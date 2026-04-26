#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const pipelinePath = path.join(__dirname, '..', 'modules', 'renderer', 'contentPipeline.js');
const source = fs.readFileSync(pipelinePath, 'utf8')
    .replace(/export\s*\{[\s\S]*?\};?\s*$/m, 'module.exports = { PIPELINE_MODES, createContentPipeline };');

const moduleShim = { exports: {} };
Function('module', 'exports', source)(moduleShim, moduleShim.exports);

const { PIPELINE_MODES, createContentPipeline } = moduleShim.exports;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const pipeline = createContentPipeline({
    escapeHtml,
});

const headingCase = pipeline.process([
    '## Plan',
    '- [x] 已完成',
    '- [-] 进行中',
    '- [ ] 待处理',
].join('\n'), {
    mode: PIPELINE_MODES.FULL_RENDER,
}).text;

const explicitCase = pipeline.process([
    '<<<[CODEX_TODO]>>>',
    'title: 下一步',
    '- [x] 第一项',
    '- [~] 第二项',
    '- 第三项',
    '<<<[END_CODEX_TODO]>>>',
].join('\n'), {
    mode: PIPELINE_MODES.FULL_RENDER,
}).text;

const checks = [
    ['heading panel', headingCase.includes('data-vcp-codex-todo="true"')],
    ['done state', headingCase.includes('is-done')],
    ['active state', headingCase.includes('is-active')],
    ['pending state', headingCase.includes('is-pending')],
    ['explicit title', explicitCase.includes('<h3>下一步</h3>')],
];

const failed = checks.filter(([, pass]) => !pass);
if (failed.length > 0) {
    for (const [name] of failed) {
        console.error(`codex todo panel smoke failed: ${name}`);
    }
    process.exit(1);
}

console.log('codex todo panel smoke: ok');
