import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findMalformedToolFields,
    describeToolRequestMarkerProblem,
} from '../modules/renderer/toolRequestMarkers.js';
import { readToolRequestField } from '../modules/renderer/toolRequestScanner.js';
import { parseJevToolUse } from '../modules/renderer/jevToolUse.js';
import { tools as toolDefinitions } from '../VCPHumanToolBox/renderer_modules/config.js';

test('Memory A/B descriptions retain verified 2xK backend refinement semantics', () => {
    const memory = toolDefinitions.LightMemo.commands.memory_ab;
    for (const description of [toolDefinitions.LightMemo.description, memory.description,
        ...memory.params.filter(field => ['candidate_k', 'compare_rerank'].includes(field.name)).map(field => field.description)]) {
        assert.match(description, /2×K/);
        assert.doesNotMatch(description, /使用完整(?:的有界)?共同候选池|而非共识 2×K/);
    }
    assert.equal(memory.params.find(field => field.name === 'compare_rerank').default, true);
    assert.equal(memory.params.find(field => field.name === 'candidate_k').max, 100);
});

const S = '「' + '始」';
const E = '「' + '末」';
const S_ESC = '「' + '始ESCAPE」';
const E_ESC = '「' + '末ESCAPE」';
const BAD_S = '「' + '始»';
const BAD_E = '«' + '末」';

test('detects malformed tool_name marker and describes error', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `tool_name:${BAD_S}ProjectForge${BAD_E},`,
        `command:${S}ReadCode${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, ['tool_name']);

    const problem = describeToolRequestMarkerProblem({
        toolName: '',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, true);
    assert.equal(problem.displayName, '格式错误');
    assert.ok(problem.hint.includes('未识别 tool_name，服务器不会执行这次调用'));
    assert.ok(problem.hint.includes('tool_name'));
});

test('detects malformed command marker when tool_name is valid', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `tool_name:${S}ProjectForge${E},`,
        `command:${BAD_S}ReadCode${BAD_E},`,
        `path:${S}modules/test.js${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, ['command']);

    const problem = describeToolRequestMarkerProblem({
        toolName: 'ProjectForge',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, true);
    assert.equal(problem.displayName, 'ProjectForge');
    assert.ok(problem.hint.includes('以下字段标记写法有误，服务器会忽略：command'));
    assert.ok(!problem.hint.includes('未识别 tool_name'));
});

test('returns no malformed fields and not malformed for completely normal syntax', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `tool_name:${S}ProjectForge${E},`,
        `command:${S}ReadCode${E},`,
        `path:${S}modules/test.js${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: 'ProjectForge',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, false);
    assert.equal(problem.displayName, 'ProjectForge');
    assert.equal(problem.hint, '');
});

test('handles missing tool_name even when no markers are malformed', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `command:${S}ReadCode${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: '',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, true);
    assert.equal(problem.displayName, '格式错误');
    assert.equal(problem.hint, '未识别 tool_name，服务器不会执行这次调用');
});

test('does not falsely flag malformed syntax inside regular bracket value section', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `tool_name:${S}ProjectForge${E},`,
        `command:${S}EditCode${E},`,
        `replace:${S}const sample = "command:${BAD_S}test${BAD_E}";${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: 'ProjectForge',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, false);
    assert.equal(problem.displayName, 'ProjectForge');
    assert.equal(problem.hint, '');
});

test('does not treat normal JEV tool request as malformed (natural language call without tool_name)', () => {
    const content = [
        `maid:${S}Nova${E}`,
        `JEV:${S}联络[Grok]，告诉他【npm 上 animejs 最新版本是多少？】，并使用[临时通讯]。${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: '',
        malformedFields: malformed,
        isJev: true,
        content
    });

    assert.equal(problem.isMalformed, false);
    assert.equal(problem.displayName, '');
    assert.equal(problem.hint, '');
});

test('unparsed content cannot assert JEV identity when the parsed flag is omitted', () => {
    const content = [
        `maid:${S}Nova${E}`,
        `JEV:${S}联络[Grok]，告诉他【npm 上 animejs 最新版本是多少？】，并使用[临时通讯]。${E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: '',
        malformedFields: malformed,
        content
    });

    assert.equal(problem.isMalformed, true);
    assert.equal(problem.displayName, '格式错误');
    assert.match(problem.hint, /未识别 tool_name/);
});

test('JEV literals inside regular or ESCAPE parameter values do not hide a missing tool name', () => {
    for (const [start, end] of [[S, E], [S_ESC, E_ESC]]) {
        const content = `content:${start}Example JEV:${S}not a declared field${end}`;
        const jev = parseJevToolUse(readToolRequestField(content, 'JEV'));
        assert.equal(jev, null);
        const problem = describeToolRequestMarkerProblem({
            toolName: readToolRequestField(content, 'tool_name') || '',
            malformedFields: findMalformedToolFields(content),
            isJev: Boolean(jev),
            content,
        });
        assert.equal(problem.isMalformed, true);
        assert.equal(problem.displayName, '格式错误');
        assert.match(problem.hint, /未识别 tool_name/);
    }
});

test('a parsed top-level JEV field retains its valid presentation', () => {
    const content = `content:${S_ESC}Example JEV:${S}data only${E_ESC}\nJEV:${S}联络[Grok]${E}`;
    const jev = parseJevToolUse(readToolRequestField(content, 'JEV'));
    assert.ok(jev);
    const problem = describeToolRequestMarkerProblem({
        isJev: Boolean(jev),
        malformedFields: findMalformedToolFields(content),
        content,
    });
    assert.equal(problem.isMalformed, false);
    assert.equal(problem.displayName, '');
    assert.equal(problem.hint, '');
});

test('detects malformed markers on JEV field and reports error without complaining about tool_name', () => {
    const content = [
        `maid:${S}Nova${E}`,
        `JEV:${BAD_S}联络[Grok]${BAD_E}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, ['JEV']);

    const problem = describeToolRequestMarkerProblem({
        toolName: '',
        malformedFields: malformed,
        isJev: true,
        content
    });

    assert.equal(problem.isMalformed, true);
    assert.equal(problem.displayName, '');
    assert.ok(problem.hint.includes('以下字段标记写法有误，服务器会忽略：JEV'));
    assert.ok(!problem.hint.includes('未识别 tool_name'));
});

test('does not falsely flag malformed syntax inside ESCAPE value section', () => {
    const content = [
        `maid:${S}Nova${E},`,
        `tool_name:${S}ProjectForge${E},`,
        `command:${S}CreateFile${E},`,
        `content:${S_ESC}Here is demo: tool_name:${BAD_S}Bad${BAD_E}, command:${BAD_S}Run${BAD_E}${E_ESC}`
    ].join('\n');

    const malformed = findMalformedToolFields(content);
    assert.deepEqual(malformed, []);

    const problem = describeToolRequestMarkerProblem({
        toolName: 'ProjectForge',
        malformedFields: malformed,
    });

    assert.equal(problem.isMalformed, false);
    assert.equal(problem.displayName, 'ProjectForge');
    assert.equal(problem.hint, '');
});
