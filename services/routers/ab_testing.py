"""A/B testing endpoints."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from services.api_models import ABTestRequest
from services.di import get_ab_testing

router = APIRouter(prefix="/ab-test", tags=["A/B Testing"])


@router.post("/create")
async def ab_test_create(req: ABTestRequest):
    """Create an A/B test."""
    try:
        ab = get_ab_testing()
        test = await ab.create_test(
            user_id=req.user_id,
            name=req.name,
            topic=req.topic,
            platform=req.platform,
            content_type=req.content_type,
            language=req.language,
        )
        return test
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{user_id}")
async def ab_test_list(user_id: int, status: Optional[str] = None):
    """List A/B tests for a user."""
    try:
        ab = get_ab_testing()
        tests = await ab.get_tests(user_id, status=status)
        return {"tests": tests, "count": len(tests)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{test_id}/start")
async def ab_test_start(user_id: int, test_id: str):
    """Start an A/B test."""
    try:
        ab = get_ab_testing()
        test = await ab.start_test(user_id, int(test_id))
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{test_id}/end")
async def ab_test_end(user_id: int, test_id: str):
    """End test and determine winner."""
    try:
        ab = get_ab_testing()
        test = await ab.end_test(user_id, int(test_id))
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{test_id}/delete")
async def ab_test_delete(test_id: str, user_id: int = 0):
    """Delete an A/B test."""
    try:
        ab = get_ab_testing()
        result = await ab.delete_test(user_id, int(test_id))
        return {"success": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
