// Scene-level lower-third caption track — the headline capability antzoki currently
// lacks. Each caption is keyed to its scene's body-relative {startMs,endMs} from the
// real recording (out/timeline.json), so it lights up exactly when that scene's
// narration plays. Captions fade in/out at their window edges.
//
// NOTE: this is SCENE-level (one caption per scene). True word-level / karaoke timing
// would come from a forced-aligner — e.g. @remotion/install-whisper-cpp (transcribe the
// rendered narration wav) or @remotion/elevenlabs (request character timestamps from the
// same ElevenLabs TTS antzoki already uses). Both emit per-token {text,startMs,endMs}
// that would slot into the same render path below, just with finer-grained rows.
import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionRow, DEFAULT_ACCENT } from './types';

const FADE_MS = 250;

export const Captions: React.FC<{ captions: CaptionRow[]; accent: string }> = ({
  captions,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  // Captions are windowed; at most one is on screen at a time for these scenes.
  const active = captions.find((c) => nowMs >= c.startMs && nowMs < c.endMs);
  if (!active) return null;

  const fadeIn = interpolate(nowMs, [active.startMs, active.startMs + FADE_MS], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(nowMs, [active.endMs - FADE_MS, active.endMs], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(opacity, [0, 1], [24, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 90,
        fontFamily: "'Helvetica Neue','Inter',Arial,sans-serif",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${rise}px)`,
          maxWidth: '78%',
          background: 'rgba(10,20,35,0.82)',
          backdropFilter: 'blur(6px)',
          borderLeft: `6px solid ${accent}`,
          borderRadius: 10,
          padding: '24px 36px',
          color: '#fff',
          fontSize: 38,
          lineHeight: 1.28,
          fontWeight: 500,
          textAlign: 'center',
          boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};

Captions.defaultProps = { accent: DEFAULT_ACCENT } as Partial<{
  captions: CaptionRow[];
  accent: string;
}>;
