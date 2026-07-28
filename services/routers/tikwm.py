"""TikWM routes — proxy for tikwm API (user posts, challenge search, challenge posts)."""
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

tikwm_router = APIRouter(prefix="", tags=["tikwm"])


class UserPostsRequest(BaseModel):
    unique_id: str
    count: int = Field(default=10, ge=1, le=100)


class ChallengeSearchRequest(BaseModel):
    keywords: str
    count: int = Field(default=5, ge=1, le=50)


class ChallengePostsRequest(BaseModel):
    challenge_id: str
    count: int = Field(default=10, ge=1, le=100)


@tikwm_router.post("/tikwm/user/posts")
async def tikwm_user_posts(req: UserPostsRequest):
    """Proxy for tikwm user/posts — fetch a creator's video list."""
    from services.download.cascade import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}user/posts",
            params={"unique_id": req.unique_id, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()


@tikwm_router.post("/tikwm/challenge/search")
async def tikwm_challenge_search(req: ChallengeSearchRequest):
    """Proxy for tikwm challenge/search — find challenges by keyword."""
    from services.download.cascade import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}challenge/search",
            params={"keywords": req.keywords, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()


@tikwm_router.post("/tikwm/challenge/posts")
async def tikwm_challenge_posts(req: ChallengePostsRequest):
    """Proxy for tikwm challenge/posts — fetch videos in a challenge."""
    from services.download.cascade import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}challenge/posts",
            params={"challenge_id": req.challenge_id, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()