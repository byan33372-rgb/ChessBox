# 生产模式启动（Windows PowerShell）
# 自动构建（如需要）→ 启动服务 → 可选启动隧道
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1            仅本地服务
#   powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1 -Tunnel    服务 + 公网隧道
#   powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1 -Port 8787 指定端口

param(
    [switch]$Tunnel,
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path "node_modules")) {
    Write-Host "[prod] 未发现 node_modules，先安装依赖..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "dist-client") -or -not (Test-Path "dist-server")) {
    Write-Host "[prod] 构建产物缺失，执行构建..." -ForegroundColor Yellow
    npm run build
}

Write-Host "[prod] 启动生产服务: http://127.0.0.1:$Port （Ctrl+C 停止）" -ForegroundColor Green
$env:PORT = "$Port"

if ($Tunnel) {
    # 服务放后台，前台运行隧道（Ctrl+C 同时结束）
    $server = Start-Process -FilePath "node" -ArgumentList "dist-server/server/index.js" -PassThru -NoNewWindow
    Start-Sleep -Seconds 2
    try {
        node scripts/tunnel.mjs --port $Port
    }
    finally {
        if (-not $server.HasExited) {
            Stop-Process -Id $server.Id -Force
        }
    }
}
else {
    node dist-server/server/index.js
}
