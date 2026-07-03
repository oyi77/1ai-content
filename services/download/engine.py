"""1ai-content Download Engine — TikTok/YouTube/IG video download service.

Cascade: tikwm → yt-dlp → Vidbee → Cobalt → CloakBrowser → scrape → cover → placeholder
Each method returns {file_path, file_type, status, reason}.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
from typing import Any  # noqa: F401 — used by type hints in docstrings

import httpx

from loguru import logger

# ── External API URLs (configurable via env) ────────────────────────

TIKWM_API_URL = os.getenv("TIKWM_API_URL", "https://www.tikwm.com/api/")
VIDBEE_URL = os.getenv("VIDBEE_URL", "http://localhost:3101")
COBALT_URL = os.getenv("COBALT_URL", "http://localhost:9000")
PICSUM_URL = os.getenv("PICSUM_URL", "https://picsum.photos")
TIKTOK_OEMBED = os.getenv("TIKTOK_OEMBED", "https://www.tiktok.com/oembed")


# ── Download Methods ────────────────────────────────────────────────


async def dl_tikwm(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via tikwm.com API."""
    try:
        r = await client.get(TIKWM_API_URL, params={"url": url}, timeout=15)
        if r.status_code == 200:
            d = r.json()
            if d.get("code") == 0:
                dl_url = d["data"].get("play") or d["data"].get("wmplay") or ""
                if dl_url:
                    result = await _dl_url(client, dl_url, vid_id, tmpdir, "mp4", referer="https://www.tikwm.com/")
                    if result["status"] == "downloaded":
                        result["file_type"] = "video"
                        return result
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


async def dl_ytdlp(url: str, vid_id: str, tmpdir: str, cookies_path: str = None) -> dict:
    """Download video via yt-dlp subprocess."""
    try:
        out_path = os.path.join(tmpdir, f"{vid_id}.mp4")
        cmd = ["yt-dlp", "--no-check-certificates", "--no-warnings"]
        if cookies_path and os.path.exists(cookies_path):
            cmd += ["--cookies", cookies_path]
        cmd += ["-f", "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/best[ext=mp4]/best", "-o", out_path, url]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=45)
        if proc.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
            return {"file_path": out_path, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
        if os.path.exists(out_path):
            ftype = "audio" if b"audio" in (stderr or b"") else "unknown"
            os.remove(out_path)
            return {"file_path": None, "file_type": ftype, "status": "failed", "tmpdir": tmpdir, "error": f"ytdlp_returned_{ftype}"}
    except asyncio.TimeoutError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_timeout"}
    except FileNotFoundError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_not_installed"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ytdlp_{type(e).__name__}"}
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_unknown"}


async def dl_cobalt(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via Cobalt API."""
    try:
        r = await client.post(
            f"{COBALT_URL}/",
            json={"url": url, "videoQuality": "720"},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=30,
        )
        if r.status_code != 200:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
        data = r.json()
        status = data.get("status", "")
        if status in ("tunnel", "redirect"):
            dl_url = data.get("url", "")
            if dl_url:
                result = await _dl_url(client, dl_url, vid_id, tmpdir, "mp4")
                if result["status"] == "downloaded":
                    result["file_type"] = "video"
                    return result
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


async def dl_vidbee(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via Vidbee API (async yt-dlp wrapper)."""
    try:
        r = await client.post(
            f"{VIDBEE_URL}/rpc/downloads/create",
            json={"json": {"url": url, "type": "video"}},
            timeout=10,
        )
        if r.status_code != 200:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
        task = r.json().get("json", {}).get("download", {})
        task_id = task.get("id", "")
        if not task_id:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
        # Poll for completion
        for _ in range(30):
            await asyncio.sleep(2)
            try:
                hist = await client.post(f"{VIDBEE_URL}/rpc/history/list", json={"json": {}}, timeout=5)
                if hist.status_code == 200:
                    items = hist.json().get("json", {}).get("items", [])
                    for item in items:
                        if item.get("status") == "completed" and item.get("savedFileName"):
                            import subprocess
                            saved = item.get("savedFileName", "")
                            host_path = os.path.join(tmpdir, f"{vid_id}.mp4")
                            container_path = f"/data/downloads/{saved}"
                            try:
                                subprocess.run(["docker", "cp", f"vidbee-api-1:{container_path}", host_path], capture_output=True, timeout=10)
                                if os.path.exists(host_path) and os.path.getsize(host_path) > 10000:
                                    return {"file_path": host_path, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
                            except Exception:
                                pass
            except Exception:
                continue
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


async def dl_cloakbrowser(url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via CloakBrowser — anti-detect Chromium for TikTok."""
    try:
        import cloakbrowser
    except ImportError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_not_installed"}
    os.makedirs(tmpdir, exist_ok=True)
    try:
        browser = await cloakbrowser.launch_async(headless=True, stealth_args=True, humanize=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()
        video_urls: list[str] = []

        def _on_resp(resp):
            u = resp.url
            ct = resp.headers.get("content-type", "")
            if "video/mp4" in ct and resp.status == 200 and "ttwstatic" not in u:
                video_urls.append(u)

        page.on("response", _on_resp)
        video_url = ""
        fp = os.path.join(tmpdir, f"tiktok_{vid_id}.mp4")
        try:
            await page.goto(url, wait_until="networkidle", timeout=25000)
            video_url = await page.evaluate(
                "() => { try { const s = document.querySelector('script[id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"]');"
                "if(s){const d=JSON.parse(s.textContent);const v=d?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.video;"
                "if(v?.playAddr)return v.playAddr;}}catch(e){} "
                "try{const v=document.querySelector('video');if(v)return v.src||v.currentSrc||'';}catch(e){} return '';}"
            )
            if not video_url or video_url.startswith("blob:"):
                video_url = next((u for u in video_urls if "tiktok" in u), "")
            if not video_url or video_url.startswith("blob:"):
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_no_video_url"}
            resp = await page.request.get(video_url, headers={"Referer": "https://www.tiktok.com/"})
            if resp.ok:
                body = await resp.body()
                if len(body) > 10000:
                    with open(fp, "wb") as f:
                        f.write(body)
                else:
                    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_empty_download"}
            else:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"cloakbrowser_http_{resp.status}"}
        finally:
            await browser.close()
        if os.path.exists(fp) and os.path.getsize(fp) > 10000:
            return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_download_failed"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"cloakbrowser_{type(e).__name__}"}


async def dl_ssstik(url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via ssstik.io — no watermark, original quality, no cookies needed."""
    try:
        import cloakbrowser
    except ImportError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_no_browser"}
    os.makedirs(tmpdir, exist_ok=True)
    try:
        browser = await cloakbrowser.launch_async(headless=True, stealth_args=True, humanize=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()
        download_url = ""

        def _on_resp(resp):
            nonlocal download_url
            u = resp.url
            ct = resp.headers.get("content-type", "")
            if "video/mp4" in ct and resp.status == 200 and "tikcdn" in u:
                download_url = u

        page.on("response", _on_resp)
        fp = os.path.join(tmpdir, f"ssstik_{vid_id}.mp4")
        try:
            # 1. Navigate to ssstik.io
            await page.goto("https://ssstik.io/id", wait_until="networkidle", timeout=20000)

            # 2. Fill in TikTok URL
            input_el = await page.query_selector('#main_page_text')
            if input_el:
                await input_el.fill(url)

            # 3. Submit the form
            submit = await page.query_selector('#_gcaptcha_pt button, #_gcaptcha_pt [type="submit"]')
            if submit:
                await submit.click()
            else:
                # Fallback: find any submit-like button
                btns = await page.query_selector_all('button')
                for btn in btns:
                    txt = await btn.evaluate('el => el.textContent.trim()')
                    if 'unduh' in txt.lower() or 'download' in txt.lower() or 'cari' in txt.lower():
                        await btn.click()
                        break

            # 4. Wait for download link to appear
            await page.wait_for_timeout(5000)

            # 5. Extract download link from DOM
            if not download_url:
                links = await page.query_selector_all('a[href*="tikcdn"]')
                for link in links:
                    href = await link.get_attribute('href')
                    if href and 'tikcdn' in href:
                        download_url = href
                        break

            if not download_url:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_no_download_url"}

            # 6. Download the video
            resp = await page.request.get(download_url)
            if resp.ok:
                body = await resp.body()
                if len(body) > 10000:
                    with open(fp, "wb") as f:
                        f.write(body)
                else:
                    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_empty_download"}
            else:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ssstik_http_{resp.status}"}
        finally:
            await browser.close()
        if os.path.exists(fp) and os.path.getsize(fp) > 10000:
            return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_download_failed"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ssstik_{type(e).__name__}"}
async def scrape_tiktok_page(client: httpx.AsyncClient, url: str) -> dict | None:
    """Scrape TikTok page for video metadata (supports both videos and slideshows)."""
    try:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        r = await client.get(url, headers={"User-Agent": ua}, timeout=10)
        if r.status_code == 200:
            m = re.search(r'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)</script>', r.text)
            if m:
                data = json.loads(m.group(1))
                item = data.get("__DEFAULT_SCOPE__", {}).get("webapp.video-detail", {}).get("itemInfo", {}).get("itemStruct", {})
                video_data = item.get("video", {})
                # Detect slideshow: TikTok puts images[] in itemStruct for slideshows
                images = item.get("images", [])
                if images:
                    video_data["_slideshow_images"] = [img.get("url", "") for img in images if img.get("url")]
                    video_data["_is_slideshow"] = True
                else:
                    video_data["_is_slideshow"] = False
                return video_data
    except Exception:
        pass
    return None


async def convert_slideshow_to_video(image_urls: list[str], vid_id: str, tmpdir: str, client: httpx.AsyncClient) -> dict:
    """Download slideshow images and convert to video using ffmpeg."""
    import subprocess
    try:
        # Download all images
        img_paths = []
        for i, url in enumerate(image_urls[:20]):  # Max 20 images
            r = await _dl_url(client, url, f"{vid_id}_slide_{i:03d}", tmpdir, "jpg", referer="https://www.tiktok.com/")
            if r["status"] == "downloaded" and r.get("file_path"):
                img_paths.append(r["file_path"])

        if not img_paths:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "no_slideshow_images"}

        # Create ffmpeg slideshow: each image shown for 3s with fade transitions
        output_path = os.path.join(tmpdir, f"{vid_id}_slideshow.mp4")
        duration_per_image = 3

        # Build ffmpeg command with crossfade
        if len(img_paths) == 1:
            # Single image → still video
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", img_paths[0],
                "-c:v", "libx264", "-t", "5", "-pix_fmt", "yuv420p",
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                output_path
            ]
        else:
            # Multiple images → slideshow with crossfade
            # Create concat file with durations
            concat_path = os.path.join(tmpdir, f"{vid_id}_concat.txt")
            with open(concat_path, "w") as f:
                for img in img_paths:
                    f.write(f"file '{img}'\n")
                    f.write(f"duration {duration_per_image}\n")
                # Last image needs to be listed again for ffmpeg concat
                f.write(f"file '{img_paths[-1]}'\n")

            cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
                output_path
            ]

        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.isfile(output_path):
            return {
                "file_path": output_path,
                "file_type": "video",
                "status": "downloaded",
                "tmpdir": tmpdir,
                "file_size": os.path.getsize(output_path),
                "reason": "slideshow_to_video",
            }
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ffmpeg_exit_{result.returncode}"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"slideshow_convert_{type(e).__name__}"}


async def dl_oembed(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Get thumbnail via TikTok oembed API."""
    try:
        r = await client.get(f"{TIKTOK_OEMBED}?url={url}", timeout=5)
        if r.status_code == 200:
            thumb = r.json().get("thumbnail_url", "")
            if thumb:
                result = await _dl_url(client, thumb, vid_id, tmpdir, "jpg")
                if result["status"] == "downloaded":
                    result["file_type"] = "image"
                    return result
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


async def dl_placeholder(client: httpx.AsyncClient, category: str, tmpdir: str) -> dict:
    """Download generic placeholder image from picsum."""
    try:
        seed = abs(hash(category)) % 100000
        r = await client.get(f"{PICSUM_URL}/seed/{seed}/1080/1080", timeout=15)
        if r.status_code == 200 and len(r.content) > 1024:
            fp = os.path.join(tmpdir, f"{category.replace(' ', '_')}_{seed}.jpg")
            with open(fp, "wb") as f:
                f.write(r.content)
            return {"file_path": fp, "file_type": "image", "status": "downloaded", "tmpdir": tmpdir}
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


# ── Cascade ─────────────────────────────────────────────────────────


async def download_video(video_url: str, category: str = "general") -> dict:
    """Download a single video with full cascade fallback.

    Cascade: yt-dlp (with cookies) → tikwm → Vidbee → Cobalt → CloakBrowser → scrape → cover → placeholder
    Returns {file_path, file_type, status, reason, tmpdir}.
    """
    tmpdir = tempfile.mkdtemp(prefix="1ai_content_")
    vid_id = video_url.rstrip("/").split("/")[-1] if video_url else "unknown"

    if not video_url:
        return {**await dl_placeholder(None, category, tmpdir), "reason": "no_video_url"}

    is_tiktok = "tiktok.com" in video_url
    errors: list[str] = []

    # 1. ssstik.io (TikTok only — no watermark, ORIGINAL quality, no cookies)
    if is_tiktok:
        r = await dl_ssstik(video_url, vid_id, tmpdir)
        if r["status"] == "downloaded":
            r["reason"] = "ssstik_video"
            return r
        errors.append(f"ssstik={r.get('error', 'failed')}")

    # 2. yt-dlp with cookies (720x1280 H.264)
    _cookies_path = os.getenv("TIKTOK_COOKIES_PATH", "")
    if not _cookies_path:
        for _p in [
            os.path.join(os.path.dirname(__file__), "..", "..", "config", "tiktok_cookies.txt"),
            "/tmp/tiktok_cookies.txt",
        ]:
            if os.path.exists(_p):
                _cookies_path = _p
                break
    r = await dl_ytdlp(video_url, vid_id, tmpdir, cookies_path=_cookies_path if is_tiktok else None)
    if r["status"] == "downloaded":
        r["reason"] = "ytdlp_video"
        return r
    errors.append(f"ytdlp={r.get('error', 'failed')}")

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as client:
        # 3. tikwm fallback (TikTok only — 576x1024, lower quality)
        if is_tiktok:
            r = await dl_tikwm(client, video_url, vid_id, tmpdir)
            if r["status"] == "downloaded":
                r["reason"] = "tikwm_video"
                return r
            errors.append(f"tikwm={r.get('error', 'failed')}")

        # 3. Vidbee
        r = await dl_vidbee(client, video_url, vid_id, tmpdir)
        if r["status"] == "downloaded":
            r["reason"] = "vidbee_video"
            return r
        errors.append(f"vidbee={r.get('error', 'failed')}")

        # 4. Cobalt
        r = await dl_cobalt(client, video_url, vid_id, tmpdir)
        if r["status"] == "downloaded":
            r["reason"] = "cobalt_video"
            return r
        errors.append(f"cobalt={r.get('error', 'failed')}")

        # 5. CloakBrowser (TikTok only)
        if is_tiktok:
            r = await dl_cloakbrowser(video_url, vid_id, tmpdir)
            if r["status"] == "downloaded":
                r["reason"] = "cloakbrowser_video"
                return r
            errors.append(f"cloakbrowser={r.get('error', 'failed')}")

        # 6. TikTok page scrape → video or slideshow
        if is_tiktok:
            page_data = await scrape_tiktok_page(client, video_url)
            if page_data:
                # 6a. Slideshow detection — images[] in itemStruct
                if page_data.get("_is_slideshow") and page_data.get("_slideshow_images"):
                    logger.info(f"[download] Slideshow detected: {len(page_data['_slideshow_images'])} images")
                    r = await convert_slideshow_to_video(
                        page_data["_slideshow_images"], vid_id, tmpdir, client
                    )
                    if r["status"] == "downloaded":
                        r["reason"] = "slideshow_to_video"
                        return r
                    errors.append(f"slideshow_convert={r.get('error', 'failed')}")

                # 6b. Regular video
                play_url = page_data.get("playAddr", "")
                if play_url:
                    r = await _dl_url(client, play_url, vid_id, tmpdir, "mp4", referer="https://www.tiktok.com/")
                    if r["status"] == "downloaded":
                        r["file_type"] = "video"
                        r["reason"] = "scraped_video"
                        return r

                # 7. Cover image fallback (only for non-slideshows)
                if not page_data.get("_is_slideshow"):
                    cover_url = page_data.get("originCover") or page_data.get("cover") or ""
                    if cover_url:
                        r = await _dl_url(client, cover_url, vid_id, tmpdir, "jpg", referer="https://www.tiktok.com/")
                        if r["status"] == "downloaded":
                            r["file_type"] = "image"
                            r["reason"] = "cover_fallback"
                            return r

            # 8. oembed thumbnail
            r = await dl_oembed(client, video_url, vid_id, tmpdir)
            if r["status"] == "downloaded":
                r["reason"] = "oembed_thumbnail"
                return r

        # 9. placeholder
        err_summary = "_".join(errors[-3:]) if errors else "unknown"
        return {**await dl_placeholder(client, category, tmpdir), "reason": f"all_failed_{err_summary}"}


# ── Helpers ─────────────────────────────────────────────────────────


async def _dl_url(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str, ext: str, referer: str = "") -> dict:
    """Download a URL to a file."""
    try:
        headers = {"Referer": referer} if referer else {}
        r = await client.get(url, headers=headers, timeout=30)
        if r.status_code == 200 and len(r.content) > 1024:
            fp = os.path.join(tmpdir, f"tiktok_{vid_id}.{ext}")
            with open(fp, "wb") as f:
                f.write(r.content)
            return {"file_path": fp, "status": "downloaded", "tmpdir": tmpdir}
    except Exception:
        pass
    return {"file_path": None, "status": "failed", "tmpdir": tmpdir}
