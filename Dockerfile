# ============================================================
# JurneeGo Safe AI Learning Assistant — Dockerfile
# ============================================================
# Multi-stage build for security and efficiency
# ============================================================

FROM python:3.12-slim AS base

# Security: run as non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Install system dependencies (psycopg2 needs libpq)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer caching: install Python deps first (they change less often)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Switch to non-root user
USER appuser

# Health check — Docker and orchestrators use this
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
