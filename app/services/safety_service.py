"""
Safety Service — checks messages for harmful content.

Two layers of defense:
1. Keyword/Pattern Matching — fast, rule-based, always runs
2. LLM-Based Safety (optional) — catches nuance that keywords miss

Categories of unsafe content:
- self_harm:     Suicide, self-injury, dangerous challenges
- sexual:        Inappropriate content for minors
- contact_info:  PII sharing (phone numbers, emails, addresses)
- manipulation:  Emotional exploitation, gaslighting
"""

import logging
import re
from dataclasses import dataclass

from app.config import settings
from app.models.flag import FlagSeverity, FlagType

logger = logging.getLogger(__name__)


@dataclass
class SafetyCheckResult:
    """Result of running a safety check on a message."""

    is_safe: bool
    flag_type: FlagType | None = None
    reason: str | None = None
    severity: FlagSeverity | None = None
    confidence: float = 1.0


# ---------- Keyword Lists ----------
# These are configurable — in production, move to a database or config file.

SELF_HARM_KEYWORDS = [
    "kill myself", "want to die", "hurt myself", "suicide",
    "self harm", "self-harm", "cut myself", "end my life",
    "don't want to live", "jump off", "hang myself",
    "overdose", "take pills to die",
]

SEXUAL_KEYWORDS = [
    "sex", "porn", "naked", "nude", "explicit",
    "sexual", "xxx", "nsfw", "adult content",
    "genitals", "intercourse",
]

MANIPULATION_KEYWORDS = [
    "don't tell anyone", "don't tell your parents",
    "keep this a secret", "our little secret",
    "no one needs to know", "trust only me",
    "your parents don't understand", "you can only trust me",
    "run away", "leave home",
]

# Regex patterns for contact info detection
PHONE_PATTERN = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?"    # Optional country code
    r"(?:\(?\d{2,4}\)?[-.\s]?)"  # Area code
    r"(?:\d{3,4}[-.\s]?)"        # First part
    r"\d{3,4}",                  # Last part
)

EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
)

ADDRESS_PATTERN = re.compile(
    r"\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)",
    re.IGNORECASE,
)


class SafetyService:
    """
    Checks messages for unsafe content.

    Usage:
        safety = SafetyService()
        result = safety.check_message("How do volcanoes work?")
        if result.is_safe:
            # proceed normally
        else:
            # flag the message
    """

    def check_message(self, content: str) -> SafetyCheckResult:
        """
        Run all safety checks on a message.
        Returns the MOST SEVERE violation found, or a safe result.
        """
        if not settings.safety_enabled:
            return SafetyCheckResult(is_safe=True)

        content_lower = content.lower().strip()

        # Run all checks — order matters (most dangerous first)
        checks = [
            self._check_self_harm(content_lower),
            self._check_sexual_content(content_lower),
            self._check_manipulation(content_lower),
            self._check_contact_info(content),  # Use original case for regex
        ]

        # Return the first (most severe) violation found
        for result in checks:
            if not result.is_safe:
                logger.warning(
                    f"Safety violation detected: type={result.flag_type}, "
                    f"severity={result.severity}, reason={result.reason}"
                )
                return result

        return SafetyCheckResult(is_safe=True)

    def _check_self_harm(self, content: str) -> SafetyCheckResult:
        """Check for self-harm or suicide-related content — HIGH severity."""
        for keyword in SELF_HARM_KEYWORDS:
            if keyword in content:
                return SafetyCheckResult(
                    is_safe=False,
                    flag_type=FlagType.SELF_HARM,
                    reason=f"Self-harm related content detected: matched '{keyword}'",
                    severity=FlagSeverity.HIGH,
                    confidence=0.9,
                )
        return SafetyCheckResult(is_safe=True)

    def _check_sexual_content(self, content: str) -> SafetyCheckResult:
        """Check for sexual or inappropriate content — HIGH severity."""
        for keyword in SEXUAL_KEYWORDS:
            if keyword in content:
                return SafetyCheckResult(
                    is_safe=False,
                    flag_type=FlagType.SEXUAL,
                    reason=f"Inappropriate content detected: matched '{keyword}'",
                    severity=FlagSeverity.HIGH,
                    confidence=0.85,
                )
        return SafetyCheckResult(is_safe=True)

    def _check_contact_info(self, content: str) -> SafetyCheckResult:
        """Check for personal contact information — MEDIUM severity."""
        if PHONE_PATTERN.search(content):
            return SafetyCheckResult(
                is_safe=False,
                flag_type=FlagType.CONTACT_INFO,
                reason="Phone number pattern detected in message",
                severity=FlagSeverity.MEDIUM,
                confidence=0.8,
            )
        if EMAIL_PATTERN.search(content):
            return SafetyCheckResult(
                is_safe=False,
                flag_type=FlagType.CONTACT_INFO,
                reason="Email address detected in message",
                severity=FlagSeverity.MEDIUM,
                confidence=0.9,
            )
        if ADDRESS_PATTERN.search(content):
            return SafetyCheckResult(
                is_safe=False,
                flag_type=FlagType.CONTACT_INFO,
                reason="Physical address pattern detected in message",
                severity=FlagSeverity.MEDIUM,
                confidence=0.7,
            )
        return SafetyCheckResult(is_safe=True)

    def _check_manipulation(self, content: str) -> SafetyCheckResult:
        """Check for manipulative or emotionally risky content — HIGH severity."""
        for keyword in MANIPULATION_KEYWORDS:
            if keyword in content:
                return SafetyCheckResult(
                    is_safe=False,
                    flag_type=FlagType.MANIPULATION,
                    reason=f"Manipulative content detected: matched '{keyword}'",
                    severity=FlagSeverity.HIGH,
                    confidence=0.85,
                )
        return SafetyCheckResult(is_safe=True)

    @staticmethod
    def get_safe_deflection(flag_type: FlagType) -> str:
        """
        Return a child-friendly deflection message when unsafe content is detected.
        Instead of just blocking, we redirect to something positive.
        """
        deflections = {
            FlagType.SELF_HARM: (
                "I care about you! 💙 If you're feeling sad or upset, "
                "please talk to a trusted adult like a parent, teacher, or school counselor. "
                "They can help! Would you like to learn about something fun instead?"
            ),
            FlagType.SEXUAL: (
                "Let's talk about something more appropriate for learning! 📚 "
                "I can help you with science, math, history, art, or lots of other cool topics. "
                "What interests you?"
            ),
            FlagType.CONTACT_INFO: (
                "For your safety, it's important to keep personal information private online! 🔒 "
                "Never share phone numbers, email addresses, or home addresses. "
                "Is there something else I can help you learn about?"
            ),
            FlagType.MANIPULATION: (
                "Remember, it's always okay to talk to your parents or teachers about anything! 🌟 "
                "Trusted adults are there to help you. "
                "Would you like to explore a fun learning topic together?"
            ),
            FlagType.OTHER: (
                "Let's focus on learning something awesome together! 🚀 "
                "What topic would you like to explore?"
            ),
        }
        return deflections.get(flag_type, deflections[FlagType.OTHER])
