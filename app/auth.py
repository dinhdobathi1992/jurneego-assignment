"""
API key authentication dependency.

All /api/* routes require an X-API-Key header matching one of the
configured keys in API_KEYS (comma-separated env var).

/health and / are intentionally left public.
"""

from fastapi import HTTPException, Security
from fastapi.security.api_key import APIKeyHeader

from app.config import settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(api_key: str = Security(_api_key_header)) -> str:
    if api_key and api_key in settings.api_keys:
        return api_key
    raise HTTPException(status_code=401, detail="Invalid or missing API key")
