'use strict';

if (require('./helpers/electron-test-entry.cjs').runFromNode(__filename)) return;

// 文坊原位打开文件：使用真实的 docxHandlers、modules/scriptorium 和 scriptorium-page:// 协议，
// 在隐藏窗口中打开文库里的 Markdown、文本、表格、网页、图片和 PDF，检查显示、保存回原文件、
// 未保存修改的询问、外部修改后的重新载入，以及离开视图后原有界面的还原。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme, protocol, webFrameMain } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const webPages = require('../modules/scriptorium/webPages');
protocol.registerSchemesAsPrivileged([webPages.PRIVILEGE]);

const dataRoot = process.env.VCP_ELECTRON_TEST_DATA;
const library = path.join(dataRoot, 'ScriptoriumDocument', 'VDOCX');
const file = (name) => path.join(library, name);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function writeFixtures() {
    fs.mkdirSync(path.join(library, 'img'), { recursive: true });
    fs.writeFileSync(file('note.md'), '# 标题\r\n\r\n正文第一段。\r\n\r\n![图](img/dot.png)\r\n');
    fs.writeFileSync(file('img/dot.png'), PNG);
    fs.writeFileSync(file('plain.txt'), '第一行\n第二行\n');
    fs.writeFileSync(file('other.txt'), '另一个文件\n');
    fs.writeFileSync(file('table.csv'), '名称,数量\n甲,1\n乙,2\n');
    fs.writeFileSync(file('other-table.csv'), 'OTHER,QTY\nB,9\n');
    fs.writeFileSync(file('empty-tail.csv'), 'header\n""');
    fs.writeFileSync(file('page.html'), '<!doctype html><html><head><meta charset="utf-8"><title>网页</title></head><body><h1>网页正文</h1></body></html>');
    fs.writeFileSync(file('other-page.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>第二网页</h1></body></html>');
    fs.writeFileSync(file('dot.png'), PNG);
    const { PDFDocument } = require('../vendor/pdf-lib/pdf-lib.min.js');
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]).drawText('FIRST-PAGE-ONLY');
    pdf.addPage([300, 400]).drawText('SECOND-PAGE-ONLY');
    fs.writeFileSync(file('two.pdf'), await pdf.save());
    const formPdf = await PDFDocument.create(), formPage = formPdf.addPage([300, 300]), form = formPdf.getForm();
    formPage.drawText('MASKED-AREA', { x: 10, y: 275, size: 12 });
    const visible = form.createTextField('visible'); visible.setText('ORIGINAL'); visible.addToPage(formPage, { x: 20, y: 185, width: 180, height: 30 }); visible.setFontSize(16);
    const hidden = form.createTextField('masked'); hidden.setText('MASK-OLD'); hidden.addToPage(formPage, { x: 110, y: 260, width: 150, height: 25 }); hidden.setFontSize(12);
    const check = form.createCheckBox('accept'); check.addToPage(formPage, { x: 20, y: 140, width: 20, height: 20 });
    const choice = form.createDropdown('choice'); choice.addOptions(['one', 'two']); choice.select('one'); choice.addToPage(formPage, { x: 20, y: 85, width: 120, height: 25 });
    const radio = form.createRadioGroup('radio'); radio.addOptionToPage('A', formPage, { x: 20, y: 35, width: 18, height: 18 }); radio.addOptionToPage('B', formPage, { x: 70, y: 35, width: 18, height: 18 }); radio.select('A');
    fs.writeFileSync(file('form-redact.pdf'), await formPdf.save());
    const ExcelJS = require('exceljs'), sparse = new ExcelJS.Workbook(), sparseSheet = sparse.addWorksheet('Sparse');
    sparseSheet.getCell('A1').value = 'LEFT'; sparseSheet.getCell('D1').value = 'RIGHT'; sparseSheet.getCell('A2').value = 1;
    sparseSheet.getCell('D2').value = { formula: 'A2+41', result: 42 }; sparseSheet.getCell('D3').value = { formula: 'A2+2' };
    fs.writeFileSync(file('sparse.xlsx'), Buffer.from(await sparse.xlsx.writeBuffer()));
    if (process.platform !== 'win32') for (const [name, mode] of [['note.md', 0o600], ['plain.txt', 0o700], ['table.csv', 0o600], ['other-table.csv', 0o600], ['empty-tail.csv', 0o600], ['other-page.html', 0o600], ['two.pdf', 0o600]]) fs.chmodSync(file(name), mode);
}

function registerWindowIpc() {
    ipcMain.handle('get-current-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
    ipcMain.on('window-lifecycle:ready', () => {});
    ipcMain.on('minimize-window', () => {});
    ipcMain.on('maximize-window', () => {});
    ipcMain.on('unmaximize-window', () => {});
    ipcMain.on('close-window', () => {});
    ipcMain.on('open-dev-tools', () => {});
}

let windowRef = null;
const page = (body) => windowRef.webContents.executeJavaScript(`(async () => { ${body} })()`, true);
async function until(expression, what, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await page(`return Boolean(${expression});`)) return;
        await delay(100);
    }
    throw new Error(`等待超时：${what}`);
}
async function untilFile(name, check, what, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (check(fs.readFileSync(file(name)))) return;
        await delay(100);
    }
    throw new Error(`等待超时：${what}`);
}
// 打开文件时不等待结果：有未保存的修改时会先显示询问对话框。
const open = (name) => page(`void window.ScriptoriumFileSession.openPath(${JSON.stringify(file(name))}); return true;`);
const click = (selector) => page(`document.querySelector(${JSON.stringify(selector)}).click(); return true;`);
const pressCtrl = (key) => page(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: true, bubbles: true, cancelable: true })); return true;`);
const title = () => page(`return document.getElementById('document-title').textContent;`);

// Hold only one synthetic library read after its bytes are captured. Other
// reads, including the next document, continue through the real main process.
function holdTextRead(name, { extra = false } = {}) {
    const owner = extra ? require('fs-extra') : fs.promises;
    const original = owner.readFile;
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    let armed = true;
    const delayed = async function(target, ...args) {
        const bytes = await original.call(this, target, ...args);
        if (armed && typeof target === 'string' && path.resolve(target) === path.resolve(file(name))) {
            armed = false; started(); await gate;
        }
        return bytes;
    };
    owner.readFile = delayed;
    return { entered, release, restore: () => { release(); if (owner.readFile === delayed) owner.readFile = original; } };
}

const textEditor = `document.querySelector('.scriptorium-text-source .CodeMirror').CodeMirror`;

const webEditor = `document.querySelector('.scriptorium-page-source .CodeMirror').CodeMirror`;
async function untilHeading(expected) {
    for (let tries = 0; tries < 100; tries++) {
        const frame = windowRef.webContents.mainFrame.framesInSubtree.find(item => item.name === webPages.FRAME_NAME);
        const heading = frame ? await frame.executeJavaScript("document.querySelector('h1')?.textContent || ''").catch(() => '') : '';
        if (heading === expected) return;
        await delay(100);
    }
    assert.fail(`网页预览未就绪：${expected}`);
}


app.whenReady().then(async () => {
    const errors = [];
    try {
        await writeFixtures();
        registerWindowIpc();
        require('../modules/ipc/docxHandlers').initialize({ mainWindow: null, openChildWindows: [], projectRoot, appDataRoot: dataRoot });
        webPages.installProtocol();
        if (process.platform !== 'win32') {
            const nativePath = file('private-project.vdocx');
            const opened = await require('../modules/scriptorium/markdownFiles').read(file('note.md'), { dataDir: () => path.join(dataRoot, 'AppData') });
            fs.writeFileSync(nativePath, Buffer.from(opened.bytes)); fs.chmodSync(nativePath, 0o600);
            await require('../modules/ipc/docxHandlers').writeProjectArtifact(nativePath, opened.bytes);
            assert.equal(fs.statSync(nativePath).mode & 0o777, 0o600, '原生文稿原子写入保留权限');
        }

        windowRef = new BrowserWindow({
            width: 1440,
            height: 900,
            show: false,
            frame: false,
            webPreferences: { preload: path.join(projectRoot, 'preloads', 'docx.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, offscreen: true },
        });
        windowRef.webContents.setAudioMuted(true);
        windowRef.webContents.on('console-message', (...args) => {
            const details = args.find((value) => value && typeof value === 'object' && typeof value.message === 'string');
            const level = details?.level ?? args[1];
            const message = details?.message ?? args[2] ?? '';
            // 页面卸载时原有的渲染协调器会报这一条（重新载入窗口时出现，tests/scriptorium-find-smoke.js 关窗时同样出现），与本测试无关。
            if (/Render coordinator has been disposed/.test(message)) return;
            if (level === 'error' || level === 3) errors.push(message);
        });
        windowRef.webContents.on('render-process-gone', (_event, details) => errors.push(`render-process-gone: ${details.reason}`));
        await windowRef.loadFile(path.join(projectRoot, 'ScriptoriumModules', 'scriptorium.html'));
        await until(`window.ScriptoriumFileViews && window.ScriptoriumFileSession`, '页面载入');

        // Markdown：在原有的编辑面中打开，相对图片按文件所在文件夹显示，保存时保留 CRLF。
        await open('note.md');
        await until(`window.ScriptoriumFileSession.current()?.markdownFile`, 'Markdown 打开');
        await until(`[...(document.getElementById('page-stream').shadowRoot?.querySelectorAll('img') || [])].some((img) => img.src.startsWith('file:///') && img.src.endsWith('/img/dot.png'))`, '相对图片解析');
        assert.equal(await title(), 'note.md');
        await page(`const session = window.ScriptoriumFileSession; return session.replaceSource(session.source().replace('正文第一段。', '正文第一段，已修改。'));`);
        await click('#save-btn');
        await untilFile('note.md', (bytes) => bytes.toString('utf8').includes('已修改'), 'Markdown 保存');
        const markdown = fs.readFileSync(file('note.md'), 'utf8');
        assert.equal(markdown.split('\r\n').length - 1, markdown.split('\n').length - 1, '保存后的 .md 仍全部使用 CRLF');

        // 文本：在文档区域的位置上打开；标题栏显示文件名；不支持另存为；Ctrl+S 保存回原文件。
        await open('plain.txt');
        await until(`document.body.classList.contains('scriptorium-text-mode') && document.querySelector('.scriptorium-text-source .CodeMirror')`, '文本打开');
        assert.equal(await title(), 'plain.txt');
        assert.equal(await page(`return document.getElementById('save-as-btn').disabled;`), true);
        // 视图盖在文档区域上：文档区中心点处是文本视图。
        assert.equal(await page(`const box = document.getElementById('document-workspace').getBoundingClientRect();
            return Boolean(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.scriptorium-text-work'));`), true);
        await page(`${textEditor}.replaceRange('新增一行\\n', { line: 0, ch: 0 }); return true;`);
        await until(`document.getElementById('save-state').textContent === '未保存'`, '文本未保存状态');
        await pressCtrl('s');
        await untilFile('plain.txt', (bytes) => bytes.toString('utf8') === '新增一行\n第一行\n第二行\n', '文本保存');
        await until(`document.getElementById('save-state').textContent === '已保存'`, '文本已保存状态');
        if (process.platform !== 'win32') assert.equal(fs.statSync(file('plain.txt')).mode & 0o777, 0o700);

        // 未保存的修改：打开别的文件前用原有的对话框询问；留在此处时不切换，舍弃修改时不写入文件。
        await page(`${textEditor}.replaceRange('不保存的修改\\n', { line: 0, ch: 0 }); return true;`);
        await open('other.txt');
        await until(`document.getElementById('unsaved-dialog').hidden === false`, '未保存对话框');
        assert.equal(await page(`return document.getElementById('unsaved-document-name').textContent;`), 'plain.txt');
        await click('#unsaved-cancel-btn');
        await until(`document.getElementById('unsaved-dialog').hidden`, '对话框关闭');
        assert.equal(await title(), 'plain.txt');
        assert.equal(await page(`return window.ScriptoriumTextView.doc().dirty;`), true);
        await open('other.txt');
        await until(`document.getElementById('unsaved-dialog').hidden === false`, '再次询问');
        await click('#unsaved-discard-btn');
        await until(`document.getElementById('document-title').textContent === 'other.txt'`, '舍弃后打开另一个文件');
        assert.equal(fs.readFileSync(file('plain.txt'), 'utf8'), '新增一行\n第一行\n第二行\n');

        // 外部修改：没有未保存的修改时自动重新载入。
        fs.writeFileSync(file('other.txt'), '另一个文件\n外部追加\n');
        await until(`${textEditor}.getValue().includes('外部追加')`, '外部修改后重新载入');

        // A 的迟到重载不能覆盖已经打开的 B，也不能把 B 新输入的内容标成已保存。
        await open('plain.txt');
        await until(`window.ScriptoriumTextView.doc()?.filePath === ${JSON.stringify(file('plain.txt'))}`, '切到 A');
        let heldRead = holdTextRead('plain.txt');
        try {
            await page('window.textReloadPending = window.ScriptoriumTextView.reload(); return true;');
            await heldRead.entered;
            await open('other.txt');
            await until(`window.ScriptoriumTextView.doc()?.filePath === ${JSON.stringify(file('other.txt'))}`, '读取 A 期间打开 B');
            const before = await page(`return { state: window.ScriptoriumTextView._state(), text: ${textEditor}.getValue() };`);
            heldRead.release();
            assert.equal(await page('return await window.textReloadPending;'), false);
            assert.deepEqual(await page(`return { state: window.ScriptoriumTextView._state(), text: ${textEditor}.getValue() };`), before);
        } finally { heldRead.restore(); }
        heldRead = holdTextRead('other.txt');
        try {
            await page('window.textReloadPending = window.ScriptoriumTextView.reload(); return true;');
            await heldRead.entered;
            await page(`${textEditor}.replaceRange('重载期间的新输入\\n', { line: 0, ch: 0 }); return true;`);
            heldRead.release();
            assert.equal(await page('return await window.textReloadPending;'), false);
            assert.equal(await page(`return window.ScriptoriumTextView.doc().dirty && ${textEditor}.getValue().startsWith('重载期间的新输入\\n');`), true);
            await pressCtrl('s');
            await untilFile('other.txt', bytes => bytes.toString('utf8') === '重载期间的新输入\n另一个文件\n外部追加\n', 'B 的后续保存不含 A 的内容');
            await until('!window.ScriptoriumTextView.doc().dirty', 'B 新输入已保存');
        } finally { heldRead.restore(); }

        // 回到首页：视图离开，标题栏和“篇章”面板还原，另存为恢复可用。
        await click('#home-btn');
        await until(`!document.body.classList.contains('scriptorium-text-mode') && !document.body.classList.contains('scriptorium-file-view-open')`, '回到首页');
        assert.notEqual(await title(), 'other.txt');
        assert.equal(await page(`return document.getElementById('save-as-btn').disabled;`), false);
        assert.equal(await page(`return document.querySelector('.outline-header h2').textContent;`), '篇章');

        // 表格：工作表列表显示在“篇章”面板中。
        await open('table.csv');
        await until(`document.body.classList.contains('scriptorium-table-mode') && window.ScriptoriumTableView._state()?.rows === 2`, '表格打开');
        assert.equal(await page(`return document.querySelector('.outline-header h2').textContent;`), '工作表');

        await open('empty-tail.csv');
        await until(`window.ScriptoriumTableView.doc()?.filePath === ${JSON.stringify(file('empty-tail.csv'))}`, '带末尾空记录的 CSV 打开');
        assert.ok((await page('return window.ScriptoriumTableView.agent.text();')).includes('2 行'));
        await page(`document.querySelector('.scriptorium-table-headerchk').click();
            const cell = document.querySelector('.scriptorium-table-row[data-at="0"] .c[data-col="0"]');
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            const input = document.querySelector('.scriptorium-table-editor'); input.value = 'EDITED';
            input.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
        await pressCtrl('s');
        await untilFile('empty-tail.csv', bytes => bytes.toString('utf8') === 'EDITED\n""', '修改另一格后保留末尾空记录');
        await until('!window.ScriptoriumTableView.doc().dirty', 'CSV 已保存');
        if (process.platform !== 'win32') assert.equal(fs.statSync(file('empty-tail.csv')).mode & 0o777, 0o600);
        await open('table.csv');
        await until(`window.ScriptoriumTableView.doc()?.filePath === ${JSON.stringify(file('table.csv'))}`, '返回表格 A');

        await open('sparse.xlsx');
        await until(`window.ScriptoriumTableView.doc()?.filePath === ${JSON.stringify(file('sparse.xlsx'))}`, '稀疏 XLSX 打开');
        assert.equal(await page('return window.ScriptoriumTableView._state().columns.length;'), 4);
        assert.equal(await page('return window.ScriptoriumTableView._state().rows;'), 2, '无缓存结果的末行公式仍在');
        assert.ok((await page('return window.ScriptoriumTableView.agent.text();')).includes('RIGHT'));
        await page(`const cell = document.querySelector('.scriptorium-table-row[data-at="0"] .c[data-col="0"]');
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            const input = document.querySelector('.scriptorium-table-editor'); input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
        await pressCtrl('s'); await until('!window.ScriptoriumTableView.doc().dirty', '稀疏表已保存');
        const ExcelJS = require('exceljs'), savedSparse = new ExcelJS.Workbook(); await savedSparse.xlsx.load(fs.readFileSync(file('sparse.xlsx')));
        assert.equal(savedSparse.getWorksheet('Sparse').getCell('D1').value, 'RIGHT');
        assert.equal(savedSparse.getWorksheet('Sparse').getCell('D2').formula, 'A2+41'); assert.equal(savedSparse.getWorksheet('Sparse').getCell('D3').formula, 'A2+2');
        await open('table.csv'); await until(`window.ScriptoriumTableView.doc()?.filePath === ${JSON.stringify(file('table.csv'))}`, '返回表格 A');

        let tableRead = holdTextRead('table.csv', { extra: true });
        try {
            await page('window.tableReloadPending = window.ScriptoriumTableView.reload(); return true;');
            await tableRead.entered;
            await open('other-table.csv');
            await until(`window.ScriptoriumTableView.doc()?.filePath === ${JSON.stringify(file('other-table.csv'))}`, '表格 B 打开');
            const before = await page('return window.ScriptoriumTableView.agent.text();');
            tableRead.release(); assert.equal(await page('return await window.tableReloadPending;'), false);
            assert.equal(await page('return window.ScriptoriumTableView.agent.text();'), before);
        } finally { tableRead.restore(); }
        tableRead = holdTextRead('other-table.csv', { extra: true });
        try {
            await page('window.tableReloadPending = window.ScriptoriumTableView.reload(); return true;');
            await tableRead.entered;
            await page(`const cell = document.querySelector('.scriptorium-table-row[data-at="0"] .c[data-col="0"]');
                cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                const input = document.querySelector('.scriptorium-table-editor'); input.value = 'LOCAL-DRAFT';
                input.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
            tableRead.release(); assert.equal(await page('return await window.tableReloadPending;'), false);
            assert.equal(await page("return document.querySelector('.scriptorium-table-editor').value;"), 'LOCAL-DRAFT');
            await pressCtrl('s');
            await untilFile('other-table.csv', bytes => bytes.toString('utf8').includes('LOCAL-DRAFT,9'), '表格草稿正确保存');
            await until('!window.ScriptoriumTableView.doc().dirty', '表格已保存');
        } finally { tableRead.restore(); }

        // 网页：在 scriptorium-page:// 的框中原样显示；可切换到源码。
        await open('page.html');
        await until(`document.querySelector('.scriptorium-page-work:not([hidden]) iframe.scriptorium-page-frame')`, '网页打开');
        let heading = '';
        for (let tries = 0; tries < 100 && heading !== '网页正文'; tries += 1) {
            const frame = windowRef.webContents.mainFrame.framesInSubtree.find((item) => item.name === webPages.FRAME_NAME);
            heading = frame ? await frame.executeJavaScript(`document.querySelector('h1')?.textContent || ''`).catch(() => '') : '';
            if (heading !== '网页正文') await delay(100);
        }
        assert.equal(heading, '网页正文');
        assert.ok(webFrameMain, 'webFrameMain 可用');
        await click('.scriptorium-page-work .scriptorium-seg button[data-view="source"]');
        await until(`document.querySelector('.scriptorium-page-work').dataset.view === 'source' && document.querySelector('.scriptorium-page-source .CodeMirror')?.CodeMirror.getValue().includes('网页正文')`, '网页源码');
        // 显示方式会被记住：重新载入窗口后打开网页，仍显示源码。
        windowRef.webContents.reload();
        await delay(500);
        await until(`window.ScriptoriumFileSession && window.ScriptoriumWebPage`, '重新载入后网页视图可用');
        await open('page.html');
        await until(`document.querySelector('.scriptorium-page-work:not([hidden])')?.dataset.view === 'source'`, '重新载入后仍显示源码');

        await untilHeading('网页正文');
        let webRead = holdTextRead('page.html');
        try {
            await page('window.webReloadPending = window.ScriptoriumWebPage.reload(); return true;');
            await webRead.entered;
            await open('other-page.html');
            await until(`window.ScriptoriumWebPage.doc()?.filePath === ${JSON.stringify(file('other-page.html'))}`, '网页 B 打开');
            await untilHeading('第二网页');
            const before = await page(`return { text: ${webEditor}.getValue(), frame: document.querySelector('.scriptorium-page-frame').src };`);
            webRead.release(); assert.equal(await page('return await window.webReloadPending;'), false);
            assert.deepEqual(await page(`return { text: ${webEditor}.getValue(), frame: document.querySelector('.scriptorium-page-frame').src };`), before);
        } finally { webRead.restore(); }
        webRead = holdTextRead('other-page.html');
        try {
            await page('window.webReloadPending = window.ScriptoriumWebPage.reload(); return true;');
            await webRead.entered;
            await page(`${webEditor}.replaceRange('<!-- LOCAL-HTML -->', { line: 0, ch: 0 }); return true;`);
            webRead.release(); assert.equal(await page('return await window.webReloadPending;'), false);
            assert.equal(await page('return window.ScriptoriumWebPage.doc().dirty;'), true);
            await pressCtrl('s');
            await untilFile('other-page.html', bytes => bytes.toString('utf8').startsWith('<!-- LOCAL-HTML -->') && !bytes.toString('utf8').includes('网页正文'), '网页 B 保存不含 A 内容');
            await until('!window.ScriptoriumWebPage.doc().dirty', '网页已保存');
            if (process.platform !== 'win32') assert.equal(fs.statSync(file('other-page.html')).mode & 0o777, 0o600);
        } finally { webRead.restore(); }

        // 图片
        await open('dot.png');
        await until(`document.body.classList.contains('scriptorium-image-mode') && document.querySelector('.scriptorium-image-stage img').naturalWidth === 1`, '图片打开');

        // PDF：两页绘制出来，缩略图在“篇章”面板中；旋转第一页后保存回原文件。
        await open('two.pdf');
        await until(`window.ScriptoriumPdfView._state()?.pages.length === 2 && document.querySelectorAll('.scriptorium-pdf-thumb').length === 2`, 'PDF 打开', 20000);
        assert.equal(await page(`return document.querySelector('.outline-header h2').textContent;`), '页面');
        await page(`const view = window.ScriptoriumPdfView; view._do.pick([view._state().pages[0].id]); view._do.rotatePages(1); return true;`);
        await until(`window.ScriptoriumPdfView.doc().dirty`, 'PDF 未保存状态');
        const before = fs.statSync(file('two.pdf')).mtimeMs;
        await pressCtrl('s');
        await untilFile('two.pdf', () => fs.statSync(file('two.pdf')).mtimeMs !== before, 'PDF 保存', 20000);
        const { PDFDocument } = require('../vendor/pdf-lib/pdf-lib.min.js');
        const saved = await PDFDocument.load(fs.readFileSync(file('two.pdf')));
        assert.equal(saved.getPageCount(), 2);
        assert.equal(saved.getPage(0).getRotation().angle, 90);
        assert.equal(saved.getPage(1).getRotation().angle, 0);
        if (process.platform !== 'win32') assert.equal(fs.statSync(file('two.pdf')).mode & 0o777, 0o600);

        await until(`!window.ScriptoriumPdfView.doc().dirty && !window.ScriptoriumPdfView.doc().saving`, 'PDF 保存并重载完成');

        // 实际保存链：另存对话框停留期间禁止编辑/撤销/重复保存，写入后切到文库外新 PDF。
        const exportedDir = path.join(dataRoot, 'pdf-exports');
        fs.mkdirSync(exportedDir);
        const exported = path.join(exportedDir, 'new.pdf');
        const fileAccess = require('../modules/scriptorium/fileAccess');
        assert.equal(await fileAccess.allowed(exported), false);
        const { dialog } = require('electron');
        const originalDialog = dialog.showSaveDialog;
        let releaseDialog, dialogCalls = 0;
        const dialogGate = new Promise(resolve => { releaseDialog = resolve; });
        dialog.showSaveDialog = async () => { dialogCalls++; await dialogGate; return { canceled: false, filePath: exported }; };
        try {
            await page(`const v = window.ScriptoriumPdfView, id = v._state().pages[0].id;
                v._do.add({ page: id, type: 'rect', x: 10, y: 10, w: 30, h: 20, color: [1, 0, 0] });
                window.pdfBeforeSaving = v._state(); window.pdfSavePending = v.save({ saveAs: true }); return true;`);
            await until(`window.ScriptoriumPdfView.doc().saving && document.querySelector('.scriptorium-pdf-work').inert`, 'PDF 保存锁定');
            for (let tries = 0; !dialogCalls && tries < 100; tries++) await delay(50);
            assert.equal(dialogCalls, 1);
            const locked = await page(`const v = window.ScriptoriumPdfView, before = window.pdfBeforeSaving;
                v._do.add({ page: before.pages[0].id, type: 'rect', x: 50, y: 50, w: 20, h: 20, color: [0, 0, 0] });
                v._do.undo(); v._do.redo(); v._do.rotatePages(1);
                const duplicate = await v.save();
                return { before, after: v._state(), duplicate };`);
            assert.equal(locked.duplicate, false);
            assert.deepEqual(locked.after.objects, locked.before.objects);
            assert.deepEqual(locked.after.pages, locked.before.pages);
            assert.equal(locked.after.history, locked.before.history);
            releaseDialog();
            await until(`window.ScriptoriumPdfView.doc()?.filePath === ${JSON.stringify(exported)} && !window.ScriptoriumPdfView.doc().saving && !window.ScriptoriumPdfView.doc().dirty`, '另存后打开文库外 PDF', 20000);
            assert.equal(await page('return await window.pdfSavePending;'), true);
            assert.equal(await fileAccess.allowed(exported), true);
            assert.equal(await fileAccess.allowed(path.join(exportedDir, 'neighbor.pdf')), false);
            assert.equal(await page(`return document.querySelector('.scriptorium-pdf-work').inert;`), false);
            assert.equal((await PDFDocument.load(fs.readFileSync(exported))).getPage(0).getRotation().angle, 90);
            // 新文件仍可继续编辑和撤销；操作锁没有遗留。
            assert.deepEqual(await page(`const v = window.ScriptoriumPdfView;
                v._do.add({ page: v._state().pages[0].id, type: 'rect', x: 20, y: 20, w: 10, h: 10, color: [0, 0, 0] });
                const dirty = v.doc().dirty; v._do.undo(); return [dirty, v.doc().dirty];`), [true, false]);
        } finally {
            releaseDialog();
            dialog.showSaveDialog = originalDialog;
        }

        // 从真实 PDF 视图执行拆分，检查每份输出的所有解压流，而不仅是页数。
        const splitDir = path.join(dataRoot, 'pdf-split'); fs.mkdirSync(splitDir);
        const originalOpenDialog = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [splitDir] });
        try {
            const result = await page("return await window.ScriptoriumPdfView._do.splitBy('each');");
            assert.equal(result.success, true); assert.equal(result.files.length, 2);
            const { PDFRawStream, decodePDFRawStream } = require('../vendor/pdf-lib/pdf-lib.min.js');
            for (const [index, target] of result.files.entries()) {
                const part = await PDFDocument.load(fs.readFileSync(target)); assert.equal(part.getPageCount(), 1);
                const all = part.context.enumerateIndirectObjects().map(([, object]) => {
                    if (object instanceof PDFRawStream) {
                        try { return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); } catch { return ''; }
                    }
                    return object.toString();
                }).join('\n');
                const omitted = index ? 'FIRST-PAGE-ONLY' : 'SECOND-PAGE-ONLY';
                assert.ok(!all.includes(omitted) && !all.includes(Buffer.from(omitted).toString('hex').toUpperCase()));
            }
        } finally { dialog.showOpenDialog = originalOpenDialog; }

        // 当前 PDF 被移走后，使用打开时的缓存和未保存改动另存，并实际切到新文件。
        const recovered = path.join(exportedDir, 'recovered.pdf');
        await page(`const view = window.ScriptoriumPdfView;
            view._do.add({ page: view._state().pages[0].id, type: 'text', text: 'RECOVERED-EDIT', size: 12,
                x: 20, y: 30, w: 120, h: 18, color: [0, 0, 0] }); return true;`);
        fs.unlinkSync(exported);
        const previousSaveDialog = dialog.showSaveDialog;
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: recovered });
        try {
            assert.equal(await page('return await window.ScriptoriumPdfView.save({ saveAs: true });'), true);
            assert.equal(await page('return window.ScriptoriumPdfView.doc().filePath;'), recovered);
            assert.equal(await page('return window.ScriptoriumPdfView.doc().dirty;'), false);
            assert.equal(fs.existsSync(exported), false, '普通原路径没有被隐式重建');
            const { PDFRawStream, decodePDFRawStream } = require('../vendor/pdf-lib/pdf-lib.min.js');
            const doc = await PDFDocument.load(fs.readFileSync(recovered));
            const streams = doc.context.enumerateIndirectObjects().map(([, object]) => {
                if (!(object instanceof PDFRawStream)) return '';
                try { return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); } catch { return ''; }
            }).join('\n');
            assert.ok(streams.includes(Buffer.from('RECOVERED-EDIT').toString('hex').toUpperCase()));
        } finally { dialog.showSaveDialog = previousSaveDialog; }

        // 表单当前值先进入原生渲染；涂黑最后覆盖，且保存后的 JPEG 必须是该计划生成的图像。
        await open('form-redact.pdf');
        await until(`window.ScriptoriumPdfView.doc()?.filePath === ${JSON.stringify(file('form-redact.pdf'))}`, '表单 PDF 打开');
        const originalFormRaster = await page(`const view = window.ScriptoriumPdfView;
            view._do.add({ page: view._state().pages[0].id, type: 'redact', x: 0, y: 0, w: 300, h: 50, color: [0, 0, 0] });
            return (await view._plan()).pages[0].image;`);
        let editedFormRaster = originalFormRaster;
        for (const [name, value] of [['visible', 'CURRENT-VALUE'], ['accept', true], ['choice', 'two'], ['radio', 'B']]) {
            const next = await page(`const view = window.ScriptoriumPdfView; view._do.setField(${JSON.stringify(name)}, ${JSON.stringify(value)}); return (await view._plan()).pages[0].image;`);
            assert.notEqual(next, editedFormRaster, `${name} 的当前值进入原生图像`);
            editedFormRaster = next;
        }
        const maskedFormRaster = await page(`const view = window.ScriptoriumPdfView; view._do.setField('masked', 'MASK-NEW-SECRET'); return (await view._plan()).pages[0].image;`);
        assert.equal(maskedFormRaster, editedFormRaster, '涂黑遮罩在表单渲染之后，覆盖区域的值不露出');
        assert.equal(await page('return await window.ScriptoriumPdfView.save();'), true);
        const finalForm = await PDFDocument.load(fs.readFileSync(file('form-redact.pdf')));
        const { PDFRawStream, PDFName, decodePDFRawStream } = require('../vendor/pdf-lib/pdf-lib.min.js');
        const jpeg = finalForm.context.enumerateIndirectObjects().map(([, object]) => object)
            .find(object => object instanceof PDFRawStream && object.dict.get(PDFName.of('Filter'))?.toString() === '/DCTDecode');
        assert.ok(jpeg); assert.deepEqual(Buffer.from(jpeg.getContents()), Buffer.from(maskedFormRaster.split(',')[1], 'base64'));
        const finalStreams = finalForm.context.enumerateIndirectObjects().map(([, object]) => {
            if (!(object instanceof PDFRawStream)) return object.toString();
            try { return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); } catch { return ''; }
        }).join('\n');
        assert.ok(!finalStreams.includes('MASK-NEW-SECRET') && !finalStreams.includes(Buffer.from('MASK-NEW-SECRET').toString('hex').toUpperCase()));

        assert.deepEqual(errors, [], '页面没有报错');
        console.log('Scriptorium file views Electron test passed');
        app.exit(0);
    } catch (error) {
        console.error(error);
        if (errors.length) console.error('页面报错：', errors);
        app.exit(1);
    }
});
