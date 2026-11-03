"""Pembersihan berkala file snapshot & pesan suara di atas batas retensi 30 hari (NFR-06)."""

import logging
import time
from pathlib import Path
from app.config import RETENTION_DAYS, SNAPSHOTS_DIR, VOICES_DIR

logger = logging.getLogger("sigap.cleanup")


def purge_expired_media() -> int:
    """Hapus file media lokal yang berumur lebih dari RETENTION_DAYS hari."""
    cutoff = time.time() - (RETENTION_DAYS * 86400)
    removed = 0
    for folder in (SNAPSHOTS_DIR, VOICES_DIR):
        for file_path in Path(folder).glob("*"):
            if file_path.is_file() and file_path.name != ".gitkeep":
                try:
                    if file_path.stat().st_mtime < cutoff:
                        file_path.unlink()
                        removed += 1
                except OSError:
                    pass
    if removed:
        logger.info("Retensi privasi: menghapus %s file lama (> %s hari).", removed, RETENTION_DAYS)
    return removed

