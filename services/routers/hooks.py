"""Viral Hooks API — Generate viral captions, hooks, and hashtags for short-form content.

Extracted from 1ai-hub viral_hooks.py. Provides POST endpoints for
hook generation, batch generation, and hook critique.
"""

from __future__ import annotations

import random

from fastapi import APIRouter
from pydantic import BaseModel, Field

hooks_router = APIRouter(prefix="", tags=["hooks"])

# ──────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────


class HookGenerateRequest(BaseModel):
    category: str = Field(default="default", description="Product category")
    affiliate_link: str = Field(default="", description="Affiliate link to include")
    variant: int = Field(default=0, description="Variant index for different captions (0-based)")


class HookGenerateResponse(BaseModel):
    caption: str
    hashtags: str
    hook_text: str
    hook_archetype: str
    visual_suggestion: str
    affiliate_link: str = ""


class HookBatchRequest(BaseModel):
    category: str = Field(default="default", description="Product category")
    affiliate_link: str = Field(default="", description="Affiliate link to include")
    count: int = Field(default=5, ge=1, le=20, description="Number of hooks to generate")


class HookCritiqueRequest(BaseModel):
    hook_text: str


class HookCritiqueResponse(BaseModel):
    score: int
    passes: list[str]
    failures: list[str]
    suggestion: str


# ── Hook Archetypes (Kane Kallaway) ────────────────────────────────

_HOOK_ARCHETYPES = {
    "fortuneteller": {
        "template": "This {thing} is about to change the way {audience} {action}",
        "visual": "Split screen: before/after or current state vs future state",
        "examples": [
            "This {category} trick is about to change how you shop forever",
            "This product is about to blow up — here's why you need it first",
        ],
    },
    "experimenter": {
        "template": "I tried {thing} for {time} to find out {result}",
        "visual": "Timer/counter overlay, hands-on demo footage",
        "examples": [
            "I tested 50 {category} products — only 3 were worth it",
            "I wore this for 7 days straight — here's what happened",
        ],
    },
    "teacher": {
        "template": "{person} got {result} using {method}",
        "visual": "Before/after, result reveal, step-by-step overlay",
        "examples": [
            "10,000 people bought this {category} item last week — here's why",
            "How top sellers get 10x more orders with this one trick",
        ],
    },
    "magician": {
        "template": "Look at this. That's actually a {surprise}",
        "visual": "Reveal moment, dramatic zoom, unexpected transformation",
        "examples": [
            "This looks expensive but it's under Rp50rb",
            "Wait for it... this {category} item does something unexpected",
        ],
    },
    "investigator": {
        "template": "I found a {hidden_thing} in {place} that does {unexpected}",
        "visual": "Discovery moment, close-up reveal, comparison shot",
        "examples": [
            "I found the #1 best seller on Shopee that nobody talks about",
            "This hidden {category} gem has 4.9 stars and 10K+ reviews",
        ],
    },
    "contrarian": {
        "template": "Everyone thinks {common_belief}. They're wrong — here's what's actually happening",
        "visual": "Myth-busting overlay, surprising evidence, counter-intuitive demo",
        "examples": [
            "Stop buying expensive {category} products — this does the same thing for less",
            "Everyone says you need to spend more. Here's why that's wrong.",
        ],
    },
}

# ── Category-specific hooks ────────────────────────────────────────

_CATEGORY_HOOKS = {
    "fashion": {
        "hooks": [
            "🔥 Outfit ini lagi viral! Banyak yang udah pada beli lho",
            "💖 Recommended banget! Worth it untuk harga segini",
            "✨ Bahan premium, harga terjangkau — ini buktinya",
            "👀 Cek outfit ini, langsung jatuh cinta!",
            "💫 Bisa jadi ini yang sedang kamu cari",
            "🌟 Style goals! Cocok banget buat daily",
        ],
        "hashtags": [
            "#fashion",
            "#ootd",
            "#fashioninspo",
            "#style",
            "#fashionkekinian",
            "#belanjamurah",
            "#outfitinspiration",
            "#racunfashion",
            "#viral",
            "#trending2025",
        ],
    },
    "kesehatan": {
        "hooks": [
            "💊 Produk kesehatan yang lagi banyak dicari",
            "🌿 Bahan alami, aman dikonsumsi setiap hari",
            "🔬 Sudah lulus uji lab internasional",
            "💚 Solusi kesehatan alami yang terpercaya",
            "✨ Rekomendasi dari para ahli kesehatan",
            "💊 Rahasia hidup sehat yang jarang diketahui",
        ],
        "hashtags": [
            "#kesehatan",
            "#health",
            "#wellness",
            "#herbal",
            "#sehatalami",
            "#tipskesehatan",
            "#hidupsehat",
            "#suplemen",
            "#viral",
            "#trending2025",
        ],
    },
    "trading": {
        "hooks": [
            "📊 Level up trading game kamu!",
            "💰 Trading makin mudah dengan tools yang tepat",
            "📈 Mau cuan dari trading? Ini rahasianya",
            "🔥 Tools terbaik untuk trader pemula & pro",
            "📉 Jangan trading tanpa ini — resiko rugi besar",
            "💎 Secret weapon para trader profesional",
        ],
        "hashtags": [
            "#trading",
            "#crypto",
            "#investasi",
            "#tradingindonesia",
            "#tradingtips",
            "#saham",
            "#cuancuan",
            "#viral",
            "#trending2025",
        ],
    },
    "homeliving": {
        "hooks": [
            "🏠 Rumah jadi aesthetic dengan produk ini",
            "✨ Dekorasi rumah anti ribet, hasilnya wow!",
            "🛋️ Transformasi ruangan dalam 5 menit",
            "🏡 Ide dekorasi rumah yang bikin betah",
            "💫 Produk wajib punya buat di rumah",
            "🏠 Hidup jadi lebih praktis dengan ini",
        ],
        "hashtags": [
            "#homeliving",
            "#decor",
            "#rumah",
            "#aesthetic",
            "#dekorasi",
            "#homedecor",
            "#interiordesign",
            "#viral",
            "#trending2025",
        ],
    },
    "default": {
        "hooks": [
            "🔥 Produk paling dicari minggu ini!",
            "🌟 Recommended! Jangan sampai kelewatan",
            "✨ Ini yang lagi viral, banyak yang udah beli",
            "💯 Worth it banget, cek sendiri!",
            "🔥 Stok terbatas, buruan sebelum kehabisan",
            "⭐ Top rated! Review dari ribuan pembeli",
        ],
        "hashtags": ["#viral", "#trending", "#recommended", "#belanjamurah", "#shopeehaul", "#trending2025"],
    },
}


def _normalize_cat(raw: str) -> str:
    """Normalize category string."""
    if not raw:
        return "default"
    return str(raw).strip().lower()


def _generate_hook_sync(category: str, affiliate_link: str = "", variant: int = 0) -> dict:
    """Synchronous hook generation logic (shared between sync/async callers)."""
    cat = _normalize_cat(category)
    cat_hooks = _CATEGORY_HOOKS.get(cat, _CATEGORY_HOOKS["default"])
    hooks = cat_hooks["hooks"]
    hook_text = hooks[variant % len(hooks)]

    archetypes = list(_HOOK_ARCHETYPES.keys())
    archetype_name = archetypes[variant % len(archetypes)]
    archetype = _HOOK_ARCHETYPES[archetype_name]

    caption_parts = [hook_text]
    if affiliate_link:
        caption_parts.append(f"👉 {affiliate_link}")
    caption = "\n\n".join(caption_parts)

    all_hashtags = cat_hooks["hashtags"]
    rotated = all_hashtags[variant:] + all_hashtags[:variant]
    selected_hashtags = rotated[: min(10, len(rotated))]
    hashtags_str = " ".join(f"#{h.lstrip('#')}" for h in selected_hashtags)

    return {
        "caption": caption,
        "hashtags": hashtags_str,
        "hook_text": hook_text,
        "hook_archetype": archetype_name,
        "visual_suggestion": archetype["visual"],
        "affiliate_link": affiliate_link,
    }


def _generate_hook_batch_sync(category: str, affiliate_link: str = "", count: int = 5) -> list[dict]:
    """Synchronous batch hook generation."""
    cat = _normalize_cat(category)
    cat_hooks = _CATEGORY_HOOKS.get(cat, _CATEGORY_HOOKS["default"])
    archetypes = list(_HOOK_ARCHETYPES.keys())
    results = []

    for i in range(count):
        archetype_name = archetypes[i % len(archetypes)]
        archetype = _HOOK_ARCHETYPES[archetype_name]
        hook_text = random.choice(cat_hooks["hooks"])
        all_hashtags = cat_hooks["hashtags"]
        random.shuffle(all_hashtags)
        selected = all_hashtags[:8]

        caption_parts = [hook_text]
        if affiliate_link:
            caption_parts.append(f"👉 {affiliate_link}")
        hashtags_str = " ".join(f"#{h.lstrip('#')}" for h in selected)

        results.append(
            {
                "caption": "\n\n".join(caption_parts),
                "hashtags": hashtags_str,
                "hook_text": hook_text,
                "hook_archetype": archetype_name,
                "visual_suggestion": archetype["visual"],
            }
        )

    return results


def _critique_hook_sync(hook_text: str) -> dict:
    """Synchronous hook critique logic."""
    failures = []
    passes = []

    if len(hook_text.split()) <= 15:
        passes.append("Concise — lands in under 2 seconds")
    else:
        failures.append("Too long — hook should be 15 words or fewer")

    setup_words = ["let me tell you", "today we're going to", "hey guys", "welcome to"]
    if not any(sw in hook_text.lower() for sw in setup_words):
        passes.append("Leads with payoff, no throat-clearing")
    else:
        failures.append("Starts with setup/welcoming — lead with the value")

    has_concrete = any(c.isdigit() for c in hook_text) or any(
        w[0].isupper() for w in hook_text.split() if len(w) > 2
    )
    if has_concrete:
        passes.append("Has concrete noun or number")
    else:
        failures.append("No concrete noun or number — add specificity")

    vague = ["you won't believe", "this will blow your mind", "incredible"]
    if not any(v in hook_text.lower() for v in vague):
        passes.append("No vague tease")
    else:
        failures.append("Contains vague tease — be specific")

    score = len(passes) / (len(passes) + len(failures)) * 100 if (passes or failures) else 0

    return {
        "score": round(score),
        "passes": passes,
        "failures": failures,
        "suggestion": "Rewrite with specific numbers and concrete nouns" if failures else "Hook looks strong",
    }


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────


@hooks_router.post("/hooks/generate", response_model=HookGenerateResponse)
async def generate_hook(req: HookGenerateRequest):
    """Generate a viral hook for a given category."""
    return _generate_hook_sync(category=req.category, affiliate_link=req.affiliate_link, variant=req.variant)


@hooks_router.post("/hooks/generate-batch")
async def generate_hook_batch(req: HookBatchRequest):
    """Generate a batch of viral hooks for A/B testing."""
    results = _generate_hook_batch_sync(category=req.category, affiliate_link=req.affiliate_link, count=req.count)
    return {"hooks": results, "count": len(results)}


@hooks_router.post("/hooks/critique", response_model=HookCritiqueResponse)
async def critique_hook(req: HookCritiqueRequest):
    """Run a hook through the anti-pattern checklist."""
    return _critique_hook_sync(hook_text=req.hook_text)
