"""Compatibility entrypoint for ASGI servers.

Prefer running:
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
"""

from app.main import app
