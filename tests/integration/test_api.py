"""
Integration tests for the API endpoints.

These tests use FastAPI's TestClient to make real HTTP requests
against the API, using an in-memory SQLite database for speed.

Tests cover the FULL FLOW:
1. Create a conversation
2. Send a safe message → get AI response
3. Send an unsafe message → verify flagging
4. List flagged conversations
5. Review a flag
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# Use in-memory SQLite for fast integration tests
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """Override the database dependency to use test database."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Override the database dependency for all tests
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    """Create fresh tables before each test, drop after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


# ---------- Health Check ----------


class TestHealthCheck:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "jurnee-safe-ai"


# ---------- Conversations ----------


class TestConversationEndpoints:
    def test_create_conversation(self, client):
        response = client.post(
            "/api/conversations",
            json={"learner_id": "student-1", "title": "Learning about space"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["learner_id"] == "student-1"
        assert data["title"] == "Learning about space"
        assert data["is_flagged"] is False
        assert "id" in data

    def test_get_conversation(self, client):
        # Create first
        create_resp = client.post(
            "/api/conversations",
            json={"learner_id": "student-1"},
        )
        conv_id = create_resp.json()["id"]

        # Then get
        response = client.get(f"/api/conversations/{conv_id}")
        assert response.status_code == 200
        assert response.json()["id"] == conv_id

    def test_get_nonexistent_conversation(self, client):
        response = client.get("/api/conversations/nonexistent-id")
        assert response.status_code == 404

    def test_list_conversations(self, client):
        # Create two conversations
        client.post("/api/conversations", json={"learner_id": "student-1"})
        client.post("/api/conversations", json={"learner_id": "student-2"})

        response = client.get("/api/conversations")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["conversations"]) == 2


# ---------- Messages (Core Flow) ----------


class TestMessageEndpoints:
    def test_send_safe_message_gets_ai_response(self, client):
        """CORE TEST: Safe message → AI response flow."""
        # Create conversation
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()

        # Send a safe message
        response = client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "How do volcanoes work?"},
        )
        assert response.status_code == 200
        data = response.json()

        # Verify learner message
        assert data["learner_message"]["role"] == "learner"
        assert data["learner_message"]["content"] == "How do volcanoes work?"

        # Verify AI response
        assert data["assistant_message"]["role"] == "assistant"
        assert len(data["assistant_message"]["content"]) > 0

        # Should NOT be flagged
        assert data["was_flagged"] is False

    def test_unsafe_message_gets_flagged(self, client):
        """SAFETY TEST: Harmful message → flag + deflection."""
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()

        # Send an unsafe message
        response = client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "I want to hurt myself"},
        )
        assert response.status_code == 200
        data = response.json()

        # Should be flagged
        assert data["was_flagged"] is True
        assert data["flag_reason"] is not None

        # AI response should be a safe deflection, not an actual response
        assert (
            "trusted adult" in data["assistant_message"]["content"].lower()
            or "parent" in data["assistant_message"]["content"].lower()
        )

    def test_contact_info_gets_flagged(self, client):
        """SAFETY TEST: PII sharing → flag."""
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()

        response = client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "My email is kid@example.com"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["was_flagged"] is True

    def test_send_to_nonexistent_conversation(self, client):
        response = client.post(
            "/api/conversations/nonexistent-id/messages",
            json={"content": "Hello"},
        )
        assert response.status_code == 404


# ---------- Moderation (Teacher Review) ----------


class TestModerationEndpoints:
    def test_list_flagged_conversations(self, client):
        """Create a flagged conversation, then list it."""
        # Create and flag a conversation
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()
        client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "I want to hurt myself"},
        )

        # List flagged conversations
        response = client.get("/api/moderation/flagged")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    def test_get_flagged_conversation_with_reasons(self, client):
        """Get a flagged conversation with flag details."""
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()
        client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "I want to hurt myself"},
        )

        response = client.get(f"/api/moderation/flagged/{conv['id']}")
        assert response.status_code == 200
        data = response.json()
        assert data["is_flagged"] is True
        assert len(data["flags"]) >= 1
        assert data["flags"][0]["flag_type"] == "self_harm"

    def test_unflagged_conversation_not_in_moderation(self, client):
        """A safe conversation should NOT appear in moderation."""
        conv = client.post("/api/conversations", json={"learner_id": "student-1"}).json()
        client.post(
            f"/api/conversations/{conv['id']}/messages",
            json={"content": "How do rainbows form?"},
        )

        response = client.get(f"/api/moderation/flagged/{conv['id']}")
        assert response.status_code == 404
