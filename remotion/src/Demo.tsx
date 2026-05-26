// Top-level composition: animated intro card -> (body video + caption track),
// joined by a fade that mirrors antzoki's ffmpeg xfade between intro and body.
//
// Timing model:
//   - intro runs for `introDurationInFrames`
//   - the body segment's length is derived from the captions we pass in (last endMs),
//     so the POC clip stays short without hard-coding a duration.
//   - captions use body-relative ms (timeline.json), and the Captions track lives
//     INSIDE the body sequence, so frame 0 of that sequence == body ms 0. That keeps
//     the same startMs/endMs numbers antzoki's compositor already trusts.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { IntroCard } from './IntroCard';
import { Captions } from './Captions';
import { DemoCompProps, DEFAULT_ACCENT } from './types';

const FADE_FRAMES = 15; // ~0.5s at 30fps, same feel as build.mjs F=0.5

const BodySegment: React.FC<{
  bodyVideoFile: string | null;
  captions: DemoCompProps['captions'];
  accent: string;
}> = ({ bodyVideoFile, captions, accent }) => (
  <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
    {bodyVideoFile ? (
      // OffthreadVideo decodes via ffmpeg off the main thread — handles the VP8 webm
      // antzoki records. staticFile() resolves the name against the bundle publicDir.
      // Optional layer: proves compositing real captured footage works.
      <OffthreadVideo src={staticFile(bodyVideoFile)} muted />
    ) : null}
    <Captions captions={captions} accent={accent} />
  </AbsoluteFill>
);

export const Demo: React.FC<DemoCompProps> = ({
  brand,
  captions,
  introDurationInFrames,
  fps,
  bodyVideoFile,
}) => {
  const accent = brand.accent || DEFAULT_ACCENT;
  const lastEndMs = captions.length ? Math.max(...captions.map((c) => c.endMs)) : 0;
  const bodyFrames = Math.max(1, Math.round((lastEndMs / 1000) * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={introDurationInFrames}>
          <IntroCard brand={brand} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={bodyFrames + FADE_FRAMES}>
          <BodySegment
            bodyVideoFile={bodyVideoFile}
            captions={captions}
            accent={accent}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
