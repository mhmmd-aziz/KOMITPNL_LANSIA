Write-Host "Menghentikan proses server SIGAP (Port 8000, 8001, 5173)..." -ForegroundColor Yellow

$ports = @(8000, 8001, 5173)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -and $procId -gt 4) {
                try {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Host "-> Menghentikan proses PID $procId pada port $port" -ForegroundColor Green
                } catch {}
            }
        }
    }
}

Write-Host "Selesai." -ForegroundColor Cyan

