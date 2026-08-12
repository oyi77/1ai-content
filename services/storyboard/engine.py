# Storyboard Service
"""
AI Storyboard Generation — Visual preview sebelum video dibuat.

Flow:
1. User kirim prompt (text)
2. AI breakdown jadi 3-5 scene (LLM)
3. Generate image per scene (FLUX/GPT Image)
4. Layout jadi storyboard grid
5. User approve/reject
6. Jika approve → generate video sesuai storyboard

Usage:
    from services.storyboard.engine import StoryboardEngine
    engine = StoryboardEngine()
    storyboard = engine.create("romantic beach sunset")
    # Returns: {scenes: [...], images: [...], layout: "..."}
"""

import os
import json
import subprocess
import base64
from pathlib import Path
from typing import Optional
from datetime import datetime

# ── API CONFIG ─────────────────────────────────────────────
OMNIROUTE_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")
# Using our best models
IMAGE_MODEL = os.getenv("STORYBOARD_IMAGE_MODEL", "together/black-forest-labs/FLUX.2-pro")
LLM_MODEL = os.getenv("STORYBOARD_LLM_MODEL", "antigravity/claude-opus-4-6-thinking")


class StoryboardEngine:
    """Generate AI storyboard from text prompt."""

    def __init__(self):
        self.output_dir = Path("/tmp/storyboard_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session_dir = None

    def _call_llm(self, messages: list, model: str = None) -> str:
        """Call LLM via OmniRoute."""
        import httpx

        payload = {
            "model": model or LLM_MODEL,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
            "stream": False,
        }

        try:
            headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"} if OMNIROUTE_API_KEY else {}
            resp = httpx.post(
                f"{OMNIROUTE_URL}/chat/completions",
                json=payload,
                headers=headers,
                timeout=60,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            return f"Error: {resp.text}"
        except Exception as e:
            return f"Error: {e}"

    def _generate_image(self, prompt: str, scene_num: int) -> Optional[str]:
        """Generate image for a scene using FLUX/GPT Image."""
        import httpx

        # Determine model based on availability
        model = IMAGE_MODEL

        # Different payload shapes for different image providers
        payload = {
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
        }

        try:
            headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"} if OMNIROUTE_API_KEY else {}
            resp = httpx.post(
                f"{OMNIROUTE_URL}/images/generations",
                json=payload,
                headers=headers,
                timeout=120,
            )

            if resp.status_code == 200:
                data = resp.json()
                # Handle different response formats
                if "data" in data and len(data["data"]) > 0:
                    img_data = data["data"][0]
                    url = img_data.get("url", "")
                    b64 = img_data.get("b64_json", "")

                    if url:
                        # Download image
                        img_resp = httpx.get(url, timeout=30)
                        if img_resp.status_code == 200:
                            output_path = str(self.session_dir / f"scene_{scene_num}.png")
                            with open(output_path, "wb") as f:
                                f.write(img_resp.content)
                            return output_path
                    elif b64:
                        output_path = str(self.session_dir / f"scene_{scene_num}.png")
                        with open(output_path, "wb") as f:
                            f.write(base64.b64decode(b64))
                        return output_path
            else:
                # Fallback to non-image generation model (just return None)
                return None
        except Exception:
            return None

    def _generate_images_parallel(self, scenes: list) -> list:
        """Generate images for all scenes in parallel."""
        from concurrent.futures import ThreadPoolExecutor, as_completed

        results = [None] * len(scenes)

        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = {}
            for i, scene in enumerate(scenes):
                prompt = scene.get("image_prompt", scene.get("description", ""))
                future = ex.submit(self._generate_image, prompt, i + 1)
                futures[future] = i

            for future in as_completed(futures):
                idx = futures[future]
                results[idx] = future.result()

        # Update scenes with image paths
        for i, img_path in enumerate(results):
            if img_path:
                scenes[i]["image_path"] = img_path

        return scenes

    def create(
        self,
        prompt: str,
        style: str = "cinematic",
        num_scenes: int = 4,
        aspect_ratio: str = "16:9",
    ) -> dict:
        """
        Create a storyboard from text prompt.

        Args:
            prompt: Video concept description (e.g., "romantic beach sunset")
            style: Visual style (cinematic, anime, realistic, product, etc.)
            num_scenes: Number of scenes (3-5)
            aspect_ratio: Output aspect ratio

        Returns:
            dict with scenes, images, metadata
        """
        # Create session directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = self.output_dir / f"storyboard_{timestamp}"
        self.session_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: LLM breakdown prompt → scenes
        print(f"🎬 Breaking down prompt: {prompt}")
        scene_messages = [
            {
                "role": "system",
                "content": """You are a professional storyboard artist and video director.
Break down video concepts into detailed scenes. For each scene provide:
- scene_number: int
- title: short scene title
- duration_seconds: float (2-10 seconds)
- description: detailed visual description (1-2 sentences)
- image_prompt: detailed prompt for AI image generation (include style, lighting, composition)
- narration: optional narration text (if applicable)
- camera: camera movement (static, pan, zoom, dolly)
- transition: transition to next scene (cut, fade, dissolve)
- notes: additional direction notes

CRITICAL:
- The image_prompt MUST be self-contained and detailed for image generation
- Include style keywords like: cinematic lighting, golden hour, shallow depth of field, etc. 
- All scenes must flow together into a coherent narrative
- Total duration should be 15-60 seconds

Output ONLY valid JSON array, no other text.
Example:
[{
  "scene_number": 1,
  "title": "Sunset Beach Walk",
  "duration_seconds": 5,
  "description": "A couple walks hand-in-hand along a golden beach at sunset",
  "image_prompt": "Cinematic shot of a couple walking on a golden sandy beach at sunset, warm golden hour lighting, shallow depth of field, romantic atmosphere, 4k, photorealistic",
  "narration": "Every sunset brings a new beginning...",
  "camera": "dolly forward",
  "transition": "dissolve",
  "notes": "Use warm color palette, lens flare effect"
}]
"""
            },
            {
                "role": "user",
                "content": f"""Create a {num_scenes}-scene storyboard for a video about: "{prompt}"

Style: {style}
Aspect Ratio: {aspect_ratio}
Target audience: Social media (TikTok, Instagram Reels, YouTube Shorts)

Make each scene vivid, detailed, and ready for image generation."""
            }
        ]

        llm_response = self._call_llm(scene_messages)

        # Parse JSON from response
        try:
            # Find JSON array in response
            import re
            json_match = re.search(r'\[[\s\S]*\]', llm_response)
            if json_match:
                scenes = json.loads(json_match.group())
            else:
                scenes = json.loads(llm_response)
        except json.JSONDecodeError:
            # Fallback: create default scenes
            scenes = [
                {
                    "scene_number": i + 1,
                    "title": f"Scene {i + 1}",
                    "duration_seconds": 5,
                    "description": f"Scene {i + 1} of: {prompt}",
                    "image_prompt": f"{prompt}, cinematic quality, scene {i + 1}",
                    "narration": "",
                    "camera": "static",
                    "transition": "cut",
                    "notes": "",
                }
                for i in range(num_scenes)
            ]

        # Step 2: Generate images for each scene (parallel)
        print(f"🎨 Generating {len(scenes)} scene images...")
        scenes = self._generate_images_parallel(scenes)

        # Step 3: Calculate total duration
        total_duration = sum(s.get("duration_seconds", 5) for s in scenes)

        # Step 4: Create storyboard HTML layout
        html_path = self._create_layout(scenes, prompt, total_duration, style)

        result = {
            "success": True,
            "prompt": prompt,
            "style": style,
            "scenes": scenes,
            "total_scenes": len(scenes),
            "total_duration_seconds": total_duration,
            "aspect_ratio": aspect_ratio,
            "session_dir": str(self.session_dir),
            "layout_html": html_path,
            "generated_at": timestamp,
        }

        # Save result
        result_path = self.session_dir / "storyboard.json"
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2, default=str)

        return result

    def _create_layout(
        self, scenes: list, prompt: str, total_duration: float, style: str
    ) -> str:
        """Create HTML layout for storyboard preview."""
        html_parts = [
            "<!DOCTYPE html><html><head>",
            "<meta charset='UTF-8'>",
            "<meta name='viewport' content='width=device-width, initial-scale=1'>",
            "<title>Storyboard Preview</title>",
            "<style>",
            "body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:20px}",
            ".container{max-width:1200px;margin:0 auto}",
            "h1{font-size:28px;margin-bottom:5px}",
            ".subtitle{color:#888;margin-bottom:30px}",
            ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}",
            ".card{background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #333}",
            ".card img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#222}",
            ".card-body{padding:15px}",
            ".scene-num{color:#f97316;font-weight:700;font-size:14px;text-transform:uppercase}",
            ".scene-title{font-size:18px;font-weight:600;margin:5px 0}",
            ".scene-desc{color:#aaa;font-size:13px;line-height:1.5}",
            ".scene-meta{display:flex;gap:15px;margin-top:10px;flex-wrap:wrap}",
            ".meta-tag{background:#333;padding:4px 10px;border-radius:20px;font-size:11px;color:#ccc}",
            ".footer{margin-top:30px;padding:20px;background:#1a1a1a;border-radius:12px}",
            ".footer h3{margin:0 0 10px;color:#f97316}",
            ".footer p{color:#aaa;font-size:14px;margin:3px 0}",
            ".img-placeholder{display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;background:#222;color:#555;font-size:14px}",
            "@media(max-width:600px){.grid{grid-template-columns:1fr}}",
            "</style></head><body><div class='container'>",
            f"<h1>📋 Storyboard Preview</h1>",
            f"<p class='subtitle'>{prompt} · {style} style · {total_duration:.0f}s total · {len(scenes)} scenes</p>",
            "<div class='grid'>",
        ]

        for i, scene in enumerate(scenes):
            img_path = scene.get("image_path", "")
            has_image = img_path and os.path.exists(img_path)

            # Convert image to base64 for inline display
            img_tag = ""
            if has_image:
                with open(img_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                img_tag = f"<img src='data:image/png;base64,{b64}' alt='Scene {i+1}'>"
            else:
                img_tag = f"<div class='img-placeholder'>🎨 Scene {i+1}</div>"

            duration = scene.get("duration_seconds", 5)
            camera = scene.get("camera", "static")
            transition = scene.get("transition", "cut")

            html_parts.append(f"""
            <div class='card'>
                {img_tag}
                <div class='card-body'>
                    <div class='scene-num'>Scene {i+1} · {duration:.0f}s</div>
                    <div class='scene-title'>{scene.get('title', f'Scene {i+1}')}</div>
                    <div class='scene-desc'>{scene.get('description', '')}</div>
                    <div class='scene-meta'>
                        <span class='meta-tag'>📷 {camera}</span>
                        <span class='meta-tag'>✂️ {transition}</span>
                    </div>
                </div>
            </div>
            """)

        # Footer with metadata
        narration_scenes = [s for s in scenes if s.get("narration")]
        html_parts.append(f"""
            </div>
            <div class='footer'>
                <h3>🎬 Production Notes</h3>
                <p><strong>Total Duration:</strong> {total_duration:.0f} seconds</p>
                <p><strong>Style:</strong> {style}</p>
                <p><strong>Narration Scenes:</strong> {len(narration_scenes)}/{len(scenes)}</p>
                <p><strong>Camera Movements:</strong> {', '.join(set(s.get('camera', 'static') for s in scenes))}</p>
            </div>
            </div></body></html>
        """)

        html_content = "\n".join(html_parts)
        html_path = str(self.session_dir / "storyboard.html")
        with open(html_path, "w") as f:
            f.write(html_content)

        return html_path


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python engine.py <prompt> [style] [scenes]")
        print("  styles: cinematic, anime, realistic, product, tutorial, animated")
        sys.exit(1)

    prompt = sys.argv[1]
    style = sys.argv[2] if len(sys.argv) > 2 else "cinematic"
    scenes = int(sys.argv[3]) if len(sys.argv) > 3 else 4

    engine = StoryboardEngine()
    result = engine.create(prompt, style=style, num_scenes=scenes)
    print(json.dumps(result, indent=2, default=str))
    print(f"\n📋 HTML Layout: {result.get('layout_html', 'N/A')}")
