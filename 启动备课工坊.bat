@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title IT Lesson Studio - 中小学信息科技四位一体备课工作台

set "APP_MODE=standalone"
set "PORT=3800"
set "PATH=%~dp0runtime\node;%~dp0runtime\pandoc;%~dp0runtime\python;%PATH%"

set "NODE_EXE=node"
if exist "%~dp0runtime\node\node.exe" (
    set "NODE_EXE=%~dp0runtime\node\node.exe"
)

echo ====================================================================
echo    IT Lesson Studio · 中小学信息科技四位一体备课工作台
echo                  [Windows 免安装单机便携版]
echo ====================================================================
echo.
echo  [环境自检]
if exist "%~dp0runtime\node\node.exe" (
    echo   * 内置 Node.js 引擎 : 已就绪
) else (
    echo   * 系统 Node.js 引擎 : 检测中...
)
if exist "%~dp0runtime\pandoc\pandoc.exe" (
    echo   * 内置 Pandoc 引擎  : 已就绪
)
if exist "%~dp0runtime\python\python.exe" (
    echo   * 内置 Python 排版  : 已就绪
)
echo.
echo  [服务地址] http://localhost:%PORT%
echo  [操作提示] 正在为您自动打开浏览器，备课期间请勿关闭本窗口（最小化即可）
echo ====================================================================
echo.

netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo  [提示] 检测到备课工作台已在运行，正在为您直接打开浏览器...
    start "" "http://localhost:%PORT%"
    timeout /t 3 >nul
    exit /b 0
)

start /b cmd /c "timeout /t 2 /nobreak >nul && start "" http://localhost:%PORT%"

"%NODE_EXE%" "%~dp0web\server.js"

echo.
echo  [提示] 服务已停止运行，按任意键关闭窗口...
pause >nul
