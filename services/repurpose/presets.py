"""Shared presets for the repurpose pipeline.

Consolidated from duplicates across repurpose/engine.py, cascade.py,
and providers/reka.py, providers/video.py.
"""

# ── Color grading presets (FFmpeg LUT-style filters) ──
COLOR_PRESETS = {
    "none": "",
    "cinematic": "eq=contrast=1.1:brightness=0.05:saturation=0.9,curves=m='0/0 0.25/0.20 0.5/0.45 0.75/0.8 1/1'",
    "warm": "eq=contrast=1.05:brightness=0.03:saturation=1.15,colorbalance=rs=0.1:gs=0.05:bs=-0.05",
    "cool": "eq=contrast=1.05:brightness=0.02:saturation=0.9,colorbalance=rs=-0.05:gs=0:bs=0.1",
    "vibrant": "eq=contrast=1.15:brightness=0.02:saturation=1.4",
    "vintage": "eq=contrast=0.9:brightness=0.05:saturation=0.7,colorbalance=rs=0.1:gs=0.05:bs=-0.1",
    "dark_moody": "eq=contrast=1.2:brightness=-0.05:saturation=0.8",
    "bright_clean": "eq=contrast=1.05:brightness=0.08:saturation=1.1",
}

# ── Transition presets ──
TRANSITION_PRESETS = {
    "crossfade": {"duration": 0.5, "filter": "xfade"},
    "fade_black": {"duration": 0.8, "filter": "fade"},
    "wipe_left": {"duration": 0.5, "filter": "wipeleft"},
    "wipe_right": {"duration": 0.5, "filter": "wiperight"},
    "wipe_up": {"duration": 0.5, "filter": "wipeup"},
    "zoom_in": {"duration": 0.6, "filter": "circlecrop"},
    "none": {"duration": 0, "filter": "none"},
}

# ── Overlay positioning presets ──
OVERLAY_POSITIONS = {
    "top_center": {"x": "(w-text_w)/2", "y": "50"},
    "top_left": {"x": "50", "y": "50"},
    "top_right": {"x": "w-text_w-50", "y": "50"},
    "center": {"x": "(w-text_w)/2", "y": "(h-text_h)/2"},
    "bottom_center": {"x": "(w-text_w)/2", "y": "h-text_h-80"},
    "bottom_left": {"x": "50", "y": "h-text_h-50"},
    "lower_third": {"x": "(w-text_w)/2", "y": "h*0.72"},
}

# ── Segment classification keywords ──
HOOK_KEYWORDS = [
    "tahukah", "pernah", "gimana", "coba", "lihat", "check", "wait",
    "did you know", "have you ever", "watch this", "check this out",
    "you won't believe", "here's why", "this is crazy",
]
CTA_KEYWORDS = [
    "follow", "like", "share", "comment", "subscribe", "save",
    "ikuti", "like", "share", "komen", "subscribe", "simpan",
    "link di bio", "check link", "link in bio",
]
EXAMPLE_KEYWORDS = [
    "contoh", "misalnya", "seperti", "for example", "such as",
    "here's how", "begini caranya", "seperti ini",
]
