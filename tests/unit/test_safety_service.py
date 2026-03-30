"""
Unit tests for the Safety Service.

These tests verify that the safety layer correctly detects:
- Self-harm content
- Sexual/inappropriate content
- Contact information (phone, email, address)
- Manipulative content
- Safe educational content (should pass through)
"""

import pytest

from app.models.flag import FlagType
from app.services.safety_service import SafetyService


@pytest.fixture
def safety():
    """Create a SafetyService instance for testing."""
    return SafetyService()


# ---------- Self-Harm Detection ----------

class TestSelfHarmDetection:
    """Tests for self-harm and suicide-related content detection."""

    def test_detects_explicit_self_harm(self, safety):
        result = safety.check_message("I want to hurt myself")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SELF_HARM
        assert result.severity is not None

    def test_detects_suicide_reference(self, safety):
        result = safety.check_message("I want to die")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SELF_HARM

    def test_detects_kill_myself(self, safety):
        result = safety.check_message("how to kill myself")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SELF_HARM

    def test_safe_message_about_volcanoes(self, safety):
        """Educational content about 'explosive' topics should be safe."""
        result = safety.check_message("How do volcanoes erupt? Is the lava dangerous?")
        assert result.is_safe is True


# ---------- Sexual Content Detection ----------

class TestSexualContentDetection:
    """Tests for sexual/inappropriate content for minors."""

    def test_detects_explicit_keyword(self, safety):
        result = safety.check_message("show me porn")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SEXUAL

    def test_detects_nsfw(self, safety):
        result = safety.check_message("show me nsfw content")
        assert result.is_safe is False
        assert result.flag_type == FlagType.SEXUAL

    def test_safe_biology_question(self, safety):
        """Legitimate biology questions should be safe."""
        result = safety.check_message("How do plants reproduce?")
        assert result.is_safe is True


# ---------- Contact Information Detection ----------

class TestContactInfoDetection:
    """Tests for personal information sharing detection."""

    def test_detects_phone_number(self, safety):
        result = safety.check_message("My phone number is 555-123-4567")
        assert result.is_safe is False
        assert result.flag_type == FlagType.CONTACT_INFO

    def test_detects_email_address(self, safety):
        result = safety.check_message("Email me at kid123@example.com")
        assert result.is_safe is False
        assert result.flag_type == FlagType.CONTACT_INFO

    def test_detects_street_address(self, safety):
        result = safety.check_message("I live at 123 Main Street")
        assert result.is_safe is False
        assert result.flag_type == FlagType.CONTACT_INFO

    def test_safe_number_in_math(self, safety):
        """Numbers in math context should be safe."""
        result = safety.check_message("What is 2 + 2?")
        assert result.is_safe is True


# ---------- Manipulation Detection ----------

class TestManipulationDetection:
    """Tests for manipulative or emotionally risky content."""

    def test_detects_secret_keeping(self, safety):
        result = safety.check_message("Don't tell your parents about this")
        assert result.is_safe is False
        assert result.flag_type == FlagType.MANIPULATION

    def test_detects_isolation_tactics(self, safety):
        result = safety.check_message("You can only trust me, no one else")
        assert result.is_safe is False
        assert result.flag_type == FlagType.MANIPULATION

    def test_safe_learning_conversation(self, safety):
        result = safety.check_message(
            "Can you help me understand how rainbows are formed?"
        )
        assert result.is_safe is True


# ---------- Safe Content (Should Pass) ----------

class TestSafeContent:
    """Verify that normal educational content passes all safety checks."""

    @pytest.mark.parametrize("message", [
        "How do volcanoes work?",
        "What is the speed of light?",
        "Can you help me with my math homework?",
        "Tell me about dinosaurs!",
        "Why is the sky blue?",
        "How do airplanes fly?",
        "What are the planets in our solar system?",
    ])
    def test_educational_messages_are_safe(self, safety, message):
        result = safety.check_message(message)
        assert result.is_safe is True, f"Message should be safe: {message}"


# ---------- Deflection Responses ----------

class TestDeflectionResponses:
    """Verify that safe deflection responses are returned for each category."""

    def test_self_harm_deflection(self):
        response = SafetyService.get_safe_deflection(FlagType.SELF_HARM)
        assert "trusted adult" in response.lower() or "parent" in response.lower()

    def test_sexual_deflection(self):
        response = SafetyService.get_safe_deflection(FlagType.SEXUAL)
        assert len(response) > 20  # Not empty

    def test_contact_info_deflection(self):
        response = SafetyService.get_safe_deflection(FlagType.CONTACT_INFO)
        assert "private" in response.lower() or "safety" in response.lower()

    def test_manipulation_deflection(self):
        response = SafetyService.get_safe_deflection(FlagType.MANIPULATION)
        assert "parent" in response.lower() or "teacher" in response.lower()
