# 开发模式启动（Windows PowerShell）
# 前提：已安装 Node.js >= 20.19，已执行 npm install
# 用法：powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path "node_modules")) {
    Write-Host "[dev] 未发现 node_modules，先安装依赖..." -ForegroundColor Yellow
    npm install
}

Write-Host "[dev] 启动开发模式：后端 http://127.0.0.1:3001 + 前端 http://localhost:5173" -ForegroundColor Green
Write-Host "[dev] 浏览器打开 http://localhost:5173（Ctrl+C 停止）" -ForegroundColor Green
npm run dev
