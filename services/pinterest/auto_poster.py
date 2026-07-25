#!/usr/bin/env python3
"""Auto-poster: scrape Pinterest → download → publish to HOMELIVING Facebook pages.

Usage:
    python services/pinterest/auto_poster.py              # default keyword
    python services/pinterest/auto_poster.py --keyword "lemari minimalis"
    python services/pinterest/auto_poster.py --keyword "dekorasi ruang tamu" --limit 10 --pages all
    python services/pinterest/auto_poster.py --keyword "rak dapur" --dry-run
    python services/pinterest/auto_poster.py --list-pages
"""

import argparse
import json
import os
import random
import sys
import dotenv
from pathlib import Path
dotenv.load_dotenv(Path(__file__).resolve().parent.parent.parent / "services" / ".env")

import httpx
if not os.getenv("PINTEREST_COOKIES"):
    print("WARNING: PINTEREST_COOKIES not set. Pinterest search will return empty results.")

SOCIAL_API_BASE = "http://localhost:8200/v1/distribution"
SOCIAL_DIR = Path.home() / "projects" / "1ai-social"
PINTEREST_CACHE = SOCIAL_DIR / "data" / "pinterest_cache"
FB_PAGES_PATH = SOCIAL_DIR / "data" / "fb_pages.json"

# Ensure pinterest_cache exists
PINTEREST_CACHE.mkdir(parents=True, exist_ok=True)


def load_homeliving_pages() -> list[dict]:
    """Load HOMELIVING pages with valid access tokens from fb_pages.json."""
    pages = json.loads(FB_PAGES_PATH.read_text())
    homeliving = [
        p
        for p in pages
        if p.get("category") == "HOMELIVING" and p.get("access_token")
    ]
    return homeliving


def list_pages(pages: list[dict]) -> None:
    print(f"  {'Page':30s} {'ID':20s} {'Fan Count':>10s}  Token (preview)")
    print(f"  {'-'*30} {'-'*20} {'-'*10}  {'-'*40}")
    for p in pages:
        tok = p.get("access_token", "")
        print(
            f"  {p['name']:30s} {p['id']:20s} {p.get('fan_count',0):>10d}  {tok[:35]}..."
        )
    print(f"\n  Total: {len(pages)} pages")


def download_image(scraper_py_path: str, image_url: str) -> str | None:
    """Download image using the PinterestScraper module.

    Because the scraper uses custom cookie-based auth, we import dynamically.
    """
    sys.path.insert(0, str(Path(scraper_py_path).parent.parent))  # services/
    from pinterest import PinterestScraper

    scraper = PinterestScraper()
    local_path = scraper.download_image(
        image_url=image_url, dest_dir=str(PINTEREST_CACHE)
    )
    return local_path


def post_to_facebook(
    page_id: str, page_token: str, file_path: str, message: str
) -> dict:
    """Post image to a Facebook page via 1ai-social distribution API."""
    payload = {
        "page_id": page_id,
        "page_token": page_token,
        "file_path": file_path,
        "message": message,
    }
    resp = httpx.post(
        f"{SOCIAL_API_BASE}/publish",
        json=payload,
        timeout=60.0,
    )
    if resp.status_code != 200:
        return {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    return resp.json()


def format_caption(pin_title: str, pin_domain: str, base_message: str) -> str:
    """Build caption with default Indonesian homeliving messaging."""
    parts = [base_message] if base_message else []
    if pin_title:
        parts.append(
            f"Inspirasi: {pin_title}"
        )
    parts.append(
        "Follow untuk tips家居 & dekorasi lainnya 🏠"
    )
    return "\n\n".join(parts)


def main():
    parser = argparse.ArgumentParser(
        description="Pinterest → Facebook auto-poster for HOMELIVING pages"
    )
    parser.add_argument("--keyword", default="dekorasi rumah minimalis")
    parser.add_argument("--limit", type=int, default=5, help="max pins to process")
    parser.add_argument("--pages", default="all", help="page IDs (comma) or 'all'")
    parser.add_argument("--dry-run", action="store_true", help="download only, no post")
    parser.add_argument("--list-pages", action="store_true", help="list pages then exit")
    parser.add_argument(
        "--message",
        default="Cari inspirasi dekorasi rumah terbaru? Lihat koleksi kami!",
        help="caption message",
    )
    args = parser.parse_args()

    # ── Load pages ──
    pages = load_homeliving_pages()
    if not pages:
        print("ERROR: No HOMELIVING pages found in fb_pages.json")
        sys.exit(1)

    if args.list_pages:
        list_pages(pages)
        sys.exit(0)

    # ── Scraper import ──
    scraper_path = Path(__file__).resolve()
    sys.path.insert(0, str(scraper_path.parent.parent))  # services/

    # lazy import so env is loaded before module-level PinterestScraper init
    try:
        from pinterest import PinterestScraper
    except Exception as e:
        print(f"ERROR importing PinterestScraper: {e}")
        print("HINT: Ensure services/.env has PINTEREST_COOKIES set")
        sys.exit(1)

    # ── Filter target pages ──
    target_pages = pages
    if args.pages != "all":
        page_ids = [pid.strip() for pid in args.pages.split(",")]
        target_pages = [p for p in pages if p["id"] in page_ids]
        missing = set(page_ids) - {p["id"] for p in pages}
        if missing:
            print(f"WARNING: Unknown page IDs: {missing}")

    print(f"Target: {len(target_pages)} page(s): {[p['name'] for p in target_pages]}")
    print(f"Keyword: {args.keyword}")
    print(f"Limit: {args.limit} pins")
    if args.dry_run:
        print("DRY RUN: images will be downloaded but NOT posted\n")

    # ── Scrape Pinterest ──
    scraper = PinterestScraper()
    print(f"\nSearching Pinterest for '{args.keyword}'...")
    results = scraper.search_pins(args.keyword, limit=args.limit * 2)

    if not results:
        print("No results found. Check keyword or Pinterest cookies.")
        sys.exit(1)

    # Filter to results with images
    valid = [r for r in results if r.get("image_url") or r.get("images_url")]
    if not valid:
        print("No results with downloadable images.")
        sys.exit(1)

    print(f"Found {len(valid)} pins with images\n")

    # ── Download and post ──
    random.shuffle(valid)
    success = 0
    fail = 0

    for idx, pin in enumerate(valid[: args.limit]):
        image_url = pin.get("image_url") or pin.get("images_url", [None])[0]
        if not image_url:
            continue

        title = pin.get("title", "") or pin.get("description", "") or ""

        print(f"[{idx+1}/{min(args.limit, len(valid))}] {image_url}")
        print(f"       Title: {title[:80]}")

        try:
            local_path = scraper.download_image(
                image_url=image_url, dest_dir=str(PINTEREST_CACHE)
            )
        except Exception as e:
            print(f"       DOWNLOAD FAILED: {e}")
            fail += 1
            continue

        if not local_path:
            print("       DOWNLOAD FAILED: no path returned")
            fail += 1
            continue

        print(f"       Saved: {local_path}")

        if args.dry_run:
            print("       DRY-RUN: skipped posting\n")
            success += 1
            continue

        # Post to each target page
        caption = format_caption(title, pin.get("domain", ""), args.message)

        for pg in target_pages:
            print(f"       → Posting to {pg['name']}...", end=" ")
            result = post_to_facebook(
                page_id=pg["id"],
                page_token=pg["access_token"],
                file_path=str(local_path),
                message=caption,
            )
            if result.get("error"):
                print(f"FAILED: {result['error'][:80]}")
                fail += 1
            else:
                print("OK")
                success += 1

        print()

    print(f"\n{'='*50}")
    print(f"Done: {success} successes, {fail} failures")
    print(f"Images cached in: {PINTEREST_CACHE}")


if __name__ == "__main__":
    main()
