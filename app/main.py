"""
JurneeGo Safe AI Learning Assistant — Main Application Entry Point

This is where the FastAPI app is created and configured.
Run with: uvicorn app.main:app --reload
Swagger docs: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.conversations import router as conversations_router
from app.api.messages import router as messages_router
from app.api.moderation import router as moderation_router
from app.auth import verify_api_key
from app.config import settings
from app.database import Base, get_engine

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown logic for the application.
    - On startup: create database tables (if they don't exist)
    - On shutdown: clean up resources
    """
    # Startup
    logger.info(f"Starting JurneeGo Safe AI Assistant ({settings.app_env})")
    logger.info(f"AI Provider: {settings.ai_provider}")
    logger.info(f"Safety Enabled: {settings.safety_enabled}")

    # Create tables (in production, use Alembic migrations instead)
    Base.metadata.create_all(bind=get_engine())
    logger.info("Database tables ready")

    yield  # App is running

    # Shutdown
    logger.info("Shutting down JurneeGo Safe AI Assistant")


# Create the FastAPI application
app = FastAPI(
    title="JurneeGo Safe AI Learning Assistant",
    description=(
        "A child-safe AI learning assistant that supports conversations between "
        "learners and an AI, with safety checks and teacher/admin moderation. "
        "\n\n"
        "## Features\n"
        "- 🗣️ **Conversations** — Create and manage learning conversations\n"
        "- 🤖 **AI Responses** — Powered by AWS Bedrock, LiteLLM, or Mock\n"
        "- 🛡️ **Safety Layer** — Detects harmful content and flags it\n"
        "- 👩‍🏫 **Moderation** — Teachers can review flagged conversations\n"
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware — allows API access from frontend apps
# In production, restrict origins to your actual domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://vm.dinhdobathi.com",
        "https://vm.dinhdobathi.com",
        "http://vm.dinhdobathi.com:8000",
        "http://jurnee-ai.dinhdobathi.com",
        "https://jurnee-ai.dinhdobathi.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers — all /api/* routes require a valid X-API-Key header
_auth = [Depends(verify_api_key)]
app.include_router(conversations_router, dependencies=_auth)
app.include_router(messages_router, dependencies=_auth)
app.include_router(moderation_router, dependencies=_auth)


# ---------- Health Check ----------


@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Returns the health status of the service and its dependencies.",
)
def health_check():
    """Simple health check — used by Docker HEALTHCHECK and load balancers."""
    return {
        "status": "healthy",
        "service": "jurnee-safe-ai",
        "version": "0.1.0",
        "ai_provider": settings.ai_provider,
        "safety_enabled": settings.safety_enabled,
    }


@app.get(
    "/",
    tags=["System"],
    summary="Root",
    description="Welcome message with links to documentation.",
)
def root():
    return {
        "message": "Welcome to JurneeGo Safe AI Learning Assistant! 🎓",
        "docs": "/docs",
        "health": "/health",
    }
