'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function loadRenderedTextModule() {
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://scriptorium.local/',
    });
    const source = fs.readFileSync(
        path.join(
            __dirname,
            '..',
            'ScriptoriumModules',
            'scriptorium-rendered-text.js'
        ),
        'utf8'
    );
    const context = vm.createContext({
        console,
        window: dom.window,
        document: dom.window.document,
        Node: dom.window.Node,
        NodeFilter: dom.window.NodeFilter,
        MutationObserver: dom.window.MutationObserver,
        AbortController: dom.window.AbortController,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    });
    vm.runInContext(source, context, {
        filename: 'scriptorium-rendered-text.js',
    });
    return context.window.ScriptoriumRenderedText;
}

test('island sequence mapping disambiguates short JS-injected text', () => {
    const renderedText = loadRenderedTextModule();
    const islandSource = `
<div data-vdoc-island="three-dimensional-text-card">
    <style>
        .three-d-title { transform: translateZ(72px); }
        .three-d-cube { animation: spin 10s linear infinite; }
    </style>
    <div class="three-d-title">文字也可以拥有空间</div>
    <p class="three-d-copy">移动鼠标观察景深</p>
    <div class="cube-front"></div>
    <div class="cube-back"></div>
    <script>
    (() => {
        const cubeTexts = [
            ['cube-front', '文字'],
            ['cube-back', '空间'],
            ['cube-right', '旋转'],
            ['cube-left', '注入'],
            ['cube-top', 'CSS 3D'],
            ['cube-bottom', 'JS TEXT']
        ];
        cubeTexts.forEach(([faceClass, text]) => {
            const face = document.querySelector('.' + faceClass);
            if (face) face.textContent = text;
        });
    })();
    </script>
</div>`;

    const visibleTexts = [
        '文字也可以拥有空间',
        '移动鼠标观察景深',
        '文字',
        '空间',
        '旋转',
        '注入',
        'CSS 3D',
        'JS TEXT',
    ];
    const targetOrdinal = visibleTexts.indexOf('文字');
    const range = renderedText.sequenceSourceRange(
        islandSource,
        {
            text: '文字',
            ordinal: targetOrdinal,
            sameTextOrdinal: 0,
            previousText: visibleTexts[targetOrdinal - 1],
            nextText: visibleTexts[targetOrdinal + 1],
        },
        { textNodeCount: visibleTexts.length }
    );

    assert.ok(range, 'the injected short text must be mapped');
    assert.equal(range.reason, 'island-text-sequence');
    assert.equal(islandSource.slice(range.start, range.end), '文字');

    const titleOffset = islandSource.indexOf('文字也可以拥有空间');
    const scriptFieldOffset = islandSource.indexOf(
        "'文字'",
        islandSource.indexOf('const cubeTexts')
    ) + 1;
    assert.notEqual(range.start, titleOffset);
    assert.equal(range.start, scriptFieldOffset);
});

test('source field extraction preserves offsets after style blocks', () => {
    const renderedText = loadRenderedTextModule();
    const islandSource = [
        '<div data-vdoc-island="offset-test">',
        '<style>.label::after { content: "not visible"; }</style>',
        '<div>静态锚点</div>',
        '<script>const labels = ["动态文字", "后续锚点"];</script>',
        '</div>',
    ].join('\n');

    const fields = renderedText.sourceTextFields(islandSource);
    const dynamicField = fields.find((field) => field.text === '动态文字');

    assert.ok(dynamicField);
    assert.equal(
        islandSource.slice(
            dynamicField.start,
            dynamicField.start + dynamicField.text.length
        ),
        '动态文字'
    );
});

test('precomputed source fields preserve sequence mapping decisions', () => {
    const renderedText = loadRenderedTextModule();
    const source = [
        '<div data-vdoc-island="source-index-equivalence">',
        '<h1>唯一静态文字</h1>',
        '<p>前置锚点</p>',
        '<p>重复文字</p>',
        '<p>中间锚点</p>',
        '<p>重复文字</p>',
        '<p>后置锚点</p>',
        '<script>',
        'const labels = ["脚本前锚点", "短文", "脚本后锚点", "核心可见文字"];',
        '</script>',
        '</div>',
    ].join('\n');
    const visibleTexts = [
        '唯一静态文字',
        '前置锚点',
        '重复文字',
        '中间锚点',
        '重复文字',
        '后置锚点',
        '脚本前锚点',
        '短文',
        '脚本后锚点',
        '核心可见文字',
    ];
    const sourceFields = renderedText.sourceTextFields(source);
    const originalFields = JSON.parse(JSON.stringify(sourceFields));
    const cases = [
        {
            name: 'unique static HTML text',
            snapshot: {
                text: '唯一静态文字',
                ordinal: 0,
                sameTextOrdinal: 0,
                previousText: '',
                nextText: '前置锚点',
            },
        },
        {
            name: 'repeated text with previous and next anchors',
            snapshot: {
                text: '重复文字',
                ordinal: 4,
                sameTextOrdinal: 1,
                previousText: '中间锚点',
                nextText: '后置锚点',
            },
        },
        {
            name: 'short JavaScript-injected text',
            snapshot: {
                text: '短文',
                ordinal: 7,
                sameTextOrdinal: 0,
                previousText: '脚本前锚点',
                nextText: '脚本后锚点',
            },
        },
        {
            name: 'trimmed fallback-compatible content',
            snapshot: {
                text: '\n  核心可见文字  \n',
                ordinal: 9,
                sameTextOrdinal: 0,
                previousText: '脚本后锚点',
                nextText: '',
            },
        },
    ];

    cases.forEach(({ name, snapshot }) => {
        const options = { textNodeCount: visibleTexts.length };
        const uncached = renderedText.sequenceSourceRange(
            source,
            snapshot,
            options
        );
        const cached = renderedText.sequenceSourceRange(
            source,
            snapshot,
            { ...options, sourceFields }
        );
        assert.deepEqual(cached, uncached, name);
        assert.ok(cached, `${name} should remain resolvable`);
    });

    assert.deepEqual(JSON.parse(JSON.stringify(sourceFields)), originalFields);
});

test('precomputed source fields preserve unresolved ambiguous mappings', () => {
    const renderedText = loadRenderedTextModule();
    const source = [
        '<div data-vdoc-island="ambiguous-source-index">',
        '<p>相同文字</p>',
        '<p>相同文字</p>',
        '</div>',
    ].join('\n');
    const snapshot = {
        text: '相同文字',
        ordinal: 0,
        sameTextOrdinal: 0,
        previousText: '',
        nextText: '',
    };
    const options = { textNodeCount: 2 };
    const sourceFields = renderedText.sourceTextFields(source);
    const originalFields = JSON.parse(JSON.stringify(sourceFields));
    const uncached = renderedText.sequenceSourceRange(source, snapshot, options);
    const cached = renderedText.sequenceSourceRange(
        source,
        snapshot,
        { ...options, sourceFields }
    );

    assert.equal(uncached, null);
    assert.deepEqual(cached, uncached);
    assert.deepEqual(JSON.parse(JSON.stringify(sourceFields)), originalFields);
});

test('island-local source fields preserve full-document offsets', () => {
    const renderedText = loadRenderedTextModule();
    const prefix = '<!doctype html>\r\n<section>文档前缀</section>\n';
    const scopedSource = [
        '  \r\n<div data-vdoc-island="offset-model">',
        '<style>\r\n.target::before { content: "样式遮罩"; }\n</style>',
        '<h1>静态锚点</h1>\r\n',
        '<script>\n',
        'const labels = ["脚本前锚点", "动态目标", "脚本后锚点"];\r\n',
        '</script>',
        '</div>\r\n  ',
    ].join('');
    const suffix = '\n<footer>文档后缀</footer>\r\n';
    const fullDocument = prefix + scopedSource + suffix;
    const islandStart = prefix.length;
    const snapshot = {
        text: '动态目标',
        ordinal: 2,
        sameTextOrdinal: 0,
        previousText: '脚本前锚点',
        nextText: '脚本后锚点',
    };
    const textNodeCount = 4;
    const sourceFields = renderedText.sourceTextFields(scopedSource);
    const uncached = renderedText.sequenceSourceRange(
        scopedSource,
        snapshot,
        { textNodeCount }
    );
    const cached = renderedText.sequenceSourceRange(
        scopedSource,
        snapshot,
        { textNodeCount, sourceFields }
    );

    assert.deepStrictEqual(cached, uncached);
    assert.ok(cached);
    assert.ok(islandStart > 0);
    assert.ok(cached.start > 0);
    const absoluteStart = islandStart + cached.start;
    const absoluteEnd = islandStart + cached.end;
    assert.equal(
        fullDocument.slice(absoluteStart, absoluteEnd),
        '动态目标'
    );
});
