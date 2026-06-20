# Storyboard Service
"""
AI-powered storyboard generation for video content preview.

Creates visual storyboards from text prompts using:
1. LLM (Claude Opus) → breaks prompt into 3-5 detailed scenes
2. Image gen (FLUX.2 Pro) → generates image per scene in parallel
3. HTML layout → combines into preview grid

Usage:
    from services.storyboard.engine import StoryboardEngine
    engine = StoryboardEngine()
    result = engine.create("romantic beach sunset", style="cinematic")
"""
