# Start production server in background with log redirection (ASCII only)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-server-bg.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force -Path logs | Out-Null
$proc = Start-Process -FilePath "node" -ArgumentList "dist-server/server/index.js" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput "logs/server.log" -RedirectStandardError "logs/server-err.log" -PassThru
Set-Content -Path "logs/server.pid" -Value $proc.Id -Encoding ascii
Start-Sleep -Seconds 2
Get-Content logs/server.log
Write-Host "PID=$($proc.Id)"
