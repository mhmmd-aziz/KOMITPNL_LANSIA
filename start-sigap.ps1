param(
    [string]$LanIp = "",
    [string]$VideoSource = "idle",
    [switch]$SkipCv,
    [switch]$SkipMobile,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   SIGAP AUTO-LAUNCHER - Sinkron IP & Langsung Jalan  " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Deteksi IP LAN aktif secara otomatis (tanpa tanya input manual)
function Get-DetectedLanIp {
    try {
        # Prioritas 1: Adapter fisik aktif (Wi-Fi / Ethernet) yang punya Default Gateway
        $gwConfigs = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPv4DefaultGateway -ne $null -and
                $_.IPv4Address -ne $null -and
                $_.InterfaceAlias -notmatch "WSL|vEthernet|Loopback|VMware|VirtualBox|Docker|Tailscale|ZeroTier|Bluetooth" -and
                $_.InterfaceDescription -notmatch "Hyper-V|Virtual|VMware|VirtualBox|TAP-Windows|WireGuard"
            }
        if ($gwConfigs) {
            foreach ($cfg in $gwConfigs) {
                $ip = ($cfg.IPv4Address | Select-Object -First 1).IPAddress
                if ($ip -and $ip -ne "127.0.0.1" -and $ip -notlike "169.254.*") {
                    return $ip
                }
            }
        }

        # Prioritas 2: IPv4 aktif non-virtual (mis. Hotspot Laptop tanpa gateway keluar)
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.InterfaceAlias -notmatch "WSL|vEthernet|Loopback|VMware|VirtualBox|Docker|Tailscale|ZeroTier"
            } |
            Sort-Object -Property InterfaceMetric
        if ($ips -and $ips.Count -gt 0) {
            return $ips[0].IPAddress
        }
    } catch {}
    return "127.0.0.1"
}

if ([string]::IsNullOrWhiteSpace($LanIp)) {
    $LanIp = Get-DetectedLanIp
} else {
    $LanIp = $LanIp.Trim()
}

$BackendUrl = "http://${LanIp}:8000"
Write-Host "-> IP LAN Otomatis : $LanIp" -ForegroundColor Yellow
Write-Host "-> BACKEND_URL     : $BackendUrl" -ForegroundColor Green

# Helper untuk memperbarui nilai key=value di file .env
function Set-EnvValue {
    param(
        [string]$FilePath,
        [string]$ExamplePath,
        [string]$Key,
        [string]$Value
    )
    if (-not (Test-Path $FilePath) -and (Test-Path $ExamplePath)) {
        Copy-Item $ExamplePath $FilePath
    }
    if (-not (Test-Path $FilePath)) {
        Set-Content -Path $FilePath -Value "${Key}=${Value}" -Encoding ASCII
        return
    }
    $lines = Get-Content $FilePath
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^\s*${Key}\s*=") {
            $found = $true
            "${Key}=${Value}"
        } else {
            $line
        }
    }
    if (-not $found) {
        $updated += "${Key}=${Value}"
    }
    Set-Content -Path $FilePath -Value $updated -Encoding ASCII
}

# 2. Sinkronkan BACKEND_URL: untuk Web & CV Worker di laptop gunakan loopback agar kebal ganti Wi-Fi, untuk Mobile gunakan IP LAN
Set-EnvValue -FilePath "$RootDir\web\.env" -ExamplePath "$RootDir\web\.env.example" -Key "BACKEND_URL" -Value "http://localhost:8000"
Set-EnvValue -FilePath "$RootDir\cv-worker\.env" -ExamplePath "$RootDir\cv-worker\.env.example" -Key "BACKEND_URL" -Value "http://127.0.0.1:8000"
if (-not (Test-Path "$RootDir\backend\.env") -and (Test-Path "$RootDir\backend\.env.example")) {
    Copy-Item "$RootDir\backend\.env.example" "$RootDir\backend\.env"
}

$DartApiFile = "$RootDir\mobile\lib\services\api_service.dart"
if (Test-Path $DartApiFile) {
    $dartContent = Get-Content $DartApiFile -Raw
    $updatedDart = [regex]::Replace(
        $dartContent,
        "defaultValue:\s*'http://[^']+'",
        "defaultValue: '$BackendUrl'"
    )
    if ($updatedDart -ne $dartContent) {
        [System.IO.File]::WriteAllText($DartApiFile, $updatedDart, [System.Text.UTF8Encoding]::new($false))
    }
}
Write-Host "-> Sinkronisasi IP ke Web, CV Worker, & Mobile selesai!" -ForegroundColor Green

# 3. Bersihkan proses lama pada port 8000, 8001, 5173 agar tidak bentrok port
foreach ($port in @(8000, 8001, 5173)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -and $procId -gt 4) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 4. Pastikan virtualenv Backend siap & jalankan migrasi tabel + seed demo MySQL
$BackendDir = "$RootDir\backend"
$BackendPython = "$BackendDir\.venv\Scripts\python.exe"
if (-not (Test-Path $BackendPython)) {
    Write-Host "[1/4] Membuat virtualenv Backend & menginstal paket..." -ForegroundColor Cyan
    python -m venv "$BackendDir\.venv"
    & "$BackendDir\.venv\Scripts\pip.exe" install -r "$BackendDir\requirements.txt"
}

Write-Host "[1/4] Mengecek database MySQL & data demo (seed_demo.py)..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    & $BackendPython seed_demo.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Gagal konek ke MySQL! Pastikan Laragon/MySQL menyala & cek backend\.env" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} finally {
    if ((Get-Location).Path -eq $BackendDir) { Pop-Location }
}

# 5. Jalankan Backend FastAPI (Port 8000)
Write-Host "[2/4] Menyalakan Backend FastAPI (Port 8000)..." -ForegroundColor Cyan
$backendCmd = "Set-Location '$BackendDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Backend FastAPI (:8000)'; & '$BackendDir\.venv\Scripts\uvicorn.exe' app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# 6. Jalankan Web Admin React (Port 5173)
$WebDir = "$RootDir\web"
if (-not (Test-Path "$WebDir\node_modules")) {
    Write-Host "Menginstal paket npm Web Admin..." -ForegroundColor Cyan
    npm install --prefix $WebDir
}
Write-Host "[3/4] Menyalakan Web Admin React (Port 5173)..." -ForegroundColor Cyan
$webCmd = "Set-Location '$WebDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Web Admin (:5173)'; npm run dev -- --host"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd

# 7. Jalankan CV Worker (Port 8001, mode siaga sekali putar)
if (-not $SkipCv) {
    $CvDir = "$RootDir\cv-worker"
    $CvPython = "$CvDir\.venv\Scripts\python.exe"
    Write-Host "[4/4] Menyalakan CV Worker (Port 8001, source=$VideoSource)..." -ForegroundColor Cyan
    $cvCmd = @"
Set-Location '$CvDir'
`$Host.UI.RawUI.WindowTitle = 'SIGAP - CV Worker (:8001)'
if (Test-Path '$CvPython') {
    & '$CvPython' main.py --source '$VideoSource'
} else {
    python -c "import cv2, ultralytics, websockets, requests, dotenv" 2>`$null
    if (`$LASTEXITCODE -eq 0) {
        python main.py --source '$VideoSource'
    } else {
        Write-Host 'Membuat virtualenv cv-worker & menginstal paket CV...' -ForegroundColor Yellow
        python -m venv .venv
        .\.venv\Scripts\pip.exe install -r requirements.txt
        .\.venv\Scripts\python.exe main.py --source '$VideoSource'
    }
}
"@
    Start-Process powershell -WindowStyle Minimized -ArgumentList "-NoExit", "-Command", $cvCmd
}

# 8. Cek otomatis HP Android / Emulator via ADB & langsung jalankan Flutter jika terhubung
$MobileDir = "$RootDir\mobile"
if (-not $SkipMobile) {
    $AdbCandidates = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:LOCALAPPDATA\Android\sdk\platform-tools\adb.exe",
        "C:\Users\ASUS\AppData\Local\Android\sdk\platform-tools\adb.exe"
    )
    $AdbExe = $AdbCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $AdbExe) {
        $adbCmdObj = Get-Command adb -ErrorAction SilentlyContinue
        if ($adbCmdObj) { $AdbExe = $adbCmdObj.Source }
    }

    $AndroidDeviceId = ""
    if ($AdbExe) {
        try {
            $adbLines = & $AdbExe devices 2>$null
            foreach ($line in $adbLines) {
                if ($line -match "^(\S+)\s+device\b") {
                    $AndroidDeviceId = $Matches[1]
                    break
                }
            }
        } catch {}
    }

    if (-not [string]::IsNullOrWhiteSpace($AndroidDeviceId)) {
        Write-Host "-> HP/Emulator Android terdeteksi ($AndroidDeviceId)! Menjalankan Flutter otomatis..." -ForegroundColor Green
        $mobCmd = "Set-Location '$MobileDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Flutter Mobile ($AndroidDeviceId)'; flutter run -d $AndroidDeviceId --dart-define=BACKEND_URL=$BackendUrl"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $mobCmd
    } else {
        Write-Host "-> Tidak ada HP Android tercolok saat ini (IP Mobile sudah disinkronkan ke $BackendUrl)." -ForegroundColor Yellow
        Write-Host "   Saat HP dicolok nanti, cukup jalankan: cd mobile; flutter run" -ForegroundColor Yellow
    }
}

if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " SEMUA LAYANAN SIGAP AKTIF & TERSINKRONISASI!" -ForegroundColor Green
Write-Host "------------------------------------------------------" -ForegroundColor Green
Write-Host " IP Server Sinkron : $BackendUrl"
Write-Host " Web Admin         : http://localhost:5173"
Write-Host " Login Admin       : admin@sigap.id / sigap123"
Write-Host " Login Keluarga    : rina@sigap.id  / sigap123"
Write-Host " Uji Kirim FCM     : .\test-fcm-event.ps1"
Write-Host " Matikan Semua     : .\stop-sigap.ps1"
Write-Host "======================================================" -ForegroundColor Green
