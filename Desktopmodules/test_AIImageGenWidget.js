/**
 * AIImageGenWidget 测试脚本
 * 验证挂件模板和功能的正确性
 */

const fs = require('fs');
const path = require('path');

console.log('=== AIImageGenWidget 测试开始 ===\n');

// 测试 1: 文件存在性
console.log('测试 1: 文件存在性检查');
const widgetFile = path.join(__dirname, 'builtinWidgets', 'AIImageGenWidget.js');
if (fs.existsSync(widgetFile)) {
    console.log('  ✅ AIImageGenWidget.js 存在');
} else {
    console.log('  ❌ AIImageGenWidget.js 不存在');
    process.exit(1);
}

// 测试 2: 文件可读性
console.log('\n测试 2: 文件可读性检查');
try {
    const content = fs.readFileSync(widgetFile, 'utf8');
    console.log(`  ✅ 文件大小: ${content.length} 字节`);

    // 检查关键内容
    const checks = [
        { name: 'IIFE 闭包', pattern: /\(function\s*\(\)\s*{/ },
        { name: 'VCPDesktop 命名空间', pattern: /window\.VCPDesktop/ },
        { name: 'spawnAIImageGenWidget 函数', pattern: /async function spawnAIImageGenWidget/ },
        { name: 'HTML 模板', pattern: /AI_IMAGE_GEN_HTML/ },
        { name: '工作流定义', pattern: /WF-001.*电商模特图/ },
        { name: '提示词模板', pattern: /promptTemplates/ },
        { name: '分类标签', pattern: /ecommerce.*portrait.*marketing.*anime/ },
        { name: '生成按钮事件', pattern: /ai-generate-btn/ },
        { name: '复制按钮事件', pattern: /ai-copy-btn/ },
        { name: 'vcpAPI 调用', pattern: /vcpAPI\.fetch/ },
    ];

    console.log('\n测试 3: 关键内容检查');
    let passCount = 0;
    checks.forEach(check => {
        if (check.pattern.test(content)) {
            console.log(`  ✅ ${check.name}`);
            passCount++;
        } else {
            console.log(`  ❌ ${check.name} - 未找到`);
        }
    });

    console.log(`\n  通过率: ${passCount}/${checks.length}`);

    // 测试 4: 语法检查
    console.log('\n测试 4: JavaScript 语法检查');
    try {
        // 尝试解析文件（仅检查语法，不执行）
        new Function(content.replace(/window\.VCPDesktop/g, '({})'));
        console.log('  ✅ JavaScript 语法正确');
    } catch (syntaxError) {
        console.log(`  ⚠️  语法警告: ${syntaxError.message}`);
    }

} catch (error) {
    console.log(`  ❌ 读取失败: ${error.message}`);
    process.exit(1);
}

// 测试 5: desktop.html 集成检查
console.log('\n测试 5: desktop.html 集成检查');
const htmlFile = path.join(__dirname, 'desktop.html');
if (fs.existsSync(htmlFile)) {
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    if (htmlContent.includes('builtinWidgets/AIImageGenWidget.js')) {
        console.log('  ✅ 脚本引用已添加到 desktop.html');
    } else {
        console.log('  ❌ 脚本引用未添加到 desktop.html');
    }
} else {
    console.log('  ❌ desktop.html 不存在');
}

// 测试 6: debugTools.js 集成检查
console.log('\n测试 6: debugTools.js 集成检查');
const debugFile = path.join(__dirname, 'debug', 'debugTools.js');
if (fs.existsSync(debugFile)) {
    const debugContent = fs.readFileSync(debugFile, 'utf8');
    if (debugContent.includes('spawnAIImageGenWidget')) {
        console.log('  ✅ 调试入口已添加到 debugTools.js');
    } else {
        console.log('  ❌ 调试入口未添加到 debugTools.js');
    }
} else {
    console.log('  ❌ debugTools.js 不存在');
}

console.log('\n=== 测试完成 ===');
console.log('\n使用方法:');
console.log('1. 启动 VCPDesktop');
console.log('2. 在控制台输入: window.__desktopDebug.spawnAIImageGenWidget()');
console.log('3. 挂件应出现在桌面画布上');
