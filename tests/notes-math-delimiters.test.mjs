import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../Notemodules/notes.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'unambiguous' });
const calls = [];
function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.name === 'renderMathInElement' && node.arguments[0]?.name === 'previewContentDiv') calls.push(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
    }
}
visit(ast);
assert.equal(calls.length, 1);
const call = source.slice(calls[0].start, calls[0].end);
const vendor = fs.readFileSync(new URL('../vendor/auto-render.min.js', import.meta.url), 'utf8');
function render(text) {
    const dom = new JSDOM('<div id="preview"></div>');
    const root = dom.window.document.getElementById('preview');
    root.textContent = text;
    const rendered = [];
    const context = { document: dom.window.document, Node: dom.window.Node, console, self: { katex: {
        ParseError: class extends Error {},
        render: (tex, element, options) => { rendered.push({ tex, display: options.displayMode }); element.textContent = '[' + tex + ']'; },
    } } };
    vm.runInNewContext(vendor, context);
    vm.runInNewContext(call, { renderMathInElement: context.self.renderMathInElement, previewContentDiv: root });
    const result = { rendered, text: root.textContent };
    dom.window.close();
    return result;
}

test('notes keep single-dollar inline math distinct from double-dollar display math', () => {
    assert.deepEqual(render('before $x+1$ middle $$y+2$$ after'), {
        rendered: [{ tex: 'x+1', display: false }, { tex: 'y+2', display: true }],
        text: 'before [x+1] middle [y+2] after',
    });
});
test('an unmatched math delimiter stays literal', () => {
    assert.deepEqual(render('price $5'), { rendered: [], text: 'price $5' });
});
