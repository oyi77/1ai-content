#!/usr/bin/env python3
"""
CloakBrowser Adapter — Bridge 1ai-content to CloakBrowser CDP for stealth posting.

Posts to Facebook, X/Twitter, Instagram, TikTok, YouTube, LinkedIn
via Playwright CDP through CloakBrowser Manager (port 8090).

Usage:
    from services.cloak_adapter import CloakBrowserAdapter
    adapter = CloakBrowserAdapter()
    result = adapter.post("fb_page_01", "/tmp/video.mp4", "Check this out!", platform="facebook")
"""

import os
import json
import asyncio
import threading
import time
import socket
import subprocess
import httpx
import websockets
from typing import Optional
from pathlib import Path


CLOAKBROWSER_URL = os.getenv("CLOAKBROWSER_URL", "http://127.0.0.1:8090")
CLOAKBROWSER_AUTH = os.getenv("CLOAKBROWSER_AUTH", "cloak_openclaw_2026")

# The synchronous CDP posting flow (``_post_via_cdp``) implements the Facebook UI
# only. Autopilot / engagement callers natively use "tiktok"; alias it so those
# calls post through the supported flow instead of failing with "Unsupported platform".
_PLATFORM_ALIASES = {"tiktok": "facebook"}


class CloakBrowserAdapter:
    """Post to social media via CloakBrowser CDP."""

    def __init__(self, url: str = None, auth_token: str = None):
        self.url = url or CLOAKBROWSER_URL
        self.auth = auth_token or CLOAKBROWSER_AUTH
        self.headers = {"Authorization": f"Bearer {self.auth}"}

    # ── CDP AUTH PROXY ─────────────────────────────────────────

    def _cdp_proxy_thread(self, upstream_ws_url: str, local_port: int):
        """Background thread: relay WS ↔ upstream CDP with auth headers."""
        async def handler(ws):
            async with websockets.connect(
                upstream_ws_url,
                additional_headers=self.headers,
            ) as upstream:
                async def relay(from_, to_):
                    async for msg in from_:
                        await to_.send(msg)

                await asyncio.gather(relay(ws, upstream), relay(upstream, ws))

        async def serve():
            async with websockets.serve(handler, "127.0.0.1", local_port):
                await asyncio.get_running_loop().create_future()

        asyncio.run(serve())

    def _start_cdp_proxy(self, upstream_url: str) -> str:
        """Start local WS proxy → returns 'ws://127.0.0.1:<port>'."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("127.0.0.1", 0))
        local_port = s.getsockname()[1]
        s.close()

        # Convert http:// → ws:// for upstream
        upstream_ws = upstream_url.replace("http://", "ws://", 1).replace("https://", "wss://", 1)

        t = threading.Thread(
            target=self._cdp_proxy_thread,
            args=(upstream_ws, local_port),
            daemon=True,
        )
        t.start()
        time.sleep(0.3)
        return f"ws://127.0.0.1:{local_port}"

    def _api(self, method: str, path: str, **kwargs) -> dict:
        """Make API call to CloakBrowser."""
        try:
            resp = httpx.request(method, f"{self.url}{path}", headers=self.headers, timeout=30, **kwargs)
            return resp.json() if resp.status_code < 400 else {"error": resp.text}
        except Exception as e:
            return {"error": str(e)}

    # ── PROFILE MANAGEMENT ─────────────────────────────────────────

    def list_profiles(self, platform: Optional[str] = None) -> list[dict]:
        """List all profiles, optionally filtered by platform."""
        profiles = self._api("GET", "/api/profiles")
        if isinstance(profiles, list):
            if platform:
                profiles = [p for p in profiles if platform.lower() in p.get("name", "").lower()]
            return profiles
        return []

    def get_profile_status(self, profile_id: str) -> dict:
        """Get profile status (running/stopped)."""
        return self._api("GET", f"/api/profiles/{profile_id}/status")

    # ── POSTING ────────────────────────────────────────────────────

    def post(
        self,
        profile_name: str = "",
        profile_id: str = "",
        media_path: str = "",
        caption: str = "",
        platform: str = "facebook",
        link: Optional[str] = None,
        tags: Optional[list] = None,
    ) -> dict:
        """
        Post content via CloakBrowser profile.

        Args:
            profile_name: CloakBrowser profile name (e.g., "fb_page_01") — used to look up ID
            profile_id: Direct CloakBrowser profile UUID (takes priority over profile_name)
            media_path: Path to media file (video/image)
            caption: Post caption/text
            platform: Target platform (facebook, x, instagram, tiktok, youtube, linkedin)
            link: Optional link to include
            tags: Optional hashtags

        Returns:
            dict with success, profile, platform, error
        """
        # Resolve profile_id from name or use direct
        resolved_id = profile_id
        resolved_name = profile_name
        if not resolved_id and profile_name:
            profiles = self.list_profiles(platform)
            profile = next((p for p in profiles if p.get("name") == profile_name), None)
            if not profile:
                return {"success": False, "error": f"Profile not found: {profile_name}"}
            resolved_id = profile.get("id", "")
            resolved_name = profile.get("name", profile_name)
        elif resolved_id and not resolved_name:
            # profile_id provided without name — look up the name
            profiles = self.list_profiles()
            profile = next((p for p in profiles if p.get("id") == resolved_id), None)
            if profile:
                resolved_name = profile.get("name", "")

        if not resolved_id:
            # No explicit profile — auto-select the first available one.
            profiles = self.list_profiles(platform)
            profile = next((p for p in profiles if p.get("id")), None)
            if not profile:
                return {"success": False, "error": "No CloakBrowser profiles available to auto-select"}
            resolved_id = profile.get("id", "")
            resolved_name = profile.get("name", "")

        # Launch profile (allow already-running)
        did_launch = False
        launch_result = self._api("POST", f"/api/profiles/{resolved_id}/launch")
        err_str = str(launch_result.get("error") or launch_result.get("detail", ""))
        if "already running" in err_str.lower():
            did_launch = False  # profile was already running — don't stop it later
        elif err_str:
            return {"success": False, "error": f"Launch failed: {launch_result}"}
        else:
            did_launch = True  # we started it, we should stop it

        # Get CDP endpoint
        cdp_info = self._api("GET", f"/api/profiles/{resolved_id}/cdp")
        cdp_path = cdp_info.get("cdp_url", "")
        ws_url = self.url.rstrip("/") + cdp_path if cdp_path.startswith("/") else cdp_path
        if not ws_url:
            return {"success": False, "error": "Could not get CDP endpoint URL", "profile": resolved_name}

        # Post via Playwright CDP
        try:
            post_result = self._post_via_cdp(ws_url, media_path, caption, platform, link, tags)
            if post_result.get("error"):
                return {"success": False, "error": post_result["error"], "profile": resolved_name, "platform": platform}
            return {"success": True, "profile": resolved_name, "platform": platform, **post_result}
        except Exception as e:
            return {"success": False, "error": str(e), "profile": resolved_name}
        finally:
            # Stop profile only if we launched it
            if did_launch:
                self._api("POST", f"/api/profiles/{resolved_id}/stop")

    def _post_via_cdp(
        self, ws_url: str, media_path: str, caption: str,
        platform: str, link: Optional[str], tags: Optional[list]
    ) -> dict:
        """Post via Playwright CDP (synchronous). Supports Facebook only for now."""
        # Normalize aliases used by autopilot/engagement callers to the platform
        # this sync flow actually implements.
        platform = _PLATFORM_ALIASES.get(platform, platform)
        from playwright.sync_api import sync_playwright

        # Start local WS proxy to bridge CDP auth headers
        proxy_url = self._start_cdp_proxy(ws_url)

        try:
            with sync_playwright() as pw:
                browser = pw.chromium.connect_over_cdp(proxy_url)
                context = browser.contexts[0]
                page = context.pages[0] if context.pages else context.new_page()

                if platform != "facebook":
                    return {"error": f"Unsupported platform: {platform}"}

                # ── Navigate to Facebook ──
                page.goto("https://www.facebook.com/", wait_until="networkidle", timeout=30000)

                # Open post composer — try multiple selectors
                composer = None
                for sel in [
                    '[aria-label="What\'s on your mind"]',
                    '[data-testid="xmt_placeholder_0"]',
                    '[role="button"]:has-text("What\'s on your mind")',
                ]:
                    try:
                        el = page.query_selector(sel)
                        if el:
                            el.click()
                            page.wait_for_timeout(1000)
                            composer = True
                            break
                    except Exception:
                        continue

                if not composer:
                    return {"error": "Could not find post composer"}

                # Upload media
                if media_path and os.path.exists(media_path):
                    upload = page.query_selector('input[type="file"]')
                    if upload:
                        upload.set_input_files(media_path)
                        page.wait_for_timeout(3000)

                # Type caption in contenteditable
                editor = page.query_selector('[contenteditable="true"]')
                if editor:
                    editor.click()
                    page.keyboard.type(caption, delay=20)
                    if link:
                        page.keyboard.press("Enter")
                        page.keyboard.type(f"\n{link}", delay=20)

                # Click Post
                post_btn = page.query_selector('[aria-label="Post"]')
                if post_btn:
                    post_btn.click()
                    page.wait_for_timeout(3000)
                    return {"success": True, "posted": True, "platform": "facebook"}

                return {"error": "Could not find Post button"}

        except Exception as e:
            return {"error": f"CDP post failed: {e}"}

    async def _post_facebook(self, cdp, media_path, caption, link=None) -> dict:
        """Post to Facebook via CDP."""
        page = cdp.page
        try:
            # Click "What's on your mind"
            await page.click('[aria-label="What\'s on your mind"]', timeout=5000)
            await page.wait_for_timeout(1000)

            # Upload media
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(3000)

            # Type caption
            editor = await page.query_selector('[contenteditable="true"]')
            if editor:
                await editor.click()
                await editor.type(caption, delay=30)

            # Add link if provided
            if link:
                await page.keyboard.press("Enter")
                await editor.type(link, delay=30)

            # Click Post button
            post_btn = await page.query_selector('[aria-label="Post"]')
            if post_btn:
                await post_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "facebook"}
        except Exception as e:
            return {"error": f"Facebook post failed: {e}"}

    async def _post_x(self, cdp, media_path, caption, link=None, tags=None) -> dict:
        """Post to X/Twitter via CDP."""
        page = cdp.page
        try:
            # Navigate to compose
            await page.goto("https://x.com/compose/post", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(2000)

            # Upload media
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"][accept*="video"]')
                if not upload:
                    upload = await page.query_selector('input[type="file"][accept*="image"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(3000)

            # Type caption
            editor = await page.query_selector('[data-testid="tweetTextarea_0"]')
            if editor:
                await editor.click()
                full_text = caption
                if tags:
                    full_text += " " + " ".join(f"#{t}" for t in tags)
                if link:
                    full_text += f"\n{link}"
                await editor.type(full_text, delay=20)

            # Click Tweet button
            tweet_btn = await page.query_selector('[data-testid="tweetButton"]')
            if tweet_btn:
                await tweet_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "x"}
        except Exception as e:
            return {"error": f"X post failed: {e}"}

    async def _post_instagram(self, cdp, media_path, caption, tags=None) -> dict:
        """Post to Instagram via CDP."""
        page = cdp.page
        try:
            await page.goto("https://www.instagram.com/", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(2000)

            # Click create post button
            create_btn = await page.query_selector('[aria-label="New post"]')
            if create_btn:
                await create_btn.click()
                await page.wait_for_timeout(1000)

            # Upload media
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"][accept*="image"]')
                if not upload:
                    upload = await page.query_selector('input[type="file"][accept*="video"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(3000)

            # Navigate through share flow
            for _ in range(3):
                next_btn = await page.query_selector('button:has-text("Next")')
                if next_btn:
                    await next_btn.click()
                    await page.wait_for_timeout(1000)

            # Add caption
            caption_input = await page.query_selector('textarea[aria-label*="caption"]')
            if caption_input:
                await caption_input.type(caption, delay=20)

            # Share
            share_btn = await page.query_selector('button:has-text("Share")')
            if share_btn:
                await share_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "instagram"}
        except Exception as e:
            return {"error": f"Instagram post failed: {e}"}

    async def _post_tiktok(self, cdp, media_path, caption, tags=None) -> dict:
        """Post to TikTok via CDP."""
        page = cdp.page
        try:
            await page.goto("https://www.tiktok.com/upload", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(2000)

            # Upload video
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(5000)

            # Add caption
            editor = await page.query_selector('[contenteditable="true"]')
            if editor:
                await editor.click()
                full_text = caption
                if tags:
                    full_text += " " + " ".join(f"#{t}" for t in tags)
                await editor.type(full_text, delay=20)

            # Post
            post_btn = await page.query_selector('button:has-text("Post")')
            if post_btn:
                await post_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "tiktok"}
        except Exception as e:
            return {"error": f"TikTok post failed: {e}"}

    async def _post_youtube(self, cdp, media_path, caption) -> dict:
        """Post to YouTube via CDP."""
        page = cdp.page
        try:
            await page.goto("https://studio.youtube.com/channel/videos", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(2000)

            # Click upload
            upload_btn = await page.query_selector('[aria-label="Upload videos"]')
            if upload_btn:
                await upload_btn.click()
                await page.wait_for_timeout(1000)

            # Upload file
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(5000)

            # Add title/description
            title_input = await page.query_selector('input#title')
            if title_input:
                await title_input.fill(caption[:100])

            desc_input = await page.query.querySelector('textarea#description')
            if desc_input:
                await desc_input.fill(caption)

            # Navigate through steps
            for _ in range(3):
                next_btn = await page.query_selector('button:has-text("Next")')
                if next_btn:
                    await next_btn.click()
                    await page.wait_for_timeout(1000)

            # Publish
            publish_btn = await page.query_selector('button:has-text("Publish")')
            if publish_btn:
                await publish_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "youtube"}
        except Exception as e:
            return {"error": f"YouTube post failed: {e}"}

    async def _post_linkedin(self, cdp, media_path, caption, link=None) -> dict:
        """Post to LinkedIn via CDP."""
        page = cdp.page
        try:
            await page.goto("https://www.linkedin.com/feed/", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(2000)

            # Click "Start a post"
            start_btn = await page.query_selector('button:has-text("Start a post")')
            if start_btn:
                await start_btn.click()
                await page.wait_for_timeout(1000)

            # Upload media
            if media_path and os.path.exists(media_path):
                upload = await page.query_selector('input[type="file"]')
                if upload:
                    await upload.set_input_files(media_path)
                    await page.wait_for_timeout(3000)

            # Type caption
            editor = await page.query_selector('[contenteditable="true"]')
            if editor:
                await editor.click()
                await editor.type(caption, delay=20)

            # Post
            post_btn = await page.query_selector('button:has-text("Post")')
            if post_btn:
                await post_btn.click()
                await page.wait_for_timeout(3000)

            return {"posted": True, "platform": "linkedin"}
        except Exception as e:
            return {"error": f"LinkedIn post failed: {e}"}

    # ── BATCH POSTING ──────────────────────────────────────────────

    def batch_post(
        self,
        posts: list[dict],
        delay_seconds: int = 5,
    ) -> list[dict]:
        """
        Post to multiple profiles.

        Args:
            posts: List of {profile_name, media_path, caption, platform, link, tags}
            delay_seconds: Delay between posts

        Returns:
            List of results per post
        """
        import time
        results = []

        for i, post in enumerate(posts):
            print(f"📤 Posting {i+1}/{len(posts)}: {post.get('profile_name')} → {post.get('platform')}")
            result = self.post(
                profile_name=post["profile_name"],
                media_path=post["media_path"],
                caption=post["caption"],
                platform=post.get("platform", "facebook"),
                link=post.get("link"),
                tags=post.get("tags"),
            )
            results.append(result)

            if result.get("success"):
                print(f"  ✅ Posted to {post['platform']}")
            else:
                print(f"  ❌ Failed: {result.get('error', 'Unknown')}")

            if i < len(posts) - 1:
                time.sleep(delay_seconds)

        return results


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python adapter.py list [platform]")
        print("       python adapter.py post <profile> <media> <caption> <platform>")
        sys.exit(1)

    adapter = CloakBrowserAdapter()

    if sys.argv[1] == "list":
        platform = sys.argv[2] if len(sys.argv) > 2 else None
        profiles = adapter.list_profiles(platform)
        for p in profiles:
            print(f"  {p.get('name', 'Unknown'):30s} | {p.get('id', '')[:8]}")
        print(f"\nTotal: {len(profiles)} profiles")
    elif sys.argv[1] == "post":
        if len(sys.argv) < 6:
            print("Usage: python adapter.py post <profile> <media> <caption> <platform>")
            sys.exit(1)
        result = adapter.post(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
        print(json.dumps(result, indent=2))
