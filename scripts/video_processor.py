#!/usr/bin/env python3
"""
🎬 VIDEO PROCESSOR — Auto-edit TikTok videos with caption, CTA, hashtag overlay
=================================================================================
Uses ffmpeg drawtext for fast, reliable text overlays.
No GPU needed. Batch processing ready.

Features:
  - Hook text (top, animated-style)
  - Product name + price (bottom-left)
  - CTA clickbait (bottom-center, pulsing)
  - Hashtag watermark (bottom-right)
  - Platform-specific output (X=16:9 crop, IG=4:5, TT=9:16)
  - Auto font detection & fallback

Usage:
  python3 video_processor.py --input video.mp4 --product "Daster Rayon" --price 49000
  python3 video_processor.py --batch input_dir/ --db products.json
  python3 video_processor.py --input video.mp4 --template viral_ecommerce
"""

import subprocess, json, os, sys, random, re
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent.parent
OUTPUT_DIR = BASE / "output"
LOG_DIR = BASE / "logs"
TEMP_DIR = BASE / "data/temp"
FONT_DIR = BASE / "data/fonts"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(FONT_DIR, exist_ok=True)

# ═══════════════════════════════════════
# FONT DETECTION
# ═══════════════════════════════════════
def find_font():
    """Find best available font for text overlays"""
    # Check bundled fonts first
    bundled = FONT_DIR / "Montserrat-Bold.ttf"
    if bundled.exists():
        return str(bundled)

    # System fonts
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for f in candidates:
        if Path(f).exists():
            return f

    # Last resort: any available TTF
    try:
        result = subprocess.run(["fc-list", ":lang=en", "file"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if ".ttf" in line:
                return line.split(":")[0].strip()
    except:
        pass

    print("⚠️  No fonts found! Installing DejaVu...")
    os.system("sudo apt-get install -y fonts-dejavu-core 2>/dev/null")
    return "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

FONT_PATH = find_font()
FONT_BOLD = FONT_PATH
FONT_REGULAR = FONT_PATH.replace("Bold", "").replace("bold", "")
if not Path(FONT_REGULAR).exists():
    FONT_REGULAR = FONT_PATH

# ═══════════════════════════════════════
# TEXT TEMPLATES
# ═══════════════════════════════════════
HOOK_TEMPLATES = [
    "STOK TERBATAS! 🔥",
    "Viral Banget! 😍",
    "Wajib Punya! ✨",
    "AUTO CANTIK 💅",
    "Gak Nyangka! 🤯",
    "BEST SELLER 🏆",
    "PROMO HARI INI ⚡",
    "Cuma 49RB! 🛍️",
    "DIBAWAH 50RB 😱",
    "KUALITAS PREMIUM 💎",
    "RATING 4.9 ⭐⭐⭐⭐⭐",
    "SUDAH 10RB+ TERJUAL 🔥",
    "YANG TELAT GIGIT JARI 😭",
    "MURAH TAPI GAK MURAHAN 💯",
]

CTA_TEMPLATES = [
    "👇 ORDER DI LINK BIO!",
    "🛒 LINK DI BIO YA!",
    "💬 KOMEN 'MAU' BUAT LINK!",
    "🔗 CHECKOUT SEKARANG!",
    "⚡ ORDER SEBELUM KEHABISAN!",
    "🛍️ KLIK LINK DI BIO!",
    "🔥 BURUAN SEBELUM HABIS!",
]

# ═══════════════════════════════════════
# CORE: FFMPEG TEXT OVERLAY
# ═══════════════════════════════════════
def get_video_info(video_path):
    """Get video dimensions, duration, etc."""
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration",
        "-of", "csv=p=0", str(video_path)
    ], capture_output=True, text=True)

    parts = probe.stdout.strip().split(",")
    if len(parts) >= 2:
        return {
            "width": int(parts[0]),
            "height": int(parts[1]),
            "duration": float(parts[2]) if len(parts) > 2 else 0,
        }
    return {"width": 1080, "height": 1920, "duration": 0}

def build_drawtext(text, x, y, font_size=48, font_color="white", 
                    border_color="black", border_width=3, alpha=1.0,
                    enable=None, box=False, box_color="black@0.5"):
    """Build ffmpeg drawtext filter string"""
    # Escape special characters for ffmpeg
    text = text.replace("'", "'\\''")
    text = text.replace(":", "\\:")
    text = text.replace(",", "\\,")

    font_file = FONT_BOLD
    parts = [
        f"text='{text}'",
        f"fontfile='{font_file}'",
        f"fontsize={font_size}",
        f"fontcolor={font_color}",
        f"x={x}",
        f"y={y}",
        f"bordercolor={border_color}",
        f"borderw={str(border_width)}",
    ]

    if box:
        parts.append(f"box=1")
        parts.append(f"boxcolor={box_color}")
        parts.append(f"boxborderw=10")

    if enable:
        parts.append(f"enable='{enable}'")

    return "drawtext=" + ":".join(parts)

def process_video(
    input_path, output_path,
    hook_text=None, product_name=None, price=None,
    cta_text=None, hashtags=None,
    font_scale=1.0, platform="tiktok"
):
    """
    Process a single video with text overlays.
    
    Layout (9:16 vertical):
    ┌─────────────────┐
    │   HOOK (top)     │
    │                  │
    │   [VIDEO]        │
    │                  │
    │ PRODUCT + PRICE  │
    │ CTA (bottom)     │
    │ #hashtags        │
    └─────────────────┘
    """
    info = get_video_info(input_path)
    w, h = info["width"], info["height"]

    # Scale font based on video width
    base_font = int(w * 0.06 * font_scale)
    small_font = int(base_font * 0.7)
    big_font = int(base_font * 1.3)
    tiny_font = int(base_font * 0.55)

    # Position calculations (relative to 9:16)
    margin = int(w * 0.04)
    hook_y = int(h * 0.06)
    product_y = int(h * 0.78)
    cta_y = int(h * 0.85)
    hashtag_y = int(h * 0.92)

    filters = []

    # 1. HOOK TEXT (top, big, eye-catching)
    if hook_text:
        # Centered hook with background box
        f = build_drawtext(
            hook_text,
            x=f"(w-text_w)/2",
            y=f"{hook_y}",
            font_size=big_font,
            font_color="white",
            border_color="black@0.8",
            border_width=4,
            box=True,
            box_color="black@0.4"
        )
        filters.append(f)

    # 2. PRODUCT NAME + PRICE (bottom-left)
    if product_name:
        price_str = f" — Rp{int(price):,}" if price else ""
        f = build_drawtext(
            f"{product_name}{price_str}",
            x=str(margin),
            y=str(product_y),
            font_size=base_font,
            font_color="yellow",
            border_color="black@0.7",
            border_width=3,
            box=True,
            box_color="black@0.5"
        )
        filters.append(f)

    # 3. CTA CLICKBAIT (bottom-center, pulsing)
    if cta_text:
        # Pulsing effect: enable/disable every 1 second
        pulse = "lt(mod(t,2),1)"
        f = build_drawtext(
            cta_text,
            x="(w-text_w)/2",
            y=str(cta_y),
            font_size=base_font,
            font_color="red",
            border_color="white@0.8",
            border_width=3,
            enable=pulse,
            box=True,
            box_color="white@0.6"
        )
        filters.append(f)

    # 4. HASHTAGS (bottom, scrolling or static)
    if hashtags:
        if isinstance(hashtags, list):
            hashtags = " ".join(hashtags)
        f = build_drawtext(
            hashtags,
            x=margin,
            y=str(hashtag_y),
            font_size=tiny_font,
            font_color="white@0.8",
            border_color="black@0.5",
            border_width=2,
        )
        filters.append(f)

    if not filters:
        print("⚠️  No filters to apply, copying file...")
        subprocess.run(["cp", str(input_path), str(output_path)])
        return True

    # Build ffmpeg command
    filter_complex = ",".join(filters)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", filter_complex,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path)
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0 and Path(output_path).exists():
            size_mb = Path(output_path).stat().st_size / (1024 * 1024)
            print(f"✅ Processed: {Path(output_path).name} ({size_mb:.1f}MB)")
            return True
        else:
            print(f"❌ FFmpeg failed:\n{result.stderr[-500:]}")
            return False
    except subprocess.TimeoutExpired:
        print(f"❌ Timeout processing {input_path}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# ═══════════════════════════════════════
# TEMPLATES
# ═══════════════════════════════════════
TEMPLATES = {
    "viral_ecommerce": {
        "hook": True,
        "product": True,
        "price": True,
        "cta": True,
        "hashtags": True,
    },
    "minimal_promo": {
        "hook": False,
        "product": True,
        "price": True,
        "cta": True,
        "hashtags": False,
    },
    "clickbait_only": {
        "hook": True,
        "product": False,
        "price": False,
        "cta": True,
        "hashtags": True,
    },
    "brand_build": {
        "hook": False,
        "product": True,
        "price": False,
        "cta": False,
        "hashtags": True,
    },
}

def process_with_template(input_path, output_path, template_name, product_info=None):
    """Process video using a predefined template"""
    template = TEMPLATES.get(template_name, TEMPLATES["viral_ecommerce"])
    pi = product_info or {}

    hook = random.choice(HOOK_TEMPLATES) if template["hook"] else None
    product = pi.get("name") if template["product"] else None
    price = pi.get("price") if template["price"] else None
    cta = random.choice(CTA_TEMPLATES) if template["cta"] else None
    hashtags = "#fyp #viral #promo #rekomendasi #affiliateshopee" if template["hashtags"] else None

    return process_video(
        input_path, output_path,
        hook_text=hook,
        product_name=product,
        price=price,
        cta_text=cta,
        hashtags=hashtags,
    )

# ═══════════════════════════════════════
# BATCH PROCESSING
# ═══════════════════════════════════════
def process_batch(input_dir, output_dir, products_db=None, template="viral_ecommerce"):
    """Batch process all videos in a directory"""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    os.makedirs(output_path, exist_ok=True)

    # Load product DB
    products = []
    if products_db and Path(products_db).exists():
        if products_db.endswith(".json"):
            products = json.load(open(products_db))
        elif products_db.endswith(".csv"):
            import csv
            with open(products_db) as f:
                products = list(csv.DictReader(f))

    # Find all video files
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
    videos = [f for f in input_path.iterdir() if f.suffix.lower() in video_exts]
    
    if not videos:
        print(f"❌ No videos found in {input_dir}")
        return []

    print(f"🎬 Processing {len(videos)} videos with template '{template}'...")
    
    results = []
    for i, video in enumerate(videos):
        out_file = output_path / f"processed_{i:03d}_{video.name}"
        
        # Pick random product if DB available
        product_info = random.choice(products) if products else {}

        print(f"\n[{i+1}/{len(videos)}] {video.name}")
        success = process_with_template(video, out_file, template, product_info)
        results.append({
            "input": str(video),
            "output": str(out_file),
            "success": success
        })

    # Summary
    succeeded = sum(1 for r in results if r["success"])
    print(f"\n{'='*50}")
    print(f"📊 BATCH COMPLETE: {succeeded}/{len(videos)} videos processed")
    print(f"📁 Output: {output_dir}")
    return results

# ═══════════════════════════════════════
# PLATFORM VARIANTS
# ═══════════════════════════════════════
PLATFORM_CONFIGS = {
    "tiktok": {"aspect": "9:16", "size": "1080x1920", "max_duration": 180},
    "instagram_reel": {"aspect": "9:16", "size": "1080x1920", "max_duration": 90},
    "instagram_feed": {"aspect": "4:5", "size": "1080x1350", "max_duration": 60},
    "x_twitter": {"aspect": "16:9", "size": "1280x720", "max_duration": 140},
    "facebook_reel": {"aspect": "9:16", "size": "1080x1920", "max_duration": 90},
    "youtube_shorts": {"aspect": "9:16", "size": "1080x1920", "max_duration": 60},
}

def platform_adapt(input_path, output_path, platform):
    """Adapt video for specific platform (crop/resize/duration)"""
    config = PLATFORM_CONFIGS.get(platform)
    if not config:
        print(f"⚠️  Unknown platform: {platform}, skipping adaptation")
        subprocess.run(["cp", str(input_path), str(output_path)])
        return True

    w, h = map(int, config["size"].split("x"))
    max_dur = config["max_duration"]

    # Get video info
    info = get_video_info(input_path)
    
    # Build filter: crop center + scale + trim
    filters = []
    
    # Scale and crop to target aspect ratio
    target_ratio = w / h
    src_ratio = info["width"] / info["height"]
    
    if abs(src_ratio - target_ratio) > 0.01:
        if src_ratio > target_ratio:
            # Source is wider — crop width
            new_w = int(info["height"] * target_ratio)
            x_offset = (info["width"] - new_w) // 2
            filters.append(f"crop={new_w}:{info['height']}:{x_offset}:0")
    else:
        new_h = int(info["width"] / target_ratio)
        y_offset = (info["height"] - new_h) // 2
        filters.append(f"crop={info['width']}:{new_h}:0:{y_offset}")
    
    filters.append(f"scale={w}:{h}")
    
    filter_str = ",".join(filters) if filters else f"scale={w}:{h}"

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-t", str(max_dur),
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path)
    ]

    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=60)
        print(f"✅ Adapted for {platform}: {output_path}")
        return True
    except Exception as e:
        print(f"❌ Platform adaptation failed: {e}")
        return False

# ═══════════════════════════════════════
# FULL PIPELINE: Process → Adapt → Ready
# ═══════════════════════════════════════
def full_pipeline(input_dir, product_db, template="viral_ecommerce", 
                  platforms=None, publish_queue=None):
    """
    Full pipeline:
    1. Process all videos with text overlays
    2. Create platform variants
    3. Write to publish queue
    
    Returns: list of processed files ready for publishing
    """
    if platforms is None:
        platforms = ["tiktok", "instagram_reel", "facebook_reel"]

    processed_dir = OUTPUT_DIR / f"batch_{datetime.now().strftime('%Y%m%d_%H%M')}"
    variants_dir = processed_dir / "variants"
    os.makedirs(variants_dir, exist_ok=True)

    # Step 1: Process with overlays
    print("=" * 50)
    print("🎬 STEP 1: Processing videos with text overlays...")
    results = process_batch(input_dir, processed_dir, product_db, template)
    
    successful = [r for r in results if r["success"]]
    if not successful:
        print("❌ No videos processed successfully")
        return []

    # Step 2: Create platform variants
    print("\n" + "=" * 50)
    print(f"📱 STEP 2: Creating platform variants for {len(platforms)} platforms...")
    
    queue_entries = []
    for r in successful:
        for platform in platforms:
            variant_file = variants_dir / f"{platform}_{Path(r['output']).name}"
            if platform_adapt(r["output"], variant_file, platform):
                queue_entries.append({
                    "video": str(variant_file),
                    "platform": platform,
                    "source": r["input"],
                    "processed": True,
                    "timestamp": datetime.now().isoformat(),
                })
    
    # Step 3: Write publish queue
    if publish_queue:
        with open(publish_queue, "w") as f:
            json.dump(queue_entries, f, indent=2)
        print(f"\n📋 Publish queue: {publish_queue} ({len(queue_entries)} entries)")
    
    print(f"\n{'='*50}")
    print(f"✅ PIPELINE COMPLETE!")
    print(f"   Processed: {len(successful)} videos")
    print(f"   Variants: {len(queue_entries)} files across {len(platforms)} platforms")
    print(f"   Output: {processed_dir}")
    
    return queue_entries


# ═══════════════════════════════════════
# CLI
# ═══════════════════════════════════════
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="🎬 Video Processor — Auto-edit with captions")
    parser.add_argument("--input", "-i", help="Input video file or directory")
    parser.add_argument("--output", "-o", help="Output path")
    parser.add_argument("--product", help="Product name for overlay")
    parser.add_argument("--price", type=float, help="Product price")
    parser.add_argument("--hook", help="Hook text (or use random)")
    parser.add_argument("--cta", help="CTA text (or use random)")
    parser.add_argument("--hashtags", help="Hashtags (space-separated)")
    parser.add_argument("--template", "-t", default="viral_ecommerce",
                       choices=list(TEMPLATES.keys()),
                       help="Processing template")
    parser.add_argument("--batch", "-b", action="store_true", help="Batch process directory")
    parser.add_argument("--db", help="Product database (JSON/CSV)")
    parser.add_argument("--platforms", nargs="+", default=["tiktok", "instagram_reel", "facebook_reel"],
                       help="Target platforms")
    parser.add_argument("--pipeline", action="store_true", help="Run full pipeline")
    parser.add_argument("--queue", help="Publish queue output file")

    args = parser.parse_args()

    if not args.input:
        # Demo mode
        print("🎬 VIDEO PROCESSOR v1.0")
        print("=" * 50)
        print(f"Font: {FONT_PATH}")
        print(f"Templates: {', '.join(TEMPLATES.keys())}")
        print(f"Platforms: {', '.join(PLATFORM_CONFIGS.keys())}")
        print("\nUsage examples:")
        print("  python3 video_processor.py -i video.mp4 -t viral_ecommerce")
        print("  python3 video_processor.py -i input_dir/ -b --db products.json")
        print("  python3 video_processor.py -i input_dir/ --pipeline --queue queue.json")
        sys.exit(0)

    if args.pipeline:
        full_pipeline(args.input, args.db, args.template, args.platforms, args.queue)
    elif args.batch:
        process_batch(args.input, args.output or OUTPUT_DIR, args.db, args.template)
    else:
        # Single file
        output = args.output or OUTPUT_DIR / f"processed_{Path(args.input).name}"
        process_video(
            args.input, output,
            hook_text=args.hook or random.choice(HOOK_TEMPLATES),
            product_name=args.product,
            price=args.price,
            cta_text=args.cta or random.choice(CTA_TEMPLATES),
            hashtags=args.hashtags or "#fyp #viral #promo",
        )
