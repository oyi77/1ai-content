#!/usr/bin/env python3
"""Verify specific smoke test findings with targeted curl calls."""
import requests as r

BASE = "http://127.0.0.1:8767"
TIMEOUT = 10

# 1. Check what fields /text/caption actually requires
print("=== /text/caption field requirements ===")
resp = r.post(f"{BASE}/text/caption", json={"topic": "test", "style": "story"}, timeout=TIMEOUT)
print(f"  topic+style: {resp.status_code} {resp.text[:120]}")

# 2. Check /video/ad field requirements
print("\n=== /video/ad field requirements ===")
resp = r.post(f"{BASE}/video/ad", json={"title": "Test Product", "category": "food", "description": "test"}, timeout=TIMEOUT)
print(f"  title+cat+desc: {resp.status_code} {resp.text[:200]}")

# 3. Check /autopilot/create field requirements
print("\n=== /autopilot/create field requirements ===")
resp = r.post(f"{BASE}/autopilot/create", json={"name":"Test","niche":"tech","platforms":["tiktok"],"posting_times":["09:00"],"videos_per_day":1,"auto_publish":False}, timeout=TIMEOUT)
print(f"  with posting_times: {resp.status_code} {resp.text[:200]}")

# 4. Check /cloak/batch-post signature
print("\n=== /cloak/batch-post - does it expect 'profile_ids'? ===")
resp = r.post(f"{BASE}/cloak/batch-post", json={"profile_ids":["test"],"media_path":"test.mp4","caption":"test","platform":"tiktok"}, timeout=TIMEOUT)
print(f"  profile_ids: {resp.status_code} {resp.text[:200]}")
# Try with singular
resp = r.post(f"{BASE}/cloak/batch-post", json={"profile_id":"test","media_path":"test.mp4","caption":"test","platform":"tiktok"}, timeout=TIMEOUT)
print(f"  profile_id: {resp.status_code} {resp.text[:200]}")

# 5. Check autopilot/run
print("\n=== /autopilot/run ===")
resp = r.post(f"{BASE}/autopilot/run", timeout=TIMEOUT)
print(f"  {resp.status_code} {resp.text[:200]}")

print("\n=== DONE ===")
