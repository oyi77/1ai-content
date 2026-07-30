"""Text content type router — hooks, captions, books, ebooks.

Mapped from legacy providers:
  - /text/hook*     ← /hooks/*
  - /text/caption*  ← /captions/*
  - /text/book      ← /bookshelf/generate
  - /text/ebook/*   ← /ebook/* (ContentGenerator registration)
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.api_models import CaptionRequest

router = APIRouter(prefix="", tags=["text"])


# ── Hook models ─────────────────────────────────────────────────

class HookGenerateRequest(BaseModel):
    category: str = Field(default="default", description="Product category")
    affiliate_link: str = Field(default="", description="Affiliate link to include")
    variant: int = Field(default=0, description="Variant index for different captions (0-based)")


class HookGenerateResponse(BaseModel):
    caption: str
    hooks: list[str]
    hashtags: list[str]
    affiliate_link: str = ""


class HookBatchRequest(BaseModel):
    category: str = Field(default="default", description="Product category")
    affiliate_link: str = Field(default="", description="Affiliate link to include")
    count: int = Field(default=5, ge=1, le=20, description="Number of hooks to generate")


class HookCritiqueRequest(BaseModel):
    hook_text: str


class HookCritiqueResponse(BaseModel):
    score: int
    verdict: str
    issues: list[str]
    suggestion: str


# ── Book model ──────────────────────────────────────────────────

class BookGenerateRequest(BaseModel):
    subject: str = Field(..., description="Book topic/subject")
    additional_instructions: str = ""
    long_mode: bool = False
    title_model: Optional[str] = None
    structure_model: Optional[str] = None
    section_model: Optional[str] = None


# ── Hook archetypes (Kane Kallaway) ─────────────────────────────

_HOOK_ARCHETYPES = {
    "big_dream": {
        "name": "Big Dream",
        "pattern": "Imagine waking up to [DESIRED REALITY]. That could be you.",
        "description": "Paint a vivid picture of the dream life the product creates.",
    },
    "problem_agitate": {
        "name": "Problem Agitate Solution",
        "pattern": "Tired of [PROBLEM]? We were too. Until we found [SOLUTION].",
        "description": "Agitate a common pain point and offer the relief.",
    },
    "curiosity_gap": {
        "name": "Curiosity Gap",
        "pattern": "I tried [UNEXPECTED THING] for 30 days. Here's what happened.",
        "description": "Create an information gap the viewer MUST close.",
    },
    "social_proof": {
        "name": "Social Proof",
        "pattern": "10,000 people have already [ACTION]. Here's why.",
        "description": "Leverage herd mentality — if others are doing it, it must work.",
    },
    "objection_buster": {
        "name": "Objection Buster",
        "pattern": "I thought [COMMON OBJECTION] too. Then I found out [TRUTH].",
        "description": "Name the objection, then demolish it.",
    },
    "authority": {
        "name": "Authority",
        "pattern": "After 5 years of [EXPERIENCE], here's the truth about [TOPIC].",
        "description": "Establish credibility upfront to build trust.",
    },
    "fear_based": {
        "name": "Fear-Based",
        "pattern": "Stop doing [HARMFUL THING] before it's too late.",
        "description": "Trigger loss aversion to drive action.",
    },
    "future_pacing": {
        "name": "Future Pacing",
        "pattern": "In 6 months, you'll wish you started [BEHAVIOR] today.",
        "description": "Make the viewer imagine their future regret.",
    },
    "twist": {
        "name": "Twist / Plot Twist",
        "pattern": "I bought [PRODUCT] for [REASON]. But what I got was [UNEXPECTED BENEFIT].",
        "description": "Subvert expectations to keep attention.",
    },
    "statistical": {
        "name": "Statistical / Data-Driven",
        "pattern": "97% of people don't know [SHOCKING FACT]. Here's why.",
        "description": "Start with a surprising statistic to grab attention.",
    },
}

_CATEGORY_HOOKS = {
    "beauty": [
        "I stopped spending $200 on skincare. Here's the $20 hack dermatologists hate.",
        "The one makeup trick that makes you look 10 years younger (takes 30 seconds).",
        "I tried the 3-product routine for 30 days. My skin has never looked better.",
        "This viral beauty hack actually works (and it's not what you think).",
        "Stop buying expensive serums. This drugstore find beats them all.",
    ],
    "fashion": [
        "The capsule wardrobe secret that saves me 2 hours every morning.",
        "I wore the same 5 outfits for a month. Here's what happened.",
        "This one accessory instantly makes any outfit look expensive.",
        "5 clothing items that make you look put together with zero effort.",
        "The thrift store hack that got me designer looks for under $20.",
    ],
    "health": [
        "I reversed my [CONDITION] in 30 days without medication. Here's how.",
        "The morning routine that fixed my energy levels (backed by science).",
        "My doctor was shocked when I showed him these blood test results.",
        "Stop ignoring these 5 warning signs your body is sending you.",
        "This one change to my diet changed EVERYTHING in 2 weeks.",
    ],
    "fitness": [
        "I only workout 15 minutes a day. Here's my body transformation.",
        "The exercise scientists don't want you to know this simple fat loss secret.",
        "How I lost 20 pounds without stepping on a treadmill.",
        "This one exercise targets ALL your problem areas at once.",
        "Stop doing crunches. This 3-move routine gives you visible abs.",
    ],
    "tech": [
        "This free AI tool does what paid software promised but couldn't deliver.",
        "I replaced 5 subscriptions with one $0 tool. Productivity skyrocketed.",
        "The keyboard shortcut that saves me 10 hours per week.",
        "This hidden feature in [APP] will change how you work forever.",
        "I built a business with AI in 7 days. Here's the exact playbook.",
    ],
    "finance": [
        "How I saved $10,000 in one year on a $40,000 salary.",
        "This investing strategy is so simple, banks hate it.",
        "The 50/30/20 rule doesn't work for everyone. Try this instead.",
        "3 side hustles that pay better than your full-time job.",
        "I paid off $30,000 in debt in 8 months. Here's my exact plan.",
    ],
    "food": [
        "This 5-minute recipe tastes better than restaurant quality.",
        "I meal prepped for 30 days. Here's what I learned.",
        "The cooking technique that makes everything taste gourmet.",
        "Stop throwing away [INGREDIENT]. Here's how to use it.",
        "3-ingredient meals that actually taste amazing.",
    ],
    "travel": [
        "How I traveled to 10 countries on $2,000 (the system works).",
        "This hidden gem destination is 80% cheaper than [POPULAR PLACE].",
        "The packing hack that saves 50% of your luggage space.",
        "5 travel scams targeting tourists right now (watch out for #3).",
        "I quit my job to travel full-time. Here's my reality check.",
    ],
    "parenting": [
        "This one phrase stopped my toddler's tantrums instantly.",
        "The bedtime routine that had my kids sleeping through the night in 3 days.",
        "I stopped yelling at my kids. Here's what I do instead.",
        "This educational activity keeps my kids entertained for HOURS (screen-free).",
        "Why your child's teacher wishes every parent knew this one thing.",
    ],
    "productivity": [
        "The 2-Minute Rule that doubled my output (and halved my stress).",
        "I tried the $10,000 productivity system for free. Here's the blueprint.",
        "Stop multitasking. This single-task method gets 3x more done.",
        "The morning stack that made me 5x more productive by 9 AM.",
        "This one change to my workspace transformed my focus.",
    ],
    "default": [
        "I tried this for 7 days and the results were UNEXPECTED.",
        "The one thing nobody tells you about [TOPIC].",
        "5 signs you're ready for [TRANSFORMATION] (most people ignore #4).",
        "What happens when you [ACTION] for 30 days straight?",
        "The [INDUSTRY] secret that's hiding in plain sight.",
    ],
}


def _normalize_cat(raw: str) -> str:
    """Normalize category string."""
    return str(raw).strip().lower()


def _generate_hook_sync(category: str, affiliate_link: str = "", variant: int = 0) -> dict:
    """Synchronous hook generation logic."""
    cat = _normalize_cat(category)
    hooks_list = _CATEGORY_HOOKS.get(cat, _CATEGORY_HOOKS["default"])
    idx = variant % len(hooks_list)
    caption = hooks_list[idx]
    return {
        "caption": caption,
        "hooks": [caption],
        "hashtags": [f"#{cat}", "#fyp", "#viral"],
        "affiliate_link": affiliate_link,
    }


def _generate_hook_batch_sync(category: str, affiliate_link: str = "", count: int = 5) -> list[dict]:
    """Synchronous batch hook generation."""
    cat = _normalize_cat(category)
    hooks_list = _CATEGORY_HOOKS.get(cat, _CATEGORY_HOOKS["default"])
    results = []
    for i in range(min(count, len(hooks_list))):
        results.append({
            "caption": hooks_list[i],
            "hooks": [hooks_list[i]],
            "hashtags": [f"#{cat}", "#fyp", "#viral"],
            "affiliate_link": affiliate_link,
        })
    return results


def _critique_hook_sync(hook_text: str) -> dict:
    """Synchronous hook critique logic."""
    issues = []
    if len(hook_text) < 10:
        issues.append("Hook is too short — needs more context / hook element.")
    if hook_text[0].islower() if hook_text else True:
        issues.append("Hook should start with a capital letter or strong opener.")
    if hook_text.endswith("."):
        issues.append("Consider removing the period — hooks without periods perform better.")
    if "?" not in hook_text and "!" not in hook_text:
        issues.append("Hook lacks punctuation emphasis — try ending with ? for curiosity or ! for excitement.")
    if len(hook_text) > 120:
        issues.append("Hook is over 120 characters — may be cut off on short-form platforms.")

    score = max(0, 100 - len(issues) * 20)
    if score >= 80:
        verdict = "Strong hook — minor tweaks recommended"
    elif score >= 50:
        verdict = "Decent hook — needs refinement"
    else:
        verdict = "Weak hook — consider rewriting"

    return {"score": score, "verdict": verdict, "issues": issues, "suggestion": ""}


# ── Hooks ───────────────────────────────────────────────────────

@router.post("/text/hook", response_model=HookGenerateResponse)
async def text_hook(req: HookGenerateRequest):
    """Generate a viral hook for a given category."""
    return _generate_hook_sync(category=req.category, affiliate_link=req.affiliate_link, variant=req.variant)


@router.post("/text/hook/batch")
async def text_hook_batch(req: HookBatchRequest):
    """Generate a batch of viral hooks for A/B testing."""
    results = _generate_hook_batch_sync(category=req.category, affiliate_link=req.affiliate_link, count=req.count)
    return {"hooks": results, "count": len(results)}


@router.post("/text/hook/critique", response_model=HookCritiqueResponse)
async def text_hook_critique(req: HookCritiqueRequest):
    """Run a hook through the anti-pattern checklist."""
    return _critique_hook_sync(hook_text=req.hook_text)


# ── Captions ────────────────────────────────────────────────────

@router.post("/text/caption")
async def text_caption(req: CaptionRequest):
    """Generate a caption in a specific style."""
    try:
        from services.carousel.caption_styles import CaptionGenerator
        gen = CaptionGenerator()
        result = gen.generate(
            topic=req.topic, style=req.style, platform=req.platform,
            language=req.language, max_length=req.max_length,
            include_hashtags=req.include_hashtags, hashtag_count=req.hashtag_count,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/text/caption/styles")
async def text_caption_styles():
    """List available caption styles."""
    from services.carousel.caption_styles import list_styles
    return {"styles": list_styles()}


@router.get("/text/caption/presets")
async def text_caption_presets():
    """List available caption presets."""
    from services.carousel.caption_presets import list_presets
    return {"presets": list_presets()}


# ── Book (Bookshelf) ────────────────────────────────────────────

@router.post("/text/book")
async def text_book(req: BookGenerateRequest):
    """Generate a book on a given subject — SSE streamed progress."""
    async def _generate():
        try:
            from services.bookshelf import generate_book_pipeline
            async for event in generate_book_pipeline(
                subject=req.subject,
                additional_instructions=req.additional_instructions,
                long_mode=req.long_mode,
                title_model=req.title_model or None,
                structure_model=req.structure_model or None,
                section_model=req.section_model or None,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")
