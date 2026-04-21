# VCP_Plugin_Validator.ps1 (Encoding-Safe Version)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

param(
    [string]$VCPRoot = "A:\VCP",
    [string]$ConfigPath = "$VCPRoot\config.json"
)

Write-Host "=== VCP Plugin Validator (Nova Edition) ===" -ForegroundColor Cyan
$errors = 0; $warnings = 0

# 1. Check Root & Config
if (-not (Test-Path $VCPRoot)) { Write-Host "[X] Root dir not found: $VCPRoot" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Root dir found: $VCPRoot" -ForegroundColor Green

if (Test-Path $ConfigPath) {
    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        Write-Host "[OK] config.json syntax valid" -ForegroundColor Green
        if ($config.system.mode -match "lite|minimal") {
            Write-Host "[!] Warning: Mode is $($config.system.mode). Change to 'full'." -ForegroundColor Yellow; $warnings++
        }
        if ($config.plugins.enabled -eq $false) {
            Write-Host "[X] Error: plugins.enabled is false!" -ForegroundColor Red; $errors++
        }
    } catch { Write-Host "[X] config.json parse failed: $_" -ForegroundColor Red; $errors++ }
} else { Write-Host "[!] config.json not found. Using default scan." -ForegroundColor Yellow; $warnings++ }

# 2. Scan Plugin Dirs
$pluginDirs = @("$VCPRoot\Plugin", "$VCPRoot\modules\plugins", "$VCPRoot\server\plugins")
$foundPlugins = @()
foreach ($dir in $pluginDirs) {
    if (Test-Path $dir) {
        Write-Host "[OK] Found plugin dir: $dir" -ForegroundColor Green
        $foundPlugins += Get-ChildItem $dir -Recurse -Include *.js, *.json, *.ts | Where-Object { $_.Name -match "^(index|manifest|plugin|main)\." }
    } else { Write-Host "[!] Plugin dir missing: $dir" -ForegroundColor Yellow }
}

if ($foundPlugins.Count -eq 0) { Write-Host "[X] No valid plugin files found" -ForegroundColor Red; $errors++ }
else { Write-Host "[OK] Found $($foundPlugins.Count) potential plugin entries" -ForegroundColor Green }

# 3. Check Core Tools
Write-Host "`n=== Core Toolchain Check ===" -ForegroundColor Cyan
$expectedTools = @("LocalSearchController", "FileOperator", "PowerShellExecutor", "DailyNote", "VSearch")
foreach ($tool in $expectedTools) {
    $match = $foundPlugins | Where-Object { $_.FullName -match $tool }
    if ($match) { Write-Host "[OK] $tool : Found" -ForegroundColor Green }
    else { Write-Host "[X] $tool : Missing" -ForegroundColor Red; $errors++ }
}

# 4. Report
Write-Host "`n=== Validation Report ===" -ForegroundColor Cyan
if ($errors -eq 0 -and $warnings -eq 0) { Write-Host "[OK] All checks passed. Plugin system should load correctly." -ForegroundColor Green }
elseif ($errors -gt 0) { Write-Host "[X] Found $errors errors. Fix and restart VCP." -ForegroundColor Red }
else { Write-Host "[!] Found $warnings warnings. Review recommended." -ForegroundColor Yellow }
Write-Host "Press any key to exit..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")