// Shapes mirror antzoki's real artifacts so the same JSON files drive both engines.
//   demo.json      -> brand block + scenes[] (with narration `text`)
//   out/timeline.json -> per body-scene {id, startMs, endMs} from the real recording
// We deliberately reuse these verbatim: nothing here re-exports or rewrites antzoki data.

export type Stat = { n: string; l: string };

export type BrandIntro = {
  title?: string;
  subtitle?: string;
  arch?: string;
  stats?: Stat[];
};

export type Brand = {
  accent?: string;
  kicker?: string;
  beta?: string;
  intro?: BrandIntro;
  outro?: { title?: string; subtitle?: string; footer?: string };
};

export type Scene = {
  id: string;
  kind?: string; // "card" for intro/outro
  text?: string; // narration -> caption source
};

export type DemoJson = {
  project?: string;
  brand?: Brand;
  scenes?: Scene[];
  video?: { fps?: number };
};

// timeline.json scene timings are BODY-RELATIVE: the first body scene starts at 0.
export type TimelineScene = { id: string; startMs: number; endMs: number; narrMs?: number };
export type Timeline = { scenes: TimelineScene[] };

// What render.mjs passes through inputProps. Caption rows are pre-joined here so the
// composition itself does no demo<->timeline matching at render time (keeps it pure).
export type CaptionRow = { id: string; text: string; startMs: number; endMs: number };

export type DemoCompProps = {
  brand: Brand;
  captions: CaptionRow[];
  introDurationInFrames: number;
  fps: number;
  // Filename of the body recording RELATIVE to the bundle's publicDir (render.mjs
  // points publicDir at the project's out/raw), resolved via staticFile() in the
  // component. null skips the video layer. (OffthreadVideo rejects bare file:// URLs,
  // so a real recording must be served as a static asset — this is that path.)
  bodyVideoFile: string | null;
};

export const DEFAULT_ACCENT = '#eaff5e';
