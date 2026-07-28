"""Fallback providers: oEmbed thumbnail and placeholder image."""
from __future__ import annotations

import os
import struct
import zlib

import httpx

from ..cascade import TIKTOK_OEMBED
from ..utils import _dl_url, PICSUM_URL


async def dl_oembed(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Get thumbnail via TikTok oembed API."""
    try:
        r = await client.get(f"{TIKTOK_OEMBED}?url={url}", timeout=5)
        if r.status_code == 200:
            thumb = r.json().get("thumbnail_url", "")
            if thumb:
                result = await _dl_url(client, thumb, vid_id, tmpdir, "jpg")
                if result["status"] == "downloaded":
                    result["file_type"] = "image"
                    return result
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}


async def dl_placeholder(client: httpx.AsyncClient | None, category: str, tmpdir: str) -> dict:
    """Download generic placeholder image from picsum or generate local fallback."""
    # Try picsum first if client is available
    if client is not None:
        try:
            seed = abs(hash(category)) % 100000
            r = await client.get(f"{PICSUM_URL}/seed/{seed}/1080/1080", timeout=15)
            if r.status_code == 200 and len(r.content) > 1024:
                fp = os.path.join(tmpdir, f"{category.replace(' ', '_')}_{seed}.jpg")
                with open(fp, "wb") as f:
                    f.write(r.content)
                return {"file_path": fp, "file_type": "image", "status": "downloaded", "tmpdir": tmpdir}
        except Exception:
            pass

    # Fallback: generate 1x1 red PNG using stdlib (no external deps)
    fp = os.path.join(tmpdir, "placeholder.png")
    try:
        width, height = 1, 1
        # IHDR: 8-bit RGBA
        ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
        ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
        # IDAT: filter byte + RGBA pixel (red)
        raw = b'\x00\xff\x00\x00\xff'
        compressed = zlib.compress(raw)
        idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
        # IEND
        iend_crc = zlib.crc32(b'IEND') & 0xffffffff
        sig = b'\x89PNG\r\n\x1a\n'

        def _chunk(ctype: bytes, cdata: bytes, ccrc: int) -> bytes:
            return struct.pack('>I', len(cdata)) + ctype + cdata + struct.pack('>I', ccrc)

        png_data = sig
        png_data += _chunk(b'IHDR', ihdr_data, ihdr_crc)
        png_data += _chunk(b'IDAT', compressed, idat_crc)
        png_data += _chunk(b'IEND', b'', iend_crc)
        with open(fp, 'wb') as f:
            f.write(png_data)
        return {"file_path": fp, "file_type": "image", "status": "downloaded", "tmpdir": tmpdir}
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}