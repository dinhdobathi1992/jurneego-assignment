"""
Moderation API — teacher/admin review of flagged conversations.

Endpoints:
    GET   /api/moderation/flagged          — List all flagged conversations
    GET   /api/moderation/flagged/{id}     — Get a flagged conversation with reasons
    PATCH /api/moderation/flags/{id}/review — Mark a flag as reviewed
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.conversation import (
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
)
from app.schemas.flag import FlagResponse, FlagReviewRequest
from app.services.ai_service import get_ai_provider
from app.services.conversation_service import ConversationService
from app.services.safety_service import SafetyService

router = APIRouter(prefix="/api/moderation", tags=["Moderation"])


def _get_service(db: Session = Depends(get_db)) -> ConversationService:
    """FastAPI dependency — creates a ConversationService with all its dependencies."""
    return ConversationService(
        db=db,
        ai_provider=get_ai_provider(),
        safety_service=SafetyService(),
    )


@router.get(
    "/flagged",
    response_model=ConversationListResponse,
    summary="List flagged conversations",
    description="Get a paginated list of conversations that have been flagged for review.",
)
def list_flagged_conversations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    service: ConversationService = Depends(_get_service),
):
    conversations, total = service.list_flagged_conversations(page=page, page_size=page_size)

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
    "/flagged/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get a flagged conversation",
    description=(
        "Get a flagged conversation with all messages and flag details. "
        "Shows the reason each message was flagged."
    ),
)
def get_flagged_conversation(
    conversation_id: str,
    service: ConversationService = Depends(_get_service),
):
    conversation = service.get_flagged_conversation(conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Flagged conversation not found",
        )
    return ConversationResponse.model_validate(conversation)


@router.patch(
    "/flags/{flag_id}/review",
    response_model=FlagResponse,
    summary="Review a flag",
    description="Mark a flag as reviewed by a teacher/admin with notes.",
)
def review_flag(
    flag_id: str,
    data: FlagReviewRequest,
    service: ConversationService = Depends(_get_service),
):
    flag = service.review_flag(flag_id=flag_id, reviewer_notes=data.reviewer_notes)
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    return FlagResponse.model_validate(flag)
