"""
Conversation model — represents a chat session between a learner and the AI.

Each conversation has:
- A learner_id (who started it)
- An optional title
- A flag indicating if any message was flagged as unsafe
- Timestamps for tracking
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    learner_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships — load messages and flags when needed
    messages: Mapped[list["Message"]] = relationship(  # noqa: F821
        back_populates="conversation",
        order_by="Message.created_at",
        cascade="all, delete-orphan",
    )
    flags: Mapped[list["Flag"]] = relationship(  # noqa: F821
        back_populates="conversation",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} learner={self.learner_id} flagged={self.is_flagged}>"
