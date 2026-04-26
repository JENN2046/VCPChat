@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "NODE_DISABLE_COLORS=1"
call node_modules\.bin\electron.cmd . %*
endlocal
