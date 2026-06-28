import React from 'react';
import { Composition } from 'remotion';
import { HermesVideoComposition } from './HermesVideo';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="HermesVideo"
        component={HermesVideoComposition}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoSrc: '',
          category: 'fashion',
          hookText: '🔥 Check this out!',
          ctaText: '👉 Link in comments',
          affiliateLink: '',
          durationFrames: 900,
        }}
      />
    </>
  );
};
