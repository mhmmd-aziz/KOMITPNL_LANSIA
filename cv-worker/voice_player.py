"""Klien WebSocket cv-worker untuk status online, pemutar suara, & kontrol simulasi sekali putar."""

import asyncio
import json
import logging
from pathlib import Path
import platform
import queue
import shutil
import subprocess
import tempfile
import threading
import requests
import websockets

import config

logger = logging.getLogger("sigap.voice")

_cmd_queue: "queue.Queue[dict]" = queue.Queue()
_telemetry_queue: "queue.Queue[dict]" = queue.Queue(maxsize=5)


def push_worker_command(cmd: dict) -> None:
    """Masukkan perintah kontrol simulasi (prepare / zones / run / stop) ke antrean."""
    _cmd_queue.put_nowait(cmd)


def consume_worker_command() -> dict | None:
    """Ambil satu perintah simulasi dari antrean secara berurutan (FIFO)."""
    try:
        return _cmd_queue.get_nowait()
    except queue.Empty:
        return None


def publish_telemetry(payload: dict) -> None:
    """Kirim status telemetri frame saat ini ke antrean WebSocket non-blocking."""
    try:
        while _telemetry_queue.full():
            _telemetry_queue.get_nowait()
        _telemetry_queue.put_nowait(payload)
    except Exception:
        pass


def play_audio_file(file_path: Path) -> bool:
    """Putar file audio (M4A/AAC/MP3/WAV) lewat speaker laptop lintas OS."""
    ffplay_bin = shutil.which("ffplay")
    if ffplay_bin:
        res = subprocess.run(
            [ffplay_bin, "-nodisp", "-autoexit", "-loglevel", "quiet", str(file_path)],
            check=False,
        )
        return res.returncode == 0

    system_name = platform.system().lower()
    if system_name == "windows":
        abs_uri = file_path.resolve().as_uri()
        ps_script = (
            "Add-Type -AssemblyName presentationCore; "
            "$player = New-Object System.Windows.Media.MediaPlayer; "
            f"$player.Open([Uri]'{abs_uri}'); "
            "$player.Volume = 1.0; "
            "Start-Sleep -Milliseconds 400; "
            "$player.Play(); "
            "$timeout = 0; "
            "while (-not $player.NaturalDuration.HasTimeSpan -and $timeout -lt 30) "
            "{ Start-Sleep -Milliseconds 100; $timeout++ }; "
            "$dur = if ($player.NaturalDuration.HasTimeSpan) "
            "{ [math]::Ceiling($player.NaturalDuration.TimeSpan.TotalSeconds) + 1 } else { 5 }; "
            "Start-Sleep -Seconds $dur; "
            "$player.Close()"
        )
        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            check=False,
        )
        return res.returncode == 0

    if system_name == "darwin":
        res = subprocess.run(["afplay", str(file_path)], check=False)
        return res.returncode == 0

    for player in ("paplay", "aplay"):
        bin_path = shutil.which(player)
        if bin_path:
            res = subprocess.run([bin_path, str(file_path)], check=False)
            return res.returncode == 0
    return False


def download_and_play(url: str) -> bool:
    """Unduh pesan suara ke file sementara, putar di speaker, lalu hapus kembali."""
    suffix = Path(url.split("?")[0]).suffix or ".m4a"
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = Path(tmp_file.name)
    tmp_file.close()

    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        tmp_path.write_bytes(resp.content)
        logger.info("Memutar pesan suara keluarga di speaker CCTV (%s)...", tmp_path.name)
        return play_audio_file(tmp_path)
    except Exception as exc:
        logger.error("Gagal mengunduh/memutar pesan suara: %s", exc)
        return False
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


async def _telemetry_sender(ws) -> None:
    """Kirim telemetri berkala dari cv-worker ke backend."""
    while True:
        await asyncio.sleep(0.25)
        latest = None
        while not _telemetry_queue.empty():
            try:
                latest = _telemetry_queue.get_nowait()
            except Exception:
                break
        if latest is not None:
            await ws.send(json.dumps(latest))


async def _worker_ws_loop() -> None:
    """Pertahankan koneksi WebSocket ke backend untuk suara & kontrol simulasi."""
    ws_base = config.BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_base}/ws/worker/{config.CAMERA_ID}?key={config.WORKER_API_KEY}"

    while True:
        try:
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as ws:
                logger.info("Terhubung ke kanal WebSocket backend (camera_id=%s).", config.CAMERA_ID)
                sender_task = asyncio.create_task(_telemetry_sender(ws))
                try:
                    async for raw_msg in ws:
                        try:
                            data = json.loads(raw_msg)
                        except json.JSONDecodeError:
                            continue

                        msg_type = data.get("type")
                        if msg_type == "voice.play" and data.get("url"):
                            played = await asyncio.to_thread(download_and_play, data["url"])
                            if played and data.get("voice_id"):
                                await ws.send(
                                    json.dumps(
                                        {
                                            "type": "voice.played",
                                            "voice_id": data["voice_id"],
                                        }
                                    )
                                )
                        elif msg_type in (
                            "simulation.prepare",
                            "simulation.run",
                            "simulation.stop",
                            "simulation.zones",
                            "source.switch",
                        ):
                            push_worker_command(data)
                finally:
                    sender_task.cancel()
        except Exception as exc:
            logger.warning("Koneksi WebSocket worker terputus (%s). Mencoba lagi 3 detik...", exc)
            await asyncio.sleep(3)


def start_worker_ws_thread() -> None:
    """Jalankan loop WebSocket worker di background thread."""
    def _runner() -> None:
        asyncio.run(_worker_ws_loop())

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
