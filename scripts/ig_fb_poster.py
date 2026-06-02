#!/usr/bin/env python3
"""
📷 IG POSTER via Facebook Graph API
====================================
Posts videos to Instagram business accounts linked to FB Pages.
No IG session needed — uses FB page tokens directly.

Supports: Reels, Feed video, Feed image, Stories
"""

import requests, json, time, sys, random
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent.parent
WORKSPACE = Path.home() / ".openclaw/workspace"
IG_ACCOUNTS_FILE = WORKSPACE / "data/ig_fb_linked.json"
LOG_FILE = BASE / "logs/ig_fb_poster.log"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def load_ig_accounts():
    if IG_ACCOUNTS_FILE.exists():
        return json.load(open(IG_ACCOUNTS_FILE))
    return {}

def post_ig_reel(ig_user_id, access_token, video_url, caption):
    """
    Post a Reel to Instagram via FB Graph API.
    
    Args:
        ig_user_id: Instagram Business Account ID (178414...)
        access_token: Facebook Page access token
        video_url: Public URL to video file (must be MP4, accessible by FB servers)
        caption: Post caption with hashtags
    
    Returns: (success, post_id or error)
    """
    # Step 1: Create media container
    r = requests.post(
        f'https://graph.facebook.com/v21.0/{ig_user_id}/media',
        params={
            'media_type': 'REELS',
            'video_url': video_url,
            'caption': caption,
            'access_token': access_token,
        },
        timeout=30
    )
    
    if r.status_code != 200:
        return False, f"Container failed: {r.text[:200]}"
    
    container_id = r.json().get('id')
    if not container_id:
        return False, f"No container ID: {r.text[:200]}"
    
    log(f"   📦 Container: {container_id} — waiting for processing...")
    
    # Step 2: Wait for video processing (poll status)
    for attempt in range(30):
        time.sleep(3)
        r = requests.get(
            f'https://graph.facebook.com/v21.0/{container_id}',
            params={
                'fields': 'status_code,status',
                'access_token': access_token,
            },
            timeout=10
        )
        
        if r.status_code != 200:
            continue
        
        status = r.json()
        code = status.get('status_code', '')
        
        if code == 'FINISHED':
            log(f"   ✅ Video processed")
            break
        elif code == 'ERROR':
            return False, f"Processing error: {r.text[:200]}"
        elif code == 'IN_PROGRESS' or code == 'PUBLISHED':
            continue
        else:
            log(f"   ⏳ Status: {code}")
    
    # Step 3: Publish
    r = requests.post(
        f'https://graph.facebook.com/v21.0/{ig_user_id}/media_publish',
        params={
            'creation_id': container_id,
            'access_token': access_token,
        },
        timeout=15
    )
    
    if r.status_code == 200:
        post_id = r.json().get('id', '?')
        return True, post_id
    else:
        return False, f"Publish failed: {r.text[:200]}"

def post_ig_feed(ig_user_id, access_token, media_url, caption, media_type='VIDEO'):
    """
    Post to Instagram Feed (video or image).
    
    media_url: Public URL to media file
    media_type: 'VIDEO' or 'IMAGE'
    """
    r = requests.post(
        f'https://graph.facebook.com/v21.0/{ig_user_id}/media',
        params={
            'media_type': media_type,
            'video_url' if media_type == 'VIDEO' else 'image_url': media_url,
            'caption': caption,
            'access_token': access_token,
        },
        timeout=30
    )
    
    if r.status_code != 200:
        return False, f"Upload failed: {r.text[:200]}"
    
    container_id = r.json().get('id')
    if not container_id:
        return False, f"No container: {r.text[:200]}"
    
    # Wait for processing
    if media_type == 'VIDEO':
        for _ in range(20):
            time.sleep(2)
            r = requests.get(
                f'https://graph.facebook.com/v21.0/{container_id}',
                params={'fields': 'status_code', 'access_token': access_token},
                timeout=10
            )
            if r.status_code == 200 and r.json().get('status_code') == 'FINISHED':
                break
    
    # Publish
    r = requests.post(
        f'https://graph.facebook.com/v21.0/{ig_user_id}/media_publish',
        params={'creation_id': container_id, 'access_token': access_token},
        timeout=15
    )
    
    if r.status_code == 200:
        return True, r.json().get('id', '?')
    return False, f"Publish failed: {r.text[:200]}"

# ═══════════════════════════════════════
# Bulk posting
# ═══════════════════════════════════════
def post_to_all_ig(video_url, caption, account_filter=None):
    """Post to all linked IG accounts"""
    accounts = load_ig_accounts()
    
    if account_filter:
        accounts = {k: v for k, v in accounts.items() 
                   if account_filter.lower() in v['ig_username'].lower()}
    
    log(f"📷 Posting to {len(accounts)} IG accounts...")
    
    results = []
    for page_id, acc in accounts.items():
        log(f"   📷 @{acc['ig_username']} ({acc['ig_name']})")
        success, detail = post_ig_reel(acc['ig_id'], acc['token'], video_url, caption)
        
        short_detail = detail[:30] if detail else '?'
        log(f"      {'✅' if success else '❌'} {short_detail}")
        results.append({
            'ig_username': acc['ig_username'],
            'success': success,
            'detail': short_detail
        })
        time.sleep(random.uniform(5, 10))
    
    return results

# ═══════════════════════════════════════
# CLI
# ═══════════════════════════════════════
if __name__ == '__main__':
    accounts = load_ig_accounts()
    print(f"📷 IG via FB API — {len(accounts)} accounts ready")
    for pid, acc in accounts.items():
        print(f"   @{acc['ig_username']} ({acc['ig_name']}) — from {acc['page_name']}")
    
    if len(sys.argv) > 1:
        action = sys.argv[1]
        if action == '--post' and len(sys.argv) >= 4:
            video_url = sys.argv[2]
            caption = sys.argv[3]
            post_to_all_ig(video_url, caption)
