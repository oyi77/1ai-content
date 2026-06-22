#!/usr/bin/env python3
"""
Hybrid Publisher — Unified publish service.

Routes to the right backend per platform:
- YouTube → YouTube Data API v3 (OAuth2)
- X/Twitter → Twitter API v2 (OAuth 1.0a)
- TikTok, Instagram, Facebook, LinkedIn, Threads → CloakBrowser CDP

User stores credentials per platform via /connect command.
"""

import os
import json
import time
from typing import Optional
from pathlib import Path

# Lazy imports to avoid circular dependencies
_youtube_uploader = None
_twitter_poster = None
_cloakbrowser = None


def _get_youtube():
    global _youtube_uploader
    if _youtube_uploader is None:
        from services.social.youtube_uploader import YouTubeUploader
        _youtube_uploader = YouTubeUploader()
    return _youtube_uploader


def _get_twitter():
    global _twitter_poster
    if _twitter_poster is None:
        from services.social.twitter_poster import TwitterPoster
        _twitter_poster = TwitterPoster()
    return _twitter_poster


def _get_cloakbrowser():
    global _cloakbrowser
    if _cloakbrowser is None:
        from services.cloakbrowser import CloakBrowserAdapter
        _cloakbrowser = CloakBrowserAdapter()
    return _cloakbrowser


# Platform → publish method mapping
PUBLISH_METHODS = {
    'youtube': 'api',       # YouTube Data API v3
    'x': 'api',             # Twitter API v2
    'twitter': 'api',       # alias
    'tiktok': 'cloakbrowser',
    'instagram': 'cloakbrowser',
    'facebook': 'cloakbrowser',
    'linkedin': 'cloakbrowser',
    'threads': 'cloakbrowser',
}

# Required credentials per API platform
API_CREDENTIALS = {
    'youtube': ['access_token'],
    'x': ['api_key', 'api_secret', 'access_token', 'access_token_secret'],
    'twitter': ['api_key', 'api_secret', 'access_token', 'access_token_secret'],
}


class HybridPublisher:
    """Unified publisher that routes to the right backend."""

    def publish(
        self,
        platform: str,
        media_path: str,
        title: str = '',
        description: str = '',
        caption: str = '',
        hashtags: list[str] = None,
        credentials: dict = None,
        profile_id: str = '',
        thumbnail_path: str = '',
        privacy_status: str = 'public',
    ) -> dict:
        """
        Publish content to a platform using the appropriate method.
        
        Args:
            platform: 'youtube', 'x', 'twitter', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads'
            media_path: Path to video/image file
            title: Video title (YouTube)
            description: Video description (YouTube)
            caption: Post caption (all platforms)
            hashtags: List of hashtags
            credentials: API credentials dict (for API platforms)
            profile_id: CloakBrowser profile ID (for browser platforms)
            thumbnail_path: Custom thumbnail (YouTube)
            privacy_status: YouTube privacy ('public', 'unlisted', 'private')
        """
        if not os.path.exists(media_path):
            return {'success': False, 'error': f'Media file not found: {media_path}'}

        hashtags = hashtags or []
        method = PUBLISH_METHODS.get(platform, 'cloakbrowser')

        # Build full caption with hashtags
        full_caption = caption or title or ''
        if hashtags:
            full_caption += '\n\n' + ' '.join(f'#{h}' for h in hashtags)

        if method == 'api':
            return self._publish_via_api(
                platform=platform,
                media_path=media_path,
                title=title,
                description=description or full_caption,
                caption=full_caption,
                credentials=credentials or {},
                thumbnail_path=thumbnail_path,
                privacy_status=privacy_status,
            )
        else:
            return self._publish_via_cloakbrowser(
                platform=platform,
                media_path=media_path,
                caption=full_caption,
                profile_id=profile_id,
            )

    def _publish_via_api(
        self,
        platform: str,
        media_path: str,
        title: str,
        description: str,
        caption: str,
        credentials: dict,
        thumbnail_path: str,
        privacy_status: str,
    ) -> dict:
        """Publish via platform API."""
        if not credentials:
            return {
                'success': False,
                'error': f'No API credentials for {platform}. Use /connect to add credentials.',
                'method': 'api',
            }

        try:
            if platform == 'youtube':
                return self._publish_youtube(
                    media_path, title, description, credentials,
                    thumbnail_path, privacy_status,
                )
            elif platform in ('x', 'twitter'):
                return self._publish_twitter(
                    media_path, caption, credentials,
                )
            else:
                return {
                    'success': False,
                    'error': f'API publishing not supported for {platform}',
                    'method': 'api',
                }
        except Exception as e:
            return {'success': False, 'error': str(e), 'method': 'api'}

    def _publish_youtube(
        self,
        media_path: str,
        title: str,
        description: str,
        credentials: dict,
        thumbnail_path: str,
        privacy_status: str,
    ) -> dict:
        """Publish to YouTube via Data API v3."""
        uploader = _get_youtube()
        access_token = credentials.get('access_token', '')

        if not access_token:
            return {'success': False, 'error': 'YouTube access_token required', 'method': 'api'}

        result = uploader.upload_video(
            video_path=media_path,
            title=title,
            description=description,
            tags=credentials.get('tags', []),
            privacy_status=privacy_status,
            thumbnail_path=thumbnail_path,
            access_token=access_token,
        )

        if result.get('success') and result.get('video_id'):
            result['video_url'] = f"https://youtube.com/watch?v={result['video_id']}"
            result['platform'] = 'youtube'
            result['method'] = 'api'

        return result

    def _publish_twitter(
        self,
        media_path: str,
        caption: str,
        credentials: dict,
    ) -> dict:
        """Publish to Twitter/X via API v2."""
        poster = _get_twitter()

        required = ['api_key', 'api_secret', 'access_token', 'access_token_secret']
        for key in required:
            if not credentials.get(key):
                return {'success': False, 'error': f'Twitter {key} required', 'method': 'api'}

        result = poster.post_tweet(
            text=caption[:280],  # Twitter character limit
            media_paths=[media_path] if media_path else None,
            access_token=credentials['access_token'],
            access_token_secret=credentials['access_token_secret'],
            api_key=credentials['api_key'],
            api_secret=credentials['api_secret'],
        )

        if result.get('success'):
            result['platform'] = 'x'
            result['method'] = 'api'

        return result

    def _publish_via_cloakbrowser(
        self,
        platform: str,
        media_path: str,
        caption: str,
        profile_id: str,
    ) -> dict:
        """Publish via CloakBrowser CDP."""
        if not profile_id:
            return {
                'success': False,
                'error': f'No CloakBrowser profile for {platform}. Use /connect to link a profile.',
                'method': 'cloakbrowser',
            }

        try:
            adapter = _get_cloakbrowser()
            result = adapter.post(
                profile_id=profile_id,
                media_path=media_path,
                caption=caption,
                platform=platform,
            )

            if isinstance(result, dict):
                result['platform'] = platform
                result['method'] = 'cloakbrowser'
                return result
            return {'success': True, 'platform': platform, 'method': 'cloakbrowser'}
        except Exception as e:
            return {'success': False, 'error': str(e), 'method': 'cloakbrowser'}

    def get_platform_method(self, platform: str) -> str:
        """Get the publish method for a platform."""
        return PUBLISH_METHODS.get(platform, 'cloakbrowser')

    def get_required_credentials(self, platform: str) -> list[str]:
        """Get required credential keys for a platform."""
        return API_CREDENTIALS.get(platform, [])

    def validate_credentials(self, platform: str, credentials: dict) -> dict:
        """Validate API credentials for a platform."""
        if platform == 'youtube':
            uploader = _get_youtube()
            valid = uploader.validate_token(credentials.get('access_token', ''))
            return {'valid': valid, 'platform': 'youtube', 'method': 'api'}

        elif platform in ('x', 'twitter'):
            poster = _get_twitter()
            valid = poster.validate_credentials(
                api_key=credentials.get('api_key', ''),
                api_secret=credentials.get('api_secret', ''),
                access_token=credentials.get('access_token', ''),
                access_token_secret=credentials.get('access_token_secret', ''),
            )
            return {'valid': valid, 'platform': 'x', 'method': 'api'}

        return {'valid': False, 'platform': platform, 'error': 'No API validation available'}
