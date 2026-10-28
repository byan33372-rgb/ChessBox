# 停止本机服务（Windows PowerShell）
# 停止监听指定端口（默认 3001）的进程
# 用法：powershell -ExecutionPolicy Bypass -File scripts/stop-server.ps1 [-Port 3001]

param(
    [int]$Port = 3001
)

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $procId = $conn.OwningProcess
    $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Write-Host "[stop] 停止端口 $Port 上的进程: $name (PID $procId)" -ForegroundColor Yellow
    Stop-Process -Id $procId -Force
    Write-Host "[stop] 已停止" -ForegroundColor Green
}
else {
    Write-Host "[stop] 端口 $Port 上没有正在运行的服务" -ForegroundColor DarkGray
}
