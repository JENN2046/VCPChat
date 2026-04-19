/**
 * 测试智能安全检查机制
 * 用于验证路径中的关键字不会触发误报
 */

// 导入智能安全检查函数（需要从主文件中提取）
function intelligentSecurityCheck(command, forbiddenKeywords, authRequiredKeywords) {
    const result = {
        isForbidden: false,
        needsAuth: false,
        matchedKeyword: null,
        reason: null
    };

    // 预处理命令：移除多余空格，转换为小写
    const normalizedCommand = command.trim().toLowerCase();
    
    // 如果命令为空，直接返回
    if (!normalizedCommand) {
        return result;
    }

    // 定义路径模式 - 常见的Windows和Unix路径格式
    const pathPatterns = [
        /[a-z]:\\[^\\/:*?"<>|]*(?:\\[^\\/:*?"<>|]*)*\\?/gi,  // Windows路径 C:\path\to\file
        /\/[^\/\s]*(?:\/[^\/\s]*)*\/?/g,                      // Unix路径 /path/to/file
        /\$env:[a-z_]+[^\\/:*?"<>|\s]*/gi,                   // PowerShell环境变量路径
        /\${[^}]+}[^\\/:*?"<>|\s]*/gi,                       // 变量路径 ${VAR}/path
        /~\/[^\/\s]*(?:\/[^\/\s]*)*\/?/g                     // 用户目录路径 ~/path
    ];

    // 提取所有可能的路径
    const detectedPaths = [];
    pathPatterns.forEach(pattern => {
        const matches = normalizedCommand.match(pattern);
        if (matches) {
            detectedPaths.push(...matches);
        }
    });

    // 创建不包含路径的命令版本用于安全检查
    let commandWithoutPaths = normalizedCommand;
    detectedPaths.forEach(path => {
        // 将路径替换为占位符，避免路径中的关键字被误判
        commandWithoutPaths = commandWithoutPaths.replace(path.toLowerCase(), ' __PATH_PLACEHOLDER__ ');
    });

    // 清理命令：移除多余空格
    commandWithoutPaths = commandWithoutPaths.replace(/\s+/g, ' ').trim();

    // 检查禁止的关键字
    for (const keyword of forbiddenKeywords) {
        if (!keyword) continue;
        
        const keywordLower = keyword.toLowerCase();
        
        // 1. 首先检查是否在路径中
        const isInPath = detectedPaths.some(path => 
            path.toLowerCase().includes(keywordLower)
        );
        
        if (isInPath) {
            // 如果关键字只在路径中出现，检查是否也在命令部分出现
            if (!commandWithoutPaths.includes(keywordLower)) {
                console.log(`[测试] 安全检查：关键字 "${keyword}" 仅在路径中发现，允许执行`);
                continue; // 跳过这个关键字，不视为违规
            }
        }
        
        // 2. 检查命令部分是否包含关键字
        if (commandWithoutPaths.includes(keywordLower)) {
            // 3. 进一步验证：检查关键字是否作为独立的命令或参数出现
            const wordBoundaryPattern = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            
            if (wordBoundaryPattern.test(commandWithoutPaths)) {
                result.isForbidden = true;
                result.matchedKeyword = keyword;
                result.reason = `命令包含被禁止的关键字: ${keyword}`;
                console.log(`[测试] 安全检查：发现禁止的命令关键字 "${keyword}"`);
                return result;
            }
        }
    }

    // 检查需要授权的关键字（使用相同的逻辑）
    for (const keyword of authRequiredKeywords) {
        if (!keyword) continue;
        
        const keywordLower = keyword.toLowerCase();
        
        // 1. 首先检查是否在路径中
        const isInPath = detectedPaths.some(path => 
            path.toLowerCase().includes(keywordLower)
        );
        
        if (isInPath) {
            // 如果关键字只在路径中出现，检查是否也在命令部分出现
            if (!commandWithoutPaths.includes(keywordLower)) {
                console.log(`[测试] 安全检查：授权关键字 "${keyword}" 仅在路径中发现，不需要授权`);
                continue; // 跳过这个关键字，不需要授权
            }
        }
        
        // 2. 检查命令部分是否包含关键字
        if (commandWithoutPaths.includes(keywordLower)) {
            // 3. 进一步验证：检查关键字是否作为独立的命令或参数出现
            const wordBoundaryPattern = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            
            if (wordBoundaryPattern.test(commandWithoutPaths)) {
                result.needsAuth = true;
                result.matchedKeyword = keyword;
                result.reason = `命令包含需要授权的关键字: ${keyword}`;
                console.log(`[测试] 安全检查：发现需要授权的命令关键字 "${keyword}"`);
                // 注意：不要return，继续检查其他关键字
            }
        }
    }

    return result;
}

// 测试用例
function runTests() {
    console.log('=== PowerShell 智能安全检查测试 ===\n');
    
    const forbiddenCommands = ['rm', 'del', 'format', 'rmdir'];
    const authRequiredCommands = ['net', 'shutdown', 'restart', 'remove-item', 'set-item'];
    
    const testCases = [
        {
            name: '误报案例：路径中包含rm',
            command: '$env:PATH += ";A:\\Down\\APK\\platform-tools-latest-windows\\platform-tools"',
            expectedForbidden: false,
            expectedAuth: false
        },
        {
            name: '误报案例：设置环境变量到包含rm的路径',
            command: 'Set-Item -Path "Env:ANDROID_HOME" -Value "A:\\Down\\APK\\platform-tools-latest-windows\\platform-tools"',
            expectedForbidden: false,
            expectedAuth: true // Set-Item需要授权
        },
        {
            name: '正确阻止：真正的rm命令',
            command: 'rm -rf /important/files',
            expectedForbidden: true,
            expectedAuth: false
        },
        {
            name: '正确阻止：PowerShell删除命令',
            command: 'Remove-Item -Path "C:\\temp\\*" -Recurse -Force',
            expectedForbidden: false,
            expectedAuth: true // Remove-Item需要授权
        },
        {
            name: '正常命令：获取进程列表',
            command: 'Get-Process | Where-Object {$_.Name -like "*chrome*"}',
            expectedForbidden: false,
            expectedAuth: false
        },
        {
            name: '需要授权：网络配置',
            command: 'net user testuser /add',
            expectedForbidden: false,
            expectedAuth: true
        },
        {
            name: '路径中包含net但不是命令',
            command: 'Get-ChildItem "C:\\Windows\\Microsoft.NET\\Framework64"',
            expectedForbidden: false,
            expectedAuth: false
        },
        {
            name: '复杂路径测试',
            command: 'Copy-Item -Path "A:\\Projects\\network-tools\\bin\\netstat.exe" -Destination "C:\\Tools\\"',
            expectedForbidden: false,
            expectedAuth: false // Copy-Item不在当前授权列表中
        }
    ];
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    testCases.forEach((testCase, index) => {
        console.log(`测试 ${index + 1}: ${testCase.name}`);
        console.log(`命令: ${testCase.command}`);
        
        const result = intelligentSecurityCheck(
            testCase.command,
            forbiddenCommands,
            authRequiredCommands
        );
        
        const forbiddenMatch = result.isForbidden === testCase.expectedForbidden;
        const authMatch = result.needsAuth === testCase.expectedAuth;
        
        if (forbiddenMatch && authMatch) {
            console.log('✅ 测试通过');
            passedTests++;
        } else {
            console.log('❌ 测试失败');
            console.log(`  预期: 禁止=${testCase.expectedForbidden}, 需要授权=${testCase.expectedAuth}`);
            console.log(`  实际: 禁止=${result.isForbidden}, 需要授权=${result.needsAuth}`);
            if (result.reason) {
                console.log(`  原因: ${result.reason}`);
            }
        }
        console.log('');
    });
    
    console.log(`=== 测试结果: ${passedTests}/${totalTests} 通过 ===`);
    
    if (passedTests === totalTests) {
        console.log('🎉 所有测试通过！智能安全检查机制工作正常。');
    } else {
        console.log('⚠️  部分测试失败，需要进一步调试。');
    }
}

// 运行测试
if (require.main === module) {
    runTests();
}

module.exports = { intelligentSecurityCheck, runTests };