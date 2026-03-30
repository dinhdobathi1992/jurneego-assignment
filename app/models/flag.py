"""
Flag model — records why a message was flagged as unsafe.

Each flag has:
- The type of violation (self_harm, sexual, contact_info, manipulation)
- A human-readable reason
- A severity level (low, medium, high)
- Whether a teacher/admin has reviewed it
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FlagType(enum.StrEnum):
    """Category of safety violation detected."""

    SELF_HARM = "self_harm"
    SEXUAL = "sexual"
    CONTACT_INFO = "contact_info"
    MANIPULATION = "manipulation"
    OTHER = "other"


class FlagSeverity(enum.StrEnum):
    """How serious is the violation."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    flag_type: Mapped[FlagType] = mapped_column(Enum(FlagType), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[FlagSeverity] = mapped_column(Enum(FlagSeverity), nullable=False)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    conversation: Mapped["Conversation"] = relationship(back_populates="flags")  # noqa: F821
    message: Mapped["Message"] = relationship(back_populates="flags")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Flag id={self.id} type={self.flag_type.value} severity={self.severity.value}>"
