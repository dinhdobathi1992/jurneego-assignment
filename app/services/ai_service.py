"""
AI Service — abstracts LLM access behind a clean interface.

Three providers:
1. MockAIProvider   — returns canned responses (testing / no API key needed)
2. BedrockAIProvider — uses AWS Bedrock (Claude) natively
3. LiteLLMAIProvider — uses LiteLLM proxy (supports 100+ models)

To switch providers, change the AI_PROVIDER env var:
    AI_PROVIDER=mock      → no external API needed
    AI_PROVIDER=bedrock   → requires AWS credentials
    AI_PROVIDER=litellm   → requires LiteLLM proxy running
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Load the system prompt from file (easier to edit than hardcoded strings)
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_system_prompt() -> str:
    """Load the system prompt from the prompts directory."""
    prompt_file = PROMPTS_DIR / "system_prompt.txt"
    if prompt_file.exists():
        return prompt_file.read_text().strip()
    # Fallback if file is missing
    return (
        "You are a friendly, safe AI learning assistant for children aged 6-14. "
        "Always be encouraging, patient, and age-appropriate."
    )


# ---------- Abstract Interface ----------


class AIProvider(ABC):
    """
    Abstract base class — all AI providers must implement this.

    This is the "adapter pattern" — it isolates the rest of the app
    from the specific LLM API being used.
    """

    @abstractmethod
    def generate_response(
        self,
        conversation_history: list[dict],
        system_prompt: str | None = None,
    ) -> str:
        """
        Send conversation to LLM and return the response text.

        Args:
            conversation_history: List of {"role": "learner|assistant", "content": "..."} dicts
            system_prompt: Optional override for the system prompt

        Returns:
            The AI's response as a string
        """
        pass


# ---------- Mock Provider ----------


class MockAIProvider(AIProvider):
    """
    Returns canned responses — used for testing and local development.
    No external API calls, no costs, always works.
    """

    def generate_response(
        self,
        conversation_history: list[dict],
        system_prompt: str | None = None,
    ) -> str:
        if not conversation_history:
            return "Hello! I'm your learning assistant. What would you like to learn about today?"

        last_message = conversation_history[-1].get("content", "")
        return (
            f"That's a great question! Let me help you understand more about "
            f"'{last_message[:80]}'. Learning is an amazing adventure, and I'm here "
            f"to help you explore! Would you like to know more?"
        )


# ---------- AWS Bedrock Provider ----------


class BedrockAIProvider(AIProvider):
    """
    Uses AWS Bedrock (Claude) — native AWS integration.

    Requires:
    - AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in env
    - BEDROCK_MODEL_ID (default: anthropic.claude-3-haiku)
    """

    def __init__(self):
        import boto3

        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
        )
        self.model_id = settings.bedrock_model_id
        logger.info(f"BedrockAIProvider initialized with model: {self.model_id}")

    def generate_response(
        self,
        conversation_history: list[dict],
        system_prompt: str | None = None,
    ) -> str:
        prompt = system_prompt or _load_system_prompt()

        # Convert our message format to Bedrock's expected format
        messages = []
        for msg in conversation_history:
            role = "user" if msg["role"] == "learner" else "assistant"
            messages.append(
                {
                    "role": role,
                    "content": [{"text": msg["content"]}],
                }
            )

        try:
            response = self.client.converse(
                modelId=self.model_id,
                system=[{"text": prompt}],
                messages=messages,
                inferenceConfig={
                    "maxTokens": 512,
                    "temperature": 0.7,
                    "topP": 0.9,
                },
            )
            # Extract the response text
            output_message = response["output"]["message"]
            return output_message["content"][0]["text"]

        except self.client.exceptions.ThrottlingException:
            logger.warning("Bedrock rate limited — returning fallback response")
            return self._fallback_response()
        except Exception as e:
            logger.error(f"Bedrock error: {e}")
            return self._fallback_response()

    def _fallback_response(self) -> str:
        return (
            "I'm having a little trouble thinking right now! 🤔 "
            "Can you try asking me again in a moment? "
            "I really want to help you learn!"
        )


# ---------- LiteLLM Provider ----------


class LiteLLMAIProvider(AIProvider):
    """
    Uses LiteLLM proxy — supports 100+ models through one interface.

    Requires:
    - LITELLM_API_BASE (URL of the LiteLLM proxy)
    - LITELLM_MODEL (which model to use, e.g., gpt-4o-mini)
    - LITELLM_API_KEY (API key for the proxy)
    """

    def __init__(self):
        self.api_base = settings.litellm_api_base
        self.model = settings.litellm_model
        self.api_key = settings.litellm_api_key
        logger.info(f"LiteLLMAIProvider initialized with model: {self.model}")

    def generate_response(
        self,
        conversation_history: list[dict],
        system_prompt: str | None = None,
    ) -> str:
        import litellm

        prompt = system_prompt or _load_system_prompt()

        # Build messages in OpenAI format (LiteLLM uses this)
        messages = [{"role": "system", "content": prompt}]
        for msg in conversation_history:
            role = "user" if msg["role"] == "learner" else "assistant"
            messages.append({"role": role, "content": msg["content"]})

        try:
            response = litellm.completion(
                model=self.model,
                messages=messages,
                api_base=self.api_base,
                api_key=self.api_key,
                timeout=15,
                max_tokens=512,
                temperature=0.7,
            )
            return response.choices[0].message.content

        except litellm.exceptions.RateLimitError:
            logger.warning("LiteLLM rate limited — returning fallback response")
            return self._fallback_response()
        except Exception as e:
            logger.error(f"LiteLLM error: {e}")
            return self._fallback_response()

    def _fallback_response(self) -> str:
        return (
            "I'm having a little trouble thinking right now! 🤔 "
            "Can you try asking me again in a moment? "
            "I really want to help you learn!"
        )


# ---------- Provider Factory ----------


def get_ai_provider() -> AIProvider:
    """
    Factory function — picks the right AI provider based on the AI_PROVIDER env var.

    This is called once at startup. To switch providers,
    change the AI_PROVIDER env var and restart.
    """
    provider_map = {
        "bedrock": BedrockAIProvider,
        "litellm": LiteLLMAIProvider,
        "mock": MockAIProvider,
    }

    provider_name = settings.ai_provider.lower()
    provider_class = provider_map.get(provider_name, MockAIProvider)

    if provider_name not in provider_map:
        logger.warning(f"Unknown AI_PROVIDER '{provider_name}', falling back to MockAIProvider")

    logger.info(f"Using AI provider: {provider_class.__name__}")
    return provider_class()
