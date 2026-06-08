#!/usr/bin/env python3
"""
📷 IG POSTER via Facebook Graph API
====================================
Posts videos to Instagram business accounts linked to FB Pages.
No IG session needed — uses FB page tokens directly.

Supports: Reels, Feed video, Feed image, Stories
"""

import requests, json, time, sys, random, hashlib
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

# ═══════════════════════════════════════
# AFFILIATE LINK MANAGEMENT
# ═══════════════════════════════════════
AFFILIATE_POOLS = {
    'shopee': [
        'https://s.shopee.co.id/4qCZdjydEv',
        'https://s.shopee.co.id/50Vzq2xzty',
        'https://s.shopee.co.id/4LGJ2p0XFu',
        'https://s.shopee.co.id/1BJHH0CagN',
        'https://s.shopee.co.id/20sOGX9Pzc',
        'https://s.shopee.co.id/8zJ2RCfo4Y',
        'https://s.shopee.co.id/3L5JtoCnRC',
        'https://s.shopee.co.id/AUqbt3ABRA',
    ],
    'tokopedia': [
        'https://tokopedia.link/abc1',
        'https://tokopedia.link/abc2',
        'https://tokopedia.link/abc3',
    ],
}

def get_unique_affiliate_link(account_id, page_id):
    """
    Get deterministic unique affiliate link per account.
    Same account always gets same link rotation (deterministic).
    
    Args:
        account_id: IG account ID or username
        page_id: Facebook page ID for additional entropy
    
    Returns: affiliate link URL
    """
    # Seed hash based on account + time-of-day (changes hourly)
    seed = f"{account_id}_{page_id}_{int(time.time() // 3600)}"
    hash_val = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    
    # Rotate through affiliate pools
    pool = AFFILIATE_POOLS.get('shopee', AFFILIATE_POOLS['tokopedia'])
    return pool[hash_val % len(pool)]

def inject_affiliate_link(caption, account_id, page_id):
    """
    Inject unique affiliate link into caption.
    
    Args:
        caption: Original caption text
        account_id: IG account ID
        page_id: FB page ID
    
    Returns: caption with affiliate link appended
    """
    link = get_unique_affiliate_link(account_id, page_id)
    # Append link before hashtags if possible, else at end
    if '#' in caption:
        parts = caption.rsplit('#', 1)
        return f"{parts[0]}Link: {link} #{parts[1]}"
    return f"{caption}\n\nLink: {link}"

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
    # FIX: Use dict unpacking instead of ternary as dict key
    # (ternary in dict key position evaluates to True/False, breaking the params)
    media_params = (
        {'video_url': media_url} if media_type == 'VIDEO'
        else {'image_url': media_url}
    )
    
    r = requests.post(
        f'https://graph.facebook.com/v21.0/{ig_user_id}/media',
        params={
            'media_type': media_type,
            **media_params,
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
    """Post to all linked IG accounts with unique affiliate links"""
    accounts = load_ig_accounts()
    
    if account_filter:
        accounts = {k: v for k, v in accounts.items() 
                   if account_filter.lower() in v['ig_username'].lower()}
    
    log(f"📷 Posting to {len(accounts)} IG accounts...")
    
    results = []
    for page_id, acc in accounts.items():
        log(f"   📷 @{acc['ig_username']} ({acc['ig_name']})")
        # Inject unique affiliate link per account
        caption_with_link = inject_affiliate_link(caption, acc['ig_id'], page_id)
        success, detail = post_ig_reel(acc['ig_id'], acc['token'], video_url, caption_with_link)
        
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
