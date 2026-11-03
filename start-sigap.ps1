param(
    [string]$LanIp = "",
    [string]$VideoSource = "demo_duduk.mp4",
    [switch]$SkipCv,
    [switch]$WithMobile
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   SIGAP LAUNCHER - Menjalankan Seluruh Sistem Demo   " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Deteksi IP LAN otomatis (utamakan Wi-Fi / Ethernet fisik, abaikan adapter virtual)
function Get-DetectedLanIp {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.InterfaceAlias -notmatch "WSL|vEthernet|Loopback|VMware|VirtualBox|Docker"
            } |
            Sort-Object -Property InterfaceMetric
        if ($ips -and $ips.Count -gt 0) {
            return $ips[0].IPAddress
        }
    } catch {}
    return "127.0.0.1"
}

if ([string]::IsNullOrWhiteSpace($LanIp)) {
    $detected = Get-DetectedLanIp
    Write-Host ""
    Write-Host "IP LAN Laptop terdeteksi: $detected" -ForegroundColor Yellow
    $inputIp = Read-Host "Tekan ENTER untuk memakai [$detected], atau ketik IP LAN lain"
    if ([string]::IsNullOrWhiteSpace($inputIp)) {
        $LanIp = $detected
    } else {
        $LanIp = $inputIp.Trim()
    }
}

$BackendUrl = "http://${LanIp}:8000"
Write-Host "-> BACKEND_URL disetel ke: $BackendUrl" -ForegroundColor Green

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

# 2. Sinkronkan BACKEND_URL ke web/.env dan cv-worker/.env
Set-EnvValue -FilePath "$RootDir\web\.env" -ExamplePath "$RootDir\web\.env.example" -Key "BACKEND_URL" -Value $BackendUrl
Set-EnvValue -FilePath "$RootDir\cv-worker\.env" -ExamplePath "$RootDir\cv-worker\.env.example" -Key "BACKEND_URL" -Value $BackendUrl
if (-not (Test-Path "$RootDir\backend\.env") -and (Test-Path "$RootDir\backend\.env.example")) {
    Copy-Item "$RootDir\backend\.env.example" "$RootDir\backend\.env"
}

# 3. Pastikan virtualenv Backend siap & jalankan migrasi tabel + seed demo MySQL
$BackendDir = "$RootDir\backend"
$BackendPython = "$BackendDir\.venv\Scripts\python.exe"
if (-not (Test-Path $BackendPython)) {
    Write-Host "[1/4] Membuat virtualenv Backend & menginstal paket..." -ForegroundColor Cyan
    python -m venv "$BackendDir\.venv"
    & "$BackendDir\.venv\Scripts\pip.exe" install -r "$BackendDir\requirements.txt"
}

Write-Host ""
Write-Host "[1/4] Mengecek koneksi MySQL & mengisi data awal demo (seed_demo.py)..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    & $BackendPython seed_demo.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[PERINGATAN] Gagal konek ke MySQL! Periksa username/password di backend\.env" -ForegroundColor Red
        Write-Host "Contoh isi backend\.env: DATABASE_URL=mysql+pymysql://root:PASSWORD@localhost:3306/sigap" -ForegroundColor Yellow
        Pop-Location
        exit 1
    }
} finally {
    if ((Get-Location).Path -eq $BackendDir) { Pop-Location }
}

# 4. Jalankan Backend FastAPI di jendela PowerShell baru (Port 8000)
Write-Host "[2/4] Menyalakan Backend FastAPI (Port 8000)..." -ForegroundColor Cyan
$backendCmd = "Set-Location '$BackendDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Backend FastAPI (:8000)'; & '$BackendDir\.venv\Scripts\uvicorn.exe' app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# 5. Jalankan Web Admin React di jendela PowerShell baru (Port 5173)
$WebDir = "$RootDir\web"
if (-not (Test-Path "$WebDir\node_modules")) {
    Write-Host "Menginstal paket npm Web Admin..." -ForegroundColor Cyan
    npm install --prefix $WebDir
}
Write-Host "[3/4] Menyalakan Web Admin React (Port 5173)..." -ForegroundColor Cyan
$webCmd = "Set-Location '$WebDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Web Admin (:5173)'; npm run dev -- --host"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd

# 6. Jalankan CV Worker di jendela PowerShell baru (Port 8001)
if (-not $SkipCv) {
    $CvDir = "$RootDir\cv-worker"
    $CvPython = "$CvDir\.venv\Scripts\python.exe"
    Write-Host "[4/4] Menyalakan CV Worker CCTV Virtual (Port 8001, source=$VideoSource)..." -ForegroundColor Cyan
    $cvCmd = @"
Set-Location '$CvDir'
`$Host.UI.RawUI.WindowTitle = 'SIGAP - CCTV Virtual (:8001)'
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
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cvCmd
}

# 7. Opsional: Jalankan Flutter ke HP Android
$MobileDir = "$RootDir\mobile"
if (-not $WithMobile) {
    Write-Host ""
    $ans = Read-Host "Apakah ingin sekalian menjalankan Flutter ke HP Android/Emulator sekarang? (y/N)"
    if ($ans -match "^[yY]") {
        $WithMobile = $true
    }
}

if ($WithMobile) {
    Write-Host "Menjalankan Flutter Mobile dengan BACKEND_URL=$BackendUrl ..." -ForegroundColor Cyan
    $mobCmd = "Set-Location '$MobileDir'; `$Host.UI.RawUI.WindowTitle = 'SIGAP - Flutter Mobile'; flutter run --dart-define=BACKEND_URL=$BackendUrl"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $mobCmd
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " SEMUA LAYANAN SIGAP SUDAH DIJALANKAN!" -ForegroundColor Green
Write-Host "------------------------------------------------------" -ForegroundColor Green
Write-Host " Backend API Docs : $BackendUrl/docs"
Write-Host " Web Admin        : http://localhost:5173"
Write-Host " Login Admin      : admin@sigap.id / sigap123"
Write-Host " Login Keluarga   : rina@sigap.id  / sigap123"
Write-Host " Uji Kirim FCM    : .\test-fcm-event.ps1"
Write-Host " Matikan Semua    : .\stop-sigap.ps1"
Write-Host "======================================================" -ForegroundColor Green

