"""
Message model — represents a single message in a conversation.

Each message has:
- A role: "learner" (the child), "assistant" (the AI), or "system"
- The text content
- Safety metadata (was it checked? what was the score?)
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MessageRole(enum.StrEnum):
    """Who sent this message."""

    LEARNER = "learner"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_safe: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    safety_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")  # noqa: F821
    flags: Mapped[list["Flag"]] = relationship(  # noqa: F821
        back_populates="message",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<Message id={self.id} role={self.role.value} content='{preview}'>"
