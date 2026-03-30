"""
Conversation Service — orchestrates the core message flow.

This is where the business logic lives. The API routes are thin —
they just validate input and call this service.

Core flow for sending a message:
1. Save the learner's message
2. Run safety check on the learner's message
3. If unsafe → flag it, return a safe deflection response
4. If safe → send to AI (Bedrock/LiteLLM/Mock)
5. Run safety check on AI response
6. If AI response unsafe → flag it, return sanitized response
7. Save AI response
8. Return both messages
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.flag import Flag
from app.models.message import Message, MessageRole
from app.schemas.conversation import ConversationCreate
from app.services.ai_service import AIProvider
from app.services.safety_service import SafetyCheckResult, SafetyService

logger = logging.getLogger(__name__)


class ConversationService:
    """Handles all conversation business logic."""

    def __init__(self, db: Session, ai_provider: AIProvider, safety_service: SafetyService):
        self.db = db
        self.ai = ai_provider
        self.safety = safety_service

    # ---------- Conversation CRUD ----------

    def create_conversation(self, data: ConversationCreate) -> Conversation:
        """Create a new conversation for a learner."""
        conversation = Conversation(
            learner_id=data.learner_id,
            title=data.title,
        )
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        logger.info(f"Created conversation {conversation.id} for learner {data.learner_id}")
        return conversation

    def get_conversation(self, conversation_id: str) -> Conversation | None:
        """Get a conversation by ID, with all messages and flags loaded."""
        return self.db.query(Conversation).filter(Conversation.id == conversation_id).first()

    def list_conversations(
        self, page: int = 1, page_size: int = 20
    ) -> tuple[list[Conversation], int]:
        """List conversations with pagination. Returns (conversations, total_count)."""
        query = self.db.query(Conversation).order_by(Conversation.created_at.desc())
        total = query.count()
        conversations = query.offset((page - 1) * page_size).limit(page_size).all()
        return conversations, total

    # ---------- Message Flow (THE CORE LOGIC) ----------

    def send_message(
        self, conversation_id: str, content: str
    ) -> tuple[Message, Message, bool, str | None]:
        """
        Process a learner's message and generate an AI response.

        Returns:
            (learner_message, assistant_message, was_flagged, flag_reason)
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Step 1: Save the learner's message
        learner_message = Message(
            conversation_id=conversation_id,
            role=MessageRole.LEARNER,
            content=content,
        )

        # Step 2: Safety check on learner's message
        safety_result = self.safety.check_message(content)
        learner_message.is_safe = safety_result.is_safe
        learner_message.safety_score = (
            safety_result.confidence if not safety_result.is_safe else 1.0
        )

        self.db.add(learner_message)
        self.db.flush()  # Get the ID without committing

        # Step 3: If unsafe → flag and return deflection
        if not safety_result.is_safe:
            return self._handle_unsafe_message(conversation, learner_message, safety_result)

        # Step 4: If safe → generate AI response
        return self._handle_safe_message(conversation, learner_message)

    def _handle_unsafe_message(
        self,
        conversation: Conversation,
        learner_message: Message,
        safety_result: SafetyCheckResult,
    ) -> tuple[Message, Message, bool, str | None]:
        """Handle an unsafe learner message — flag it and return a deflection."""
        logger.warning(
            f"Unsafe message in conversation {conversation.id}: "
            f"type={safety_result.flag_type}, reason={safety_result.reason}"
        )

        # Create a flag record
        flag = Flag(
            conversation_id=conversation.id,
            message_id=learner_message.id,
            flag_type=safety_result.flag_type,
            reason=safety_result.reason,
            severity=safety_result.severity,
        )
        self.db.add(flag)

        # Mark the conversation as flagged
        conversation.is_flagged = True

        # Generate a safe deflection response
        deflection = SafetyService.get_safe_deflection(safety_result.flag_type)
        assistant_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=deflection,
            is_safe=True,
            safety_score=1.0,
        )
        self.db.add(assistant_message)
        self.db.commit()
        self.db.refresh(learner_message)
        self.db.refresh(assistant_message)

        return learner_message, assistant_message, True, safety_result.reason

    def _handle_safe_message(
        self,
        conversation: Conversation,
        learner_message: Message,
    ) -> tuple[Message, Message, bool, str | None]:
        """Handle a safe learner message — generate AI response."""
        # Build conversation history for the AI
        history = self._build_conversation_history(conversation, learner_message)

        # Generate AI response
        ai_response_text = self.ai.generate_response(history)

        # Safety check on AI response too
        ai_safety = self.safety.check_message(ai_response_text)
        if not ai_safety.is_safe:
            logger.warning(f"AI generated unsafe response in conversation {conversation.id}")
            ai_response_text = (
                "Let me think of a better way to answer that! 🤔 "
                "Could you try asking your question in a different way?"
            )

        # Save the AI response
        assistant_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=ai_response_text,
            is_safe=ai_safety.is_safe,
            safety_score=1.0 if ai_safety.is_safe else ai_safety.confidence,
        )
        self.db.add(assistant_message)
        self.db.commit()
        self.db.refresh(learner_message)
        self.db.refresh(assistant_message)

        return learner_message, assistant_message, False, None

    def _build_conversation_history(
        self, conversation: Conversation, current_message: Message
    ) -> list[dict]:
        """Build the message history to send to the AI provider."""
        history = []
        for msg in conversation.messages:
            history.append(
                {
                    "role": msg.role.value,
                    "content": msg.content,
                }
            )
        # Add the current message (not yet in conversation.messages)
        history.append(
            {
                "role": "learner",
                "content": current_message.content,
            }
        )
        return history

    # ---------- Moderation (Teacher/Admin) ----------

    def list_flagged_conversations(
        self, page: int = 1, page_size: int = 20
    ) -> tuple[list[Conversation], int]:
        """List only flagged conversations for teacher review."""
        query = (
            self.db.query(Conversation)
            .filter(Conversation.is_flagged == True)  # noqa: E712
            .order_by(Conversation.updated_at.desc())
        )
        total = query.count()
        conversations = query.offset((page - 1) * page_size).limit(page_size).all()
        return conversations, total

    def get_flagged_conversation(self, conversation_id: str) -> Conversation | None:
        """Get a flagged conversation with all its flags and messages."""
        return (
            self.db.query(Conversation)
            .filter(
                Conversation.id == conversation_id,
                Conversation.is_flagged == True,  # noqa: E712
            )
            .first()
        )

    def review_flag(self, flag_id: str, reviewer_notes: str) -> Flag | None:
        """Mark a flag as reviewed by a teacher/admin."""
        flag = self.db.query(Flag).filter(Flag.id == flag_id).first()
        if not flag:
            return None

        flag.reviewed = True
        flag.reviewer_notes = reviewer_notes
        flag.reviewed_at = datetime.now(UTC)
        self.db.commit()
        self.db.refresh(flag)

        logger.info(f"Flag {flag_id} reviewed: {reviewer_notes[:100]}")
        return flag
