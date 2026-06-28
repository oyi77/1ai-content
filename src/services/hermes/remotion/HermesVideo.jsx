import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  Video,
  staticFile,
} from 'remotion';

// ── Animated Text Component ─────────────────────────────────────

function AnimatedText({ text, delay = 0, color = '#ffffff', fontSize = 32, y = '40%' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const translateY = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: '50%',
        transform: `translate(-50%, ${interpolate(translateY, [0, 1], [20, 0])}px)`,
        opacity,
        color,
        fontSize,
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        zIndex: 10,
      }}
    >
      {text}
    </div>
  );
}

// ── CTA Banner Component ────────────────────────────────────────

function CTABanner({ text, link, delay = 0 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame - delay, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 120 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: `translateX(-50%) scale(${interpolate(scale, [0, 1], [0.8, 1])})`,
        opacity,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '12px 24px',
        borderRadius: 12,
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
        {text}
      </div>
      <div style={{ color: '#ffd700', fontSize: 14, fontFamily: 'monospace' }}>
        {link}
      </div>
    </div>
  );
}

// ── Watermark Component ─────────────────────────────────────────

function Watermark({ text = '1AI Affiliate' }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        background: 'rgba(0,0,0,0.5)',
        padding: '4px 8px',
        borderRadius: 4,
        color: '#fff',
        fontSize: 10,
        fontFamily: 'monospace',
        zIndex: 20,
      }}
    >
      {text}
    </div>
  );
}

// ── Main Composition ────────────────────────────────────────────

export function HermesVideoComposition({
  videoSrc,
  category = 'fashion',
  hookText = '🔥 Check this out!',
  ctaText = '👉 Link in comments',
  affiliateLink = '',
  durationFrames = 900, // 30 seconds at 30fps
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Category-specific colors
  const categoryColors = {
    fashion: { primary: '#ec4899', secondary: '#f472b6' },
    kesehatan: { primary: '#10b981', secondary: '#34d399' },
    'home living': { primary: '#6366f1', secondary: '#818cf8' },
    'fashion muslim': { primary: '#8b5cf6', secondary: '#a78bfa' },
    trading: { primary: '#f59e0b', secondary: '#fbbf24' },
  };

  const colors = categoryColors[category] || categoryColors.fashion;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Video background */}
      {videoSrc && (
        <Video
          src={videoSrc}
          startFrom={0}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* Gradient overlay at top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          background: `linear-gradient(180deg, ${colors.primary}88 0%, transparent 100%)`,
          zIndex: 5,
        }}
      />

      {/* Hook text (first 5 seconds) */}
      <Sequence from={0} durationInFrames={fps * 5}>
        <AnimatedText
          text={hookText}
          delay={15}
          color="#ffffff"
          fontSize={28}
          y="15%"
        />
      </Sequence>

      {/* CTA banner (last 5 seconds) */}
      <Sequence from={durationFrames - fps * 5} durationInFrames={fps * 5}>
        <CTABanner
          text={ctaText}
          link={affiliateLink}
          delay={0}
        />
      </Sequence>

      {/* Watermark */}
      <Watermark text="1AI Affiliate" />

      {/* Category badge */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: colors.primary,
          padding: '4px 10px',
          borderRadius: 6,
          color: '#fff',
          fontSize: 11,
          fontWeight: 'bold',
          textTransform: 'uppercase',
          zIndex: 20,
        }}
      >
        {category}
      </div>
    </AbsoluteFill>
  );
}
