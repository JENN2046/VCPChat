document.addEventListener('DOMContentLoaded', () => {
 const initialWorkbookId = new URLSearchParams(window.location.search).get('workbookId');

 const state = {
 apiConfig: null,
 workbooks: [],
 activeWorkbook: null,
 activeSheet: null,
 activeWorkbookId: null,
 activeSheetId: null,
 requestedWorkbookId: initialWorkbookId || null,
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
 aiCard: document.querySelector('.ai-card'),
 sheetTabs: document.getElementById('sheetTabs'),
 sheetGridSummary: document.getElementById('sheetGridSummary'),
 selectedCellBadge: document.getElementById('selectedCellBadge'),
 formulaInput: document.getElementById('formulaInput'),
 applyFormulaBtn: document.getElementById('applyFormulaBtn'),
 generateFormulaBtn: document.getElementById('generateFormulaBtn'),
 cleanColumnBtn: document.querySelectorAll('.ai-card .action-list button')[1] || null,
 summarizeSelectionBtn: document.querySelectorAll('.ai-card .action-list button')[2] || null,
 generateReportBtn: document.querySelectorAll('.ai-card .action-list button')[3] || null,
 importCsvBtn: document.getElementById('importCsvBtn'),
 exportCsvBtn: document.getElementById('exportCsvBtn'),
 importCsvInput: document.getElementById('importCsvInput'),
 importXlsxBtn: document.getElementById('importXlsxBtn'),
 exportXlsxBtn: document.getElementById('exportXlsxBtn'),
 importXlsxInput: document.getElementById('importXlsxInput'),
 renameWorkbookBtn: document.getElementById('renameWorkbookBtn'),
 addSheetBtn: document.getElementById('addSheetBtn'),
 sheetGrid: document.getElementById('sheetGrid')
 };

 ensureAiOutputCard();
 ensureInputModal();
 ensureConfirmModal();
 bindEvents();
 initialize().catch((error) => {
 console.error('[SheetAI] initialization failed:', error);
 setStatus(`初始化失败：${error.message}`);
 setSaveState('加载失败');
 renderWorkbookList([]);
 renderSheetTabs();
 renderSheetGrid(null);
 setAiOutput(`初始化失败：${error.message}`);
 });

 function ensureAiOutputCard() {
 if (!dom.aiCard) {
 return;
 }

 let outputEl = document.getElementById('aiOutput');
 if (!outputEl) {
 const infoList = dom.aiCard.querySelector('.info-list');
 const card = document.createElement('div');
 card.className = 'info-card ai-output-card';
 card.innerHTML = `
 <strong>AI 输出</strong>
 <div id="aiOutput" class="ai-output">暂无 AI 输出</div>
 `;
 if (infoList) {
 dom.aiCard.insertBefore(card, infoList);
 } else {
 dom.aiCard.appendChild(card);
 }
 outputEl = card.querySelector('#aiOutput');
 }

 dom.aiOutput = outputEl;

 if (!document.getElementById('sheetStudioAiOutputStyle')) {
 const style = document.createElement('style');
 style.id = 'sheetStudioAiOutputStyle';
 style.textContent = `
 .ai-output-card {
 margin-top: 10px;
 }
 .ai-output {
 color: var(--muted);
 font-size: 12px;
 line-height: 1.6;
 white-space: pre-wrap;
 word-break: break-word;
 }
 `;
 document.head.appendChild(style);
 }
 }

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
 .sheet-input-modal, .sheet-confirm-modal, .sheet-alert-modal {
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
 .sheet-input-modal.visible, .sheet-confirm-modal.visible, .sheet-alert-modal.visible {
 display: flex;
 }
 .sheet-input-modal-card, .sheet-confirm-modal-card, .sheet-alert-modal-card {
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
 .sheet-input-modal-title, .sheet-confirm-modal-title, .sheet-alert-modal-title {
 font-size: 16px;
 font-weight: 700;
 color: #f3f7fb;
 }
 .sheet-input-modal-desc, .sheet-confirm-modal-desc, .sheet-alert-modal-desc {
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
 .sheet-input-modal-actions, .sheet-confirm-modal-actions, .sheet-alert-modal-actions {
 display: flex;
 justify-content: flex-end;
 gap: 10px;
 }
 `;
 document.head.appendChild(style);
 }
 }

 function ensureConfirmModal() {
 let modal = document.getElementById('sheetConfirmModal');
 if (!modal) {
 modal = document.createElement('div');
 modal.id = 'sheetConfirmModal';
 modal.className = 'sheet-confirm-modal';
 modal.innerHTML = `
 <div class="sheet-confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="sheetConfirmModalTitle">
 <div id="sheetConfirmModalTitle" class="sheet-confirm-modal-title">Confirm</div>
 <div id="sheetConfirmModalDesc" class="sheet-confirm-modal-desc"></div>
 <div class="sheet-confirm-modal-actions">
 <button id="sheetConfirmModalCancel" type="button" class="secondary-btn">Cancel</button>
 <button id="sheetConfirmModalConfirm" type="button">Confirm</button>
 </div>
 </div>
 `;
 document.body.appendChild(modal);
 }

 dom.confirmModal = modal;
 dom.confirmModalTitle = modal.querySelector('#sheetConfirmModalTitle');
 dom.confirmModalDesc = modal.querySelector('#sheetConfirmModalDesc');
 dom.confirmModalCancel = modal.querySelector('#sheetConfirmModalCancel');
 dom.confirmModalConfirm = modal.querySelector('#sheetConfirmModalConfirm');
 }

 function ensureAlertModal() {
 let modal = document.getElementById('sheetAlertModal');
 if (!modal) {
 modal = document.createElement('div');
 modal.id = 'sheetAlertModal';
 modal.className = 'sheet-alert-modal';
 modal.innerHTML = `
 <div class="sheet-alert-modal-card" role="dialog" aria-modal="true" aria-labelledby="sheetAlertModalTitle">
 <div id="sheetAlertModalTitle" class="sheet-alert-modal-title">Alert</div>
 <div id="sheetAlertModalDesc" class="sheet-alert-modal-desc"></div>
 <div class="sheet-alert-modal-actions">
 <button id="sheetAlertModalConfirm" type="button">OK</button>
 </div>
 </div>
 `;
 document.body.appendChild(modal);
 }

 dom.alertModal = modal;
 dom.alertModalTitle = modal.querySelector('#sheetAlertModalTitle');
 dom.alertModalDesc = modal.querySelector('#sheetAlertModalDesc');
 dom.alertModalConfirm = modal.querySelector('#sheetAlertModalConfirm');
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

 function showConfirmModal(title, description) {
 ensureConfirmModal();

 return new Promise((resolve) => {
 const modal = dom.confirmModal;
 const titleEl = dom.confirmModalTitle;
 const descEl = dom.confirmModalDesc;
 const cancelBtn = dom.confirmModalCancel;
 const confirmBtn = dom.confirmModalConfirm;

 if (!modal) { resolve(false); return; }

 if (titleEl) titleEl.textContent = title;
 if (descEl) descEl.textContent = description || '';
 modal.classList.add('visible');

 let settled = false;

 function cleanup(result) {
 if (settled) return;
 settled = true;
 modal.classList.remove('visible');
 cancelBtn?.removeEventListener('click', onCancel);
 confirmBtn?.removeEventListener('click', onConfirm);
 modal.removeEventListener('click', onOverlayClick);
 resolve(result);
 }

 function onCancel() { cleanup(false); }
 function onConfirm() { cleanup(true); }
 function onOverlayClick(event) { if (event.target === modal) onCancel(); }

 cancelBtn?.addEventListener('click', onCancel);
 confirmBtn?.addEventListener('click', onConfirm);
 modal.addEventListener('click', onOverlayClick);
 });
 }

 function showAlertModal(title, description) {
 ensureAlertModal();

 return new Promise((resolve) => {
 const modal = dom.alertModal;
 const titleEl = dom.alertModalTitle;
 const descEl = dom.alertModalDesc;
 const confirmBtn = dom.alertModalConfirm;

 if (!modal) { resolve(); return; }

 if (titleEl) titleEl.textContent = title;
 if (descEl) descEl.textContent = description || '';
 modal.classList.add('visible');

 let settled = false;

 function cleanup() {
 if (settled) return;
 settled = true;
 modal.classList.remove('visible');
 confirmBtn?.removeEventListener('click', onConfirm);
 modal.removeEventListener('click', onOverlayClick);
 resolve();
 }

 function onConfirm() { cleanup(); }
 function onOverlayClick(event) { if (event.target === modal) cleanup(); }

 confirmBtn?.addEventListener('click', onConfirm);
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

 dom.generateFormulaBtn?.addEventListener('click', async () => {
 await generateFormulaWithAI();
 });

 dom.cleanColumnBtn?.addEventListener('click', async () => {
 await cleanCurrentColumnWithAI();
 });

 dom.summarizeSelectionBtn?.addEventListener('click', async () => {
 await summarizeSelectionWithAI();
 });

 dom.generateReportBtn?.addEventListener('click', async () => {
 await generateReportWithAI();
 });

 dom.formulaInput?.addEventListener('keydown', async (event) => {
 if (event.key === 'Enter') {
 event.preventDefault();
 await applyFormulaBarValue();
 }
 });

 dom.renameWorkbookBtn?.addEventListener('click', async () => {
 await renameWorkbook();
 });

 dom.addSheetBtn?.addEventListener('click', async () => {
 await createSheet();
 });

 dom.importCsvBtn?.addEventListener('click', () => {
 dom.importCsvInput?.click();
 });

 dom.importCsvInput?.addEventListener('change', async (event) => {
 const file = event.target?.files?.[0];
 if (file) {
 await importCsvFile(file);
 }
 event.target.value = '';
 });

 dom.exportCsvBtn?.addEventListener('click', () => {
 exportCurrentSheetAsCsv();
 });

 dom.importXlsxBtn?.addEventListener('click', () => {
 dom.importXlsxInput?.click();
 });

 dom.importXlsxInput?.addEventListener('change', async (event) => {
 const file = event.target?.files?.[0];
 if (file) {
 await importXlsxFile(file);
 }
 event.target.value = '';
 });

 dom.exportXlsxBtn?.addEventListener('click', async () => {
 await exportCurrentSheetAsXlsx();
 });

 window.electronAPI?.onSheetOpenWorkbook?.(async (payload) => {
 const workbookId = typeof payload === 'string' ? payload : payload?.workbookId;
 if (!workbookId) {
 return;
 }
 await openRequestedWorkbook(workbookId);
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
 auth: `Basic ${btoa(`${result.username}:${result.password}`)}`,
 vcpServerUrl: result.vcpServerUrl || '',
 vcpApiKey: result.vcpApiKey || ''
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

 const preferredWorkbookId = resolvePreferredWorkbookId();
 state.activeWorkbookId = preferredWorkbookId;

 renderWorkbookList(state.workbooks);
 await loadWorkbookDetail(state.activeWorkbookId);
 setStatus(`已加载 ${state.workbooks.length} 个工作簿`);
 } catch (error) {
 console.error('[SheetAI] loadWorkbooks failed:', error);
 setStatus(`加载失败：${error.message}`);
 setSaveState('读取失败');
 }
 }

 function resolvePreferredWorkbookId() {
 if (state.requestedWorkbookId && state.workbooks.some((item) => item.id === state.requestedWorkbookId)) {
 return state.requestedWorkbookId;
 }
 if (state.activeWorkbookId && state.workbooks.some((item) => item.id === state.activeWorkbookId)) {
 return state.activeWorkbookId;
 }
 return state.workbooks[0].id;
 }

 async function openRequestedWorkbook(workbookId) {
 await flushPendingUpdates();
 state.requestedWorkbookId = workbookId;

 if (state.workbooks.some((item) => item.id === workbookId)) {
 state.activeWorkbookId = workbookId;
 state.activeSheetId = null;
 await loadWorkbookDetail(workbookId);
 return;
 }

 await loadWorkbooks();

 if (!state.workbooks.some((item) => item.id === workbookId)) {
 setStatus(`未找到工作簿：${workbookId}`);
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
 state.requestedWorkbookId = data.workbook.id;
 }

 await loadWorkbooks();
 setStatus('工作簿已创建');
 setSaveState('已创建');
 } catch (error) {
 console.error('[SheetAI] createWorkbook failed:', error);
 setStatus(`创建失败：${error.message}`);
 setSaveState('创建失败');
 }
 }

 async function renameWorkbook() {
 if (!state.activeWorkbookId || !state.activeWorkbook) {
 return;
 }

 const nextTitle = await showInputModal(
 '重命名工作簿',
 '输入新的工作簿名称',
 state.activeWorkbook.title || ''
 );
 if (nextTitle === null) {
 return;
 }

 const title = nextTitle.trim();
 if (!title || title === state.activeWorkbook.title) {
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus('正在重命名工作簿');
 setSaveState('更新中');

 const data = await sheetApiFetch(`/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({ title })
 });

 state.activeWorkbook = data?.workbook || state.activeWorkbook;
 syncWorkbookListEntry(state.activeWorkbook);
 renderWorkbookList(state.workbooks);
 renderWorkbookMeta();
 setStatus('工作簿名称已更新');
 setSaveState('已同步');
 } catch (error) {
 console.error('[SheetAI] renameWorkbook failed:', error);
 setStatus(`重命名失败：${error.message}`);
 setSaveState('更新失败');
 }
 }

 async function createSheet() {
 if (!state.activeWorkbookId || !state.activeWorkbook) {
 return;
 }

 const defaultName = `Sheet${(state.activeWorkbook.sheets?.length || 0) + 1}`;
 const nextName = await showInputModal('新建工作表', '输入新工作表名称', defaultName);
 if (nextName === null) {
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus('正在创建工作表');
 setSaveState('创建中');

 const data = await sheetApiFetch(`/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 name: nextName.trim() || defaultName,
 rowCount: 100,
 columnCount: 26
 })
 });

 state.activeWorkbook = data?.workbook || state.activeWorkbook;
 state.activeSheetId = data?.sheet?.id || state.activeSheetId;
 syncWorkbookListEntry(state.activeWorkbook);
 renderWorkbookList(state.workbooks);
 renderSheetTabs();
 renderWorkbookMeta();

 if (state.activeSheetId) {
 await loadSheet(state.activeSheetId);
 }
 } catch (error) {
 console.error('[SheetAI] createSheet failed:', error);
 setStatus(`创建工作表失败：${error.message}`);
 setSaveState('创建失败');
 }
 }

 async function importCsvFile(file) {
 if (!state.activeWorkbookId || !state.activeSheetId || !state.activeSheet) {
 return;
 }

 try {
 const confirmed = await showConfirmModal('确认导入 CSV', `导入 ${file.name} 会覆盖当前工作表内容，是否继续？`);
 if (!confirmed) {
 return;
 }

 const csvText = await file.text();
 const rows = parseCsv(csvText);
 const rowCount = Math.max(rows.length, 10);
 const columnCount = Math.max(rows.reduce((max, row) => Math.max(max, row.length), 0), 5);
 const updates = [];

 Object.keys(state.activeSheet.cells || {}).forEach((cellRef) => {
 updates.push({ cell: cellRef, value: '' });
 });

 rows.forEach((row, rowIndex) => {
 row.forEach((value, columnIndex) => {
 if (!value) {
 return;
 }
 updates.push({
 cell: `${getColumnLabel(columnIndex + 1)}${rowIndex + 1}`,
 value
 });
 });
 });

 setStatus(`正在导入 ${file.name}`);
 setSaveState('导入中');

 const data = await sheetApiFetch(
 `/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets/${encodeURIComponent(state.activeSheetId)}/cells`,
 {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 updates,
 rowCount,
 columnCount
 })
 });

 state.pendingUpdates.clear();
 state.activeWorkbook = data?.workbook || state.activeWorkbook;
 state.activeSheet = data?.sheet || state.activeSheet;
 syncWorkbookListEntry(state.activeWorkbook);
 renderWorkbookList(state.workbooks);
 renderSheetTabs();
 renderWorkbookMeta();
 renderSheetGrid(state.activeSheet);
 setStatus(`已导入 ${file.name}`);
 setSaveState('导入完成');
 } catch (error) {
 console.error('[SheetAI] importCsvFile failed:', error);
 setStatus(`导入失败：${error.message}`);
 setSaveState('导入失败');
 }
 }

 function exportCurrentSheetAsCsv() {
 if (!state.activeSheet) {
 return;
 }

 const bounds = getSheetBounds(state.activeSheet);
 const lines = [];

 for (let rowIndex = 1; rowIndex <= bounds.rowCount; rowIndex += 1) {
 const values = [];
 for (let columnIndex = 1; columnIndex <= bounds.columnCount; columnIndex += 1) {
 const cellRef = `${getColumnLabel(columnIndex)}${rowIndex}`;
 values.push(escapeCsvValue(readCellValue(state.activeSheet, cellRef)));
 }
 lines.push(values.join(','));
 }

 const csvContent = lines.join('\\r\\n');
 const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 const workbookName = (state.activeWorkbook?.title || 'sheetai-workbook').replace(/[\\\\/:*?"<>|]+/g, '_');
 const sheetName = (state.activeSheet?.name || 'Sheet1').replace(/[\\\\/:*?"<>|]+/g, '_');

 link.href = url;
 link.download = `${workbookName}-${sheetName}.csv`;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);

 setStatus('CSV 已导出');
 setSaveState('已导出');
 }

 async function importXlsxFile(file) {
 if (!state.activeWorkbookId || !state.activeSheetId) {
 return;
 }

 try {
 const confirmed = await showConfirmModal('确认导入 XLSX', `导入 ${file.name} 会覆盖当前工作表内容，是否继续？`);
 if (!confirmed) {
 return;
 }

 setStatus(`正在导入 ${file.name}`);
 setSaveState('导入中');

 const arrayBuffer = await file.arrayBuffer();
 const data = await sheetApiFetch(
 `/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets/${encodeURIComponent(state.activeSheetId)}/import/xlsx`,
 {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 filename: file.name,
 contentBase64: arrayBufferToBase64(arrayBuffer)
 })
 });

 state.pendingUpdates.clear();
 state.activeWorkbook = data?.workbook || state.activeWorkbook;
 state.activeSheet = data?.sheet || state.activeSheet;
 syncWorkbookListEntry(state.activeWorkbook);
 renderWorkbookList(state.workbooks);
 renderSheetTabs();
 renderWorkbookMeta();
 renderSheetGrid(state.activeSheet);
 setStatus(`已导入 ${file.name}`);
 setSaveState('导入完成');
 } catch (error) {
 console.error('[SheetAI] importXlsxFile failed:', error);
 setStatus(`导入失败：${error.message}`);
 setSaveState('导入失败');
 }
 }

 async function exportCurrentSheetAsXlsx() {
 if (!state.activeWorkbookId || !state.activeSheetId) {
 return;
 }

 try {
 setStatus('正在导出 XLSX');
 setSaveState('导出中');

 const data = await sheetApiFetch(
 `/admin_api/sheetai/workbooks/${encodeURIComponent(state.activeWorkbookId)}/sheets/${encodeURIComponent(state.activeSheetId)}/export/xlsx`
 );

 const blob = base64ToBlob(
 data?.contentBase64 || '',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 );
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');

 link.href = url;
 link.download = data?.filename || 'sheetai-export.xlsx';
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);

 setStatus('XLSX 已导出');
 setSaveState('已导出');
 } catch (error) {
 console.error('[SheetAI] exportCurrentSheetAsXlsx failed:', error);
 setStatus(`导出失败：${error.message}`);
 setSaveState('导出失败');
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

 if (state.requestedWorkbookId === state.activeWorkbookId) {
 state.requestedWorkbookId = null;
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
 setStatus(`工作簿加载失败：${error.message}`);
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
 setStatus(`工作表读取失败：${error.message}`);
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
 `工作表：${sheetCount}`,
 `当前：${activeSheetName}`,
 `更新：${formatDateTime(state.activeWorkbook.updatedAt || state.activeWorkbook.createdAt)}`
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
 const match = /^([A-Z]+)(\\d+)$/.exec(cellRef || '');
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

 async function generateFormulaWithAI() {
 if (!state.selectedCell) {
 await showAlertModal('提示', '请先选择一个目标单元格。');
 return;
 }

 if (!state.apiConfig?.vcpServerUrl || !state.apiConfig?.vcpApiKey) {
 await showAlertModal('错误', 'VCP AI 凭据不可用。');
 return;
 }

 const requirement = await showInputModal(
 'AI 公式生成',
 '描述你想要生成的公式：',
 '统计当前列非空值的数量'
 );
 if (!requirement) {
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus('AI 正在生成公式');
 setSaveState('AI 运行中');

 const formula = await callVcpAI({
 systemPrompt: [
 'You are a spreadsheet formula assistant.',
 'Return exactly one spreadsheet formula string.',
 'The formula must start with "=".',
 'Do not include explanations, markdown, or code fences.'
 ].join(' '),
 userPrompt: [
 `Target cell: ${state.selectedCell}`,
 `Sheet name: ${state.activeSheet?.name || 'Sheet1'}`,
 `Requirement: ${requirement}`,
 `Sheet context: ${buildSheetContext()}`
 ].join('\\n')
 });

 const normalizedFormula = formula.startsWith('=') ? formula : `=${formula}`;
 if (dom.formulaInput) {
 dom.formulaInput.value = normalizedFormula;
 }

 await applyFormulaBarValue();
 setAiOutput(`Formula -> ${state.selectedCell}\\n${normalizedFormula}`);
 setStatus('AI 公式已就绪');
 setSaveState('AI 完成');
 } catch (error) {
 console.error('[SheetAI] generateFormulaWithAI failed:', error);
 setAiOutput(`公式生成失败：${error.message}`);
 setStatus(`公式生成失败：${error.message}`);
 setSaveState('AI 失败');
 }
 }

 async function cleanCurrentColumnWithAI() {
 const columnInfo = getSelectedColumnInfo();
 if (!columnInfo) {
 await showAlertModal('提示', '请选择要清理的列中的一个单元格。');
 return;
 }

 if (!state.apiConfig?.vcpServerUrl || !state.apiConfig?.vcpApiKey) {
 await showAlertModal('错误', 'VCP AI 凭据不可用。');
 return;
 }

 if (!columnInfo.dataValues.length) {
 await showAlertModal('提示', '当前选中的列没有可清理的数据行。');
 return;
 }

 const rule = await showInputModal(
 '清理列',
 '描述如何清理此列：',
 '去除空白，标准化格式，保留原始含义'
 );
 if (!rule) {
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus(`AI 正在清理列 ${columnInfo.columnLabel}`);
 setSaveState('AI 运行中');

 const rawResult = await callVcpAI({
 systemPrompt: [
 'You clean spreadsheet column values.',
 'Return JSON only.',
 'The JSON must be an array.',
 'Each item must be either a string value or an object with "cell" and "value".',
 'Do not include markdown fences or explanations.'
 ].join(' '),
 userPrompt: [
 `Workbook: ${state.activeWorkbook?.title || state.activeWorkbookId}`,
 `Sheet: ${state.activeSheet?.name || state.activeSheetId}`,
 `Column: ${columnInfo.columnLabel}`,
 `Header: ${columnInfo.headerValue || '(empty)'}`,
 `Cleaning rule: ${rule}`,
 'Rows:',
 ...columnInfo.dataValues.map((item) => `${item.cell}\\t${item.value}`)
 ].join('\\n')
 });

 const parsed = parseAiJsonArray(rawResult);
 const updates = normalizeAiCellUpdates(columnInfo.dataValues, parsed);
 const changedUpdates = updates.filter((update, index) => update.value !== columnInfo.dataValues[index].value);

 if (!changedUpdates.length) {
 setAiOutput(`列 ${columnInfo.columnLabel} 已干净或 AI 未返回更改。`);
 setStatus('AI 清理完成，无更改');
 setSaveState('AI 完成');
 return;
 }

 await applyBulkCellUpdates(changedUpdates);

 const preview = changedUpdates
 .slice(0, 8)
 .map((update) => `${update.cell}: ${update.value}`)
 .join('\\n');

 setAiOutput(
 [
 `列 ${columnInfo.columnLabel} 已清理。`,
 `更新单元格数：${changedUpdates.length}`,
 preview
 ].join('\\n')
 );
 setStatus(`AI 已清理列 ${columnInfo.columnLabel}`);
 setSaveState('AI 完成');
 } catch (error) {
 console.error('[SheetAI] cleanCurrentColumnWithAI failed:', error);
 setAiOutput(`列清理失败：${error.message}`);
 setStatus(`列清理失败：${error.message}`);
 setSaveState('AI 失败');
 }
 }

 async function summarizeSelectionWithAI() {
 if (!state.activeSheet) {
 await showAlertModal('提示', '请先打开一个工作表。');
 return;
 }

 if (!state.apiConfig?.vcpServerUrl || !state.apiConfig?.vcpApiKey) {
 await showAlertModal('错误', 'VCP AI 凭据不可用。');
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus('AI 正在总结当前工作表焦点');
 setSaveState('AI 运行中');

 const columnInfo = getSelectedColumnInfo();
 const promptLines = columnInfo && columnInfo.dataValues.length
 ? [
 `Workbook: ${state.activeWorkbook?.title || state.activeWorkbookId}`,
 `Sheet: ${state.activeSheet?.name || state.activeSheetId}`,
 `Focus cell: ${state.selectedCell}`,
 `Focus column: ${columnInfo.columnLabel}`,
 `Header: ${columnInfo.headerValue || '(empty)'}`,
 'Column values:',
 ...columnInfo.dataValues.map((item) => `${item.cell}\\t${item.value}`)
 ]
 : [
 `Workbook: ${state.activeWorkbook?.title || state.activeWorkbookId}`,
 `Sheet: ${state.activeSheet?.name || state.activeSheetId}`,
 `Sheet snapshot:\\n${buildDetailedSheetContext(18, 8)}`
 ];

 const summary = await callVcpAI({
 systemPrompt: [
 'You summarize spreadsheet data for a personal work system.',
 'Respond in concise Chinese.',
 'Use 3 to 5 short bullet points.',
 'Mention patterns, anomalies, and a suggested next action.'
 ].join(' '),
 userPrompt: promptLines.join('\\n')
 });

 setAiOutput(summary);
 setStatus('AI 总结已就绪');
 setSaveState('AI 完成');
 } catch (error) {
 console.error('[SheetAI] summarizeSelectionWithAI failed:', error);
 setAiOutput(`总结失败：${error.message}`);
 setStatus(`总结失败：${error.message}`);
 setSaveState('AI 失败');
 }
 }

 async function generateReportWithAI() {
 if (!state.activeSheet) {
 await showAlertModal('提示', '请先打开一个工作表。');
 return;
 }

 if (!state.apiConfig?.vcpServerUrl || !state.apiConfig?.vcpApiKey) {
 await showAlertModal('错误', 'VCP AI 凭据不可用。');
 return;
 }

 try {
 await flushPendingUpdates();
 setStatus('AI 正在生成报告结论');
 setSaveState('AI 运行中');

 const report = await callVcpAI({
 systemPrompt: [
 'You write a short weekly report conclusion from spreadsheet data.',
 'Respond in concise Chinese.',
 'Keep it under 6 lines.',
 'Include overall status, key changes, risks, and a next-step recommendation.',
 'Do not use markdown tables.'
 ].join(' '),
 userPrompt: [
 `Workbook: ${state.activeWorkbook?.title || state.activeWorkbookId}`,
 `Sheet: ${state.activeSheet?.name || state.activeSheetId}`,
 `Snapshot:\\n${buildDetailedSheetContext(24, 10)}`
 ].join('\\n')
 });

 setAiOutput(report);
 setStatus('AI 报告结论已就绪');
 setSaveState('AI 完成');
 } catch (error) {
 console.error('[SheetAI] generateReportWithAI failed:', error);
 setAiOutput(`报告生成失败：${error.message}`);
 setStatus(`报告生成失败：${error.message}`);
 setSaveState('AI 失败');
 }
 }

 async function callVcpAI({ systemPrompt, userPrompt, temperature = 0.2 }) {
 if (!state.apiConfig?.vcpServerUrl || !state.apiConfig?.vcpApiKey) {
 throw new Error('VCP AI 凭据不可用。');
 }

 const response = await fetch(state.apiConfig.vcpServerUrl, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${state.apiConfig.vcpApiKey}`
 },
 body: JSON.stringify({
 stream: false,
 temperature,
 messages: [
 {
 role: 'system',
 content: systemPrompt
 },
 {
 role: 'user',
 content: userPrompt
 }
 ]
 })
 });

 let data = null;
 try {
 data = await response.json();
 } catch {
 throw new Error('AI 响应不是有效的 JSON。');
 }

 const content = String(data?.choices?.[0]?.message?.content || '').trim();
 if (!response.ok || !content) {
 throw new Error(data?.error?.message || data?.message || `AI 请求失败，HTTP ${response.status}`);
 }

 return content;
 }

 async function applyBulkCellUpdates(updates) {
 if (!updates.length || !state.activeWorkbookId || !state.activeSheetId || !state.activeSheet) {
 return null;
 }

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
 });

 state.pendingUpdates.clear();
 state.activeWorkbook = data?.workbook || state.activeWorkbook;
 state.activeSheet = data?.sheet || state.activeSheet;
 syncWorkbookListEntry(state.activeWorkbook);
 renderWorkbookList(state.workbooks);
 renderSheetTabs();
 renderWorkbookMeta();
 renderSheetGrid(state.activeSheet);
 return data;
 }

 function getSelectedColumnInfo() {
 if (!state.activeSheet || !state.selectedCell) {
 return null;
 }

 const match = /^([A-Z]+)(\\d+)$/.exec(state.selectedCell);
 if (!match) {
 return null;
 }

 const columnLabel = match[1];
 const bounds = getSheetBounds(state.activeSheet);
 const rowCount = Math.max(state.activeSheet.rowCount || 0, bounds.rowCount || 0, 1);
 const values = [];

 for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
 const cell = `${columnLabel}${rowIndex}`;
 const value = String(readCellValue(state.activeSheet, cell) ?? '');
 if (value !== '') {
 values.push({
 cell,
 rowIndex,
 value
 });
 }
 }

 return {
 columnLabel,
 headerValue: String(readCellValue(state.activeSheet, `${columnLabel}1`) ?? ''),
 values,
 dataValues: values.filter((item) => item.rowIndex > 1)
 };
 }

 function parseAiJsonArray(rawText) {
 const text = String(rawText || '').trim();
 const fencedMatch = text.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
 const jsonText = fencedMatch?.[1]?.trim() || text.match(/\\[[\\s\\S]*\\]/)?.[0] || text;
 const parsed = JSON.parse(jsonText);
 if (!Array.isArray(parsed)) {
 throw new Error('AI 未返回 JSON 数组。');
 }
 return parsed;
 }

 function normalizeAiCellUpdates(sourceItems, aiItems) {
 const normalizedByCell = new Map();

 aiItems.forEach((entry, index) => {
 if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
 const cell = String(entry.cell || '').toUpperCase();
 const hasValue = Object.prototype.hasOwnProperty.call(entry, 'value');

 if (cell && hasValue) {
 normalizedByCell.set(cell, String(entry.value ?? ''));
 return;
 }

 if (hasValue) {
 normalizedByCell.set(`__INDEX__${index}`, String(entry.value ?? ''));
 }
 return;
 }

 normalizedByCell.set(`__INDEX__${index}`, String(entry ?? ''));
 });

 return sourceItems.map((item, index) => {
 const byCell = normalizedByCell.get(item.cell);
 const byIndex = normalizedByCell.get(`__INDEX__${index}`);
 return {
 cell: item.cell,
 value: byCell ?? byIndex ?? item.value
 };
 });
 }

 function buildDetailedSheetContext(maxRows = 18, maxColumns = 8) {
 if (!state.activeSheet) {
 return 'No sheet is loaded.';
 }

 const bounds = getSheetBounds(state.activeSheet);
 const rowCount = Math.min(Math.max(bounds.rowCount, 1), Math.max(maxRows, 1));
 const columnCount = Math.min(Math.max(bounds.columnCount, 1), Math.max(maxColumns, 1));
 const lines = [];

 for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
 const values = [];
 for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
 const cellRef = `${getColumnLabel(columnIndex)}${rowIndex}`;
 const value = readCellValue(state.activeSheet, cellRef);
 if (value !== '') {
 values.push(`${cellRef}=${value}`);
 }
 }

 if (values.length) {
 lines.push(`Row ${rowIndex}: ${values.join(', ')}`);
 }
 }

 return lines.join('\\n') || 'The active sheet is currently empty.';
 }

 function setAiOutput(message) {
 if (dom.aiOutput) {
 dom.aiOutput.textContent = String(message || 'No AI output yet.');
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
 });

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
 setStatus(`保存失败：${error.message}`);
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

 function buildSheetContext() {
 if (!state.activeSheet) {
 return '无可用上下文';
 }

 const rows = [];
 for (let rowIndex = 1; rowIndex <= Math.min(state.activeSheet.rowCount || 10, 6); rowIndex += 1) {
 const columns = [];
 for (let columnIndex = 1; columnIndex <= Math.min(state.activeSheet.columnCount || 8, 6); columnIndex += 1) {
 const cellRef = `${getColumnLabel(columnIndex)}${rowIndex}`;
 const value = readCellValue(state.activeSheet, cellRef);
 if (value) {
 columns.push(`${cellRef}=${value}`);
 }
 }
 if (columns.length) {
 rows.push(columns.join(', '));
 }
 }

 return rows.join(' | ') || '当前表格前几行为空';
 }

 function getSheetBounds(sheet) {
 const usedCells = Object.keys(sheet?.cells || {});
 let maxRow = 1;
 let maxColumn = 1;

 usedCells.forEach((cellRef) => {
 const match = /^([A-Z]+)(\\d+)$/.exec(cellRef);
 if (!match) {
 return;
 }
 maxColumn = Math.max(maxColumn, columnLabelToIndex(match[1]));
 maxRow = Math.max(maxRow, Number(match[2]));
 });

 return {
 rowCount: Math.max(Math.min(maxRow, sheet?.rowCount || 1), 1),
 columnCount: Math.max(Math.min(maxColumn, sheet?.columnCount || 1), 1)
 };
 }

 function escapeCsvValue(value) {
 const normalized = String(value ?? '');
 if (/[\",\\r\\n]/.test(normalized)) {
 return `"${normalized.replaceAll('"', '""')}"`;
 }
 return normalized;
 }

 function parseCsv(text) {
 const rows = [];
 let row = [];
 let value = '';
 let insideQuotes = false;

 for (let index = 0; index < text.length; index += 1) {
 const char = text[index];
 const nextChar = text[index + 1];

 if (insideQuotes) {
 if (char === '"' && nextChar === '"') {
 value += '"';
 index += 1;
 } else if (char === '"') {
 insideQuotes = false;
 } else {
 value += char;
 }
 continue;
 }

 if (char === '"') {
 insideQuotes = true;
 } else if (char === ',') {
 row.push(value);
 value = '';
 } else if (char === '\\n') {
 row.push(value.replace(/\\r$/, ''));
 rows.push(row);
 row = [];
 value = '';
 } else {
 value += char;
 }
 }

 row.push(value.replace(/\\r$/, ''));
 rows.push(row);

 if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
 rows.pop();
 }

 return rows;
 }

 function arrayBufferToBase64(arrayBuffer) {
 const bytes = new Uint8Array(arrayBuffer);
 let binary = '';
 bytes.forEach((byte) => {
 binary += String.fromCharCode(byte);
 });
 return btoa(binary);
 }

 function base64ToBlob(base64, mimeType) {
 const binary = atob(base64);
 const bytes = new Uint8Array(binary.length);
 for (let index = 0; index < binary.length; index += 1) {
 bytes[index] = binary.charCodeAt(index);
 }
 return new Blob([bytes], { type: mimeType });
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