"""
Pydantic schemas for Message API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    """Request body to send a new message from the learner."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="The learner's message text",
        examples=["How do volcanoes work?"],
    )


class MessageResponse(BaseModel):
    """A single message in the response."""

    id: str
    conversation_id: str
    role: str
    content: str
    is_safe: bool | None = None
    safety_score: float | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class MessagePairResponse(BaseModel):
    """
    Response after sending a message — contains both the learner's message
    and the AI assistant's response (or a safety deflection).
    """

    learner_message: MessageResponse
    assistant_message: MessageResponse
    was_flagged: bool = False
    flag_reason: str | None = None
