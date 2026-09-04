@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 实验变量数据流 - 本地服务

echo.
echo   实验变量数据流
echo   正在启动本地服务……
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 首次运行，正在安装所需组件……
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo 正在构建本地网页……
call npm.cmd run build
if errorlevel 1 goto :error

echo.
echo 本地地址：http://127.0.0.1:3000
echo 关闭本窗口或按 Ctrl+C 即可停止服务。
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:3000'"
call npm.cmd run start
exit /b 0

:error
echo.
echo [错误] 本地服务启动失败，请保留本窗口中的提示信息。
pause
exit /b 1
