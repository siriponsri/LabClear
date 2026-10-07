"""Public build provenance, without configuration values or credentials."""
import os
import re
from functools import lru_cache
from pathlib import Path
import subprocess

VERSION = '3.0.2'

@lru_cache(maxsize=1)
def build_commit():
    value = os.getenv('RENDER_GIT_COMMIT') or os.getenv('VERCEL_GIT_COMMIT_SHA') or os.getenv('LABCLEAR_COMMIT_SHA')
    if not value:
        try:
            value = subprocess.check_output(['git','rev-parse','HEAD'],cwd=Path(__file__).resolve().parents[1],stderr=subprocess.DEVNULL,timeout=2,text=True).strip()
        except (OSError,subprocess.SubprocessError):
            return None
    return value if re.fullmatch(r'[0-9a-fA-F]{40}', value or '') else None
