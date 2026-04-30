@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "NODE_DISABLE_COLORS=1"
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
set "ELECTRON_CMD=%~dp0node_modules\.bin\electron.cmd"

if exist "%ELECTRON_EXE%" (
    "%ELECTRON_EXE%" . %*
    exit /b %errorlevel%
)

if exist "%ELECTRON_CMD%" (
    call "%ELECTRON_CMD%" . %*
    exit /b %errorlevel%
)

echo [start-vcpchat-utf8] Electron runtime not found under node_modules.
exit /b 1
endlocal
