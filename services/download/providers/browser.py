"""Download via CloakBrowser and Playwright (direct CDN capture)."""
from __future__ import annotations

import os

from loguru import logger

from ..cascade import TIKTOK_PROXY


async def dl_cloakbrowser(url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via CloakBrowser — anti-detect Chromium with proxy support."""
    try:
        import cloakbrowser
    except ImportError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_not_installed"}
    os.makedirs(tmpdir, exist_ok=True)
    proxy = TIKTOK_PROXY or None
    if proxy:
        logger.info(f"[cloakbrowser] Using proxy {proxy}")
    fp = os.path.join(tmpdir, f"tiktok_{vid_id}.mp4")
    debug_log = os.path.join(tmpdir, f"cloak_debug_{vid_id}.log")
    async def _log(msg: str) -> None:
        with open(debug_log, "a") as f:
            f.write(f"{msg}\n")
    await _log(f"=== CloakBrowser session for {url} ===")
    try:
        browser = await cloakbrowser.launch_async(
            headless=True, stealth_args=True, humanize=True, proxy=proxy,
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()

        # ── Response interception ────────────────────────────────────────
        video_urls: list[tuple[int, str, bytes]] = []
        async def _on_resp(resp):
            u = resp.url
            ct = (resp.headers.get("content-type") or "").lower()
            status = resp.status
            if status not in (200, 206):
                return
            # Direct video/audio MIME — accept all CDN domains
            if "video" not in ct and "audio" not in ct:
                return
            # Reject webapp static bundles — they're tutorial/boot MP4s, not user videos
            if "sf16-website-login" in u or "webapp/main" in u or "/webapp/" in u:
                return
            cl = int(resp.headers.get("content-length", "0"))
            if cl < 500_000:
                return  # real TikTok user videos are 500KB+; skip tutorial/boot placeholders
            # Prefer paths containing video CDN patterns
            if "video/" not in u and "video_id" not in u and "tos/" not in u:
                if "octet-stream" in ct:
                    return  # non-video octet-stream without video path signatures
            # Capture body IN-SESSION to avoid CDN token expiry
            try:
                body = await resp.body()
            except Exception:
                return
            video_urls.append((cl, u, body))
        page.on("response", _on_resp)

        # ── Cookie pre-warm: set initial cookies before video page ──────
        await _log("=== Pre-warm: TikTok homepage ===")
        prewarm_ok = False
        try:
            await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(2000)
            prewarm_ok = True
            await _log("Pre-warm OK")
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}"
            await _log(f"Pre-warm failed: {err_msg}")
            logger.warning(f"[cloakbrowser] Pre-warm failed: {err_msg}")
        # ── Navigation ──────────────────────────────────────────────────
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        except Exception as e:
            goto_err = f"{type(e).__name__}: {e}"
            await _log(f"Goto failed: {goto_err}")
            logger.warning(f"[cloakbrowser] Goto failed: {goto_err}")
            # Retry without pre-warm — pre-warm itself may have broken page state
            if not prewarm_ok:
                await _log("Skipping retry — pre-warm was already failing, likely systemic")
                await browser.close()
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"cloakbrowser_goto_{goto_err}"}
            await _log("Retrying goto (pre-warm was OK, may be transient)...")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e2:
                goto_err2 = f"{type(e2).__name__}: {e2}"
                await _log(f"Goto retry also failed: {goto_err2}")
                await browser.close()
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"cloakbrowser_goto_retry_{goto_err2}"}

        # ── Wait & poll for video element (SPA needs render time) ────────
        await page.wait_for_timeout(3000)
        video_url = ""
        for _ in range(8):
            video_url = await page.evaluate(
                "() => {"
                "  var s = document.querySelector('script[id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"]');"
                "  if (s) {"
                "    try {"
                "      var d = JSON.parse(s.textContent);"
                "      var vd = d?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.video;"
                "      if (vd?.playAddr) return vd.playAddr;"
                "      if (vd?.downloadAddr) return vd.downloadAddr;"
                "    } catch(e){}"
                "  }"
                "  var s2 = document.querySelector('script[id=\"__NEXT_DATA__\"]');"
                "  if (s2) {"
                "    try {"
                "      var d2 = JSON.parse(s2.textContent);"
                "      var vu = d2?.props?.pageProps?.videoData?.video?.urls?.[0];"
                "      if (vu) return vu;"
                "    } catch(e){}"
                "  }"
                "  var v = document.querySelector('video');"
                "  if (v) {"
                "    var vsrc = v.src || v.currentSrc || '';"
                "    if (vsrc && !vsrc.startsWith('blob:')) return vsrc;"
                "  }"
                "  return '';"
                "}"
            )
            # Reject webapp static URLs — tutorial/boot placeholders, not user videos
            if video_url and ("sf16-website-login" in video_url or "webapp/main" in video_url or "/webapp/" in video_url):
                video_url = ""
                break
            if video_url and not video_url.startswith("blob:"):
                break
            await page.wait_for_timeout(1500)
            video_url = ""
        # ── Diagnostics: dump rehydration data and page HTML ────────────
        await _log("=== Diagnostics ===")
        try:
            rehydrated = await page.evaluate(
                "() => {"
                "  var s = document.querySelector('script[id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"]');"
                "  if (!s) return '<missing>';"
                "  try { var d = JSON.parse(s.textContent); return JSON.stringify(Object.keys(d)); }"
                "  catch(e) { return '<parse_error>'; }"
                "}"
            )
            await _log(f"DATA_REHYDRATION keys: {rehydrated}")
            next_data = await page.evaluate(
                "() => {"
                "  var s = document.querySelector('script[id=\"__NEXT_DATA__\"]');"
                "  if (!s) return '<missing>';"
                "  return s.textContent.substring(0, 2000);"
                "}"
            )
            await _log(f"__NEXT_DATA__: {next_data[:500]}")
            video_tag = await page.evaluate(
                "() => { var v = document.querySelector('video'); return v ? 'src=' + (v.src||'') + ' currentSrc=' + (v.currentSrc||'') + ' readyState=' + v.readyState : '<no_video>'; }"
            )
            await _log(f"VIDEO TAG: {video_tag}")
        except Exception as e:
            await _log(f"Diagnostics error: {e}")

        # ── Fallback: check intercepted responses ──────────────────────
        if not video_url or video_url.startswith("blob:"):
            if video_urls:
                # Pick the intercepted response with the largest content-length
                video_urls.sort(key=lambda x: x[0], reverse=True)
                video_url = video_urls[0][1]
                await _log(f"FALLBACK (size-based): picked {video_url}")

        if not video_url or video_url.startswith("blob:"):
            # ── Mobile fallback ──────────────────────────────────────────
            mobile_url = url.replace("www.tiktok.com", "m.tiktok.com")
            try:
                logger.info(f"[cloakbrowser] Trying mobile version: {mobile_url}")
                page2 = await context.new_page()
                await page2.goto(mobile_url, wait_until="domcontentloaded", timeout=15000)
                await page2.wait_for_timeout(3000)
                video_url = await page2.evaluate(
                    "() => {"
                    "  var v = document.querySelector('video');"
                    "  if (v) {"
                    "    var vsrc = v.src || v.currentSrc || '';"
                    "    if (vsrc && !vsrc.startsWith('blob:')) return vsrc;"
                    "  }"
                    "  var l = document.querySelector('link[rel=\"preload\"][as=\"video\"]');"
                    "  if (l) { "
                    "    var lsrc = l.href || '';"
                    "    if (lsrc) return lsrc;"
                    "  }"
                    "  return '';"
                    "}"
                )
                if not video_url or video_url.startswith("blob:"):
                    if video_urls:
                        video_urls.sort(key=lambda x: x[0], reverse=True)
                        best = video_urls[0]
                        video_url = best[1]
                        captured_body = best[2]
                        await _log(f"MOBILE FALLBACK (size-based): {video_url} ({best[0]} bytes, body={len(captured_body)})")
                await page2.close()
            except Exception as e:
                logger.info(f"[cloakbrowser] Mobile fallback failed: {type(e).__name__}")

        if not video_url or video_url.startswith("blob:"):
            # Last resort: use in-session captured body even if we can't resolve a URL
            if video_urls:
                video_urls.sort(key=lambda x: x[0], reverse=True)
                best = video_urls[0]
                video_url = best[1]
                captured_body = best[2]
                await _log(f"LAST RESORT: using captured body for {video_url} ({best[0]} bytes, body={len(captured_body)})")

        if not video_url or video_url.startswith("blob:"):
            await browser.close()
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_no_video_url"}

        # ── Use captured body if available (avoids CDN token expiry) ─────
        if video_urls:
            body_to_use = None
            # Match by URL
            for cl, u, body in video_urls:
                if u == video_url and body:
                    body_to_use = body
                    break
            # Try the largest if no exact match
            if not body_to_use:
                video_urls.sort(key=lambda x: x[0], reverse=True)
                best = video_urls[0]
                body_to_use = best[2]
            if body_to_use and len(body_to_use) > 50000:
                with open(fp, "wb") as f:
                    f.write(body_to_use)
                await browser.close()
                if os.path.exists(fp) and os.path.getsize(fp) > 50000:
                    logger.info(f"[cloakbrowser] In-session capture OK: {os.path.getsize(fp)} bytes")
                    return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir, "debug_log": debug_log}
                else:
                    logger.warning(f"[cloakbrowser] Captured body too small: {len(body_to_use)}")

        # ── Fallback: re-download via page.request (CDN token may have expired) ──
        try:
            logger.info(f"[cloakbrowser] Re-downloading from: {video_url[:80]}")
            resp = await page.request.get(video_url, timeout=30000)
            if resp.ok:
                ct = (resp.headers.get("content-type") or "").lower()
                body = await resp.body()
                if "video" in ct and len(body) > 10000:
                    with open(fp, "wb") as f:
                        f.write(body)
                    await browser.close()
                    if os.path.exists(fp) and os.path.getsize(fp) > 10000:
                        logger.info(f"[cloakbrowser] Download OK: {os.path.getsize(fp)} bytes")
                        return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir, "debug_log": debug_log}
                logger.warning(f"[cloakbrowser] Bad response: {resp.status} ct={ct} size={len(body)}")
            else:
                logger.warning(f"[cloakbrowser] HTTP {resp.status}")
        except Exception as e:
            logger.warning(f"[cloakbrowser] Download error: {e}")
        await browser.close()
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "cloakbrowser_download_failed"}
    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"cloakbrowser_{type(e).__name__}"}


async def dl_playwright_direct(url: str, vid_id: str, tmpdir: str) -> dict:
    """Download TikTok video via direct Playwright — proven to capture real CDN video.

    Uses plain Playwright (not CloakBrowser) with stealth init script + broad video MIME
    detection, matching the deep RE approach that successfully captured 1.7 MB real CDN
    responses (where CloakBrowser only captured the 197 KB placeholder).
    """
    os.makedirs(tmpdir, exist_ok=True)
    fp = os.path.join(tmpdir, f"tiktok_{vid_id}.mp4")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "playwright_not_installed"}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--no-sandbox",
                    "--disable-web-security",
                    "--allow-running-insecure-content",
                ],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                locale="en-US",
            )

            # Stealth: hide Playwright automation markers
            await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                window.chrome = { runtime: {} };
            """)

            # Collect CDN video responses with size AND body (captured in browser to avoid token expiry)
            cdn_responses: list[tuple[int, str, bytes]] = []

            async def _on_response(resp):
                u = resp.url
                ct = resp.headers.get("content-type", "")
                is_video_mime = any(
                    marker in ct for marker in ["video/", "octet-stream", "dash+xml", "vnd.apple.mpegurl"]
                )
                if not is_video_mime:
                    return
                status = resp.status
                if status not in (200, 206):
                    return
                cl = int(resp.headers.get("content-length", "0"))
                if cl < 500_000:
                    return  # skip thumbnails / tiny static bundles — real TikTok videos are 500KB+
                # Reject webapp static files served as octet-stream
                if "sf16-website-login" in u or "webapp/main" in u or "/webapp/" in u:
                    return
                # Prefer paths containing video CDN patterns; reject octet-stream without them
                if "video/" not in u and "video_id" not in u and "tos/" not in u:
                    if "octet-stream" in ct:
                        return  # non-video octet-stream resources without video path patterns
                try:
                    body = await resp.body()
                except Exception:
                    return
                cdn_responses.append((cl, u, body))

            page = await context.new_page()
            page.on("response", _on_response)
            logger.info(f"[playwright-direct] Pre-warm on homepage")
            try:
                await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(3000)
            except Exception as e:
                logger.warning(f"[playwright-direct] Pre-warm failed: {type(e).__name__}: {e}")

            logger.info(f"[playwright-direct] Navigate to {url}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            except Exception as e:
                logger.warning(f"[playwright-direct] Goto failed: {type(e).__name__}: {e}")

            # Wait generously for CDN video chunks to arrive
            await page.wait_for_timeout(10000)
            # Pick largest CDN response as winner — body was captured in-session to avoid CDN token expiry
            body_bytes: bytes | None = None
            if cdn_responses:
                cdn_responses.sort(key=lambda x: x[0], reverse=True)
                cl_winner, winner_url, winner_body = cdn_responses[0]
                body_bytes = winner_body
                logger.info(f"[playwright-direct] CDN winner: {cl_winner} bytes from {winner_url[:100]}")

            await browser.close()

            if body_bytes is None or len(body_bytes) < 10000:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir,
                        "error": "playwright_direct_no_video_body"}

            with open(fp, "wb") as f:
                f.write(body_bytes)
            written = os.path.getsize(fp)
            logger.info(f"[playwright-direct] OK: {written} bytes -> {fp}")
            return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}

    except Exception as e:
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"playwright_direct_{type(e).__name__}: {e}"}