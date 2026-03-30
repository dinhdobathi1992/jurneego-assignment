"""
Conversations API — create and list conversations.

Endpoints:
    POST /api/conversations        — Create a new conversation
    GET  /api/conversations        — List all conversations (paginated)
    GET  /api/conversations/{id}   — Get a single conversation with messages
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.conversation import (
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
)
from app.services.ai_service import get_ai_provider
from app.services.conversation_service import ConversationService
from app.services.safety_service import SafetyService

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


def _get_service(db: Session = Depends(get_db)) -> ConversationService:
    """FastAPI dependency — creates a ConversationService with all its dependencies."""
    return ConversationService(
        db=db,
        ai_provider=get_ai_provider(),
        safety_service=SafetyService(),
    )


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=201,
    summary="Create a new conversation",
    description="Start a new chat session for a learner.",
)
def create_conversation(
    data: ConversationCreate,
    service: ConversationService = Depends(_get_service),
):
    conversation = service.create_conversation(data)
    return ConversationResponse.model_validate(conversation)


@router.get(
    "",
    response_model=ConversationListResponse,
    summary="List all conversations",
    description="Get a paginated list of all conversations.",
)
def list_conversations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    service: ConversationService = Depends(_get_service),
):
    conversations, total = service.list_conversations(page=page, page_size=page_size)

    summaries = []
    for conv in conversations:
        summaries.append(
            ConversationSummary(
                id=conv.id,
                learner_id=conv.learner_id,
                title=conv.title,
                is_flagged=conv.is_flagged,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=len(conv.messages),
            )
        )

    return ConversationListResponse(
        conversations=summaries,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get a conversation",
    description="Get a conversation with its full message history and any flags.",
)
def get_conversation(
    conversation_id: str,
    service: ConversationService = Depends(_get_service),
):
    conversation = service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse.model_validate(conversation)
