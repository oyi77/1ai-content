/**
 * Image handlers — Element UI helpers
 *
 * Pure functions for element detection, keyboard rendering, and message building.
 * No bot state dependency — easily testable.
 */
import { t } from "@/i18n/translations";

// ── Constants ──

export const CHARACTER_KEYWORDS = [
  "person",
  "woman",
  "man",
  "model",
  "figure",
  "people",
  "character",
  "individual",
  "portrait",
  "face",
  "hands",
];

export const PRODUCT_KEYWORDS = [
  "product",
  "bottle",
  "package",
  "item",
  "object",
  "brand",
  "label",
  "box",
  "bag",
  "container",
  "device",
  "gadget",
];

export const categoryNames: Record<string, string> = {
  product: "🛍️ Product Photo",
  fnb: "🍔 F&B Food",
  realestate: "🏠 Real Estate",
  car: "🚗 Car/Automotive",
};

// ── Detection ──

export function detectImageElements(analysisText: string): {
  hasCharacter: boolean;
  hasProduct: boolean;
  characterDesc: string;
  productDesc: string;
  backgroundDesc: string;
} {
  const lower = analysisText.toLowerCase();
  let hasCharacter = CHARACTER_KEYWORDS.some((kw) =>
    new RegExp(`\\b${kw}\\b`).test(lower),
  );
  const hasProduct = PRODUCT_KEYWORDS.some((kw) =>
    new RegExp(`\\b${kw}\\b`).test(lower),
  );
  if (
    /\b(no|tanpa|without)\s+(person|human|character|model|orang)\b/.test(lower)
  ) {
    hasCharacter = false;
  }

  let characterDesc = "";
  let productDesc = "";
  if (hasCharacter) {
    for (const kw of CHARACTER_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        characterDesc = analysisText
          .slice(Math.max(0, idx - 20), idx + 150)
          .trim();
        break;
      }
    }
  }
  if (hasProduct) {
    for (const kw of PRODUCT_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        productDesc = analysisText
          .slice(Math.max(0, idx - 20), idx + 150)
          .trim();
        break;
      }
    }
  }
  const backgroundDesc = analysisText.slice(0, 200).trim();

  return {
    hasCharacter,
    hasProduct,
    characterDesc,
    productDesc,
    backgroundDesc,
  };
}

// ── Keyboard ──

export function renderElementSelectionKeyboard(sel: {
  keepProduct: boolean;
  keepCharacter: boolean;
  keepBackground: boolean;
}) {
  const check = (on: boolean) => (on ? "✅" : "☐");
  return {
    inline_keyboard: [
      [
        {
          text: `${check(sel.keepProduct)} Produk/Objek`,
          callback_data: "imgelem_product",
        },
      ],
      [
        {
          text: `${check(sel.keepCharacter)} Orang/Model`,
          callback_data: "imgelem_character",
        },
      ],
      [
        {
          text: `${check(sel.keepBackground)} Background/Scene`,
          callback_data: "imgelem_background",
        },
      ],
      [
        { text: "✨ Generate →", callback_data: "imgelem_confirm" },
        { text: "⏭️ Lewati", callback_data: "imgelem_skip" },
      ],
    ],
  };
}

// ── Message builder ──

export function buildElementSelectionMessage(
  analysis: { hasCharacter: boolean; hasProduct: boolean },
  characterDesc?: string,
  productDesc?: string,
): string {
  const detected: string[] = [];
  if (analysis.hasCharacter) detected.push("👤 Orang/Model");
  if (analysis.hasProduct) detected.push("📦 Produk/Objek");
  if (!analysis.hasCharacter && !analysis.hasProduct)
    detected.push("🖼️ Gambar");

  let descPreview = "";
  const desc = productDesc || characterDesc;
  if (desc) {
    descPreview = `\n📝 _${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}_`;
  }

  return (
    "🎯 *Pilih elemen yang ingin dipertahankan*\n\n" +
    `Terdeteksi: ${detected.join(" + ")}${descPreview}\n\n` +
    "Pilih elemen yang ingin dipertahankan di hasil:\n" +
    "_✅ = dipertahankan · ☐ = tidak · lalu tap Generate_"
  );
}

/** Back-to-main button factory */
export function btnBackMain(lang: string) {
  return { text: t("btn.main_menu", lang), callback_data: "main_menu" };
}
