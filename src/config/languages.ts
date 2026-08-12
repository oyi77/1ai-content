/**
 * Dynamic Language Registry
 *
 * Central config for all supported languages. Each entry defines:
 * - Display label and flag emoji
 * - Edge-TTS voice ID for VO generation
 * - AI label used in LLM prompts (e.g. "Generate a Thai voiceover…")
 * - Reading speed (words per minute) for subtitle timing
 *
 * To add a new language: add an entry here. Everything else adapts automatically.
 * Edge-TTS voice list: https://github.com/nicklashxx/edge-tts#voices
 */

export interface LanguageConfig {
  code: string;
  label: string;
  flag: string;
  /** Full label for AI prompts, e.g. "Thai (ภาษาไทย)" */
  aiLabel: string;
  /** edge-tts voice name */
  ttsVoice: string;
  /** Alternative TTS voice (male/female swap) */
  ttsVoiceAlt?: string;
  /** Approximate words-per-minute for this language */
  readingSpeedWpm: number;
}

export const LANGUAGES: Record<string, LanguageConfig> = {
  id: {
    code: "id",
    label: "Bahasa Indonesia",
    flag: "\ud83c\uddee\ud83c\udde9",
    aiLabel: "Indonesian (Bahasa Indonesia)",
    ttsVoice: "id-ID-GadisNeural",
    ttsVoiceAlt: "id-ID-ArdiNeural",
    readingSpeedWpm: 140,
  },
  en: {
    code: "en",
    label: "English",
    flag: "\ud83c\uddec\ud83c\udde7",
    aiLabel: "English",
    ttsVoice: "en-US-GuyNeural",
    ttsVoiceAlt: "en-US-JennyNeural",
    readingSpeedWpm: 150,
  },
  ms: {
    code: "ms",
    label: "Bahasa Melayu",
    flag: "\ud83c\uddf2\ud83c\uddfe",
    aiLabel: "Malay (Bahasa Melayu)",
    ttsVoice: "ms-MY-YasminNeural",
    ttsVoiceAlt: "ms-MY-OsmanNeural",
    readingSpeedWpm: 140,
  },
  th: {
    code: "th",
    label: "\u0e44\u0e17\u0e22",
    flag: "\ud83c\uddf9\ud83c\udded",
    aiLabel: "Thai (\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22)",
    ttsVoice: "th-TH-PremwadeeNeural",
    ttsVoiceAlt: "th-TH-NiwatNeural",
    readingSpeedWpm: 120,
  },
  vi: {
    code: "vi",
    label: "Ti\u1ebfng Vi\u1ec7t",
    flag: "\ud83c\uddfb\ud83c\uddf3",
    aiLabel: "Vietnamese (Ti\u1ebfng Vi\u1ec7t)",
    ttsVoice: "vi-VN-HoaiMyNeural",
    ttsVoiceAlt: "vi-VN-NamMinhNeural",
    readingSpeedWpm: 135,
  },
  tl: {
    code: "tl",
    label: "Filipino",
    flag: "\ud83c\uddf5\ud83c\udded",
    aiLabel: "Filipino (Tagalog)",
    ttsVoice: "fil-PH-BlessicaNeural",
    ttsVoiceAlt: "fil-PH-AngeloNeural",
    readingSpeedWpm: 145,
  },
  zh: {
    code: "zh",
    label: "\u4e2d\u6587",
    flag: "\ud83c\udde8\ud83c\uddf3",
    aiLabel: "Chinese (Mandarin, \u4e2d\u6587)",
    ttsVoice: "zh-CN-XiaoxiaoNeural",
    ttsVoiceAlt: "zh-CN-YunxiNeural",
    readingSpeedWpm: 160,
  },
  ja: {
    code: "ja",
    label: "\u65e5\u672c\u8a9e",
    flag: "\ud83c\uddef\ud83c\uddf5",
    aiLabel: "Japanese (\u65e5\u672c\u8a9e)",
    ttsVoice: "ja-JP-NanamiNeural",
    ttsVoiceAlt: "ja-JP-KeitaNeural",
    readingSpeedWpm: 130,
  },
  ko: {
    code: "ko",
    label: "\ud55c\uad6d\uc5b4",
    flag: "\ud83c\uddf0\ud83c\uddf7",
    aiLabel: "Korean (\ud55c\uad6d\uc5b4)",
    ttsVoice: "ko-KR-SunHiNeural",
    ttsVoiceAlt: "ko-KR-InJoonNeural",
    readingSpeedWpm: 135,
  },
  hi: {
    code: "hi",
    label: "\u0939\u093f\u0928\u094d\u0926\u0940",
    flag: "\ud83c\uddee\ud83c\uddf3",
    aiLabel: "Hindi (\u0939\u093f\u0928\u094d\u0926\u0940)",
    ttsVoice: "hi-IN-SwaraNeural",
    ttsVoiceAlt: "hi-IN-MadhurNeural",
    readingSpeedWpm: 140,
  },
  ar: {
    code: "ar",
    label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    flag: "\ud83c\uddf8\ud83c\udde6",
    aiLabel: "Arabic (\u0627\u0644\u0639\u0631\u0628\u064a\u0629)",
    ttsVoice: "ar-SA-ZariyahNeural",
    ttsVoiceAlt: "ar-SA-HamedNeural",
    readingSpeedWpm: 130,
  },
  pt: {
    code: "pt",
    label: "Portugu\u00eas",
    flag: "\ud83c\udde7\ud83c\uddf7",
    aiLabel: "Portuguese (Portugu\u00eas)",
    ttsVoice: "pt-BR-FranciscaNeural",
    ttsVoiceAlt: "pt-BR-AntonioNeural",
    readingSpeedWpm: 145,
  },
  es: {
    code: "es",
    label: "Espa\u00f1ol",
    flag: "\ud83c\uddea\ud83c\uddf8",
    aiLabel: "Spanish (Espa\u00f1ol)",
    ttsVoice: "es-MX-DaliaNeural",
    ttsVoiceAlt: "es-MX-JorgeNeural",
    readingSpeedWpm: 145,
  },
  fr: {
    code: "fr",
    label: "Fran\u00e7ais",
    flag: "\ud83c\uddeb\ud83c\uddf7",
    aiLabel: "French (Fran\u00e7ais)",
    ttsVoice: "fr-FR-DeniseNeural",
    ttsVoiceAlt: "fr-FR-HenriNeural",
    readingSpeedWpm: 145,
  },
  de: {
    code: "de",
    label: "Deutsch",
    flag: "\ud83c\udde9\ud83c\uddea",
    aiLabel: "German (Deutsch)",
    ttsVoice: "de-DE-KatjaNeural",
    ttsVoiceAlt: "de-DE-ConradNeural",
    readingSpeedWpm: 140,
  },
  ru: {
    code: "ru",
    label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    flag: "\ud83c\uddf7\ud83c\uddfa",
    aiLabel: "Russian (\u0420\u0443\u0441\u0441\u043a\u0438\u0439)",
    ttsVoice: "ru-RU-SvetlanaNeural",
    ttsVoiceAlt: "ru-RU-DmitryNeural",
    readingSpeedWpm: 135,
  },
  tr: {
    code: "tr",
    label: "T\u00fcrk\u00e7e",
    flag: "\ud83c\uddf9\ud83c\uddf7",
    aiLabel: "Turkish (T\u00fcrk\u00e7e)",
    ttsVoice: "tr-TR-EmelNeural",
    ttsVoiceAlt: "tr-TR-AhmetNeural",
    readingSpeedWpm: 140,
  },
  it: {
    code: "it",
    label: "Italiano",
    flag: "\ud83c\uddee\ud83c\uddf9",
    aiLabel: "Italian (Italiano)",
    ttsVoice: "it-IT-ElsaNeural",
    ttsVoiceAlt: "it-IT-DiegoNeural",
    readingSpeedWpm: 145,
  },
  nl: {
    code: "nl",
    label: "Nederlands",
    flag: "\ud83c\uddf3\ud83c\uddf1",
    aiLabel: "Dutch (Nederlands)",
    ttsVoice: "nl-NL-ColetteNeural",
    ttsVoiceAlt: "nl-NL-MaartenNeural",
    readingSpeedWpm: 140,
  },
  pl: {
    code: "pl",
    label: "Polski",
    flag: "\ud83c\uddf5\ud83c\uddf1",
    aiLabel: "Polish (Polski)",
    ttsVoice: "pl-PL-ZofiaNeural",
    ttsVoiceAlt: "pl-PL-MarekNeural",
    readingSpeedWpm: 135,
  },
  sv: {
    code: "sv",
    label: "Svenska",
    flag: "\ud83c\uddf8\ud83c\uddea",
    aiLabel: "Swedish (Svenska)",
    ttsVoice: "sv-SE-SofieNeural",
    ttsVoiceAlt: "sv-SE-MattiasNeural",
    readingSpeedWpm: 140,
  },
  uk: {
    code: "uk",
    label: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430",
    flag: "\ud83c\uddfa\ud83c\udde6",
    aiLabel:
      "Ukrainian (\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430)",
    ttsVoice: "uk-UA-PolinaNeural",
    ttsVoiceAlt: "uk-UA-OstapNeural",
    readingSpeedWpm: 135,
  },
  bn: {
    code: "bn",
    label: "\u09ac\u09be\u0982\u09b2\u09be",
    flag: "\ud83c\udde7\ud83c\udde9",
    aiLabel: "Bengali (\u09ac\u09be\u0982\u09b2\u09be)",
    ttsVoice: "bn-BD-NabanitaNeural",
    ttsVoiceAlt: "bn-BD-PradeepNeural",
    readingSpeedWpm: 130,
  },
  my: {
    code: "my",
    label: "\u1019\u103c\u1014\u103a\u1019\u102c",
    flag: "\ud83c\uddf2\ud83c\uddf2",
    aiLabel: "Myanmar (Burmese, \u1019\u103c\u1014\u103a\u1019\u102c)",
    ttsVoice: "my-MM-NilarNeural",
    ttsVoiceAlt: "my-MM-ThihaNeural",
    readingSpeedWpm: 120,
  },
};

/** Ordered list for UI display — popular/regional first */
export const LANGUAGE_LIST: LanguageConfig[] = [
  LANGUAGES.id,
  LANGUAGES.en,
  LANGUAGES.ms,
  LANGUAGES.th,
  LANGUAGES.vi,
  LANGUAGES.tl,
  LANGUAGES.zh,
  LANGUAGES.ja,
  LANGUAGES.ko,
  LANGUAGES.hi,
  LANGUAGES.ar,
  LANGUAGES.pt,
  LANGUAGES.es,
  LANGUAGES.fr,
  LANGUAGES.de,
  LANGUAGES.ru,
  LANGUAGES.tr,
  LANGUAGES.it,
  LANGUAGES.nl,
  LANGUAGES.pl,
  LANGUAGES.sv,
  LANGUAGES.uk,
  LANGUAGES.bn,
  LANGUAGES.my,
];

/** Number of languages per page in the selection UI */
export const LANG_PAGE_SIZE = 8;

/**
 * Get language config by code, with fallback to Indonesian.
 */
export function getLangConfig(code: string): LanguageConfig {
  return LANGUAGES[code] || LANGUAGES.id;
}

/**
 * Get TTS voice for a language code.
 */
export function getTTSVoice(code: string): string {
  return getLangConfig(code).ttsVoice;
}

/**
 * Get AI label for prompt generation.
 */
export function getAILabel(code: string): string {
  return getLangConfig(code).aiLabel;
}

/**
 * Check if a language code is supported.
 */
export function isSupported(code: string): boolean {
  return code in LANGUAGES;
}
