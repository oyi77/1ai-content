"""Language support for book generation.

Maps language codes to writing instructions for the AI agents.
Falls back gracefully to English for unknown language codes.
"""

from typing import Final

_LANGUAGE_INSTRUCTIONS: Final[dict[str, str]] = {
    "en": "Write all content in English.",
    "id": "Tulis semua konten dalam Bahasa Indonesia.",
    "ms": "Tulis semua konten dalam Bahasa Melayu.",
    "es": "Escribe todo el contenido en español.",
    "fr": "Rédigez tout le contenu en français.",
    "de": "Schreiben Sie alle Inhalte auf Deutsch.",
    "pt": "Escreva todo o conteúdo em português.",
    "nl": "Schrijf alle inhoud in het Nederlands.",
    "ru": "Пишите весь контент на русском языке.",
    "zh": "请用中文撰写所有内容。",
    "ja": "すべてのコンテンツを日本語で書いてください。",
    "ko": "모든 콘텐츠를 한국어로 작성하세요.",
    "ar": "اكتب كل المحتوى باللغة العربية.",
    "hi": "सभी सामग्री हिंदी में लिखें।",
    "th": "เขียนเนื้อหาทั้งหมดเป็นภาษาไทย",
    "vi": "Viết tất cả nội dung bằng tiếng Việt.",
    "tr": "Tüm içeriği Türkçe yazın.",
    "it": "Scrivi tutto il contenuto in italiano.",
    "pl": "Napisz całą treść po polsku.",
    "uk": "Пишіть весь вміст українською мовою.",
}


def get_language_instruction(language: str) -> str:
    """Get the agent instruction phrase for a language code.

    Returns a language-specific instruction for the most common codes.
    Falls back to a generic instruction for unknown codes.
    """
    if instruction := _LANGUAGE_INSTRUCTIONS.get(language):
        return instruction
    return f"Write all content in {language}."
