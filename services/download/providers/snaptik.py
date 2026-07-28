"""Download via snaptik.app v2 API — no watermark."""
from __future__ import annotations

import asyncio
import json as _json
import os
import re
from urllib.parse import quote as _uq

import httpx
from Crypto.Cipher import AES as _AES
import hashlib as _hl2
from loguru import logger


_SN_SALT = "sn4pt1k_v3r1fy2026"


def _deobfuscate_snaptik(data: str) -> str | None:
    """Deobfuscate snaptik.app eval-based obfuscation.

    Extracts eval params from }("PAYLOAD",U,"CHARSET",T,E,R)) pattern,
    decodes segments delimited by charset[T] -> base-E -> subtract t -> chr().
    """
    fidx = data.find("function(h,u,n,t,e,r)")
    if fidx < 0:
        return None
    brace_idx = data.find("}(", fidx)
    if brace_idx < 0:
        return None
    args_text = data[brace_idx + 2:]
    # Payload (first quoted string)
    q1 = args_text.find('"')
    q2 = args_text.find('"', q1 + 1)
    payload = args_text[q1 + 1:q2]
    rest = args_text[q2 + 1:].lstrip(",")
    # U (first number)
    parts = rest.split(",")
    u_val = int(parts[0].strip())  # noqa: F841
    rest2 = ",".join(parts[1:]).lstrip(",")
    # Charset
    q3 = rest2.find('"')
    q4 = rest2.find('"', q3 + 1)
    charset = rest2[q3 + 1:q4]
    rest3 = rest2[q4 + 1:].lstrip(",")
    # T, E, R (strip trailing parens)
    rest3 = rest3.rstrip(")").strip()
    nums = [int(x.strip()) for x in rest3.split(",")]
    t_val, e_val, _ = nums[0], nums[1], nums[2]
    # Decode
    delim = charset[e_val]
    result_chars: list[str] = []
    i = 0
    while i < len(payload):
        s = ""
        while i < len(payload) and payload[i] != delim:
            s += payload[i]
            i += 1
        i += 1  # skip delimiter
        if not s:
            continue
        digits = "".join(str(charset.find(ch)) if ch in charset else ch for ch in s)
        val = int(digits, e_val)
        result_chars.append(chr(val - t_val))
    return "".join(result_chars)


def _extract_snaptik_link(decoded: str) -> str | None:
    """Extract RapidCDN download URL from decoded snaptik HTML."""
    for m in re.finditer(r'href="(https://d\.rapidcdn\.app/[^"]+)"', decoded):
        return m.group(1)
    for m in re.finditer(r'href="(https://api\.snaptik\.app/[^"]+)"', decoded):
        return m.group(1)
    return None


async def dl_snaptik(video_url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via snaptik.app v2 API — no watermark.

    Flow:
      1. POST /api/token -> get challenge id + encrypted payload
      2. AES-CBC decrypt payload with key = SHA-256("sn4pt1k_v3r1fy2026" + ":" + id)
      3. Solve challenge (compute e() result over decrypted fields)
      4. GET /api/extract?url=... with X-Verify header -> get downloadUrl
      5. Download video from RapidCDN

    Added 2026-07-28 based on reverse-engineered JS challenge.
    Falls back to old abc2.php flow if v2 fails.
    """
    os.makedirs(tmpdir, exist_ok=True)
    fp = os.path.join(tmpdir, f"snaptik_{vid_id}.mp4")

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, verify=False) as c:
            # Step 1: Get challenge token
            r = await c.post("https://snaptik.app/api/token",
                headers={"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json",
                         "Referer": "https://snaptik.app/en3", "Cookie": "snaptik-locale=en3"},
            )
            if r.status_code != 200:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"snaptik_token_http_{r.status_code}"}
            tok = r.json()
            id_val, p_b64 = tok["id"], tok["p"]

            # Step 2: AES-CBC decrypt payload
            p_raw = __import__("base64").b64decode(p_b64)
            key = _hl2.sha256((_SN_SALT + ":" + id_val).encode()).digest()
            cipher = _AES.new(key, _AES.MODE_CBC, iv=p_raw[:16])
            decrypted = cipher.decrypt(p_raw[16:])
            pad_len = decrypted[-1]
            data = _json.loads(decrypted[:-pad_len])

            # Step 3: Solve challenge
            e_val = data.pop("_e")
            h_val = data.pop("_h")
            t = data["t"]
            if t == "r":
                p_result = sum(data["n"]) * 2 + 1
            elif t == "b":
                p_result = (data["a"] ^ data["b"]) >> data["s"] & 255
            elif t == "c":
                p_result = ord(data["w"][data["i"]]) * data["m"]
            elif t == "m":
                p_result = (data["a"] + data["b"]) % 100 * data["c"]
            elif t == "n":
                a, b, c_val = data["a"], data["b"], data["c"]
                p_result = a * b + b * c_val + c_val * a - a
            else:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"snaptik_unknown_t_{t}"}

            x_verify = f"{id_val}:{p_result}:{e_val}:{h_val}"

            # Step 4: Extract download URL
            url_encoded = _uq(video_url, safe="")
            r2 = await c.get(f"https://snaptik.app/api/extract?url={url_encoded}",
                headers={"X-Requested-With": "XMLHttpRequest", "X-Verify": x_verify,
                         "Referer": "https://snaptik.app/en3", "Cookie": "snaptik-locale=en3"},
            )
            if r2.status_code != 200:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"snaptik_extract_http_{r2.status_code}"}
            ext = r2.json()
            if not ext.get("success"):
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "snaptik_extract_failed"}
            dl_url = ext["data"]["downloadUrl"]

            # Step 5: Download video
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as dl:
                vr = await dl.get(dl_url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://snaptik.app/",
                })
                if vr.status_code == 200 and len(vr.content) > 10000:
                    with open(fp, "wb") as f:
                        f.write(vr.content)
                    return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"snaptik_dl_{vr.status_code}"}
    except Exception as e:
        logger.warning(f"[snaptik] Error: {type(e).__name__}: {e}")
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"snaptik_{type(e).__name__}"}