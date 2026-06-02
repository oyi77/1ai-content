/**
 * i18n Translation System
 *
 * UI translations for 4 supported languages: id, en, ru, zh.
 * Translations are loaded from JSON files in locales/ directory.
 *
 * Usage:
 *   import { t } from '@/i18n/translations';
 *   const msg = t('create.select_niche', 'ru');
 */

import idTranslations from './locales/id.json';
import enTranslations from './locales/en.json';
import ruTranslations from './locales/ru.json';
import zhTranslations from './locales/zh.json';

type Lang = string;

const translations: Record<string, Record<Lang, string>> = {};

// Load translations from JSON files
const languageFiles: Record<string, Record<string, string>> = {
  id: idTranslations,
  en: enTranslations,
  ru: ruTranslations,
  zh: zhTranslations,
};

// Build reverse index: key -> { lang -> value }
for (const [lang, data] of Object.entries(languageFiles)) {
  for (const [key, value] of Object.entries(data)) {
    if (!translations[key]) {
      translations[key] = {};
    }
    translations[key][lang] = value;
  }
}

/**
 * Get translation for a key in the specified language.
 * Falls back to English if translation not found.
 * Falls back to key itself if not found in any language.
 */
export function t(key: string, lang: string = 'en'): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry['en'] || key;
}

/**
 * Get all available languages.
 */
export function getAvailableLanguages(): string[] {
  return Object.keys(languageFiles);
}

/**
 * Check if a translation key exists.
 */
export function hasTranslation(key: string): boolean {
  return key in translations;
}
