/**
 * ProductAd — Remotion Composition for Indonesian Shopee Affiliate Products
 *
 * 9:16 (1080×1920) @ 30fps, 15 seconds (450 frames)
 *
 * Three scenes:
 *  1. Hook (0–90):    Bold text hook + product image fade-in
 *  2. Showcase (90–300): Full product image + animated text overlay
 *  3. CTA (300–450):  "Link di Bio!" + brand badge
 */

import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { getCategoryGradient } from "./adCopy";

// ============================================================================
// PROPS
// ============================================================================

export interface ProductAdProps {
  imageUrl: string;
  title: string;
  category: string;
  affiliateLink: string;
  brandName: string;
  adCopy: string;
  hookText: string;
  ctaText: string;
  categoryLabel: string;
  categoryEmoji: string;
}

// ============================================================================
// SCENE BOUNDARIES (frames)
// ============================================================================

const SCENE = {
  HOOK_START: 0,
  HOOK_END: 90,
  SHOWCASE_START: 90,
  SHOWCASE_END: 300,
  CTA_START: 300,
  CTA_END: 450,
} as const;

// ============================================================================
// IMAGE RESOLUTION
// ============================================================================

/**
 * Resolve image source:
 * - HTTP/HTTPS URLs: pass through directly
 * - Filenames (no path separators): use staticFile() for public/ directory
 */
function resolveImageSrc(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }
  // If it's just a filename (no path separators), use staticFile
  if (!src.includes("/") && !src.includes("\\")) {
    return staticFile(src);
  }
  // Otherwise pass through (absolute path or other)
  return src;
}

// ============================================================================
// MAIN COMPOSITION
// ============================================================================

export const ProductAd: React.FC<ProductAdProps> = ({
  imageUrl,
  title,
  category,
  brandName,
  adCopy,
  hookText,
  ctaText,
  categoryLabel,
  categoryEmoji,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [gradStart, gradEnd] = getCategoryGradient(category);
  const resolvedImageUrl = resolveImageSrc(imageUrl);

  return (
    <AbsoluteFill
      style={{
        fontFamily:
          "'Inter', 'SF Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ── Background gradient ──────────────────────────────────── */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(165deg, ${gradStart} 0%, ${gradEnd} 40%, #1a1a2e 100%)`,
        }}
      />

      {/* ── Decorative background circles (subtle) ───────────────── */}
      <AbsoluteFill style={{ overflow: "hidden", opacity: 0.08 }}>
        <div
          style={{
            position: "absolute",
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: gradStart,
            top: -200,
            right: -200,
            filter: "blur(100px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: gradEnd,
            bottom: -150,
            left: -150,
            filter: "blur(80px)",
          }}
        />
      </AbsoluteFill>

      {/* ── Scene 1: HOOK (frames 0–90) ──────────────────────────── */}
      {frame < SCENE.HOOK_END && (
        <HookScene
          frame={frame}
          fps={fps}
          hookText={hookText}
          imageUrl={resolvedImageUrl}
          gradStart={gradStart}
        />
      )}

      {/* ── Scene 2: PRODUCT SHOWCASE (frames 90–300) ────────────── */}
      {frame >= SCENE.SHOWCASE_START && frame < SCENE.SHOWCASE_END && (
        <ShowcaseScene
          frame={frame}
          fps={fps}
          imageUrl={resolvedImageUrl}
          title={title}
          adCopy={adCopy}
          categoryLabel={categoryLabel}
          categoryEmoji={categoryEmoji}
          gradStart={gradStart}
        />
      )}

      {/* ── Scene 3: CTA (frames 300–450) ────────────────────────── */}
      {frame >= SCENE.CTA_START && (
        <CTAScene
          frame={frame}
          fps={fps}
          ctaText={ctaText}
          brandName={brandName}
          gradStart={gradStart}
          imageUrl={resolvedImageUrl}
          title={title}
          categoryEmoji={categoryEmoji}
        />
      )}
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 1: HOOK
// ============================================================================

const HookScene: React.FC<{
  frame: number;
  fps: number;
  hookText: string;
  imageUrl: string;
  gradStart: string;
}> = ({ frame, fps, hookText, imageUrl, gradStart }) => {
  const exitOpacity =
    frame > 75
      ? interpolate(frame, [75, 90], [1, 0], { extrapolateRight: "clamp" })
      : 1;

  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8 },
    delay: 5,
  });
  const titleY = interpolate(titleProgress, [0, 1], [120, 0]);
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

  const imgProgress = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.9 },
    delay: 15,
  });
  const imgScale = interpolate(imgProgress, [0, 1], [0.7, 1]);
  const imgOpacity = interpolate(imgProgress, [0, 1], [0, 1]);

  const underlineProgress = spring({
    frame,
    fps,
    config: { damping: 18 },
    delay: 25,
  });
  const underlineWidth = interpolate(underlineProgress, [0, 1], [0, 80]);

  return (
    <AbsoluteFill
      style={{
        opacity: exitOpacity,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Hook text */}
      <div
        style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          textAlign: "center",
          padding: "0 60px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.15,
            textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            letterSpacing: "-1px",
          }}
        >
          {hookText}
        </div>
        <div
          style={{
            width: `${underlineWidth}%`,
            height: 5,
            background: gradStart,
            borderRadius: 3,
            margin: "20px auto 0",
          }}
        />
      </div>

      {/* Product image */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          opacity: imgOpacity,
          transform: `scale(${imgScale})`,
        }}
      >
        <div
          style={{
            width: 500,
            height: 500,
            borderRadius: 30,
            overflow: "hidden",
            boxShadow: "0 20px 80px rgba(0,0,0,0.5)",
            border: "3px solid rgba(255,255,255,0.15)",
          }}
        >
          <Img
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 2: PRODUCT SHOWCASE
// ============================================================================

const ShowcaseScene: React.FC<{
  frame: number;
  fps: number;
  imageUrl: string;
  title: string;
  adCopy: string;
  categoryLabel: string;
  categoryEmoji: string;
  gradStart: string;
}> = ({
  frame,
  fps,
  imageUrl,
  title,
  adCopy,
  categoryLabel,
  categoryEmoji,
  gradStart,
}) => {
  const localFrame = frame - SCENE.SHOWCASE_START;

  const exitOpacity =
    localFrame > 195
      ? interpolate(localFrame, [195, 210], [1, 0], { extrapolateRight: "clamp" })
      : 1;

  const entrance = spring({
    frame: localFrame,
    fps,
    config: { damping: 15 },
  });

  const imgScale = interpolate(localFrame, [0, 210], [1, 1.06], {
    extrapolateRight: "clamp",
  });
  const imgY = interpolate(entrance, [0, 1], [60, 0]);
  const imgOpacity = interpolate(entrance, [0, 1], [0, 1]);

  const titleSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 14 },
    delay: 8,
  });
  const titleY = interpolate(titleSpring, [0, 1], [50, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  const copySpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 16 },
    delay: 20,
  });
  const copyY = interpolate(copySpring, [0, 1], [40, 0]);
  const copyOpacity = interpolate(copySpring, [0, 1], [0, 1]);

  const badgeSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 12 },
    delay: 2,
  });
  const badgeScale = interpolate(badgeSpring, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        opacity: exitOpacity,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Category badge */}
      <div
        style={{
          position: "absolute",
          top: 80,
          transform: `scale(${badgeScale})`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            padding: "12px 30px",
            borderRadius: 30,
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 28 }}>{categoryEmoji}</span>
          <span
            style={{
              fontSize: 24,
              color: "#fff",
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* Product image */}
      <div
        style={{
          transform: `translateY(${imgY}px) scale(${imgScale})`,
          opacity: imgOpacity,
          marginTop: -60,
        }}
      >
        <div
          style={{
            width: 700,
            height: 700,
            borderRadius: 40,
            overflow: "hidden",
            boxShadow:
              "0 30px 100px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.1), inset 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          <Img
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>

      {/* Text overlay panel */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "50px 50px 80px",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)",
        }}
      >
        <div
          style={{
            transform: `translateY(${titleY}px)`,
            opacity: titleOpacity,
            fontSize: 42,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            marginBottom: 16,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          }}
        >
          {title}
        </div>

        <div
          style={{
            width: 80,
            height: 4,
            background: gradStart,
            borderRadius: 2,
            marginBottom: 16,
          }}
        />

        <div
          style={{
            transform: `translateY(${copyY}px)`,
            opacity: copyOpacity,
            fontSize: 28,
            color: "rgba(255,255,255,0.9)",
            lineHeight: 1.5,
            textShadow: "0 1px 10px rgba(0,0,0,0.3)",
          }}
        >
          {adCopy}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 3: CALL TO ACTION
// ============================================================================

const CTAScene: React.FC<{
  frame: number;
  fps: number;
  ctaText: string;
  brandName: string;
  gradStart: string;
  imageUrl: string;
  title: string;
  categoryEmoji: string;
}> = ({
  frame,
  fps,
  ctaText,
  brandName,
  gradStart,
  imageUrl,
  title,
  categoryEmoji,
}) => {
  const localFrame = frame - SCENE.CTA_START;

  const imgSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 14 },
  });
  const imgScale = interpolate(imgSpring, [0, 1], [0.8, 1]);
  const imgOpacity = interpolate(imgSpring, [0, 1], [0, 1]);

  const ctaSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, mass: 0.8 },
    delay: 10,
  });
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.6, 1]);
  const ctaOpacity = interpolate(ctaSpring, [0, 1], [0, 1]);

  const brandSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 16 },
    delay: 20,
  });
  const brandY = interpolate(brandSpring, [0, 1], [30, 0]);
  const brandOpacity = interpolate(brandSpring, [0, 1], [0, 1]);

  const pulse =
    localFrame > 40
      ? interpolate(Math.sin((localFrame - 40) * 0.15), [-1, 1], [0.97, 1.03])
      : 1;

  const badgeSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 12 },
    delay: 30,
  });
  const badgeOpacity = interpolate(badgeSpring, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 120,
          opacity: imgOpacity,
          transform: `scale(${imgScale})`,
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 15px 50px rgba(0,0,0,0.4)",
            border: "2px solid rgba(255,255,255,0.15)",
          }}
        >
          <Img
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 450,
          fontSize: 28,
          color: "rgba(255,255,255,0.7)",
          textAlign: "center",
          padding: "0 60px",
          opacity: brandOpacity,
          fontWeight: 500,
        }}
      >
        {title}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 350,
          opacity: ctaOpacity,
          transform: `scale(${ctaScale * pulse})`,
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${gradStart}, ${adjustBrightness(gradStart, 30)})`,
            padding: "28px 70px",
            borderRadius: 60,
            boxShadow: `0 10px 40px ${gradStart}80`,
            border: "2px solid rgba(255,255,255,0.2)",
          }}
        >
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              color: "#fff",
              textShadow: "0 2px 10px rgba(0,0,0,0.3)",
              whiteSpace: "nowrap",
            }}
          >
            {ctaText}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 220,
          opacity: brandOpacity,
          transform: `translateY(${brandY}px)`,
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 2px 15px rgba(0,0,0,0.4)",
          }}
        >
          {categoryEmoji} {brandName}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 120,
          opacity: badgeOpacity,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(10px)",
            padding: "14px 40px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 30, color: "#EE4D2D", fontWeight: 900 }}>
            🛒
          </span>
          <span
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.8)",
              fontWeight: 600,
            }}
          >
            Tersedia di Shopee
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
