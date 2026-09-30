'use strict';

// Trace reads declarations as data. Never resolve/require/evaluate workspace modules.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 128;
const kinds = { invoke: 'query', send: 'command', on: 'subscription', onArgs: 'subscription', onSignal: 'subscription' };

function object(node) {
    if (node?.type !== 'ObjectExpression') throw new Error('需要静态对象声明');
    const result = new Map();
    for (const p of node.properties) {
        if (p.type !== 'ObjectProperty' || p.computed || !['Identifier', 'StringLiteral'].includes(p.key.type)) {
            throw new Error('不支持动态声明属性');
        }
        const key = p.key.name ?? p.key.value;
        if (result.has(key)) throw new Error('重复声明属性');
        result.set(key, p.value);
    }
    return result;
}
function string(node) {
    if (node?.type !== 'StringLiteral') throw new Error('需要字符串字面量');
    return node.value;
}
function strings(node) {
    if (node?.type !== 'ArrayExpression') throw new Error('需要字符串数组字面量');
    return node.elements.map(string);
}
function member(node, owner, property) {
    return node?.type === 'MemberExpression' && !node.computed &&
        node.object.type === 'Identifier' && node.object.name === owner && node.property.name === property;
}
function entry(node, defaults, helpers) {
    if (node?.type !== 'CallExpression') throw new Error('不支持动态 API 声明');
    if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
        const value = entry(node.callee.object, defaults, helpers);
        if (node.callee.property.name === 'roles') value.roles = node.arguments.map(string);
        else if (node.callee.property.name !== 'mapResult') throw new Error('未知 API 修饰器');
        return value;
    }
    const helper = node.callee.type === 'Identifier' && helpers.get(node.callee.name);
    if (helper === 'custom') {
        const kind = string(node.arguments[0]);
        if (!['query', 'command', 'subscription'].includes(kind)) throw new Error('未知 API 类型');
        return { kind, channel: node.arguments[1]?.type === 'NullLiteral' ? null : string(node.arguments[1]), roles: defaults };
    }
    if (!Object.hasOwn(kinds, helper)) throw new Error('未知 API 声明函数');
    return { kind: kinds[helper], channel: string(node.arguments[0]), roles: defaults };
}

function readStaticPreloadDecls(root) {
    const base = fs.realpathSync(root);
    let total = 0;
    const read = relative => {
        const file = path.join(base, relative);
        // Refuse reparse points at every level, including ones pointing inside root.
        let cursor = base;
        for (const part of relative.split('/')) {
            cursor = path.join(cursor, part);
            if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('声明路径不允许符号链接');
        }
        const stat = fs.statSync(file);
        total += stat.size;
        if (!stat.isFile() || stat.size > MAX_BYTES || total > 4 * MAX_BYTES) throw new Error('声明文件超过静态分析限制');
        return parse(fs.readFileSync(file, 'utf8'), { sourceType: 'script' }).program.body;
    };
    if (!fs.existsSync(path.join(base, 'preloads/core/registry.js'))) {
        return { status: 'absent', apis: [], roleGlobals: null };
    }
    const registry = read('preloads/core/registry.js');
    const globals = registry.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : [])
        .filter(n => n.id.type === 'Identifier' && n.id.name === 'ROLE_GLOBALS');
    if (globals.length !== 1) throw new Error('未找到静态 ROLE_GLOBALS 声明');
    let globalNode = globals[0].init;
    if (globalNode?.type === 'CallExpression' && member(globalNode.callee, 'Object', 'freeze') && globalNode.arguments.length === 1) globalNode = globalNode.arguments[0];
    const roleGlobals = Object.fromEntries([...object(globalNode)].map(([k, v]) => [k, string(v)]));
    const apiDir = path.join(base, 'preloads/api');
    if (fs.lstatSync(apiDir).isSymbolicLink()) throw new Error('声明目录不允许符号链接');
    const files = fs.readdirSync(apiDir).filter(n => n.endsWith('.js')).sort();
    if (files.length > MAX_FILES) throw new Error('声明文件数量超过限制');
    const apis = [];
    const names = new Set();
    for (const file of files) {
        const body = read(`preloads/api/${file}`);
        const helpers = new Map();
        for (const n of body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : [])) {
            if (n.id.type !== 'ObjectPattern' || n.init?.type !== 'CallExpression' || n.init.callee.name !== 'require' ||
                n.init.arguments.length !== 1 || n.init.arguments[0].value !== '../core/define') continue;
            for (const p of n.id.properties) if (p.type === 'ObjectProperty' && !p.computed && p.value.type === 'Identifier') helpers.set(p.value.name, p.key.name);
        }
        const exports = body.filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' &&
            n.expression.operator === '=' && member(n.expression.left, 'module', 'exports'));
        if (exports.length !== 1) throw new Error('未找到唯一静态 module.exports');
        const declaration = object(exports[0].expression.right);
        const roles = strings(declaration.get('roles'));
        for (const [name, node] of object(declaration.get('api'))) {
            if (names.has(name)) throw new Error('重复 API 名');
            names.add(name);
            const value = entry(node, roles, helpers);
            if (!value.roles.length || value.roles.some(role => !Object.hasOwn(roleGlobals, role))) throw new Error('未知或空 API 角色');
            apis.push({ name, domain: path.basename(file, '.js'), ...value });
        }
    }
    return { status: 'ok', apis, roleGlobals, source: 'static' };
}

module.exports = { readStaticPreloadDecls };
