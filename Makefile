.PHONY: dev test lint format docker-up docker-down migrate seed clean help

# ============================================================
# JurneeGo Safe AI Learning Assistant — Makefile
# ============================================================

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------- Local Development ----------

dev: ## Run the API server locally (with hot reload)
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# ---------- Code Quality ----------

lint: ## Run linter (ruff)
	ruff check app/ tests/

format: ## Format code (ruff)
	ruff format app/ tests/

check: ## Run lint + format check together
	ruff check app/ tests/
	ruff format --check app/ tests/

# ---------- Testing ----------

test: ## Run all tests
	pytest tests/ -v

test-unit: ## Run only unit tests
	pytest tests/unit/ -v

test-integration: ## Run only integration tests
	pytest tests/integration/ -v

test-cov: ## Run tests with coverage report
	pytest tests/ -v --cov=app --cov-report=term-missing

# ---------- Docker ----------

docker-up: ## Start all services (API + DB)
	docker compose up --build -d

docker-up-litellm: ## Start all services including LiteLLM proxy
	docker compose --profile litellm up --build -d

docker-down: ## Stop and remove all services + volumes
	docker compose down -v

docker-logs: ## Follow logs from all services
	docker compose logs -f

docker-logs-api: ## Follow logs from API only
	docker compose logs -f api

# ---------- Database ----------

migrate: ## Run database migrations
	alembic upgrade head

migrate-new: ## Create a new migration (usage: make migrate-new MSG="add users table")
	alembic revision --autogenerate -m "$(MSG)"

seed: ## Seed the database with sample data
	python scripts/seed_data.py

# ---------- Cleanup ----------

clean: ## Remove generated files and caches
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf .coverage htmlcov/ dist/ build/ *.egg-info/
