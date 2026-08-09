#!/usr/bin/env python3
"""End-to-end generation smoke tests for 1ai-content Python API (port 8767).

Tests all registered endpoints with real-ish payloads. Reports per-endpoint
pass/fail and a layer-by-layer summary.
"""

import sys
import json
import time
import os
import requests

BASE = "http://127.0.0.1:8767"
TIMEOUT_FAST = 10    # endpoints that should respond instantly
TIMEOUT_SLOW = 120   # generation endpoints that may take a while

# Shared-secret for the Python enforce_api_key gate (gap-1). Attach it to every
# request when set in the environment; when unset the gate fails open and
# behavior is unchanged (negative tests still expect 404, not 401).
_SESSION = requests.Session()
_API_KEY = os.environ.get("EBOOK_API_KEY")
if _API_KEY:
    _SESSION.headers.update({"X-API-Key": _API_KEY})

results = []
failures = 0
passes = 0

class SmokeError(Exception):
    """Raised when a smoke test fails."""
    pass

def test(method: str, path: str, desc: str, *,
         expect_status: int = 200,
         expect_json: bool = True,
         body: dict | None = None,
         params: dict | None = None,
         timeout: int = TIMEOUT_FAST,
         allow_422: bool = False) -> dict:
    """Perform a single smoke test and record the result."""
    global failures, passes
    url = f"{BASE}{path}"
    start = time.time()
    try:
        if method == "GET":
            r = _SESSION.get(url, params=params, timeout=timeout)
        elif method == "POST":
            r = _SESSION.post(url, params=params, json=body, timeout=timeout)
        elif method == "DELETE":
            r = _SESSION.delete(url, params=params, timeout=timeout)
        else:
            raise SmokeError(f"Unknown method {method}")

        elapsed = round(time.time() - start, 2)
        status = r.status_code

        issues = []
        # Check status
        if status != expect_status:
            if status == 422 and allow_422:
                pass  # validation error — route exists and is wired
            else:
                issues.append(f"expected {expect_status}, got {status}")

        # Check JSON parseability
        parsed = {}
        if expect_json:
            try:
                parsed = r.json()
            except Exception:
                issues.append("response is not valid JSON")

        # Build verdict
        if issues:
            failures += 1
            verdict = "FAIL"
            issues_str = "; ".join(issues)
            detail = f"{status}: {r.text[:200] if r.text else '(empty)'}"
        else:
            passes += 1
            verdict = "PASS"
            issues_str = ""
            detail = f"{status} ({elapsed}s): {json.dumps(parsed)[:120] if parsed else '(empty)'}"

        record = {
            "endpoint": f"{method} {path}",
            "description": desc,
            "verdict": verdict,
            "status": status,
            "elapsed": elapsed,
            "issues": issues_str,
            "detail": detail,
        }
        results.append(record)
        print(f"  [{verdict}] {method} {path}  ({elapsed}s)  {issues_str or detail[:80]}")
        return record

    except requests.Timeout:
        elapsed = round(time.time() - start, 2)
        failures += 1
        record = {
            "endpoint": f"{method} {path}",
            "description": desc,
            "verdict": "FAIL",
            "status": 0,
            "elapsed": elapsed,
            "issues": "timeout",
            "detail": f"Request timed out after {timeout}s",
        }
        results.append(record)
        print(f"  [FAIL] {method} {path}  ({elapsed}s)  TIMEOUT")
        return record

    except Exception as e:
        elapsed = round(time.time() - start, 2)
        failures += 1
        record = {
            "endpoint": f"{method} {path}",
            "description": desc,
            "verdict": "FAIL",
            "status": 0,
            "elapsed": elapsed,
            "issues": str(e),
            "detail": str(e),
        }
        results.append(record)
        print(f"  [FAIL] {method} {path}  ({elapsed}s)  {e}")
        return record


def print_layer(name: str):
    print(f"\n{'='*60}")
    print(f"  LAYER: {name}")
    print(f"{'='*60}")


# ════════════════════════════════════════════════════════════════
# 1. HEALTH / LIVENESS
# ════════════════════════════════════════════════════════════════
print_layer("Health / Liveness")
test("GET", "/health", "Main health check")

# ════════════════════════════════════════════════════════════════
# 2. AUDIO LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Audio")
test("GET", "/audio/speech/voices", "List TTS voices")
test("POST", "/audio/music", "Generate music (minimal)", body={"prompt":"test beat","instrumental":True}, timeout=TIMEOUT_SLOW)
test("POST", "/audio/music/bgm", "Generate BGM", params={"theme":"corporate"}, timeout=TIMEOUT_SLOW)
test("POST", "/audio/music/lofi", "Generate lo-fi", params={"mood":"chill"}, timeout=TIMEOUT_SLOW)
test("POST", "/audio/speech", "Synthesize speech", body={"text":"Hello world this is a test","voice":"alloy"}, timeout=TIMEOUT_SLOW)
test("POST", "/audio/podcast", "Generate podcast episode", body={"title":"Smoke podcast","segments":[{"speaker":"narrator","text":"Hello this is a smoke test segment"}]}, allow_422=True, timeout=TIMEOUT_SLOW)

# ════════════════════════════════════════════════════════════════
# 3. TEXT LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Text")
test("POST", "/text/hook", "Generate hook", body={"category":"default"})
test("POST", "/text/hook/batch", "Generate hook batch", body={"category":"default","count":3})
test("POST", "/text/hook/critique", "Critique hook", body={"hook_text":"You won't believe what happened next"})
test("GET", "/text/caption/styles", "List caption styles")
test("GET", "/text/caption/presets", "List caption presets")
test("POST", "/text/caption", "Generate caption", body={"text":"A relaxing summer day","style":"story"})
test("POST", "/text/newsletter", "Generate newsletter", body={"topic":"AI productivity trends","audience":"general"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/text/article", "Generate article", body={"topic":"AI productivity trends","keywords":["AI"]}, allow_422=True, timeout=TIMEOUT_SLOW)
test("GET", "/text/articles", "List saved articles")
test("GET", "/text/articles/__missing__", "Get missing article (404)", expect_status=404)

# Ebook endpoints
test("GET", "/text/ebook/health", "Ebook health check")
test("GET", "/text/ebook/projects", "Ebook list projects")

# ════════════════════════════════════════════════════════════════
# 4. IMAGE LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Image")
test("POST", "/image/comic", "Generate comic (SSE)", body={"prompt":"A cat detective solving a mystery","generate_images":False}, timeout=TIMEOUT_SLOW)
test("GET", "/image/carousel/styles", "List carousel styles")
test("GET", "/image/carousel/templates", "List carousel templates")
test("GET", "/image/carousel/templates/default", "Get carousel template 'default'")
test("POST", "/image/carousel", "Generate carousel", body={"topic":"Social media marketing tips","num_slides":5}, timeout=TIMEOUT_SLOW)
test("POST", "/image/storyboard", "Generate storyboard", body={"prompt":"A hero rescuing a cat from a tree"}, timeout=TIMEOUT_SLOW)
test("POST", "/infographic/generate", "Generate infographic PNG", body={"title":"Quarterly Growth","data_points":[{"label":"Q1","value":10},{"label":"Q2","value":25},{"label":"Q3","value":40}]}, timeout=15)
test("POST", "/meme/generate", "Generate meme PNG", body={"top_text":"this is fine","bottom_text":""}, timeout=15)

# ════════════════════════════════════════════════════════════════
# 5. VIDEO LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Video")
test("POST", "/video/movie", "Generate video (SSE)", body={"prompt":"A short peaceful nature scene","style":"slideshow"}, timeout=TIMEOUT_SLOW)
test("POST", "/video/loop", "Create loop", body={"audio_path":"test.mp3"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/remeta", "Re-render with metadata", body={"source":"test.mp4","brand_name":"TestBrand"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/repurpose", "Repurpose content", body={"source":"test.mp4"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/ad", "Render ad video", body={"product_name":"TestProduct","category":"food","description":"A test product"}, timeout=TIMEOUT_SLOW)
test("POST", "/video/transforms", "Generate transforms", body={"video_url":"https://example.com/test.mp4"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/subtitles", "Burn subtitle segments", body={"video_path":"test.mp4","segments":[{"text":"Hello world","start":0,"end":1}],"style":"default"}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/screen-rec", "Record screen", body={"duration":2}, allow_422=True, timeout=TIMEOUT_SLOW)
test("POST", "/video/interactive", "Build interactive video manifest", body={"title":"Branch","start_id":"start","nodes":[{"id":"start","text":"Intro","choices":["end"]},{"id":"end","text":"Outro","choices":[]}]}, timeout=15)

# ════════════════════════════════════════════════════════════════
# 6. DOWNLOAD / TIKWM LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Download / TikWM")
test("POST", "/download/video", "Download video", body={"video_url":"https://www.tiktok.com/@test/video/123456","category":"test"}, allow_422=True)
test("POST", "/download/profile", "Download profile", body={"profile_url":"https://www.tiktok.com/@test","max_videos":1}, allow_422=True)
test("POST", "/tikwm/user/posts", "TikWM user posts", body={"unique_id":"test","count":1}, timeout=15)
test("POST", "/tikwm/challenge/search", "TikWM challenge search", body={"keywords":"dance","count":5}, timeout=15)
test("POST", "/tikwm/challenge/posts", "TikWM challenge posts", body={"challenge_id":"test","count":5}, timeout=15)

# ════════════════════════════════════════════════════════════════
# 7. PINTEREST LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Pinterest")
test("POST", "/pinterest/search", "Pinterest search", body={"query":"nature wallpaper","limit":5}, timeout=15)
test("POST", "/pinterest/post", "Pinterest post to FB", body={"image_url":"https://example.com/test.jpg","caption":"Test post"}, allow_422=True, timeout=15)
test("POST", "/publish-to-facebook", "Publish to Facebook", body={"image_url":"https://example.com/test.jpg","caption":"Test"}, allow_422=True, timeout=15)

# ════════════════════════════════════════════════════════════════
# 8. RESEARCH LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Research")
test("POST", "/research/topics", "Research trending niches", body={"language":"en"}, timeout=15)
test("POST", "/research/book-brief", "Generate book brief", body={"niche":"self-help productivity"}, timeout=TIMEOUT_SLOW)

# ════════════════════════════════════════════════════════════════
# 9. TRENDS LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Trends")
test("GET", "/trending/cached", "Get cached trends")
test("GET", "/trending/status", "Get scanner status")

# ════════════════════════════════════════════════════════════════
# 10. ENGAGEMENT LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Engagement")
test("GET", "/engagement/stats", "Engagement stats", params={"profile_id":""})
test("POST", "/engagement/reply", "Generate reply", body={"profile_id":"test","comment_text":"Great video!","platform":"tiktok"}, allow_422=True, timeout=15)

# ════════════════════════════════════════════════════════════════
# 11. ANALYZE LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Analyze")
test("GET", "/analyze/info", "Channel info", params={"channel_url":"https://www.tiktok.com/@test"}, timeout=15)
test("POST", "/analyze/channel", "Analyze channel", body={"channel_url":"https://www.tiktok.com/@test"}, timeout=15)
test("POST", "/analyze/compare", "Compare channels", body={"channel_urls":["https://www.tiktok.com/@a","https://www.tiktok.com/@b"]}, timeout=15)

# ════════════════════════════════════════════════════════════════
# 12. CLOAK LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Cloak")
test("GET", "/cloak/profiles", "List cloaked profiles", timeout=15)
test("POST", "/cloak/post", "Post via cloak", body={"profile_id":"test","media_path":"test.mp4","caption":"test","platform":"tiktok"}, allow_422=True, timeout=15)
test("POST", "/cloak/batch-post", "Batch post via cloak", body={"profile_ids":["test"],"media_path":"test.mp4","caption":"test","platform":"tiktok"}, allow_422=True, timeout=15)

# ════════════════════════════════════════════════════════════════
# 13. AUTOPILOT LAYER
# ════════════════════════════════════════════════════════════════
print_layer("AutoPilot")
test("GET", "/autopilot/status", "Get autopilot status", timeout=15)
test("POST", "/autopilot/create", "Create autopilot job", body={"name":"TestJob","niche":"tech","platforms":["tiktok"],"videos_per_day":1,"auto_publish":False}, timeout=15)
test("POST", "/autopilot/run", "Run autopilot", timeout=15)

# ════════════════════════════════════════════════════════════════
# 14. CALENDAR LAYER
# ════════════════════════════════════════════════════════════════
print_layer("Calendar")
test("GET", "/calendar/list/1", "List calendar entries for user 1", timeout=15)
test("POST", "/calendar/schedule", "Schedule content", body={"user_id":1,"topic":"Test","scheduled_at":"2026-08-01T10:00:00","platform":"tiktok","content_type":"video"}, allow_422=True, timeout=15)
test("DELETE", "/calendar/delete/0", "Delete calendar entry 0", params={"user_id":1}, allow_422=True, timeout=15)

# ════════════════════════════════════════════════════════════════
# 15. A/B TESTING LAYER
# ════════════════════════════════════════════════════════════════
print_layer("A/B Testing")
test("GET", "/ab-test/list/1", "List A/B tests for user 1", timeout=15)
test("POST", "/ab-test/create", "Create A/B test", body={"user_id":1,"name":"TestAB","topic":"test","platform":"tiktok","content_type":"video"}, timeout=15)

# ════════════════════════════════════════════════════════════════
# 16. NEGATIVE TESTS (legacy endpoints should 404)
# ════════════════════════════════════════════════════════════════
print_layer("Negative (legacy endpoints)")
test("GET", "/suno/generate", "Legacy Suno endpoint (should 404)", expect_status=404)
test("POST", "/music/generate", "Legacy music endpoint (should 404)", expect_status=404)
test("GET", "/tts/voices", "Legacy TTS endpoint (should 404)", expect_status=404)
test("POST", "/hooks/generate", "Legacy hooks endpoint (should 404)", expect_status=404)
test("POST", "/captions/generate", "Legacy captions endpoint (should 404)", expect_status=404)
test("POST", "/comic/generate", "Legacy comic endpoint (should 404)", expect_status=404)
test("POST", "/movie/generate", "Legacy movie endpoint (should 404)", expect_status=404)
test("POST", "/loop/create", "Legacy loop endpoint (should 404)", expect_status=404)
test("POST", "/remeta", "Legacy remeta endpoint (should 404)", expect_status=404)
test("POST", "/repurpose", "Legacy repurpose endpoint (should 404)", expect_status=404)
test("POST", "/storyboard/create", "Legacy storyboard endpoint (should 404)", expect_status=404)
test("POST", "/carousel/create", "Legacy carousel endpoint (should 404)", expect_status=404)
test("GET", "/ebook/*", "Legacy ebook wildcard endpoint (should 404)", expect_status=404)

# ════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ════════════════════════════════════════════════════════════════
print("\n\n")
print("="*60)
print("  SMOKE TEST RESULTS")
print("="*60)

# Group by layer
layers = {
    "Health": [],
    "Audio": [],
    "Text": [],
    "Image": [],
    "Video": [],
    "Download/TikWM": [],
    "Pinterest": [],
    "Research": [],
    "Trends": [],
    "Engagement": [],
    "Analyze": [],
    "Cloak": [],
    "AutoPilot": [],
    "Calendar": [],
    "AB Testing": [],
    "Negative": [],
}
current_layer = None
layer_map = {
    "/health": "Health",
    "/audio": "Audio",
    "/text": "Text",
    "/image": "Image",
    "/infographic": "Image",
    "/meme": "Image",
    "/video": "Video",
    "/download": "Download/TikWM",
    "/tikwm": "Download/TikWM",
    "/pinterest": "Pinterest",
    "/publish": "Pinterest",
    "/research": "Research",
    "/trending": "Trends",
    "/engagement": "Engagement",
    "/analyze": "Analyze",
    "/cloak": "Cloak",
    "/autopilot": "AutoPilot",
    "/calendar": "Calendar",
    "/ab-test": "AB Testing",
    "/suno": "Negative",
    "/music": "Negative",
    "/tts": "Negative",
    "/hooks": "Negative",
    "/captions": "Negative",
    "/comic/generate": "Negative",
    "/movie/generate": "Negative",
    "/loop/create": "Negative",
    "/remeta": "Negative",
    "/repurpose": "Negative",
    "/storyboard/create": "Negative",
    "/carousel/create": "Negative",
    "/ebook": "Negative",
}

for res in results:
    ep = res["endpoint"]
    method_and_path = ep.split(" ", 1)[1] if " " in ep else ep
    matched = False
    for prefix, layer in layer_map.items():
        if method_and_path.startswith(prefix):
            layers.setdefault(layer, []).append(res)
            matched = True
            break
    if not matched:
        layers.setdefault("Other", []).append(res)

total_pass = 0
total_fail = 0
for layer_name, layer_results in layers.items():
    if not layer_results:
        continue
    p = sum(1 for r in layer_results if r["verdict"] == "PASS")
    f = sum(1 for r in layer_results if r["verdict"] == "FAIL")
    total_pass += p
    total_fail += f
    status = "✅" if f == 0 else "⚠️"
    print(f"\n  {status} {layer_name}: {p}/{p+f} passed ({f} failed)")

print(f"\n{'─'*60}")
total = total_pass + total_fail
print(f"  TOTAL: {total_pass}/{total} passed, {total_fail} failed")
print(f"  PASS RATE: {total_pass/max(total,1)*100:.0f}%")
print(f"{'─'*60}")

# Detailed failures
if total_fail > 0:
    print("\n\n  FAILED ENDPOINTS:")
    print("  " + "─"*60)
    for res in results:
        if res["verdict"] == "FAIL":
            print(f"  ✗ {res['endpoint']}")
            print(f"    Detail: {res['detail'][:200]}")
            if res["issues"]:
                print(f"    Issues: {res['issues']}")
            print()

sys.exit(0 if total_fail == 0 else 1)
