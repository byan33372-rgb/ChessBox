# Memory measurement for the running production server (ASCII only)
$root = Split-Path $PSScriptRoot -Parent
$serverPid = (Get-Content (Join-Path $root "logs/server.pid")).Trim()
$p = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if (-not $p) { Write-Host "PROCESS NOT FOUND"; exit 1 }
Write-Host ("PID=$($p.Id)")
Write-Host ("WorkingSet MB=" + [math]::Round($p.WorkingSet64/1MB,1))
Write-Host ("PrivateMB=" + [math]::Round($p.PrivateMemorySize64/1MB,1))
