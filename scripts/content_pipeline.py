#!/usr/bin/env python3
"""
🚀 FULL CONTENT PIPELINE — Download → Edit → Publish
=====================================================
End-to-end automation for TikTok video → multi-platform publishing.

Flow:
  1. DOWNLOAD: yt-dlp from TikTok profiles
  2. PROCESS: Add captions, CTA, hashtags via ffmpeg
  3. ADAPT: Create platform-specific variants (9:16 → 16:9, 4:5)
  4. PUBLISH: Distribute to X, FB, IG, TT

Usage:
  python3 content_pipeline.py --profile hijrahyuk0010
  python3 content_pipeline.py --profile hijrahyuk0010 --products products.json
  python3 content_pipeline.py --download-dir input/ --skip-download
  python3 content_pipeline.py --watch  # Auto-process new downloads
"""

import json, os, sys, subprocess, time, random, shutil
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent.parent
WORKSPACE = Path.home() / ".openclaw/workspace"
TEMP_DIR = BASE / "data/temp"
DOWNLOAD_DIR = BASE / "data/downloads"
PROCESSED_DIR = BASE / "data" / "processed"
LOG_DIR = BASE / "logs"

for d in [TEMP_DIR, DOWNLOAD_DIR, PROCESSED_DIR, LOG_DIR]:
    os.makedirs(d, exist_ok=True)

# ═══════════════════════════════════════
# STEP 1: DOWNLOAD
# ═══════════════════════════════════════
def download_tiktok(profile, max_videos=20, cookies_file=None):
    """
    Download TikTok videos using yt-dlp.
    
    Args:
        profile: TikTok username or URL
        max_videos: Max videos to download
        cookies_file: Path to cookies.txt for auth
    """
    output_dir = DOWNLOAD_DIR / f"tiktok_{profile}_{datetime.now().strftime('%Y%m%d')}"
    os.makedirs(output_dir, exist_ok=True)

    url = f"https://www.tiktok.com/@{profile}" if not profile.startswith("http") else profile
    profile_name = profile.replace("https://www.tiktok.com/@", "").rstrip("/")
    
    print(f"📥 DOWNLOADING: @{profile_name}")
    print(f"   Output: {output_dir}")
    print(f"   Max: {max_videos} videos")

    cmd = [
        "yt-dlp",
        "--no-playlist",
        f"--max-downloads={max_videos}",
        "-o", f"{output_dir}/%(upload_date)s_%(title).80s_%(id)s.%(ext)s",
        "-f", "bv*+ba/b",
        "--merge-output-format", "mp4",
        "--no-warnings",
    ]

    # Add cookies if available
    if cookies_file:
        cmd.extend(["--cookies", cookies_file])
    else:
        # Try browser cookies
        for browser in ["vivaldi", "chrome", "chromium"]:
            try:
                test = subprocess.run(
                    ["yt-dlp", "--cookies-from-browser", browser, "--dry-run", url],
                    capture_output=True, timeout=10
                )
                if b"cookies" not in test.stderr.lower() or b"error" not in test.stderr.lower():
                    cmd.extend(["--cookies-from-browser", browser])
                    break
            except:
                continue

    cmd.append(url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        # Count downloads
        videos = list(output_dir.glob("*.mp4")) + list(output_dir.glob("*.mkv"))
        print(f"   ✅ Downloaded: {len(videos)} videos")
        
        if result.stderr:
            # Filter common warnings
            lines = [l for l in result.stderr.splitlines() 
                    if "WARNING" not in l and "ERROR" not in l]
            if len(lines) > 0 and len(lines) < 20:
                for l in lines[-5:]:
                    print(f"   {l}")
        
        return str(output_dir), len(videos)
    except subprocess.TimeoutExpired:
        print(f"   ❌ Download timeout")
        return str(output_dir), 0
    except Exception as e:
        print(f"   ❌ Download error: {e}")
        return str(output_dir), 0


# ═══════════════════════════════════════
# STEP 2: PROCESS
# ═══════════════════════════════════════
def process_videos(input_dir, product_db=None, template="viral_ecommerce"):
    """
    Process downloaded videos with text overlays.
    Calls video_processor.py batch mode.
    """
    batch_id = datetime.now().strftime("%Y%m%d_%H%M")
    output_dir = PROCESSED_DIR / f"batch_{batch_id}"
    
    print(f"\n🎬 PROCESSING: {input_dir}")
    print(f"   Template: {template}")
    print(f"   Output: {output_dir}")
    
    cmd = [
        sys.executable,
        str(BASE / "scripts/video_processor.py"),
        "-i", str(input_dir),
        "-o", str(output_dir),
        "-t", template,
        "--batch",
    ]
    
    if product_db and Path(product_db).exists():
        cmd.extend(["--db", str(product_db)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        print(result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout)
        
        if result.returncode != 0:
            print(result.stderr[-500:])
        
        # Count processed files
        processed = list(output_dir.glob("*.mp4")) if output_dir.exists() else []
        return str(output_dir), len(processed)
    except Exception as e:
        print(f"❌ Processing error: {e}")
        return str(output_dir), 0


# ═══════════════════════════════════════
# STEP 3: PUBLISH
# ═══════════════════════════════════════
def publish_videos(video_dir, platforms=None, limit=None):
    """
    Publish processed videos to all platforms.
    Calls publish_orchestrator.py.
    """
    if platforms is None:
        platforms = ["x_twitter", "facebook"]
    
    print(f"\n📤 PUBLISHING: {video_dir}")
    print(f"   Platforms: {', '.join(platforms)}")
    
    cmd = [
        sys.executable,
        str(BASE / "scripts/publish_orchestrator.py"),
        "--dir", str(video_dir),
        "--platforms", *platforms,
    ]
    
    if limit:
        cmd.extend(["--limit", str(limit)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        print(result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout)
        return True
    except Exception as e:
        print(f"❌ Publish error: {e}")
        return False


# ═══════════════════════════════════════
# FULL PIPELINE
# ═══════════════════════════════════════
def run_pipeline(tiktok_profile, product_db=None, max_videos=20, 
                 template="viral_ecommerce", platforms=None, publish=True):
    """
    Run the full pipeline end-to-end.
    
    1. Download TikTok videos
    2. Process with text overlays
    3. Adapt for platforms
    4. Publish
    """
    start_time = datetime.now()
    
    print("=" * 60)
    print("🚀 FULL CONTENT PIPELINE")
    print(f"   Profile: @{tiktok_profile}")
    print(f"   Template: {template}")
    print(f"   Max videos: {max_videos}")
    print(f"   Platforms: {platforms or ['x_twitter', 'facebook']}")
    print(f"   Start: {start_time.strftime('%H:%M:%S')}")
    print("=" * 60)
    
    # STEP 1: Download
    print("\n" + "─" * 40)
    print("📥 STEP 1/3: DOWNLOAD")
    print("─" * 40)
    download_dir, count = download_tiktok(tiktok_profile, max_videos)
    
    if count == 0:
        print("\n❌ No videos downloaded. Pipeline stopped.")
        return False
    
    # STEP 2: Process
    print("\n" + "─" * 40)
    print("🎬 STEP 2/3: PROCESS (add captions, CTA, hashtags)")
    print("─" * 40)
    processed_dir, processed_count = process_videos(download_dir, product_db, template)
    
    if processed_count == 0:
        print("\n❌ No videos processed. Pipeline stopped.")
        return False
    
    # STEP 3: Publish
    if publish and platforms:
        print("\n" + "─" * 40)
        print("📤 STEP 3/3: PUBLISH")
        print("─" * 40)
        publish_videos(processed_dir, platforms)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print(f"\n{'='*60}")
    print(f"✅ PIPELINE COMPLETE in {elapsed:.0f}s")
    print(f"   Downloaded: {count} videos")
    print(f"   Processed: {processed_count} videos")
    print(f"   Download dir: {download_dir}")
    print(f"   Processed dir: {processed_dir}")
    print(f"{'='*60}")
    
    return True


# ═══════════════════════════════════════
# BATCH PROCESSOR (for multiple profiles)
# ═══════════════════════════════════════
def batch_from_profiles(profiles_file, product_db=None, **kwargs):
    """
    Process videos from multiple TikTok profiles listed in a JSON file.
    
    profiles_file format:
    {
        "profiles": [
            {"username": "hijrahyuk0010", "niche": "kids_fashion"},
            {"username": "anothershop", "niche": "daster"},
        ]
    }
    """
    profiles = json.load(open(profiles_file))
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles", [])
    
    print(f"📋 BATCH MODE: {len(profiles)} profiles")
    
    results = []
    for p in profiles:
        username = p if isinstance(p, str) else p.get("username", p.get("profile", ""))
        niche = p.get("niche", "") if isinstance(p, dict) else ""
        
        print(f"\n{'─'*60}")
        print(f"🔹 @{username} ({niche})")
        print(f"{'─'*60}")
        
        success = run_pipeline(username, product_db, **kwargs)
        results.append({"profile": username, "success": success})
        time.sleep(random.uniform(10, 30))  # Rate limit between profiles
    
    print(f"\n📊 BATCH COMPLETE: {sum(1 for r in results if r['success'])}/{len(results)}")
    return results


# ═══════════════════════════════════════
# CLI
# ═══════════════════════════════════════
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="🚀 Full Content Pipeline")
    parser.add_argument("--profile", "-p", help="TikTok profile to download from")
    parser.add_argument("--products", help="Product database (JSON/CSV)")
    parser.add_argument("--max-videos", "-n", type=int, default=20, help="Max videos to download")
    parser.add_argument("--template", "-t", default="viral_ecommerce", help="Processing template")
    parser.add_argument("--platforms", nargs="+", 
                       default=["x_twitter", "facebook"],
                       help="Target platforms for publishing")
    parser.add_argument("--no-publish", action="store_true", help="Skip publishing")
    parser.add_argument("--download-only", action="store_true", help="Only download, don't process")
    parser.add_argument("--process-only", help="Process existing directory")
    parser.add_argument("--publish-only", help="Publish existing processed directory")
    parser.add_argument("--batch", help="Batch process from profiles JSON file")
    parser.add_argument("--watch", type=int, metavar="MINUTES",
                       help="Watch for new downloads and auto-process")

    args = parser.parse_args()
    
    if args.batch:
        batch_from_profiles(
            args.batch, args.products,
            max_videos=args.max_videos,
            template=args.template,
            platforms=args.platforms,
            publish=not args.no_publish,
        )
    
    elif args.publish_only:
        publish_videos(args.publish_only, args.platforms)
    
    elif args.process_only:
        process_videos(args.process_only, args.products, args.template)
    
    elif args.download_only and args.profile:
        download_tiktok(args.profile, args.max_videos)
    
    elif args.profile:
        run_pipeline(
            args.profile, args.products,
            max_videos=args.max_videos,
            template=args.template,
            platforms=args.platforms,
            publish=not args.no_publish,
        )
    
    elif args.watch:
        print(f"👀 Watching for new downloads every {args.watch} minutes...")
        processed = set()
        while True:
            for d in DOWNLOAD_DIR.iterdir():
                if d.is_dir() and d.name not in processed:
                    videos = list(d.glob("*.mp4"))
                    if videos:
                        print(f"\n🔔 New: {d.name} ({len(videos)} videos)")
                        process_videos(str(d), args.products, args.template)
                        processed.add(d.name)
            time.sleep(args.watch * 60)
    
    else:
        parser.print_help()
        print("\n🚀 Content Pipeline Ready!")
        print(f"   Download dir: {DOWNLOAD_DIR}")
        print(f"   Processed dir: {PROCESSED_DIR}")
        print(f"\nExample:")
        print(f"   python3 content_pipeline.py --profile hijrahyuk0010 --products products.json")
