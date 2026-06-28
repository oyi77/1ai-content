import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { HermesVideo } from './HermesVideo';

const RemotionRoot = () => (
  <>
    <Composition
      id="HermesVideo"
      component={HermesVideo}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        hookText: '🔥 Check this out!',
        ctaText: '👉 Link in comments',
        affiliateLink: 'https://shopee.co.id/abc123',
        category: 'fashion',
        bgGradient: ['#ec4899', '#f472b6'],
      }}
    />
    <Composition
      id="HermesCompilation"
      component={HermesVideo}
      durationInFrames={2700}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        hookText: '🔥 Best of Fashion 2026!',
        ctaText: '👉 Link in bio',
        affiliateLink: 'https://shopee.co.id/abc123',
        category: 'fashion',
        bgGradient: ['#ec4899', '#f472b6'],
      }}
    />
  </>
);

registerRoot(RemotionRoot);
