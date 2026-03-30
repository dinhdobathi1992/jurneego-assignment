"""
Database connection and session management.

Uses SQLAlchemy with synchronous engine (simpler to understand and debug).
Connection pooling is configured for production-readiness.

The engine and session factory are created lazily (on first use)
so that importing this module doesn't fail if the database isn't available yet.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# These are created lazily on first use
_engine = None
_SessionLocal = None


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def get_engine():
    """Get or create the database engine (lazy initialization)."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_size=5,         # Keep 5 connections ready
            max_overflow=10,     # Allow up to 10 extra connections under load
            pool_pre_ping=True,  # Check if connection is alive before using it
            echo=(settings.app_env == "development"),  # Log SQL in dev mode
        )
    return _engine


def get_session_factory():
    """Get or create the session factory (lazy initialization)."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def get_db():
    """
    FastAPI dependency — provides a database session per request.

    Usage in route handlers:
        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            ...

    The session is automatically closed after the request finishes.
    """
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
