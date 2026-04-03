/**
 * VCPdesktop - SheetAI 工作台挂件
 * 负责：显示最近工作簿、快速新建、快速打开 SheetAI 独立窗口
 */

'use strict';

(function () {
    const { state, CONSTANTS, widget } = window.VCPDesktop;

    const SHEET_WIDGET_HTML = `
<style>
:host, .widget-scoped-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.sheet-widget {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    color: rgba(255,255,255,0.88);
    background:
        radial-gradient(circle at top right, rgba(79,195,161,0.18), transparent 30%),
        linear-gradient(155deg, rgba(18,26,34,0.95), rgba(18,28,24,0.88));
    border-radius: 14px;
    backdrop-filter: blur(18px);
    font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}

.sheet-widget-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.sheet-widget-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sheet-widget-title strong {
    font-size: 15px;
    line-height: 1.2;
}

.sheet-widget-title span {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
}

.sheet-widget-status {
    font-size: 10px;
    color: rgba(255,255,255,0.38);
    white-space: nowrap;
}

.sheet-widget-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.sheet-widget-btn {
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 9px 10px;
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.88);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.16s ease;
}

.sheet-widget-btn:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(79,195,161,0.35);
}

.sheet-widget-btn.primary {
    background: rgba(79,195,161,0.16);
    border-color: rgba(79,195,161,0.34);
}

.sheet-widget-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
}

.sheet-widget-list::-webkit-scrollbar {
    width: 5px;
}

.sheet-widget-list::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.18);
    border-radius: 999px;
}

.sheet-widget-item,
.sheet-widget-empty {
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.06);
}

.sheet-widget-item {
    cursor: pointer;
    transition: all 0.16s ease;
}

.sheet-widget-item:hover {
    transform: translateY(-1px);
    border-color: rgba(79,195,161,0.26);
    background: rgba(255,255,255,0.08);
}

.sheet-widget-item strong {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
}

.sheet-widget-item span,
.sheet-widget-empty {
    font-size: 11px;
    line-height: 1.45;
    color: rgba(255,255,255,0.56);
}

body.light-theme .sheet-widget {
    color: rgba(0,0,0,0.82);
    background:
        radial-gradient(circle at top right, rgba(79,195,161,0.18), transparent 30%),
        linear-gradient(155deg, rgba(255,255,255,0.82), rgba(240,247,243,0.9));
}

body.light-theme .sheet-widget-title span,
body.light-theme .sheet-widget-status,
body.light-theme .sheet-widget-item span,
body.light-theme .sheet-widget-empty {
    color: rgba(0,0,0,0.5);
}

body.light-theme .sheet-widget-btn {
    background: rgba(0,0,0,0.04);
    border-color: rgba(0,0,0,0.08);
    color: rgba(0,0,0,0.82);
}

body.light-theme .sheet-widget-btn.primary {
    background: rgba(79,195,161,0.14);
    border-color: rgba(79,195,161,0.28);
}

body.light-theme .sheet-widget-item,
body.light-theme .sheet-widget-empty {
    background: rgba(255,255,255,0.6);
    border-color: rgba(0,0,0,0.06);
}

.sheet-widget-modal {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 14px;
    background: rgba(7, 14, 20, 0.62);
    backdrop-filter: blur(8px);
    border-radius: 14px;
}

.sheet-widget-modal.visible {
    display: flex;
}

.sheet-widget-modal-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(14, 20, 27, 0.96);
    box-shadow: 0 18px 48px rgba(0,0,0,0.24);
}

.sheet-widget-modal-title {
    font-size: 14px;
    font-weight: 700;
}

.sheet-widget-modal-desc {
    font-size: 11px;
    line-height: 1.5;
    color: rgba(255,255,255,0.6);
}

.sheet-widget-modal-input {
    width: 100%;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: inherit;
    padding: 9px 10px;
    outline: none;
}

.sheet-widget-modal-input:focus {
    border-color: rgba(79,195,161,0.4);
    box-shadow: 0 0 0 3px rgba(79,195,161,0.14);
}

.sheet-widget-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>

<div class="sheet-widget">
    <div class="sheet-widget-header">
        <div class="sheet-widget-title">
            <strong>SheetAI 工作台</strong>
            <span>个人工作系统里的最近工作簿入口</span>
        </div>
        <div class="sheet-widget-status" id="sheet-widget-status">加载中</div>
    </div>

    <div class="sheet-widget-actions">
        <button class="sheet-widget-btn primary" id="sheet-widget-open">打开工作台</button>
        <button class="sheet-widget-btn" id="sheet-widget-create">新建工作簿</button>
    </div>

    <div class="sheet-widget-list" id="sheet-widget-list">
        <div class="sheet-widget-empty">正在读取工作簿...</div>
    </div>
</div>

<script>
(function () {
    var statusEl = document.getElementById('sheet-widget-status');
    var listEl = document.getElementById('sheet-widget-list');
    var openBtn = document.getElementById('sheet-widget-open');
    var createBtn = document.getElementById('sheet-widget-create');
    var widgetRoot = document.querySelector('.sheet-widget');

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function formatDateTime(value) {
        if (!value) return '未知';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '未知';
        return date.toLocaleString('zh-CN', { hour12: false });
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function openSheetWindow(workbookId) {
        if (window.electronAPI && window.electronAPI.desktopLaunchVchatApp) {
            var payload = workbookId ? { workbookId: workbookId } : undefined;
            window.electronAPI.desktopLaunchVchatApp('open-sheet-window', payload);
        }
    }

    function ensureInputModal() {
        var modal = document.getElementById('sheet-widget-modal');
        if (modal) return modal;
        if (!widgetRoot) return null;

        modal = document.createElement('div');
        modal.id = 'sheet-widget-modal';
        modal.className = 'sheet-widget-modal';
        modal.innerHTML =
            '<div class="sheet-widget-modal-card">' +
                '<div class="sheet-widget-modal-title" id="sheet-widget-modal-title">Input</div>' +
                '<div class="sheet-widget-modal-desc" id="sheet-widget-modal-desc"></div>' +
                '<input class="sheet-widget-modal-input" id="sheet-widget-modal-input" type="text" />' +
                '<div class="sheet-widget-modal-actions">' +
                    '<button class="sheet-widget-btn" id="sheet-widget-modal-cancel" type="button">Cancel</button>' +
                    '<button class="sheet-widget-btn primary" id="sheet-widget-modal-confirm" type="button">Confirm</button>' +
                '</div>' +
            '</div>';
        widgetRoot.appendChild(modal);
        return modal;
    }

    function showInputModal(title, description, defaultValue) {
        return new Promise(function (resolve) {
            var modal = ensureInputModal();
            if (!modal) {
                resolve(null);
                return;
            }

            var titleEl = modal.querySelector('#sheet-widget-modal-title');
            var descEl = modal.querySelector('#sheet-widget-modal-desc');
            var inputEl = modal.querySelector('#sheet-widget-modal-input');
            var cancelBtn = modal.querySelector('#sheet-widget-modal-cancel');
            var confirmBtn = modal.querySelector('#sheet-widget-modal-confirm');

            if (titleEl) titleEl.textContent = title || 'Input';
            if (descEl) descEl.textContent = description || '';
            if (inputEl) inputEl.value = defaultValue || '';

            modal.classList.add('visible');
            setTimeout(function () {
                if (inputEl) {
                    inputEl.focus();
                    inputEl.select();
                }
            }, 20);

            var settled = false;

            function cleanup(result) {
                if (settled) return;
                settled = true;
                modal.classList.remove('visible');
                cancelBtn.removeEventListener('click', onCancel);
                confirmBtn.removeEventListener('click', onConfirm);
                inputEl.removeEventListener('keydown', onKeyDown);
                modal.removeEventListener('click', onOverlay);
                resolve(result);
            }

            function onCancel() {
                cleanup(null);
            }

            function onConfirm() {
                cleanup(inputEl ? inputEl.value : '');
            }

            function onKeyDown(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onConfirm();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            }

            function onOverlay(e) {
                if (e.target === modal) {
                    onCancel();
                }
            }

            cancelBtn.addEventListener('click', onCancel);
            confirmBtn.addEventListener('click', onConfirm);
            inputEl.addEventListener('keydown', onKeyDown);
            modal.addEventListener('click', onOverlay);
        });
    }

    function renderWorkbooks(workbooks) {
        if (!listEl) return;
        listEl.innerHTML = '';

        if (!workbooks || workbooks.length === 0) {
            listEl.innerHTML = '<div class="sheet-widget-empty">还没有工作簿。先点“新建工作簿”，把它接入你的个人工作流。</div>';
            return;
        }

        workbooks.slice(0, 5).forEach(function (workbook) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'sheet-widget-item';
            item.innerHTML =
                '<strong>' + escapeHtml(workbook.title || workbook.id) + '</strong>' +
                '<span>' + escapeHtml('更新于 ' + formatDateTime(workbook.updatedAt || workbook.createdAt)) + '</span>';
            item.addEventListener('click', function () {
                openSheetWindow(workbook.id);
            });
            listEl.appendChild(item);
        });
    }

    async function loadWorkbooks() {
        try {
            setStatus('同步中');
            var data = await vcpAPI.fetch('/admin_api/sheetai/workbooks');
            var workbooks = Array.isArray(data && data.workbooks) ? data.workbooks : [];
            renderWorkbooks(workbooks);
            setStatus(workbooks.length + ' 个工作簿');
        } catch (error) {
            console.error('[SheetWidget] load workbooks failed:', error);
            if (listEl) {
                listEl.innerHTML = '<div class="sheet-widget-empty">工作簿读取失败，请稍后重试。</div>';
            }
            setStatus('读取失败');
        }
    }

    async function createWorkbook() {
        try {
            var now = new Date();
            var defaultTitle = '个人工作簿 ' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            var title = await showInputModal('新建工作簿', '输入新工作簿名称', defaultTitle);
            if (title === null) return;

            setStatus('创建中');
            var result = await vcpAPI.fetch('/admin_api/sheetai/workbooks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title.trim() || defaultTitle
                })
            });

            await loadWorkbooks();
            openSheetWindow(result && result.workbook ? result.workbook.id : undefined);
        } catch (error) {
            console.error('[SheetWidget] create workbook failed:', error);
            setStatus('创建失败');
        }
    }

    openBtn.addEventListener('click', openSheetWindow);
    createBtn.addEventListener('click', createWorkbook);

    loadWorkbooks();
    setInterval(loadWorkbooks, 30000);
})();
<\/script>
`;

    function spawnSheetWidget() {
        const widgetId = 'builtin-sheet';

        if (state.widgets.has(widgetId)) {
            const existing = state.widgets.get(widgetId);
            if (existing && window.VCPDesktop.zIndex) {
                window.VCPDesktop.zIndex.bringToFront(widgetId);
            }
            return;
        }

        const widgetData = widget.create(widgetId, {
            x: 120,
            y: CONSTANTS.TITLE_BAR_HEIGHT + 70,
            width: 340,
            height: 340
        });

        widgetData.fixedSize = true;

        if (widgetData._resizeObserver) {
            widgetData._resizeObserver.disconnect();
            widgetData._resizeObserver = null;
        }

        widgetData.element.style.width = '340px';
        widgetData.element.style.height = '340px';

        if (widgetData.contentContainer) {
            widgetData.contentContainer.style.width = '100%';
            widgetData.contentContainer.style.height = '100%';
            widgetData.contentContainer.style.overflow = 'hidden';
        }

        widgetData.contentBuffer = SHEET_WIDGET_HTML;
        widgetData.contentContainer.innerHTML = SHEET_WIDGET_HTML;
        widget.processInlineStyles(widgetData);
        widgetData.isConstructing = false;
        widgetData.element.classList.remove('constructing');

        setTimeout(() => {
            widget.processInlineScripts(widgetData);
        }, 150);
    }

    window.VCPDesktop = window.VCPDesktop || {};
    window.VCPDesktop.builtinSheet = {
        spawn: spawnSheetWidget
    };
})();
