@echo off
cd /d "%~dp0.."
chcp 65001 >nul
title IT Lesson Studio - 本机运行与编译加速器

echo ====================================================================
echo    IT Lesson Studio · 本机运行与编译加速器 (Defender 免检白名单)
echo ====================================================================
echo.
echo 💡 正在为您弹出管理员授权窗口，将本项目路径加入 Windows 安全中心免检白名单...
echo    (请在稍后弹出的 UAC 提示框中点击【是】以允许加速)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command Add-MpPreference -ExclusionPath ''%CD%''; Write-Host \"`n✔ 已成功将本工程目录加入 Windows 安全中心排除项（白名单）！`n\"; Start-Sleep -Seconds 2'"

echo.
echo ====================================================================
echo 如果您在刚才弹出的管理员窗口中点击了【是】，本项目已成功开启极速模式！
echo 后续本地无论执行导出 Word、PPT 课件还是打包，都将不再受杀毒软件拖慢。
echo ====================================================================
echo.
pause
