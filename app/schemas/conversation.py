"""
Pydantic schemas for Conversation API requests and responses.

These define what data the API accepts and returns.
FastAPI uses them to:
- Validate incoming requests automatically
- Generate Swagger/OpenAPI documentation
- Serialize responses to JSON
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    """Request body to create a new conversation."""

    learner_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique identifier for the learner (e.g., 'student-1')",
        examples=["student-1"],
    )
    title: str | None = Field(
        default=None,
        max_length=255,
        description="Optional title for the conversation",
        examples=["Learning about volcanoes"],
    )


class MessageInConversation(BaseModel):
    """A single message shown inside a conversation response."""

    id: str
    role: str
    content: str
    is_safe: bool | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FlagInConversation(BaseModel):
    """A flag summary shown inside a conversation response."""

    id: str
    flag_type: str
    reason: str
    severity: str
    reviewed: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    """Full conversation with messages and flags."""

    id: str
    learner_id: str
    title: str | None
    is_flagged: bool
    created_at: datetime
    updated_at: datetime
    messages: list[MessageInConversation] = []
    flags: list[FlagInConversation] = []

    class Config:
        from_attributes = True


class ConversationSummary(BaseModel):
    """Conversation without messages — used for list views."""

    id: str
    learner_id: str
    title: str | None
    is_flagged: bool
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    """Paginated list of conversations."""

    conversations: list[ConversationSummary]
    total: int
    page: int
    page_size: int
