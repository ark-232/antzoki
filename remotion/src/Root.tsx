// Registers the "Demo" composition. Default props let Remotion Studio (`npm run studio`)
// and `selectComposition` work standalone, but render.mjs overrides them via inputProps
// with the parsed demo.json + timeline.json. calculateMetadata derives the total frame
// count from whatever props are active, so the timeline always matches the data.
import React from 'react';
import { Composition } from 'remotion';
import { Demo } from './Demo';
import { DemoCompProps, DEFAULT_ACCENT } from './types';

const FPS = 30;
const WIDTH = 1920; // POC renders 1080p for speed; 4K is just WIDTH/HEIGHT = 3840x2160.
const HEIGHT = 1080;
const INTRO_FRAMES = 4 * FPS; // 4s animated intro card
const FADE_FRAMES = 15;

// Minimal stand-in props so Studio has something to show before render.mjs feeds real
// data. Kept tiny on purpose; the real values come from the greyline artifacts at render.
const defaultProps: DemoCompProps = {
  brand: {
    accent: DEFAULT_ACCENT,
    kicker: 'FIELD WALKTHROUGH',
    beta: 'OFFLINE FIRST',
    intro: {
      title: 'Greyline',
      subtitle: 'Private, offline travel planning with operational security built in',
      stats: [
        { n: 'LOCAL', l: 'Runs offline on your machine' },
        { n: 'AES-256', l: 'Encrypted document vault' },
        { n: '26 ITEMS', l: 'Security posture checklist' },
      ],
    },
  },
  captions: [
    { id: 'dashboard', text: 'The mission dashboard is the home base.', startMs: 0, endMs: 4000 },
    { id: 'trips', text: 'Trips are where planning begins.', startMs: 4000, endMs: 8000 },
  ],
  introDurationInFrames: INTRO_FRAMES,
  fps: FPS,
  bodyVideoFile: null,
};

const totalFrames = (props: DemoCompProps): number => {
  const lastEndMs = props.captions.length
    ? Math.max(...props.captions.map((c) => c.endMs))
    : 0;
  const bodyFrames = Math.max(1, Math.round((lastEndMs / 1000) * props.fps));
  return props.introDurationInFrames + FADE_FRAMES + bodyFrames;
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={totalFrames(defaultProps)}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: totalFrames(props),
      fps: props.fps || FPS,
    })}
  />
);
