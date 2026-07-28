from __future__ import annotations

SUPPORTED_LANGUAGES: dict[str, dict] = {
    # --- English & West Germanic ---
    "en": {"name": "English", "rtl": False, "font_hint": "Calibri"},
    "de": {"name": "German", "rtl": False, "font_hint": "Calibri"},
    "nl": {"name": "Dutch", "rtl": False, "font_hint": "Calibri"},
    "af": {"name": "Afrikaans", "rtl": False, "font_hint": "Calibri"},
    # --- Romance ---
    "es": {"name": "Spanish", "rtl": False, "font_hint": "Calibri"},
    "pt": {"name": "Portuguese", "rtl": False, "font_hint": "Calibri"},
    "fr": {"name": "French", "rtl": False, "font_hint": "Calibri"},
    "it": {"name": "Italian", "rtl": False, "font_hint": "Calibri"},
    "ro": {"name": "Romanian", "rtl": False, "font_hint": "Calibri"},
    "ca": {"name": "Catalan", "rtl": False, "font_hint": "Calibri"},
    # --- North Germanic (Scandinavian) ---
    "sv": {"name": "Swedish", "rtl": False, "font_hint": "Calibri"},
    "no": {"name": "Norwegian", "rtl": False, "font_hint": "Calibri"},
    "da": {"name": "Danish", "rtl": False, "font_hint": "Calibri"},
    "fi": {"name": "Finnish", "rtl": False, "font_hint": "Calibri"},
    # --- Slavic ---
    "ru": {"name": "Russian", "rtl": False, "font_hint": "Times New Roman"},
    "uk": {"name": "Ukrainian", "rtl": False, "font_hint": "Times New Roman"},
    "pl": {"name": "Polish", "rtl": False, "font_hint": "Calibri"},
    "cs": {"name": "Czech", "rtl": False, "font_hint": "Calibri"},
    "sk": {"name": "Slovak", "rtl": False, "font_hint": "Calibri"},
    "hr": {"name": "Croatian", "rtl": False, "font_hint": "Calibri"},
    "sr": {"name": "Serbian", "rtl": False, "font_hint": "Times New Roman"},
    "bg": {"name": "Bulgarian", "rtl": False, "font_hint": "Times New Roman"},
    # --- Other European ---
    "tr": {"name": "Turkish", "rtl": False, "font_hint": "Calibri"},
    "el": {"name": "Greek", "rtl": False, "font_hint": "Arial"},
    "hu": {"name": "Hungarian", "rtl": False, "font_hint": "Calibri"},
    "lt": {"name": "Lithuanian", "rtl": False, "font_hint": "Calibri"},
    "lv": {"name": "Latvian", "rtl": False, "font_hint": "Calibri"},
    "et": {"name": "Estonian", "rtl": False, "font_hint": "Calibri"},
    # --- RTL: Arabic-script & Hebrew ---
    "ar": {"name": "Arabic", "rtl": True, "font_hint": "Arial"},
    "he": {"name": "Hebrew", "rtl": True, "font_hint": "Arial"},
    "fa": {"name": "Persian (Farsi)", "rtl": True, "font_hint": "Arial"},
    "ur": {"name": "Urdu", "rtl": True, "font_hint": "Arial"},
    # --- South & Southeast Asian ---
    "hi": {"name": "Hindi", "rtl": False, "font_hint": "Mangal"},
    "bn": {"name": "Bengali", "rtl": False, "font_hint": "Vrinda"},
    "ta": {"name": "Tamil", "rtl": False, "font_hint": "Latha"},
    "te": {"name": "Telugu", "rtl": False, "font_hint": "Gautami"},
    "mr": {"name": "Marathi", "rtl": False, "font_hint": "Mangal"},
    "gu": {"name": "Gujarati", "rtl": False, "font_hint": "Shruti"},
    "pa": {"name": "Punjabi (Gurmukhi)", "rtl": False, "font_hint": "Raavi"},
    "ne": {"name": "Nepali", "rtl": False, "font_hint": "Mangal"},
    "si": {"name": "Sinhala", "rtl": False, "font_hint": "Iskoola Pota"},
    "th": {"name": "Thai", "rtl": False, "font_hint": "Tahoma"},
    "vi": {"name": "Vietnamese", "rtl": False, "font_hint": "Arial"},
    "id": {
        "name": "Indonesian (Bahasa Indonesia)",
        "rtl": False,
        "font_hint": "Calibri",
    },
    "ms": {"name": "Malay", "rtl": False, "font_hint": "Calibri"},
    "tl": {"name": "Filipino (Tagalog)", "rtl": False, "font_hint": "Calibri"},
    "km": {"name": "Khmer", "rtl": False, "font_hint": "DaunPenh"},
    "my": {"name": "Burmese (Myanmar)", "rtl": False, "font_hint": "Myanmar Text"},
    # --- East Asian ---
    "zh": {"name": "Chinese (Simplified)", "rtl": False, "font_hint": "SimSun"},
    "zh-TW": {"name": "Chinese (Traditional)", "rtl": False, "font_hint": "MingLiU"},
    "ja": {"name": "Japanese", "rtl": False, "font_hint": "MS Mincho"},
    "ko": {"name": "Korean", "rtl": False, "font_hint": "Malgun Gothic"},
    # --- African ---
    "sw": {"name": "Swahili", "rtl": False, "font_hint": "Calibri"},
    "am": {"name": "Amharic", "rtl": False, "font_hint": "Nyala"},
    "yo": {"name": "Yoruba", "rtl": False, "font_hint": "Calibri"},
    "ig": {"name": "Igbo", "rtl": False, "font_hint": "Calibri"},
    "ha": {"name": "Hausa", "rtl": False, "font_hint": "Calibri"},
    "zu": {"name": "Zulu", "rtl": False, "font_hint": "Calibri"},
}


def language_instruction(lang_code: str) -> str:
    """Return a system prompt instruction for the given language code."""
    meta = SUPPORTED_LANGUAGES.get(lang_code)
    if meta:
        name = meta["name"]
        return f"Write entirely in {name}. Use natural {name} grammar, idioms, and cultural context appropriate for the target audience."
    return f"Write entirely in the language with code '{lang_code}'."


def is_rtl(lang_code: str) -> bool:
    """Return True if the language is right-to-left."""
    return SUPPORTED_LANGUAGES.get(lang_code, {}).get("rtl", False)
