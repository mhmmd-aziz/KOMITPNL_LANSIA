param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot
$BackendDir = Join-Path $ProjectDir "backend"
$WebDir = Join-Path $ProjectDir "web"
$RuntimeDir = Join-Path $ProjectDir ".runtime"
$StatePath = Join-Path $RuntimeDir "web-dev.json"
$BackendPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
$ViteScript = Join-Path $WebDir "node_modules\vite\bin\vite.js"
$State = @{ backend = $null; web = $null }

function Save-LauncherState {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Get-OwnedProcess {
    param($Entry)
    if (-not $Entry) { return $null }
    $ownedProcess = Get-Process -Id ([int]$Entry.pid) -ErrorAction SilentlyContinue
    if (-not $ownedProcess) { return $null }
    try {
        $sameStart = $ownedProcess.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$Entry.startTimeUtcTicks
        $samePath = [string]::Equals($ownedProcess.Path, [string]$Entry.executablePath, [System.StringComparison]::OrdinalIgnoreCase)
        if ($sameStart -and $samePath) { return $ownedProcess }
    } catch {
        Write-Warning "Identitas proses PID $($Entry.pid) tidak dapat diverifikasi; proses tidak disentuh."
    }
    return $null
}

function Test-LocalPort {
    param([int]$Port)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connecting = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $connecting.AsyncWaitHandle.WaitOne(500)) { return $false }
        $client.EndConnect($connecting)
        return $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

function Test-ServiceReady {
    param([string]$Name)
    try {
        if ($Name -eq "backend") {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 1
            return $health.status -eq "ok" -and $health.service -eq "sigap-backend"
        }
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5173/" -TimeoutSec 1
        return $response.StatusCode -eq 200 -and ($response.Content -match '/@vite/client|SIGAP')
    } catch { return $false }
}

function Start-LocalService {
    param(
        [string]$Name,
        [int]$Port,
        [string]$Executable,
        [string[]]$ServiceArguments,
        [string]$Directory
    )

    if (Test-ServiceReady $Name) {
        # Only retain ownership if this process was recorded by this launcher.
        if (-not (Get-OwnedProcess $State[$Name])) { $State[$Name] = $null }
        Save-LauncherState
        Write-Host "$Name sudah siap pada port $Port; menggunakan layanan yang berjalan." -ForegroundColor Green
        return
    }
    if (Test-LocalPort $Port) {
        throw "Port $Port sedang digunakan, tetapi bukan layanan SIGAP yang siap. Periksa proses tersebut secara manual; launcher tidak menghentikannya."
    }
    $previousProcess = Get-OwnedProcess $State[$Name]
    if ($previousProcess) {
        throw "$Name dari launcher sebelumnya (PID $($previousProcess.Id)) masih berjalan tetapi belum siap. Periksa log di $RuntimeDir atau jalankan .\start-web-dev.ps1 -Stop."
    }

    $outLog = Join-Path $RuntimeDir "$Name.out.log"
    $errLog = Join-Path $RuntimeDir "$Name.err.log"
    $startedProcess = Start-Process -FilePath $Executable -ArgumentList $ServiceArguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    try {
        # MainModule/Path may not be available immediately after Start-Process.
        # The absolute executable we just launched is the ownership reference;
        # -Stop still verifies the running process path and creation time.
        $launchedPath = (Resolve-Path -LiteralPath $Executable).Path
        $State[$Name] = @{
            pid = $startedProcess.Id
            startTimeUtcTicks = $startedProcess.StartTime.ToUniversalTime().Ticks.ToString()
            executablePath = $launchedPath
        }
        Save-LauncherState
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        while ($timer.Elapsed.TotalSeconds -lt 15) {
            $startedProcess.Refresh()
            if ($startedProcess.HasExited) {
                throw "$Name berhenti dengan exit code $($startedProcess.ExitCode). Log: $errLog dan $outLog"
            }
            if (Test-ServiceReady $Name) {
                Write-Host "$Name siap pada port $Port (PID $($startedProcess.Id))." -ForegroundColor Green
                return
            }
            Start-Sleep -Milliseconds 300
        }
        throw "$Name belum siap setelah 15 detik. Log: $errLog dan $outLog. Jalankan -Stop untuk menghentikan proses milik launcher."
    } catch {
        # Keep recorded process metadata for a safe, explicit -Stop if startup hangs.
        throw
    }
}

try {
    if (Test-Path -LiteralPath $StatePath) {
        $savedState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
        foreach ($name in @("backend", "web")) {
            if ($savedState.$name) { $State[$name] = $savedState.$name }
        }
    }

    if ($Stop) {
        foreach ($name in @("web", "backend")) {
            $ownedProcess = Get-OwnedProcess $State[$name]
            if ($ownedProcess) {
                # Windows virtualenv python.exe can redirect to a child Python
                # process that owns the API port. Stop the verified launcher's
                # complete process tree, never an arbitrary process on a port.
                $taskKillPath = Join-Path $env:SystemRoot "System32\taskkill.exe"
                $terminationOutput = & $taskKillPath /PID $ownedProcess.Id /T /F 2>&1
                if ($LASTEXITCODE -ne 0) {
                    throw "Gagal menghentikan proses $name (PID $($ownedProcess.Id)): $($terminationOutput -join ' ')"
                }
                Write-Host "$name dihentikan (PID $($ownedProcess.Id))." -ForegroundColor Green
            } elseif ($State[$name]) {
                Write-Host "$name tidak lagi cocok dengan catatan launcher; tidak ada proses lain yang dihentikan."
            }
            $State[$name] = $null
        }
        if (Test-Path -LiteralPath $StatePath) { Save-LauncherState }
        Write-Host "Selesai. Layanan yang dijalankan di luar launcher tetap dibiarkan."
        exit 0
    }

    foreach ($envFile in @((Join-Path $BackendDir ".env"), (Join-Path $WebDir ".env"))) {
        if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
            throw "Konfigurasi belum tersedia: $envFile. Salin .env.example ke .env pada folder tersebut lalu sesuaikan koneksi lokal."
        }
    }
    if (-not (Test-Path -LiteralPath $BackendPython -PathType Leaf)) {
        throw "Virtualenv backend belum tersedia. Siapkan backend\.venv dan install backend\requirements.txt terlebih dahulu."
    }
    if (-not (Test-Path -LiteralPath $ViteScript -PathType Leaf)) {
        throw "Dependensi web belum tersedia. Jalankan npm ci dari folder web."
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw "Node.js belum tersedia pada PATH. Install Node.js lalu buka kembali terminal." }

    $dependencyCheck = & $BackendPython -c "import fastapi, uvicorn, sqlalchemy, dotenv, bcrypt, jwt, pymysql, multipart, httpx, email_validator" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Dependensi backend belum lengkap. Jalankan backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt."
    }

    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    Start-LocalService -Name "backend" -Port 8000 -Executable $BackendPython -ServiceArguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") -Directory $BackendDir
    Start-LocalService -Name "web" -Port 5173 -Executable $nodeCommand.Source -ServiceArguments @(('"' + $ViteScript + '"'), "--host", "127.0.0.1", "--port", "5173", "--strictPort") -Directory $WebDir

    Write-Host ""
    Write-Host "Web Admin : http://127.0.0.1:5173" -ForegroundColor Cyan
    Write-Host "Backend   : http://127.0.0.1:8000/docs"
    Write-Host "Log       : $RuntimeDir"
    Write-Host "Hentikan  : .\start-web-dev.ps1 -Stop"
} catch {
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
}
