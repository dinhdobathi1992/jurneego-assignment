"""
Unit tests for the AI Service.

Tests the MockAIProvider and the provider factory.
Bedrock and LiteLLM providers are not tested here (they need external APIs).
"""

import pytest

from app.services.ai_service import (
    AIProvider,
    BedrockAIProvider,
    LiteLLMAIProvider,
    MockAIProvider,
    get_ai_provider,
)


class TestMockAIProvider:
    """Tests for the mock AI provider (used in testing and local dev)."""

    def test_returns_string_response(self):
        provider = MockAIProvider()
        response = provider.generate_response(
            conversation_history=[{"role": "learner", "content": "How do volcanoes work?"}]
        )
        assert isinstance(response, str)
        assert len(response) > 0

    def test_includes_question_context(self):
        provider = MockAIProvider()
        response = provider.generate_response(
            conversation_history=[{"role": "learner", "content": "Tell me about dinosaurs"}]
        )
        assert "dinosaurs" in response.lower()

    def test_handles_empty_history(self):
        provider = MockAIProvider()
        response = provider.generate_response(conversation_history=[])
        assert isinstance(response, str)
        assert len(response) > 0

    def test_handles_long_messages(self):
        provider = MockAIProvider()
        long_message = "x" * 1000
        response = provider.generate_response(
            conversation_history=[{"role": "learner", "content": long_message}]
        )
        assert isinstance(response, str)


class TestProviderFactory:
    """Tests for the AI provider factory function."""

    def test_mock_provider_is_default(self, monkeypatch):
        monkeypatch.setattr("app.services.ai_service.settings.ai_provider", "mock")
        provider = get_ai_provider()
        assert isinstance(provider, MockAIProvider)

    def test_unknown_provider_falls_back_to_mock(self, monkeypatch):
        monkeypatch.setattr("app.services.ai_service.settings.ai_provider", "nonexistent")
        provider = get_ai_provider()
        assert isinstance(provider, MockAIProvider)

    def test_provider_implements_interface(self):
        provider = MockAIProvider()
        assert isinstance(provider, AIProvider)
        assert hasattr(provider, "generate_response")
