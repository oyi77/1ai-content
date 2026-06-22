#!/usr/bin/env python3
"""
Twitter/X API v2 Poster — OAuth 1.0a authenticated tweet posting.

Supports:
- Text-only tweets
- Tweets with media (images, videos, GIFs)
- Simple upload (< 5MB) and chunked upload (>= 5MB)
- Credential validation
- Rate limit handling

Usage:
    from services.social.twitter_poster import TwitterPoster
    poster = TwitterPoster()
    result = poster.post_tweet(
        text="Hello from my bot!",
        media_paths=["/tmp/image.png"],
        api_key=os.getenv("TWITTER_API_KEY"),
        api_secret=os.getenv("TWITTER_API_SECRET"),
        access_token=os.getenv("TWITTER_ACCESS_TOKEN"),
        access_token_secret=os.getenv("TWITTER_ACCESS_TOKEN_SECRET"),
    )
"""

import httpx
import os
import json
import hmac
import hashlib
import base64
import urllib.parse
import time
import secrets


# ── CONSTANTS ──────────────────────────────────────────────
UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json"
TWEET_URL = "https://api.twitter.com/2/tweets"
VERIFY_URL = "https://api.twitter.com/2/users/me"

CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB chunks for chunked upload
SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024  # 5 MB threshold
REQUEST_TIMEOUT = 30.0
UPLOAD_TIMEOUT = 120.0


class TwitterPoster:
    """Post tweets via Twitter API v2 with OAuth 1.0a."""

    def __init__(self):
        pass

    # ── PUBLIC API ─────────────────────────────────────────

    def post_tweet(
        self,
        text: str,
        media_paths: list[str] = None,
        access_token: str = "",
        access_token_secret: str = "",
        api_key: str = "",
        api_secret: str = "",
    ) -> dict:
        """
        Post a tweet with optional media attachments.

        Args:
            text: Tweet content (max 280 chars).
            media_paths: Optional list of local file paths to attach.
            access_token: OAuth 1.0a access token.
            access_token_secret: OAuth 1.0a access token secret.
            api_key: Twitter API consumer key.
            api_secret: Twitter API consumer secret.

        Returns:
            {success: bool, tweet_id: str|None, tweet_url: str|None, error: str|None}
        """
        try:
            media_ids = []
            if media_paths:
                for path in media_paths:
                    media_id = self.upload_media(
                        path, api_key, api_secret, access_token, access_token_secret
                    )
                    media_ids.append(media_id)

            # Build request body
            payload = {"text": text}
            if media_ids:
                payload["media"] = {"media_ids": media_ids}

            auth_header = self._generate_oauth_header(
                "POST", TWEET_URL, {}, api_key, api_secret, access_token, access_token_secret
            )

            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                resp = client.post(
                    TWEET_URL,
                    json=payload,
                    headers={
                        "Authorization": auth_header,
                        "Content-Type": "application/json",
                    },
                )

            if resp.status_code == 429:
                reset = resp.headers.get("x-rate-limit-reset", "")
                return {
                    "success": False,
                    "tweet_id": None,
                    "tweet_url": None,
                    "error": f"Rate limited. Resets at {reset}",
                }

            if resp.status_code != 201:
                return {
                    "success": False,
                    "tweet_id": None,
                    "tweet_url": None,
                    "error": f"HTTP {resp.status_code}: {resp.text}",
                }

            data = resp.json()
            tweet_id = data["data"]["id"]
            # Derive screen name from access token lookup or leave generic
            tweet_url = f"https://x.com/i/status/{tweet_id}"

            return {
                "success": True,
                "tweet_id": tweet_id,
                "tweet_url": tweet_url,
                "error": None,
            }

        except Exception as e:
            return {"success": False, "tweet_id": None, "tweet_url": None, "error": str(e)}

    def upload_media(
        self,
        media_path: str,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
    ) -> str:
        """
        Upload media to Twitter and return media_id_string.

        Uses simple upload for files < 5MB, chunked upload for larger files.

        Args:
            media_path: Path to the media file.
            api_key: Consumer key.
            api_secret: Consumer secret.
            access_token: Access token.
            access_token_secret: Access token secret.

        Returns:
            media_id as string.

        Raises:
            FileNotFoundError: If media_path does not exist.
            RuntimeError: If the upload fails.
        """
        if not os.path.isfile(media_path):
            raise FileNotFoundError(f"Media file not found: {media_path}")

        file_size = os.path.getsize(media_path)

        if file_size < SIMPLE_UPLOAD_LIMIT:
            return self._simple_upload(
                media_path, file_size, api_key, api_secret, access_token, access_token_secret
            )
        else:
            return self._chunked_upload(
                media_path, file_size, api_key, api_secret, access_token, access_token_secret
            )

    def validate_credentials(
        self,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
    ) -> bool:
        """
        Validate credentials by calling GET /2/users/me.

        Returns True if credentials are valid, False otherwise.
        """
        try:
            auth_header = self._generate_oauth_header(
                "GET", VERIFY_URL, {}, api_key, api_secret, access_token, access_token_secret
            )
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                resp = client.get(VERIFY_URL, headers={"Authorization": auth_header})
            return resp.status_code == 200
        except Exception:
            return False

    # ── OAUTH 1.0a ─────────────────────────────────────────

    def _generate_oauth_header(
        self,
        method: str,
        url: str,
        params: dict,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
    ) -> str:
        """
        Generate OAuth 1.0a Authorization header using HMAC-SHA1.

        Steps:
            1. Collect OAuth params (nonce, timestamp, consumer key, token, signature method, version)
            2. Merge with request params → percent-encode → sort
            3. Build signature base string: METHOD&url&param_string
            4. Signing key: percent_encode(consumer_secret)&percent_encode(token_secret)
            5. HMAC-SHA1(signing_key, base_string) → base64
            6. Add oauth_signature to params → build Authorization header

        Args:
            method: HTTP method (GET, POST).
            url: Full request URL (without query string for OAuth).
            params: Request parameters (query or form body; NOT JSON body).
            api_key: Consumer key.
            api_secret: Consumer secret.
            access_token: OAuth access token.
            access_token_secret: OAuth access token secret.

        Returns:
            Authorization header value string.
        """
        oauth_params = {
            "oauth_consumer_key": api_key,
            "oauth_nonce": secrets.token_hex(16),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_token": access_token,
            "oauth_version": "1.0",
        }

        # Combine OAuth params with request params for signing
        all_params = {**oauth_params, **params}

        # Percent-encode keys and values, then sort
        encoded_params = urllib.parse.urlencode(
            sorted(
                [(urllib.parse.quote(k, safe=""), urllib.parse.quote(str(v), safe="")) for k, v in all_params.items()]
            )
        )

        # Signature base string
        base_string = "&".join(
            [
                method.upper(),
                urllib.parse.quote(url, safe=""),
                urllib.parse.quote(encoded_params, safe=""),
            ]
        )

        # Signing key
        signing_key = "&".join(
            [
                urllib.parse.quote(api_secret, safe=""),
                urllib.parse.quote(access_token_secret, safe=""),
            ]
        )

        # HMAC-SHA1 signature
        signature = base64.b64encode(
            hmac.new(signing_key.encode("utf-8"), base_string.encode("utf-8"), hashlib.sha1).digest()
        ).decode("utf-8")

        oauth_params["oauth_signature"] = signature

        # Build header value
        header_value = "OAuth " + ", ".join(
            f'{urllib.parse.quote(k, safe="")}="{urllib.parse.quote(v, safe="")}"'
            for k, v in sorted(oauth_params.items())
        )
        return header_value

    # ── INTERNAL UPLOAD HELPERS ────────────────────────────

    def _simple_upload(
        self,
        media_path: str,
        file_size: int,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
    ) -> str:
        """Simple media upload for files < 5MB."""
        auth_header = self._generate_oauth_header(
            "POST", UPLOAD_URL, {}, api_key, api_secret, access_token, access_token_secret
        )

        with open(media_path, "rb") as f:
            media_data = f.read()

        with httpx.Client(timeout=UPLOAD_TIMEOUT) as client:
            resp = client.post(
                UPLOAD_URL,
                files={"media": (os.path.basename(media_path), media_data)},
                headers={"Authorization": auth_header},
            )

        if resp.status_code == 429:
            raise RuntimeError(
                f"Rate limited on media upload. Reset: {resp.headers.get('x-rate-limit-reset', '?')}"
            )

        if resp.status_code != 200:
            raise RuntimeError(f"Media upload failed ({resp.status_code}): {resp.text}")

        data = resp.json()
        return str(data["media_id_string"])

    def _chunked_upload(
        self,
        media_path: str,
        file_size: int,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
    ) -> str:
        """
        Chunked media upload (INIT → APPEND → FINALIZE) for files >= 5MB.

        Follows Twitter's chunked upload protocol:
            1. INIT  — declare media type and total bytes
            2. APPEND — send each chunk (up to 4MB) in sequence
            3. FINALIZE — trigger server-side processing, return media_id
        """
        import mimetypes

        mime_type = mimetypes.guess_type(media_path)[0] or "application/octet-stream"

        # ── INIT ──
        init_params = {
            "command": "INIT",
            "media_type": mime_type,
            "total_bytes": str(file_size),
        }
        auth_header = self._generate_oauth_header(
            "POST", UPLOAD_URL, init_params, api_key, api_secret, access_token, access_token_secret
        )

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.post(
                UPLOAD_URL,
                data=init_params,
                headers={"Authorization": auth_header},
            )

        if resp.status_code != 202:
            raise RuntimeError(f"Chunked INIT failed ({resp.status_code}): {resp.text}")

        media_id = resp.json()["media_id_string"]

        # ── APPEND ──
        with open(media_path, "rb") as f:
            segment_index = 0
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break

                append_params = {
                    "command": "APPEND",
                    "media_id": media_id,
                    "segment_index": str(segment_index),
                }
                auth_header = self._generate_oauth_header(
                    "POST",
                    UPLOAD_URL,
                    append_params,
                    api_key,
                    api_secret,
                    access_token,
                    access_token_secret,
                )

                with httpx.Client(timeout=UPLOAD_TIMEOUT) as client:
                    resp = client.post(
                        UPLOAD_URL,
                        data=append_params,
                        files={"media": ("chunk", chunk, mime_type)},
                        headers={"Authorization": auth_header},
                    )

                if resp.status_code != 204:
                    raise RuntimeError(
                        f"Chunked APPEND failed at segment {segment_index} "
                        f"({resp.status_code}): {resp.text}"
                    )
                segment_index += 1

        # ── FINALIZE ──
        finalize_params = {
            "command": "FINALIZE",
            "media_id": media_id,
        }
        auth_header = self._generate_oauth_header(
            "POST", UPLOAD_URL, finalize_params, api_key, api_secret, access_token, access_token_secret
        )

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.post(
                UPLOAD_URL,
                data=finalize_params,
                headers={"Authorization": auth_header},
            )

        if resp.status_code != 201:
            raise RuntimeError(f"Chunked FINALIZE failed ({resp.status_code}): {resp.text}")

        # Poll for processing if needed (video/animated GIF)
        self._wait_for_processing(media_id, api_key, api_secret, access_token, access_token_secret)

        return media_id

    def _wait_for_processing(
        self,
        media_id: str,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
        max_retries: int = 10,
        poll_interval: float = 2.0,
    ) -> None:
        """
        Poll the media STATUS endpoint until processing completes.

        For images this is instant; videos/GIFs may need server-side processing.
        """
        status_params = {"command": "STATUS", "media_id": media_id}

        for _ in range(max_retries):
            auth_header = self._generate_oauth_header(
                "GET", UPLOAD_URL, status_params, api_key, api_secret, access_token, access_token_secret
            )

            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                resp = client.get(
                    UPLOAD_URL,
                    params=status_params,
                    headers={"Authorization": auth_header},
                )

            if resp.status_code != 200:
                return  # If status check fails, proceed anyway

            data = resp.json()
            processing = data.get("processing_info", {})
            state = processing.get("state", "succeeded")

            if state == "succeeded":
                return
            elif state == "failed":
                error = processing.get("error", {})
                raise RuntimeError(
                    f"Media processing failed: {error.get('message', 'unknown error')}"
                )

            # Still pending — wait before next poll
            time.sleep(processing.get("check_after_secs", poll_interval))

        raise RuntimeError(f"Media processing timed out for media_id={media_id}")


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m services.social.twitter_poster <text> [media_path1 media_path2 ...]")
        sys.exit(1)

    tweet_text = sys.argv[1]
    media_files = sys.argv[2:] if len(sys.argv) > 2 else None

    poster = TwitterPoster()

    result = poster.post_tweet(
        text=tweet_text,
        media_paths=media_files,
        api_key=os.getenv("TWITTER_API_KEY", ""),
        api_secret=os.getenv("TWITTER_API_SECRET", ""),
        access_token=os.getenv("TWITTER_ACCESS_TOKEN", ""),
        access_token_secret=os.getenv("TWITTER_ACCESS_TOKEN_SECRET", ""),
    )

    print(json.dumps(result, indent=2))
