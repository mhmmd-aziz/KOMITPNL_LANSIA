param(
    [int]$CameraId = 1,
    [string]$BackendUrl = "http://127.0.0.1:8000"
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPython = "$RootDir\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $BackendPython)) {
    $BackendPython = "python"
}

Write-Host "Mengirim simulasi event jatuh ke $BackendUrl/events (camera_id=$CameraId)..." -ForegroundColor Cyan

$pyCode = @"
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

load_dotenv(Path(r'$RootDir\backend\.env'))
worker_key = os.getenv('WORKER_API_KEY', 'sigap-worker-key-2026')

# Buat gambar JPEG minimal 1x1 valid untuk uji cepat notifikasi FCM & WebSocket
minimal_jpeg = bytes.fromhex(
    'FFD8FFE000104A46494600010101004800480000FFDB0043000806060706050807'
    '07070909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C'
    '231C1C2837292C30313434341F27393D38323C2E333432FFC0000B080001000101'
    '011100FFC40014000100000000000000000000000000000008FFDA000801010000'
    '3F00D2CF20FFD9'
)

resp = httpx.post(
    '$BackendUrl/events',
    headers={'X-Worker-Key': worker_key},
    data={'camera_id': '$CameraId', 'confidence': '0.95'},
    files={'snapshot': ('simulasi_fcm.jpg', minimal_jpeg, 'image/jpeg')},
    timeout=10.0,
)
print('Status HTTP :', resp.status_code)
print('Respons     :', resp.text)
"@

& $BackendPython -c $pyCode

