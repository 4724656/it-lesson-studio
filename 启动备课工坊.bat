@echo off
cd /d "%~dp0"
chcp 65001 >nul
title IT Lesson Studio
if exist "runtime\node\node.exe" (
    "runtime\node\node.exe" "scripts\start-portable.mjs"
) else (
    node "scripts\start-portable.mjs"
)
if errorlevel 1 pause
