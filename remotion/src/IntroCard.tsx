// Animated intro title card. Visual parity with antzoki's pipeline/cards.mjs
// (dark navy gradient, accent rule, letterspaced kicker, big title, subtitle, stats
// with accent numbers + muted labels, beta footer) — but each element springs/slides
// in on a stagger, which the static PNG path cannot do.
//
// Sizes here are the cards.mjs values scaled x2 for a 1080p (vs cards.mjs's internal
// 1920x1080 -> 4K@dsf2). At a 1920x1080 composition we use the cards.mjs numbers as-is.
import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Brand, DEFAULT_ACCENT } from './types';

// One spring-driven entrance: returns {opacity, translateY} for a staggered reveal.
const useReveal = (delayFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delayFrames;
  const progress = spring({
    frame: local,
    fps,
    config: { damping: 200, mass: 0.6, stiffness: 120 },
  });
  const opacity = interpolate(local, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(progress, [0, 1], [40, 0]);
  return { opacity, transform: `translateY(${translateY}px)` };
};

export const IntroCard: React.FC<{ brand: Brand }> = ({ brand }) => {
  const accent = brand.accent || DEFAULT_ACCENT;
  const intro = brand.intro || {};
  const stats = intro.stats || [];

  // Whole-card slow zoom-in (matches the ffmpeg zoompan z='min(zoom+...,1.06)').
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateRight: 'clamp',
  });

  const kicker = useReveal(0);
  const rule = useReveal(4);
  const title = useReveal(8);
  const sub = useReveal(16);
  const statsReveal = useReveal(26);
  const foot = useReveal(34);

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(135deg,#0e1a2f 0%,#1a2c4e 60%,#16243f 100%)',
        color: '#fff',
        fontFamily: "'Helvetica Neue','Inter',Arial,sans-serif",
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          padding: '120px 150px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {brand.kicker ? (
          <>
            <div
              style={{
                color: accent,
                letterSpacing: '.32em',
                fontSize: 24,
                fontWeight: 700,
                ...kicker,
              }}
            >
              {brand.kicker}
            </div>
            <div
              style={{
                width: 300,
                height: 4,
                background: accent,
                marginTop: 28,
                ...rule,
              }}
            />
          </>
        ) : null}

        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            lineHeight: 1,
            marginTop: 54,
            letterSpacing: -2,
            ...title,
          }}
        >
          {intro.title || 'Product'}
        </div>

        {intro.subtitle ? (
          <div
            style={{
              fontSize: 46,
              fontWeight: 500,
              color: '#d6e0f0',
              marginTop: 30,
              ...sub,
            }}
          >
            {intro.subtitle}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        {stats.length ? (
          <div style={{ display: 'flex', gap: 90, ...statsReveal }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div
                  style={{
                    color: accent,
                    fontSize: 40,
                    fontWeight: 800,
                    letterSpacing: '.04em',
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    color: '#9fb0c9',
                    fontSize: 24,
                    marginTop: 8,
                    letterSpacing: '.06em',
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 50,
            ...foot,
          }}
        >
          <span
            style={{
              color: accent,
              letterSpacing: '.22em',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            {brand.beta || ''}
          </span>
          <span style={{ color: '#76869f', letterSpacing: '.2em', fontSize: 22 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
