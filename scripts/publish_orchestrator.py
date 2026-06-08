#!/usr/bin/env python3
"""
📤 PUBLISH ORCHESTRATOR - Distribute processed videos to all platforms
==========================================================================
Reads publish queue from video_processor.py, publishes to:
  - X/Twitter (via GraphQL API)
  - Instagram (via PostBridge / session)
  - Facebook (via Graph API pages)
  - TikTok (via PostBridge)

Usage:
  python3 publish_orchestrator.py --queue output/batch_xxx/variants/
  python3 publish_orchestrator.py --queue queue.json --platforms x,fb,ig
  python3 publish_orchestrator.py --auto  # Watch queue dir for new files
"""

import json, os, sys, time, random, subprocess, requests
from pathlib import Path
from datetime import datetime, timedelta

BASE = Path(__file__).parent.parent
WORKSPACE = Path.home() / ".openclaw/workspace"
LOG_FILE = BASE / "logs/publish_orchestrator.log"

os.makedirs(BASE / "logs", exist_ok=True)

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

# ═══════════════════════════════════════
# CAPTION GENERATOR
# ═══════════════════════════════════════
CAPTIONS_BY_PLATFORM = {
    "x_twitter": [
        "Baru nemu ini! Auto checkout 🛒🔥\n{link}\n\n#fashionwanita #affiliateshopee",
        "Gila sih kualitasnya! Recommended banget ✨\n{link}\n\n#viral #produkindonesia",
        "Wajib punya! Udah ribuan yang checkout ⚡\n{link}\n\n#rekomendasi #fyp",
    ],
    "instagram": [
        "🔥 {product}\n💰 Rp{price}\n\nBahan premium, nyaman dipakai! ORDER sekarang sebelum kehabisan 👇\n\n🔗 LINK DI BIO!\n\n#fashion #ootd #affiliateshopee #viral #produkindonesia",
    ],
    "facebook": [
        "Bismillah, share rekomendasi produk buat kalian: {product}. Worth it! {link} 🙏\n\n#Rekomendasi #WajibCoba #Viral",
    ],
    "tiktok": [
        "{product} - Cuma Rp{price} aja! Kualitas premium! #fyp #viral #promo",
    ],
}

# ═══════════════════════════════════════
# AFFILIATE LINK POOL
# ═══════════════════════════════════════
AFFILIATE_LINKS = [
    'https://s.shopee.co.id/4qCZdjydEv',
    'https://s.shopee.co.id/50Vzq2xzty',
    'https://s.shopee.co.id/4LGJ2p0XFu',
    'https://s.shopee.co.id/1BJHH0CagN',
    'https://s.shopee.co.id/20sOGX9Pzc',
    'https://s.shopee.co.id/8zJ2RCfo4Y',
    'https://s.shopee.co.id/3L5JtoCnRC',
    'https://s.shopee.co.id/AUqbt3ABRA',
]

def gen_caption(platform, product_info=None, link=None):
    """Generate platform-appropriate caption"""
    pi = product_info or {}
    name = pi.get("name", pi.get("Nama Produk", "Produk Fashion"))
    price = pi.get("price", pi.get("Harga", "49.000"))
    # Use provided link or random from pool
    link = link or pi.get("link", pi.get("Link Komisi Ekstra", random.choice(AFFILIATE_LINKS)))

    templates = CAPTIONS_BY_PLATFORM.get(platform, CAPTIONS_BY_PLATFORM["x_twitter"])
    caption = random.choice(templates)

    return caption.format(product=name, price=price, link=link)

# ═══════════════════════════════════════
# X/TWITTER PUBLISHER
# ═══════════════════════════════════════
def publish_to_x(video_path, caption):
    """Publish to X using x_poster.py infrastructure"""
    x_poster = WORKSPACE / "scripts/x_poster.py"
    if not x_poster.exists():
        log("❌ X poster script not found")
        return False

    # Import and use the post_tweet function
    sys.path.insert(0, str(WORKSPACE / "scripts"))
    try:
        from x_poster import post_tweet, load_accounts, load_state, get_available_account

        accts = load_accounts()
        state = load_state()

        acct, err = get_available_account(accts, state)
        if not acct:
            log(f"⚠️ X: {err}")
            return False

        name = acct.get('name', '?')
        log(f"🐦 X: Posting via @{acct.get('username','?')} ({name})")

        # FIX: Path().exists() fails for URLs, so check both local files and HTTP URLs
        is_valid_media = Path(video_path).exists() or str(video_path).startswith('http')
        success, url, error = post_tweet(acct, caption, str(video_path) if is_valid_media else None)

        if success:
            log(f"   ✅ X: {url}")
        else:
            log(f"   ❌ X: {error}")

        return success
    except ImportError:
        log("❌ Cannot import x_poster")
        return False

# ═══════════════════════════════════════
# FACEBOOK PUBLISHER
# ═══════════════════════════════════════
def publish_to_facebook(video_path, caption):
    """Publish to Facebook pages via Graph API"""
    tokens_file = WORKSPACE / "data/fb_page_tokens.json"
    if not tokens_file.exists():
        log("⚠️ FB: No page tokens file")
        return False

    tokens = json.load(open(tokens_file))
    log(f"📘 FB: Posting to {len(tokens)} pages")

    import asyncio
    import httpx

    async def post_all():
        results = []
        async with httpx.AsyncClient(timeout=15) as client:
            for page_id, token_data in tokens.items():
                try:
                    # Token bisa string langsung atau dict dengan key 'token'/'access_token'
                    if isinstance(token_data, dict):
                        access_token = token_data.get('token') or token_data.get('access_token', '')
                    else:
                        access_token = token_data
                    if not access_token:
                        log(f"   ⚠️ FB: No token for page {page_id}")
                        continue
                    resp = await client.post(
                        f"https://graph.facebook.com/v21.0/{page_id}/feed",
                        params={"message": caption, "access_token": access_token}
                    )
                    if resp.status_code == 200:
                        results.append({"page": page_id, "success": True})
                    else:
                        results.append({"page": page_id, "success": False, "error": resp.text[:100]})
                except Exception as e:
                    results.append({"page": page_id, "success": False, "error": str(e)[:100]})
                await asyncio.sleep(random.uniform(1, 3))
        return results

    try:
        results = asyncio.run(post_all())
        succeeded = sum(1 for r in results if r["success"])
        log(f"   ✅ FB: {succeeded}/{len(tokens)} pages posted")
        return succeeded > 0
    except Exception as e:
        log(f"   ❌ FB: {e}")
        return False

# ═══════════════════════════════════════
# INSTAGRAM PUBLISHER (via PostBridge)
# ═══════════════════════════════════════
def publish_to_instagram(video_path, caption):
    """Publish to Instagram - try PostBridge first, fallback to session"""
    # TODO: Implement when PostBridge token refreshed or IG session recovered
    log(f"⚠️ IG: PostBridge token expired / IG session dead - SKIPPED")
    log(f"   📝 Caption ready: {caption[:80]}...")
    return False

# ═══════════════════════════════════════
# TIKTOK PUBLISHER (via PostBridge)
# ═══════════════════════════════════════
def publish_to_tiktok(video_path, caption):
    """Publish to TikTok via PostBridge"""
    # TODO: Implement when PostBridge token refreshed
    log(f"⚠️ TT: PostBridge token expired - SKIPPED")
    log(f"   📝 Caption ready: {caption[:80]}...")
    return False

# ═══════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════
PUBLISHERS = {
    "x_twitter": publish_to_x,
    "facebook": publish_to_facebook,
    "instagram": publish_to_instagram,
    "tiktok": publish_to_tiktok,
}

# Map common aliases/short names to canonical publisher keys.
PLATFORM_ALIASES = {
    "x": "x_twitter",
    "twitter": "x_twitter",
    "x/twitter": "x_twitter",
    "x_twitter": "x_twitter",
    "fb": "facebook",
    "facebook": "facebook",
    "ig": "instagram",
    "insta": "instagram",
    "instagram": "instagram",
    "tt": "tiktok",
    "tiktok": "tiktok",
}

def normalize_platforms(platforms):
    """Accept list or comma/space string of platform names/aliases.

    Returns a de-duplicated list of canonical publisher keys, preserving order.
    Unknown names are logged and dropped so one bad token never aborts a batch.
    """
    if platforms is None:
        return ["x_twitter", "facebook"]

    if isinstance(platforms, str):
        raw_tokens = platforms.replace(",", " ").split()
    else:
        raw_tokens = []
        for item in platforms:
            raw_tokens.extend(str(item).replace(",", " ").split())

    canonical = []
    for token in raw_tokens:
        key = PLATFORM_ALIASES.get(token.strip().lower())
        if key is None:
            log(f"   ⚠️ Unknown platform alias ignored: {token!r}")
            continue
        if key not in canonical:
            canonical.append(key)

    return canonical or ["x_twitter", "facebook"]

def publish_video(video_entry, platforms=None):
    """
    Publish a single video to target platforms.

    video_entry: dict with:
        - video: path to video file
        - platform: which platform variant this is
        - product: dict with name, price, link (optional)
    """
    platforms = normalize_platforms(platforms)

    video_path = video_entry.get("video", video_entry.get("output", ""))
    platform_hint = video_entry.get("platform", "")
    if platform_hint:
        platform_hint = PLATFORM_ALIASES.get(platform_hint.strip().lower(), platform_hint)

    if not Path(video_path).exists():
        log(f"❌ Video not found: {video_path}")
        return {"video": video_path, "results": []}

    # If this entry is a platform-specific variant, only publish to that platform
    if platform_hint and platform_hint in platforms:
        platforms = [platform_hint]

    log(f"\n📤 Publishing: {Path(video_path).name}")

    results = []
    for platform in platforms:
        publisher = PUBLISHERS.get(platform)
        if not publisher:
            log(f"   ⚠️ Unknown platform: {platform}")
            continue

        caption = gen_caption(platform, video_entry.get("product"))
        success = publisher(video_path, caption)
        results.append({"platform": platform, "success": success})

        # Rate-limit between platforms
        time.sleep(random.uniform(2, 5))

    return {"video": video_path, "results": results}


def publish_from_queue(queue_path, platforms=None, limit=None):
    """Process entire publish queue"""
    queue = json.load(open(queue_path))

    log(f"\n{'='*60}")
    log(f"📤 PUBLISH ORCHESTRATOR")
    log(f"   Queue: {queue_path} ({len(queue)} entries)")
    log(f"   Platforms: {platforms or 'all'}")
    log(f"{'='*60}")

    entries = queue[:limit] if limit else queue

    total = {"success": 0, "failed": 0, "skipped": 0}

    for i, entry in enumerate(entries):
        log(f"\n[{i+1}/{len(entries)}] {Path(entry.get('video','?')).name}")
        result = publish_video(entry, platforms)

        for r in result["results"]:
            if r["success"]:
                total["success"] += 1
            elif r["success"] is False:
                total["failed"] += 1
            else:
                total["skipped"] += 1

    log(f"\n{'='*60}")
    log(f"📊 PUBLISH COMPLETE")
    log(f"   ✅ Success: {total['success']}")
    log(f"   ❌ Failed: {total['failed']}")
    log(f"   ⚠️ Skipped: {total['skipped']}")
    log(f"{'='*60}")

    return total


def publish_from_directory(directory, platforms=None, limit=None):
    """Scan directory for processed videos and publish them"""
    dir_path = Path(directory)
    if not dir_path.exists():
        log(f"❌ Directory not found: {directory}")
        return

    # Find all video files
    video_exts = {".mp4", ".mov", ".avi", ".mkv"}
    videos = sorted([
        f for f in dir_path.iterdir()
        if f.suffix.lower() in video_exts
    ])

    if not videos:
        log(f"❌ No videos found in {directory}")
        return

    log(f"🎬 Found {len(videos)} videos in {directory}")

    # Derive platform from filename
    queue = []
    for v in videos:
        platform = "tiktok"
        for p in ["x_twitter", "instagram", "facebook", "tiktok"]:
            if p in v.name:
                platform = p
                break

        queue.append({
            "video": str(v),
            "platform": platform,
        })

    return publish_from_queue_virtual(queue, platforms, limit)


def publish_from_queue_virtual(queue, platforms=None, limit=None):
    """Publish from in-memory queue"""
    entries = queue[:limit] if limit else queue
    total = {"success": 0, "failed": 0, "skipped": 0}

    for i, entry in enumerate(entries):
        log(f"[{i+1}/{len(entries)}] {Path(entry.get('video','?')).name}")
        result = publish_video(entry, platforms)

        for r in result.get("results", []):
            if r.get("success") is True:
                total["success"] += 1
            elif r.get("success") is False:
                total["failed"] += 1
            else:
                total["skipped"] += 1

    log(f"📊 Done: {total['success']}✅ {total['failed']}❌ {total['skipped']}⚠️")
    return total


# ═══════════════════════════════════════
# CLI
# ═══════════════════════════════════════
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="📤 Publish Orchestrator")
    parser.add_argument("--queue", "-q", help="Publish queue JSON file")
    parser.add_argument("--dir", "-d", help="Directory with processed videos")
    parser.add_argument("--video", "-v", help="Single video file to publish")
    parser.add_argument("--product", help="Product name")
    parser.add_argument("--price", help="Product price")
    parser.add_argument("--platforms", "-p", nargs="+",
                       default=["x_twitter", "facebook"],
                       help="Target platforms")
    parser.add_argument("--limit", type=int, help="Max videos to publish")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be published")

    args = parser.parse_args()

    if args.dry_run:
        print("🔍 DRY RUN MODE - no actual publishing")

    if args.video:
        # Single video
        entry = {
            "video": args.video,
            "product": {"name": args.product or "Produk", "price": args.price or "49000"},
        }
        if not args.dry_run:
            publish_video(entry, args.platforms)
        else:
            for p in args.platforms:
                caption = gen_caption(p, entry["product"])
                print(f"  [{p}] {args.video}")
                print(f"  {caption[:100]}...")

    elif args.queue:
        if not args.dry_run:
            publish_from_queue(args.queue, args.platforms, args.limit)

    elif args.dir:
        if not args.dry_run:
            publish_from_directory(args.dir, args.platforms, args.limit)

    else:
        parser.print_help()
        print("\n📤 Publish Orchestrator ready!")
        print(f"   Platforms: {', '.join(PUBLISHERS.keys())}")
        print(f"   X/Twitter: ✅ | Facebook: ✅ | IG: ⚠️ | TikTok: ⚠️")
