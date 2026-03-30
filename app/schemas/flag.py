"""
Pydantic schemas for Flag/Moderation API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class FlagResponse(BaseModel):
    """A flag record with full details."""

    id: str
    conversation_id: str
    message_id: str
    flag_type: str
    reason: str
    severity: str
    reviewed: bool
    reviewer_notes: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    class Config:
        from_attributes = True


class FlagReviewRequest(BaseModel):
    """Request body for a teacher/admin to review a flag."""

    reviewer_notes: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Teacher's notes on reviewing this flag",
        examples=["Reviewed — false positive, student was asking about volcano eruptions."],
    )
