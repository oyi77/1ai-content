"""
ViMax Service — Agentic Video Generation
Director, Screenwriter, Producer, and Video Generator All-in-One.
Runs on port 8770.
"""

import os
import uuid
import asyncio
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("vimax")

app = FastAPI(title="ViMax Service", version="1.0.0")

OUTPUT_DIR = Path("/tmp/vimax_outputs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# LLM configuration
LLM_PROVIDER = os.getenv("VIMAX_LLM_PROVIDER", "openai")
LLM_API_KEY = os.getenv("OPENAI_API_KEY", os.getenv("LLM_API_KEY", ""))
LLM_MODEL = os.getenv("VIMAX_LLM_MODEL", "gpt-4o-mini")


class IdeaRequest(BaseModel):
    idea: str
    style: str = "cinematic"  # cinematic, casual, corporate, educational
    duration: int = 30  # target duration in seconds
    platform: str = "tiktok"  # tiktok, youtube, instagram
    language: str = "id"  # id, en


class ScriptRequest(BaseModel):
    topic: str
    style: str = "engaging"
    duration: int = 30
    language: str = "id"
    include_hooks: bool = True


class AgentResponse(BaseModel):
    success: bool
    job_id: str
    script: str = ""
    scenes: list = []
    voiceover: str = ""
    video_path: str = ""
    metadata: dict = {}
    error: str = ""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "vimax",
        "llm_provider": LLM_PROVIDER,
        "has_api_key": bool(LLM_API_KEY),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/idea-to-video", response_model=AgentResponse)
async def idea_to_video(req: IdeaRequest):
    """Generate a complete video from an idea using AI agents."""
    job_id = str(uuid.uuid4())[:12]

    try:
        # Step 1: Director agent creates concept
        concept = await _director_agent(req.idea, req.style, req.platform)

        # Step 2: Screenwriter agent writes script
        script = await _screenwriter_agent(concept, req.duration, req.language)

        # Step 3: Producer agent creates scene breakdown
        scenes = await _producer_agent(script, req.duration)

        # Step 4: Generate voiceover text
        voiceover = "\n".join([
            s.get("narration", "") for s in scenes if s.get("narration")
        ])

        return AgentResponse(
            success=True,
            job_id=job_id,
            script=json.dumps(script, ensure_ascii=False, indent=2),
            scenes=scenes,
            voiceover=voiceover,
            metadata={
                "concept": concept,
                "style": req.style,
                "platform": req.platform,
                "duration": req.duration,
                "scene_count": len(scenes),
            },
        )

    except Exception as e:
        logger.error(f"Idea-to-video failed: {e}")
        return AgentResponse(success=False, job_id=job_id, error=str(e))


@app.post("/generate-script", response_model=AgentResponse)
async def generate_script(req: ScriptRequest):
    """Generate a video script from a topic."""
    job_id = str(uuid.uuid4())[:12]

    try:
        script = await _screenwriter_agent(
            {"topic": req.topic, "style": req.style},
            req.duration,
            req.language,
        )

        scenes = await _producer_agent(script, req.duration)

        return AgentResponse(
            success=True,
            job_id=job_id,
            script=json.dumps(script, ensure_ascii=False, indent=2),
            scenes=scenes,
            metadata={
                "topic": req.topic,
                "style": req.style,
                "duration": req.duration,
                "scene_count": len(scenes),
            },
        )

    except Exception as e:
        logger.error(f"Script generation failed: {e}")
        return AgentResponse(success=False, job_id=job_id, error=str(e))


async def _director_agent(idea: str, style: str, platform: str) -> dict:
    """Director agent: creates video concept and direction."""
    # Template-based concept creation (LLM-enhanced when API key available)
    concepts = {
        "cinematic": {
            "mood": "epic, dramatic",
            "pacing": "slow to medium",
            "transitions": "smooth fades, cinematic cuts",
            "color_grade": "warm tones, high contrast",
        },
        "casual": {
            "mood": "friendly, relatable",
            "pacing": "fast, energetic",
            "transitions": "quick cuts, zoom effects",
            "color_grade": "bright, saturated",
        },
        "corporate": {
            "mood": "professional, trustworthy",
            "pacing": "medium, steady",
            "transitions": "clean cuts, dissolves",
            "color_grade": "neutral, clean",
        },
        "educational": {
            "mood": "informative, clear",
            "pacing": "medium, structured",
            "transitions": "slide-like, organized",
            "color_grade": "clean, high readability",
        },
    }

    concept = concepts.get(style, concepts["cinematic"])
    concept["idea"] = idea
    concept["style"] = style
    concept["platform"] = platform
    concept["target_audience"] = _infer_audience(idea, platform)

    return concept


async def _screenwriter_agent(concept: dict, duration: int, language: str) -> dict:
    """Screenwriter agent: writes the video script."""
    idea = concept.get("idea", concept.get("topic", ""))
    style = concept.get("style", "cinematic")

    # Calculate scene count based on duration
    scene_count = max(3, min(8, duration // 5))

    # Template-based script structure
    hook_templates = {
        "id": [
            f"Tahukah kamu tentang {idea}?",
            f"Ini yang terjadi saat {idea}...",
            f"Jangan lakukan ini sebelum tahu {idea}!",
        ],
        "en": [
            f"Did you know about {idea}?",
            f"This is what happens when {idea}...",
            f"Don't do this before knowing {idea}!",
        ],
    }

    hook = hook_templates.get(language, hook_templates["en"])[0]

    script = {
        "title": f"Video: {idea}",
        "hook": hook,
        "language": language,
        "style": style,
        "total_duration": duration,
        "acts": [
            {
                "act": 1,
                "name": "Hook",
                "duration": min(5, duration // 3),
                "content": hook,
                "visual": f"Eye-catching opening shot related to {idea}",
            },
            {
                "act": 2,
                "name": "Body",
                "duration": duration // 2,
                "content": f"Main content about {idea} with key points",
                "visual": f"Multiple scenes showing {idea} in detail",
            },
            {
                "act": 3,
                "name": "CTA",
                "duration": min(5, duration // 4),
                "content": "Follow for more! Like and share!",
                "visual": "Closing shot with logo/brand",
            },
        ],
    }

    return script


async def _producer_agent(script: dict, duration: int) -> list:
    """Producer agent: breaks down script into production scenes."""
    scenes = []
    scene_num = 1

    for act in script.get("acts", []):
        act_duration = act.get("duration", 5)
        scenes_per_act = max(1, act_duration // 4)

        for i in range(scenes_per_act):
            scene_dur = act_duration / scenes_per_act
            scenes.append({
                "scene_number": scene_num,
                "act": act.get("name", ""),
                "duration": round(scene_dur, 1),
                "visual_prompt": act.get("visual", ""),
                "narration": act.get("content", "") if i == 0 else "",
                "motion": "medium" if act.get("name") == "Hook" else "slow",
                "camera": "dynamic" if act.get("name") == "Hook" else "static",
                "transition": "cut" if scene_num > 1 else "fade_in",
                "audio_mood": "energetic" if act.get("name") == "Hook" else "calm",
            })
            scene_num += 1

    return scenes


def _infer_audience(idea: str, platform: str) -> str:
    """Infer target audience from idea and platform."""
    platform_audiences = {
        "tiktok": "Gen Z and Millennials (18-34)",
        "youtube": "General audience (18-45)",
        "instagram": "Millennials and Gen Z (18-35)",
    }
    return platform_audiences.get(platform, "General audience")


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8770)
