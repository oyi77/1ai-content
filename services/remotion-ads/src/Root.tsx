/**
 * Root — Remotion composition registry.
 * Registers the ProductAd composition for the studio and CLI.
 */

import React from "react";
import { Composition } from "remotion";
import { ProductAd, ProductAdProps } from "./ProductAd";

// Default props for studio preview
const defaultProps: ProductAdProps = {
  imageUrl: "https://cf.shopee.co.id/file/placeholder.jpg",
  title: "Serum Wajah Niacinamide 10% — Kulit Cerah & Glowing",
  category: "beauty",
  affiliateLink: "https://shope.ee/sample",
  brandName: "Pelembap Estetik Hub",
  adCopy: "Formulasi ringan dengan bahan alami yang teruji klinis. Cocok untuk semua jenis kulit!",
  hookText: "Kulit glowing dalam 7 hari! ✨",
  ctaText: "Link di Bio! 🔗",
  categoryLabel: "Kecantikan",
  categoryEmoji: "✨",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main product ad composition */}
      <Composition
        id="ProductAd"
        component={ProductAd}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />

      {/* Shorter hook-only variant (for testing) */}
      <Composition
        id="ProductAd-Hook"
        component={ProductAd}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};
