#!/usr/bin/env python3
"""
CloakBrowser Adapter — Bridge 1ai-content to CloakBrowser CDP for stealth posting.

Posts to Facebook, X/Twitter, Instagram, TikTok, YouTube, LinkedIn
via Playwright CDP through CloakBrowser Manager (port 8090).

Usage:
    from services.cloakbrowser.adapter import CloakBrowserAdapter
    adapter = CloakBrowserAdapter()
    result = adapter.post("fb_page_01", "/tmp/video.mp4", "Check this out!", platform="facebook")
"""

import os
import json
import subprocess
import httpx
from typing import Optional
from pathlib import Path


CLOAKBROWSER_URL = os.getenv("CLOAKBROWSER_URL", "http://127.0.0.1:8090")
CLOAKBROWSER_AUTH = os.getenv("CLOAKBROWSER_AUTH", "cloak_openclaw_2026")


class CloakBrowserAdapter:
    """Post to social media via CloakBrowser CDP."""

    def __init__(self, url: str = None, auth_token: str = None):
        self.url = url or CLOAKBROWSER_URL
        self.auth = auth_token or CLOAKBROWSER_AUTH
        self.headers = {"Authorization": f"Bearer {self.auth}"}

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
        profile_name: str,
        media_path: str,
        caption: str,
        platform: str = "facebook",
        link: Optional[str] = None,
        tags: Optional[list] = None,
    ) -> dict:
        """
        Post content via CloakBrowser profile.

        Args:
            profile_name: CloakBrowser profile name (e.g., "fb_page_01")
            media_path: Path to media file (video/image)
            caption: Post caption/text
            platform: Target platform (facebook, x, instagram, tiktok, youtube, linkedin)
            link: Optional link to include
            tags: Optional hashtags

        Returns:
            dict with success, profile, platform, error
        """
        # Find profile by name
        profiles = self.list_profiles(platform)
        profile = next((p for p in profiles if p.get("name") == profile_name), None)

        if not profile:
            return {"success": False, "error": f"Profile not found: {profile_name}"}

        profile_id = profile.get("id", "")

        # Launch profile
        launch_result = self._api("POST", f"/api/profiles/{profile_id}/launch")
        if "error" in launch_result:
            return {"success": False, "error": f"Launch failed: {launch_result['error']}"}

        # Get CDP endpoint
        cdp_info = self._api("GET", f"/api/profiles/{profile_id}/cdp")
        ws_url = cdp_info.get("webSocketDebuggerUrl", "")
        if not ws_url:
            ws_url = cdp_info.get("url", "")

        # Post via Playwright CDP
        try:
            post_result = self._post_via_cdp(ws_url, media_path, caption, platform, link, tags)
            return {"success": True, "profile": profile_name, "platform": platform, **post_result}
        except Exception as e:
            return {"success": False, "error": str(e), "profile": profile_name}
        finally:
            # Stop profile
            self._api("POST", f"/api/profiles/{profile_id}/stop")

    def _post_via_cdp(
        self, ws_url: str, media_path: str, caption: str,
        platform: str, link: Optional[str], tags: Optional[list]
    ) -> dict:
        """Post via Playwright CDP WebSocket."""

        try:
            from cloakbrowser_cdp_integration import CloakBrowserCDP

            async def _do_post():
                cdp = CloakBrowserCDP(ws_url)
                if not await cdp.connect():
                    return {"error": "CDP connection failed"}

                # Navigate to platform
                urls = {
                    "facebook": "https://www.facebook.com/",
                    "x": "https://x.com/compose/post",
                    "instagram": "https://www.instagram.com/",
                    "tiktok": "https://www.tiktok.com/upload",
                    "youtube": "https://studio.youtube.com/",
                    "linkedin": "https://www.linkedin.com/feed/",
                }

                target_url = urls.get(platform, urls["facebook"])
                await cdp.page.goto(target_url, wait_until="networkidle", timeout=30000)

                # Platform-specific posting logic
                if platform == "facebook":
                    return await self._post_facebook(cdp, media_path, caption, link)
                elif platform == "x":
                    return await self._post_x(cdp, media_path, caption, link, tags)
                elif platform == "instagram":
                    return await self._post_instagram(cdp, media_path, caption, tags)
                elif platform == "tiktok":
                    return await self._post_tiktok(cdp, media_path, caption, tags)
                elif platform == "youtube":
                    return await self._post_youtube(cdp, media_path, caption)
                elif platform == "linkedin":
                    return await self._post_linkedin(cdp, media_path, caption, link)

                return {"error": f"Unsupported platform: {platform}"}

            import asyncio
            return asyncio.run(_do_post())

        except ImportError:
            return {"error": "CloakBrowser CDP integration not available"}

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
