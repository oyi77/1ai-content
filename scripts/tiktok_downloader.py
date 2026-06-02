#!/usr/bin/env python3
"""TikTok Downloader via tikwm.com API — no auth needed, reliable"""
import requests, json, os, time, subprocess, re
from pathlib import Path
from datetime import datetime

OUTPUT_DIR = Path.home() / "projects/1ai-content/data/downloads"

def get_video_ids_tiktok(profile_url, cookies_file=None, max_ids=30):
    """Get video IDs from a TikTok profile using yt-dlp flat playlist"""
    cmd = [
        "yt-dlp", "--flat-playlist", "--dump-json",
        f"--max-downloads={max_ids}", "--skip-download",
        profile_url
    ]
    if cookies_file:
        cmd.insert(1, "--cookies")
        cmd.insert(2, str(cookies_file))
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        ids = []
        for line in result.stdout.strip().split('\n'):
            if line:
                try:
                    d = json.loads(line)
                    if d.get('id'):
                        ids.append((d['id'], d.get('title','')[:80]))
                except: pass
        return ids
    except subprocess.TimeoutExpired:
        print("⚠️ yt-dlp timeout, trying alternative...")
        return []

def get_video_ids_fast(profile_url, cookies_str="", max_ids=30):
    """Fast alternative: scrape video IDs from profile HTML"""
    import requests as req
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Cookie': cookies_str,
    }
    
    try:
        r = req.get(profile_url, headers=headers, timeout=15)
        ids = list(set(re.findall(r'/video/(\d+)', r.text)))[:max_ids]
        # We lose titles this way, but tikwm will provide them
        return [(vid, '') for vid in ids]
    except:
        return []

def download_via_tikwm(video_id, output_dir, title_hint=""):
    """Download a single TikTok video via tikwm.com API"""
    output_file = Path(output_dir) / f"{video_id}.mp4"
    if output_file.exists() and output_file.stat().st_size > 10000:
        return True, str(output_file), "already_exists"
    
    try:
        api_url = f"https://www.tikwm.com/api/?url=https://www.tiktok.com/@i/video/{video_id}"
        r = requests.get(api_url, timeout=15)
        
        if r.status_code != 200:
            return False, None, f"HTTP {r.status_code}"
        
        data = r.json()
        if data.get('code') != 0:
            return False, None, data.get('msg', 'API error')
        
        video_url = data['data'].get('hdplay', data['data'].get('play', ''))
        if not video_url:
            return False, None, "No video URL"
        
        # Download
        vr = requests.get(video_url, headers={'User-Agent': 'Mozilla/5.0'}, 
                         timeout=60, stream=True)
        if vr.status_code != 200:
            return False, None, f"Download HTTP {vr.status_code}"
        
        with open(output_file, 'wb') as f:
            for chunk in vr.iter_content(8192):
                f.write(chunk)
        
        size_mb = output_file.stat().st_size / (1024*1024)
        return True, str(output_file), f"{size_mb:.1f}MB"
    
    except Exception as e:
        return False, None, str(e)[:100]

def download_profile(profile_name, max_videos=20, cookies_file=None):
    """Download all videos from a TikTok profile"""
    profile_url = f"https://www.tiktok.com/@{profile_name}"
    output_dir = OUTPUT_DIR / f"tiktok_{profile_name}"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"📥 Downloading @{profile_name} (max {max_videos} videos)")
    
    # Try fast method first
    ids = get_video_ids_fast(profile_url)
    if not ids:
        print("   Trying yt-dlp fallback...")
        ids = get_video_ids_tiktok(profile_url, cookies_file, max_videos)
    
    if not ids:
        print("   ❌ No videos found")
        return output_dir, 0
    
    print(f"   Found {len(ids)} videos, downloading...")
    
    downloaded = 0
    for i, (vid, title) in enumerate(ids[:max_videos]):
        success, path, info = download_via_tikwm(vid, output_dir, title)
        if success:
            status = "✅" if info != "already_exists" else "📦"
            print(f"   [{i+1}/{min(len(ids), max_videos)}] {status} {vid}: {info}")
            downloaded += 1
        else:
            print(f"   [{i+1}/{min(len(ids), max_videos)}] ❌ {vid}: {info}")
        time.sleep(0.3)
    
    print(f"\n✅ Downloaded {downloaded} videos → {output_dir}")
    return output_dir, downloaded

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("profile", nargs="?", help="TikTok profile name")
    p.add_argument("-n", "--max", type=int, default=20, help="Max videos")
    p.add_argument("--cookies", help="Cookies file for yt-dlp")
    args = p.parse_args()
    
    if not args.profile:
        p.print_help()
        print("\nExample: python3 tiktok_downloader.py hijrahyuk0010 -n 30")
    else:
        download_profile(args.profile, args.max, args.cookies)
