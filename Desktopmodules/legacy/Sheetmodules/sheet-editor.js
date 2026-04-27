document.addEventListener('DOMContentLoaded', () => {
  const state = {
    apiConfig: null,
    workbooks: [],
    activeWorkbook: null,
    activeSheet: null,
    activeWorkbookId: null,
    activeSheetId: null,
    selectedCell: null,
    pendingUpdates: new Map(),
    saveTimer: null
  };

  const dom = {
    statusValue: document.getElementById('sheetStatus'),
    saveState: document.getElementById('sheetSaveState'),
    workbookList: document.getElementById('workbookList'),
    activeWorkbookTitle: document.getElementById('activeWorkbookTitle'),
    activeWorkbookMeta: document.getElementById('activeWorkbookMeta'),
    sheetTabs: document.getElementById('sheetTabs'),
    sheetGridSummary: document.getElementById('sheetGridSummary'),
    selectedCellBadge: document.getElementById('selectedCellBadge'),
    formulaInput: document.getElementById('formulaInput'),
    applyFormulaBtn: document.getElementById('applyFormulaBtn'),
    sheetGrid: document.getElementById('sheetGrid')
  };

  ensureInputModal();
  bindEvents();
  initialize().catch((error) => {
    console.error('[SheetAI] initialization failed:', error);
    setStatus(`初始化失败: ${error.message}`);
    setSaveState('加载失败');
    renderWorkbookList([]);
    renderSheetGrid(null);
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
    document.getElementById('refreshWorkbooksBtn')?.addEventListener('click', async () => {
      await loadWorkbooks();
    });

    document.getElementById('createWorkbookBtn')?.addEventListener('click', async () => {
      await createWorkbook();
    });

    dom.applyFormulaBtn?.addEventListener('click', async () => {
      await applyFormulaBarValue();
    });

    dom.formulaInput?.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await applyFormulaBarValue();
      }
    });
  }

    async function initialize() {
        setStatus('正在连接 SheetAI 后端');
        setSaveState('等待加载');
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
                state.activeWorkbook = null;
                state.activeSheet = null;
                state.activeSheetId = null;
                state.selectedCell = null;
                renderWorkbookList([]);
                renderSheetTabs();
                renderWorkbookMeta();
                renderSheetGrid(null);
                setSaveState('没有工作簿');
                setStatus('当前没有工作簿');
                return;
            }

            if (!state.workbooks.some((item) => item.id === state.activeWorkbookId)) {
                state.activeWorkbookId = state.workbooks[0].id;
            }

            renderWorkbookList(state.workbooks);
            await loadWorkbookDetail(state.activeWorkbookId);
            setStatus(`已加载 ${state.workbooks.length} 个工作簿`);
        } catch (error) {
            console.error('[SheetAI] loadWorkbooks failed:', error);
            setStatus(`加载失败: ${error.message}`);
            setSaveState('读取失败');
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
      setSaveState('创建中');
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
      setSaveState('已创建');
    } catch (error) {
      console.error('[SheetAI] createWorkbook failed:', error);
      setStatus(`创建失败: ${error.message}`);
      setSaveState('创建失败');
    }
  }

    async function loadWorkbookDetail(workbookId) {
        if (!workbookId) {
            return;
        }

        try {
            setStatus('正在读取工作簿详情');
            const data = await sheetApiFetch(`/admin_api/sheetai/workbooks/${encodeURIComponent(workbookId)}`);
            state.activeWorkbook = data?.workbook || null;
            state.activeWorkbookId = state.activeWorkbook?.id || null;

            if (!state.activeWorkbook) {
                throw new Error('工作簿详情为空');
            }

            const availableSheets = Array.isArray(state.activeWorkbook.sheets) ? state.activeWorkbook.sheets : [];
            if (!availableSheets.some((sheet) => sheet.id === state.activeSheetId)) {
                state.activeSheetId = availableSheets[0]?.id || null;
            }

            renderWorkbookList(state.workbooks);
            renderSheetTabs();
            renderWorkbookMeta();

            if (state.activeSheetId) {
                await loadSheet(state.activeSheetId);
            } else {
                renderSheetGrid(null);
            }
        } catch (error) {
            console.error('[SheetAI] loadWorkbookDetail failed:', error);
            setStatus(`工作簿加载失败: ${error.message}`);
            setSaveState('读取失败');
        }
    }

    async function loadSheet(sheetId) {
        if (!state.activeWorkbookId || !sheetId) {
            return;
        }

        try {
            setStatus('正在读取工作表');
            const data = await sheetApiFetch(
                `/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets/${encodeURIComponent(sheetId)}`
            );

            state.activeWorkbook = data?.workbook || state.activeWorkbook;
            state.activeSheet = data?.sheet || null;
            state.activeSheetId = state.activeSheet?.id || sheetId;
            state.selectedCell = null;
            state.pendingUpdates.clear();
            clearSaveTimer();

            syncWorkbookListEntry(state.activeWorkbook);
            renderWorkbookList(state.workbooks);
            renderSheetTabs();
            renderWorkbookMeta();
            renderSheetGrid(state.activeSheet);
            setSaveState('已同步');
            setStatus('工作表已就绪');
        } catch (error) {
            console.error('[SheetAI] loadSheet failed:', error);
            setStatus(`工作表读取失败: ${error.message}`);
            setSaveState('读取失败');
        }
    }

    function renderWorkbookList(workbooks) {
        if (!dom.workbookList) {
            return;
        }

        dom.workbookList.innerHTML = '';

        if (!workbooks.length) {
            dom.workbookList.innerHTML = `
                <li class="placeholder-item workbook-empty">
                    还没有工作簿。先点“新建”，把 SheetAI 接入你的个人工作系统。
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
            item.addEventListener('click', async () => {
                if (workbook.id === state.activeWorkbookId) {
                    return;
                }
                await flushPendingUpdates();
                state.activeWorkbookId = workbook.id;
                state.activeSheetId = null;
                await loadWorkbookDetail(workbook.id);
            });
            dom.workbookList.appendChild(item);
        });
    }

    function renderSheetTabs() {
        if (!dom.sheetTabs) {
            return;
        }

        dom.sheetTabs.innerHTML = '';
        const sheets = Array.isArray(state.activeWorkbook?.sheets) ? state.activeWorkbook.sheets : [];

        if (!sheets.length) {
            dom.sheetTabs.innerHTML = '<div class="muted">暂无工作表</div>';
            return;
        }

        sheets.forEach((sheet) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `sheet-tab${sheet.id === state.activeSheetId ? ' active' : ''}`;
            button.textContent = sheet.name || sheet.id;
            button.addEventListener('click', async () => {
                if (sheet.id === state.activeSheetId) {
                    return;
                }
                await flushPendingUpdates();
                await loadSheet(sheet.id);
            });
            dom.sheetTabs.appendChild(button);
        });
    }

    function renderWorkbookMeta() {
        if (dom.activeWorkbookTitle) {
            dom.activeWorkbookTitle.textContent = state.activeWorkbook?.title || '未打开工作簿';
        }

        if (dom.activeWorkbookMeta) {
            if (!state.activeWorkbook) {
                dom.activeWorkbookMeta.textContent = '选择一个工作簿后，会在这里显示当前工作簿和工作表信息。';
            } else {
                const sheetCount = Array.isArray(state.activeWorkbook.sheets) ? state.activeWorkbook.sheets.length : 0;
                const activeSheetName = state.activeSheet?.name || state.activeWorkbook.sheets?.[0]?.name || '未选择工作表';
                dom.activeWorkbookMeta.textContent = [
                    `ID: ${state.activeWorkbook.id}`,
                    `工作表: ${sheetCount}`,
                    `当前: ${activeSheetName}`,
                    `更新: ${formatDateTime(state.activeWorkbook.updatedAt || state.activeWorkbook.createdAt)}`
                ].join(' | ');
            }
        }

        if (dom.sheetGridSummary) {
            if (!state.activeSheet) {
                dom.sheetGridSummary.textContent = '尚未加载工作表';
            } else {
                dom.sheetGridSummary.textContent = `${state.activeSheet.rowCount || 0} 行 × ${state.activeSheet.columnCount || 0} 列`;
            }
        }
    }

    function renderSheetGrid(sheet) {
        if (!dom.sheetGrid) {
            return;
        }

        if (!sheet) {
            dom.sheetGrid.innerHTML = '<div class="grid-empty">选择工作簿后开始编辑表格。</div>';
            updateSelectionUI();
            renderWorkbookMeta();
            return;
        }

        const rowCount = Math.max(10, Math.min(sheet.rowCount || 20, 100));
        const columnCount = Math.max(5, Math.min(sheet.columnCount || 10, 26));
        const table = document.createElement('table');
        table.className = 'sheet-table';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');

        const corner = document.createElement('th');
        corner.className = 'sheet-row-header sheet-corner';
        corner.textContent = '#';
        headRow.appendChild(corner);

        for (let colIndex = 1; colIndex <= columnCount; colIndex += 1) {
            const th = document.createElement('th');
            th.textContent = getColumnLabel(colIndex);
            headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
            const row = document.createElement('tr');

            const rowHeader = document.createElement('th');
            rowHeader.className = 'sheet-row-header';
            rowHeader.textContent = String(rowIndex);
            row.appendChild(rowHeader);

            for (let colIndex = 1; colIndex <= columnCount; colIndex += 1) {
                const td = document.createElement('td');
                const cellRef = `${getColumnLabel(colIndex)}${rowIndex}`;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'sheet-cell-input';
                input.dataset.cell = cellRef;
                input.value = readCellValue(sheet, cellRef);

                input.addEventListener('focus', () => {
                    selectCell(cellRef, input.value);
                    markSelectedInput(input);
                });

                input.addEventListener('input', () => {
                    if (state.selectedCell === cellRef && dom.formulaInput) {
                        dom.formulaInput.value = input.value;
                    }
                    queueCellUpdate(cellRef, input.value);
                });

                input.addEventListener('blur', async () => {
                    await flushPendingUpdates();
                });

                input.addEventListener('keydown', async (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        await flushPendingUpdates();
                        moveSelection(cellRef, 1, 0);
                    } else if (event.key === 'Tab') {
                        event.preventDefault();
                        await flushPendingUpdates();
                        moveSelection(cellRef, 0, event.shiftKey ? -1 : 1);
                    }
                });

                td.appendChild(input);
                row.appendChild(td);
            }

            tbody.appendChild(row);
        }

        table.appendChild(tbody);
        dom.sheetGrid.innerHTML = '';
        dom.sheetGrid.appendChild(table);
        markSelectedInput(findInputByCell(state.selectedCell));
        updateSelectionUI();
        renderWorkbookMeta();
    }

    function selectCell(cellRef, value) {
        state.selectedCell = cellRef;
        if (dom.formulaInput) {
            dom.formulaInput.value = value || '';
        }
        updateSelectionUI();
    }

    function updateSelectionUI() {
        if (dom.selectedCellBadge) {
            dom.selectedCellBadge.textContent = state.selectedCell || '未选中';
        }
        if (!state.selectedCell && dom.formulaInput) {
            dom.formulaInput.value = '';
        }
    }

    function markSelectedInput(activeInput) {
        document.querySelectorAll('.sheet-cell-input.selected').forEach((input) => {
            input.classList.remove('selected');
        });
        if (activeInput) {
            activeInput.classList.add('selected');
        }
    }

    function findInputByCell(cellRef) {
        if (!cellRef) {
            return null;
        }
        return dom.sheetGrid?.querySelector(`.sheet-cell-input[data-cell="${cellRef}"]`) || null;
    }

    function moveSelection(cellRef, rowOffset, columnOffset) {
        const match = /^([A-Z]+)(\d+)$/.exec(cellRef || '');
        if (!match) {
            return;
        }

        const nextColumn = Math.max(1, columnLabelToIndex(match[1]) + columnOffset);
        const nextRow = Math.max(1, Number(match[2]) + rowOffset);
        const nextRef = `${getColumnLabel(nextColumn)}${nextRow}`;
        const nextInput = findInputByCell(nextRef);
        if (nextInput) {
            nextInput.focus();
            nextInput.select();
        }
    }

    async function applyFormulaBarValue() {
        if (!state.selectedCell) {
            return;
        }

        const input = findInputByCell(state.selectedCell);
        const nextValue = dom.formulaInput?.value || '';
        if (input) {
            input.value = nextValue;
        }
        queueCellUpdate(state.selectedCell, nextValue);
        await flushPendingUpdates();
        if (input) {
            input.focus();
            input.select();
        }
    }

    function queueCellUpdate(cellRef, value) {
        if (!state.activeSheet) {
            return;
        }

        if (!state.activeSheet.cells || typeof state.activeSheet.cells !== 'object') {
            state.activeSheet.cells = {};
        }

        if (value === '') {
            delete state.activeSheet.cells[cellRef];
        } else {
            state.activeSheet.cells[cellRef] = { value };
        }

        state.pendingUpdates.set(cellRef, value);
        setSaveState(`待保存 ${state.pendingUpdates.size} 项`);
        scheduleSave();
    }

    function scheduleSave() {
        clearSaveTimer();
        state.saveTimer = window.setTimeout(() => {
            flushPendingUpdates().catch((error) => {
                console.error('[SheetAI] auto-save failed:', error);
            });
        }, 500);
    }

    function clearSaveTimer() {
        if (state.saveTimer) {
            window.clearTimeout(state.saveTimer);
            state.saveTimer = null;
        }
    }

    async function flushPendingUpdates() {
        clearSaveTimer();

        if (!state.pendingUpdates.size || !state.activeWorkbookId || !state.activeSheetId || !state.activeSheet) {
            return;
        }

        const updates = Array.from(state.pendingUpdates.entries()).map(([cell, value]) => ({
            cell,
            value
        }));

        try {
            setSaveState('正在保存');
            const data = await sheetApiFetch(
                `/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets/${encodeURIComponent(state.activeSheetId)}/cells`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        updates,
                        rowCount: state.activeSheet.rowCount,
                        columnCount: state.activeSheet.columnCount
                    })
                }
            );

            state.pendingUpdates.clear();
            state.activeWorkbook = data?.workbook || state.activeWorkbook;
            state.activeSheet = data?.sheet || state.activeSheet;
            syncWorkbookListEntry(state.activeWorkbook);
            renderWorkbookList(state.workbooks);
            renderSheetTabs();
            renderWorkbookMeta();
            setSaveState(`已保存 ${updates.length} 项`);
            setStatus('单元格已保存');
        } catch (error) {
            console.error('[SheetAI] flushPendingUpdates failed:', error);
            setSaveState('保存失败');
            setStatus(`保存失败: ${error.message}`);
        }
    }

    function syncWorkbookListEntry(workbook) {
        if (!workbook) {
            return;
        }
        const index = state.workbooks.findIndex((item) => item.id === workbook.id);
        if (index >= 0) {
            state.workbooks[index] = workbook;
        }
    }

    function readCellValue(sheet, cellRef) {
        return sheet?.cells?.[cellRef]?.value || '';
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

    function setSaveState(message) {
        if (dom.saveState) {
            dom.saveState.textContent = message;
        }
    }

    function getColumnLabel(index) {
        let value = index;
        let label = '';
        while (value > 0) {
            const remainder = (value - 1) % 26;
            label = String.fromCharCode(65 + remainder) + label;
            value = Math.floor((value - 1) / 26);
        }
        return label;
    }

    function columnLabelToIndex(label) {
        return label.split('').reduce((total, char) => {
            return total * 26 + (char.charCodeAt(0) - 64);
        }, 0);
    }

    function formatDateTime(value) {
        if (!value) {
            return '未知';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '未知';
        }
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
