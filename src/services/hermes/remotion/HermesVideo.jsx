import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// ── Animated Text ────────────────────────────────────────────────

function AnimatedText({ text, delay = 0, color = '#fff', fontSize = 32, y = '40%', shadow = true }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const translateY = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 100 } });

  return (
    <div style={{
      position: 'absolute', top: y, left: '50%',
      transform: `translate(-50%, ${interpolate(translateY, [0, 1], [30, 0])}px)`,
      opacity, color, fontSize, fontWeight: 'bold',
      fontFamily: 'Arial, Helvetica, sans-serif',
      textAlign: 'center',
      textShadow: shadow ? '2px 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)' : 'none',
      zIndex: 10, width: '90%', lineHeight: 1.3,
    }}>
      {text}
    </div>
  );
}

// ── CTA Banner ───────────────────────────────────────────────────

function CTABanner({ text, link, delay = 0, color1 = '#667eea', color2 = '#764ba2' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame - delay, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const scale = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 120 } });

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%',
      transform: `translateX(-50%) scale(${interpolate(scale, [0, 1], [0.8, 1])})`,
      opacity,
      background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
      padding: '16px 32px', borderRadius: 16,
      textAlign: 'center', zIndex: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 6 }}>{text}</div>
      <div style={{ color: '#ffd700', fontSize: 14, fontFamily: 'monospace', wordBreak: 'break-all' }}>{link}</div>
    </div>
  );
}

// ── Watermark ────────────────────────────────────────────────────

function Watermark() {
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6,
      color: '#fff', fontSize: 11, fontFamily: 'monospace', zIndex: 20,
    }}>
      1AI Affiliate
    </div>
  );
}

// ── Category Badge ───────────────────────────────────────────────

function CategoryBadge({ category, color }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16,
      background: color, padding: '4px 12px', borderRadius: 8,
      color: '#fff', fontSize: 12, fontWeight: 'bold',
      textTransform: 'uppercase', zIndex: 20,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {category}
    </div>
  );
}

// ── Gradient Overlay ─────────────────────────────────────────────

function GradientOverlay({ color1, color2 }) {
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 150,
        background: `linear-gradient(180deg, ${color1}cc 0%, transparent 100%)`,
        zIndex: 5,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
        background: `linear-gradient(0deg, ${color2}cc 0%, transparent 100%)`,
        zIndex: 5,
      }} />
    </>
  );
}

// ── Main Composition ─────────────────────────────────────────────

export function HermesVideo({
  hookText = '🔥 Check this out!',
  ctaText = '👉 Link in comments',
  affiliateLink = '',
  category = 'fashion',
  bgGradient = ['#ec4899', '#f472b6'],
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${bgGradient[0]}15 0%, #0f0f23 50%, ${bgGradient[1]}15 100%)`,
      overflow: 'hidden',
    }}>
      {/* Gradient overlays */}
      <GradientOverlay color1={bgGradient[0]} color2={bgGradient[1]} />

      {/* Category badge */}
      <CategoryBadge category={category} color={bgGradient[0]} />

      {/* Watermark */}
      <Watermark />

      {/* Hook text (first 5 seconds) */}
      {frame < fps * 5 && (
        <AnimatedText text={hookText} delay={10} color="#ffffff" fontSize={36} y="30%" />
      )}

      {/* Main content area (animated) */}
      <div style={{
        position: 'absolute', top: '45%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center', zIndex: 10,
        opacity: interpolate(frame, [30, 45], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>
          {category === 'fashion' && '👗'}
          {category === 'kesehatan' && '💊'}
          {category === 'home living' && '🏠'}
          {category === 'fashion muslim' && '🕌'}
          {category === 'trading' && '📈'}
        </div>
        <div style={{ color: '#fff', fontSize: 18, fontFamily: 'Arial, sans-serif' }}>
          {category.charAt(0).toUpperCase() + category.slice(1)} Collection
        </div>
      </div>

      {/* CTA banner (last 5 seconds) */}
      {frame > durationInFrames - fps * 5 && (
        <CTABanner text={ctaText} link={affiliateLink} color1={bgGradient[0]} color2={bgGradient[1]} />
      )}

      {/* Bottom bar with link */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)', padding: '8px 20px', borderRadius: 20,
        color: '#ffd700', fontSize: 12, fontFamily: 'monospace',
        zIndex: 20, maxWidth: '80%', textAlign: 'center',
        opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        {affiliateLink}
      </div>
    </AbsoluteFill>
  );
}
