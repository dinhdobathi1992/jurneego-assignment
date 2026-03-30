"""
Messages API — send a message and get an AI response.

This is the CORE endpoint of the entire system.
It orchestrates: message → safety check → AI → safety check → response.

Endpoints:
    POST /api/conversations/{id}/messages — Send a learner message, get AI response
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.message import MessageCreate, MessagePairResponse, MessageResponse
from app.services.ai_service import get_ai_provider
from app.services.conversation_service import ConversationService
from app.services.safety_service import SafetyService

router = APIRouter(prefix="/api/conversations", tags=["Messages"])


def _get_service(db: Session = Depends(get_db)) -> ConversationService:
    """FastAPI dependency — creates a ConversationService with all its dependencies."""
    return ConversationService(
        db=db,
        ai_provider=get_ai_provider(),
        safety_service=SafetyService(),
    )


@router.post(
    "/{conversation_id}/messages",
    response_model=MessagePairResponse,
    summary="Send a message",
    description=(
        "Send a learner's message and receive an AI response. "
        "The message is checked for safety before and after AI processing. "
        "If unsafe content is detected, the message is flagged and a safe "
        "deflection response is returned instead."
    ),
)
def send_message(
    conversation_id: str,
    data: MessageCreate,
    service: ConversationService = Depends(_get_service),
):
    try:
        learner_msg, assistant_msg, was_flagged, flag_reason = service.send_message(
            conversation_id=conversation_id,
            content=data.content,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return MessagePairResponse(
        learner_message=MessageResponse.model_validate(learner_msg),
        assistant_message=MessageResponse.model_validate(assistant_msg),
        was_flagged=was_flagged,
        flag_reason=flag_reason,
    )
