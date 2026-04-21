document.addEventListener('DOMContentLoaded', () => {
  const state = {
    apiConfig: null,
    workbooks: [],
    activeWorkbookId: null
  };

  const dom = {
    statusValue: document.getElementById('sheetStatus'),
    fakeGrid: document.getElementById('fakeGrid'),
    workbookList: document.getElementById('workbookList'),
    activeWorkbookTitle: document.getElementById('activeWorkbookTitle'),
    activeWorkbookMeta: document.getElementById('activeWorkbookMeta')
  };

  ensureInputModal();
  buildPreviewGrid();
  bindEvents();
  initialize().catch((error) => {
    console.error('[SheetAI] initialization failed:', error);
    setStatus(`初始化失败: ${error.message}`);
    renderWorkbookList([]);
  });

  function ensureInputModal() {
    let modal = document.getElementById('sheetInputModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sheetInputModal';
      modal.className = 'sheet-input-modal';
      modal.innerHTML = `
        <div class="sheet-input-modal-card" role="dialog" aria-modal="true" aria-labelledby="sheetInputModalTitle">
          <div id="sheetInputModalTitle" class="sheet-input-modal-title">Input</div>
          <div id="sheetInputModalDesc" class="sheet-input-modal-desc"></div>
          <input id="sheetInputModalField" class="sheet-input-modal-field" type="text" />
          <div class="sheet-input-modal-actions">
            <button id="sheetInputModalCancel" type="button" class="secondary-btn">Cancel</button>
            <button id="sheetInputModalConfirm" type="button">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    dom.inputModal = modal;
    dom.inputModalTitle = modal.querySelector('#sheetInputModalTitle');
    dom.inputModalDesc = modal.querySelector('#sheetInputModalDesc');
    dom.inputModalField = modal.querySelector('#sheetInputModalField');
    dom.inputModalCancel = modal.querySelector('#sheetInputModalCancel');
    dom.inputModalConfirm = modal.querySelector('#sheetInputModalConfirm');

    if (!document.getElementById('sheetStudioInputModalStyle')) {
      const style = document.createElement('style');
      style.id = 'sheetStudioInputModalStyle';
      style.textContent = `
        .sheet-input-modal {
          position: fixed;
          inset: 0;
          z-index: 3000;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(7, 14, 20, 0.55);
          backdrop-filter: blur(8px);
        }
        .sheet-input-modal.visible {
          display: flex;
        }
        .sheet-input-modal-card {
          width: min(420px, calc(100vw - 32px));
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(14, 20, 27, 0.96);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
        }
        .sheet-input-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #f3f7fb;
        }
        .sheet-input-modal-desc {
          font-size: 13px;
          line-height: 1.5;
          color: rgba(235, 243, 250, 0.68);
        }
        .sheet-input-modal-field {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #f3f7fb;
          padding: 11px 12px;
          outline: none;
        }
        .sheet-input-modal-field:focus {
          border-color: rgba(126, 231, 173, 0.5);
          box-shadow: 0 0 0 3px rgba(126, 231, 173, 0.12);
        }
        .sheet-input-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function showInputModal(title, description, defaultValue = '') {
    ensureInputModal();

    return new Promise((resolve) => {
      const modal = dom.inputModal;
      const titleEl = dom.inputModalTitle;
      const descEl = dom.inputModalDesc;
      const fieldEl = dom.inputModalField;
      const cancelBtn = dom.inputModalCancel;
      const confirmBtn = dom.inputModalConfirm;

      if (!modal || !fieldEl) {
        resolve(null);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = description || '';
      fieldEl.value = defaultValue;
      modal.classList.add('visible');

      requestAnimationFrame(() => {
        fieldEl.focus();
        fieldEl.select();
      });

      let settled = false;

      function cleanup(result) {
        if (settled) return;
        settled = true;
        modal.classList.remove('visible');
        cancelBtn?.removeEventListener('click', onCancel);
        confirmBtn?.removeEventListener('click', onConfirm);
        fieldEl.removeEventListener('keydown', onKeyDown);
        modal.removeEventListener('click', onOverlayClick);
        resolve(result);
      }

      function onCancel() { cleanup(null); }
      function onConfirm() { cleanup(fieldEl.value); }
      function onKeyDown(event) {
        if (event.key === 'Enter') { event.preventDefault(); onConfirm(); }
        else if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      }
      function onOverlayClick(event) { if (event.target === modal) onCancel(); }

      cancelBtn?.addEventListener('click', onCancel);
      confirmBtn?.addEventListener('click', onConfirm);
      fieldEl.addEventListener('keydown', onKeyDown);
      modal.addEventListener('click', onOverlayClick);
    });
  }

  function bindEvents() {
    document.getElementById('refreshWorkbooksBtn')?.addEventListener('click', () => {
      loadWorkbooks();
    });

    document.getElementById('createWorkbookBtn')?.addEventListener('click', () => {
      createWorkbook();
    });
  }

    async function initialize() {
        setStatus('正在连接 SheetAI 后端');
        state.apiConfig = await loadApiConfig();
        await loadWorkbooks();
    }

    async function loadApiConfig() {
        const result = await window.electronAPI?.desktopGetCredentials?.();
        if (!result?.success || !result.apiBaseUrl) {
            throw new Error('未获取到 VCPdesktop 凭据');
        }

        return {
            apiBaseUrl: result.apiBaseUrl,
            auth: `Basic ${btoa(`${result.username}:${result.password}`)}`
        };
    }

    async function sheetApiFetch(endpoint, options = {}) {
        if (!state.apiConfig) {
            throw new Error('SheetAI API 未初始化');
        }

        const response = await fetch(`${state.apiConfig.apiBaseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: state.apiConfig.auth,
                ...(options.headers || {})
            }
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const message = payload?.error || payload?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }

        return payload;
    }

    async function loadWorkbooks() {
        try {
            setStatus('正在加载工作簿列表');
            const data = await sheetApiFetch('/admin_api/sheetai/workbooks');
            state.workbooks = Array.isArray(data?.workbooks) ? data.workbooks : [];

            if (!state.workbooks.length) {
                state.activeWorkbookId = null;
            } else if (!state.workbooks.some((item) => item.id === state.activeWorkbookId)) {
                state.activeWorkbookId = state.workbooks[0].id;
            }

            renderWorkbookList(state.workbooks);
            syncActiveWorkbook();
            setStatus(`已加载 ${state.workbooks.length} 个工作簿`);
        } catch (error) {
            console.error('[SheetAI] failed to load workbooks:', error);
            setStatus(`加载失败: ${error.message}`);
            renderWorkbookList([]);
            syncActiveWorkbook();
        }
    }

  async function createWorkbook() {
    try {
      const defaultTitle = `个人工作簿 ${formatTimestamp(new Date())}`;
      const title = await showInputModal('新建工作簿', '输入新工作簿名称', defaultTitle);
      if (title === null) {
        return;
      }

      setStatus('正在创建工作簿');
      const data = await sheetApiFetch('/admin_api/sheetai/workbooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: title.trim() || defaultTitle
        })
      });

      if (data?.workbook?.id) {
        state.activeWorkbookId = data.workbook.id;
      }

      await loadWorkbooks();
      setStatus(`已创建工作簿: ${data?.workbook?.title || defaultTitle}`);
    } catch (error) {
      console.error('[SheetAI] failed to create workbook:', error);
      setStatus(`创建失败: ${error.message}`);
    }
  }

    function renderWorkbookList(workbooks) {
        if (!dom.workbookList) return;

        dom.workbookList.innerHTML = '';

        if (!workbooks.length) {
            dom.workbookList.innerHTML = `
                <li class="placeholder-item workbook-empty">
                    当前还没有工作簿。先点“新建”，把 SheetAI 接入你的个人工作系统。
                </li>
            `;
            return;
        }

        workbooks.forEach((workbook) => {
            const item = document.createElement('li');
            item.className = `workbook-item${workbook.id === state.activeWorkbookId ? ' active' : ''}`;
            item.innerHTML = `
                <div class="workbook-title">${escapeHtml(workbook.title || workbook.id)}</div>
                <div class="workbook-meta">${escapeHtml(describeWorkbook(workbook))}</div>
            `;
            item.addEventListener('click', () => {
                state.activeWorkbookId = workbook.id;
                renderWorkbookList(state.workbooks);
                syncActiveWorkbook();
            });
            dom.workbookList.appendChild(item);
        });
    }

    function syncActiveWorkbook() {
        const workbook = state.workbooks.find((item) => item.id === state.activeWorkbookId);

        if (!workbook) {
            if (dom.activeWorkbookTitle) {
                dom.activeWorkbookTitle.textContent = '未打开工作簿';
            }
            if (dom.activeWorkbookMeta) {
                dom.activeWorkbookMeta.textContent = '创建或选择一个工作簿后，会在这里显示元数据。';
            }
            return;
        }

        if (dom.activeWorkbookTitle) {
            dom.activeWorkbookTitle.textContent = workbook.title || workbook.id;
        }

        if (dom.activeWorkbookMeta) {
            dom.activeWorkbookMeta.textContent = [
                `ID: ${workbook.id}`,
                `工作表: ${Array.isArray(workbook.sheets) ? workbook.sheets.length : 0}`,
                `更新: ${formatDateTime(workbook.updatedAt || workbook.createdAt)}`
            ].join(' | ');
        }
    }

    function buildPreviewGrid() {
        if (!dom.fakeGrid) return;
        dom.fakeGrid.innerHTML = '';

        for (let row = 0; row < 12; row += 1) {
            const rowEl = document.createElement('div');
            rowEl.style.display = 'grid';
            rowEl.style.gridTemplateColumns = '60px repeat(6, 120px)';
            rowEl.style.height = '40px';

            for (let col = 0; col < 7; col += 1) {
                const cell = document.createElement('div');
                cell.style.borderRight = '1px solid rgba(255,255,255,0.06)';
                cell.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
                cell.style.padding = '10px 12px';
                cell.style.color = col === 0 || row === 0 ? '#8b9aad' : '#e6edf3';

                if (row === 0 && col > 0) {
                    cell.textContent = String.fromCharCode(64 + col);
                } else if (col === 0 && row > 0) {
                    cell.textContent = String(row);
                } else if (row === 1) {
                    cell.textContent = ['预算', '执行', '差值', '状态', '负责人', '备注'][col - 1] || '';
                } else if (row > 1 && col > 0 && row < 6) {
                    cell.textContent = `${row * col}`;
                }

                rowEl.appendChild(cell);
            }

            dom.fakeGrid.appendChild(rowEl);
        }
    }

    function describeWorkbook(workbook) {
        const sheetCount = Array.isArray(workbook.sheets) ? workbook.sheets.length : 0;
        return `${sheetCount} 个工作表 | 更新于 ${formatDateTime(workbook.updatedAt || workbook.createdAt)}`;
    }

    function setStatus(message) {
        if (dom.statusValue) {
            dom.statusValue.textContent = message;
        }
    }

    function formatDateTime(value) {
        if (!value) return '未知';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '未知';
        return date.toLocaleString('zh-CN', {
            hour12: false
        });
    }

    function formatTimestamp(date) {
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
});
