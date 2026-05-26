// Node render driver for the Remotion POC. Reuses antzoki's real artifacts unchanged:
//   demo.json       -> brand block (intro card) + scene narration `text`
//   out/timeline.json -> body-relative {id,startMs,endMs} per scene
// It joins them into caption rows, then bundle() -> selectComposition() -> renderMedia()
// to produce remotion/out/<project>-remotion-poc.mp4.
//
//   node render.mjs <demo.json> <timeline.json> [--full] [--no-video]
//   npm run render:greyline
//
// Defaults to the greyline example. By default we render a SHORT clip (intro card + the
// first few caption scenes) to keep render time low; pass --full for the whole body.
// Rendering 4K instead of 1080p is purely a composition-size change in src/Root.tsx.
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const DEMO_PATH = path.resolve(args[0] || path.join(__dirname, '../examples/greyline/demo.json'));
const TIMELINE_PATH = path.resolve(
  args[1] || path.join(path.dirname(DEMO_PATH), 'out/timeline.json'),
);
const PROJ_OUT = path.dirname(TIMELINE_PATH);

// How many leading caption scenes to keep in the short POC clip. Default 2 (~25s with
// the 4s intro) keeps the 4K-decode render time reasonable while still showing the
// caption track switch between scenes. Use --full or SCENE_LIMIT for more.
const SCENE_LIMIT = flags.has('--full') ? Infinity : Number(process.env.SCENE_LIMIT || 2);
const WITH_VIDEO = !flags.has('--no-video'); // embed body.webm behind captions if present

const log = (...a) => console.log('[render]', ...a);

async function main() {
  if (!existsSync(DEMO_PATH)) throw new Error(`demo.json not found: ${DEMO_PATH}`);
  if (!existsSync(TIMELINE_PATH)) throw new Error(`timeline.json not found: ${TIMELINE_PATH}`);

  const demo = JSON.parse(await readFile(DEMO_PATH, 'utf8'));
  const timeline = JSON.parse(await readFile(TIMELINE_PATH, 'utf8'));

  // Map scene id -> narration text from demo.json (skip the intro/outro CARD scenes;
  // those become the title cards, not body captions).
  const textById = new Map(
    (demo.scenes || [])
      .filter((s) => s.kind !== 'card' && s.text)
      .map((s) => [s.id, s.text]),
  );

  // Join timeline timings (body-relative ms) with narration text -> caption rows.
  let captions = (timeline.scenes || [])
    .filter((s) => textById.has(s.id))
    .map((s) => ({
      id: s.id,
      text: textById.get(s.id),
      startMs: s.startMs,
      endMs: s.endMs,
    }));

  if (Number.isFinite(SCENE_LIMIT)) captions = captions.slice(0, SCENE_LIMIT);
  if (!captions.length) throw new Error('no caption rows produced — check demo/timeline ids');

  // Re-base the clip to start at the first kept caption so the body video and captions
  // line up at body ms 0 (the full timeline starts the first scene at 0 anyway).
  const baseMs = captions[0].startMs;
  captions = captions.map((c) => ({ ...c, startMs: c.startMs - baseMs, endMs: c.endMs - baseMs }));

  const fps = demo.video?.fps || 30;
  const introDurationInFrames = Math.round(4 * fps); // 4s animated intro card

  // Optional body video layer. OffthreadVideo can't fetch a bare file:// URL, so we
  // expose the recording's directory as the bundle publicDir and reference the file by
  // name via staticFile() in the component. No copy/symlink, fully portable.
  const rawDir = path.join(PROJ_OUT, 'raw');
  const bodyWebm = path.join(rawDir, 'body.webm');
  const haveBody = WITH_VIDEO && existsSync(bodyWebm);
  const bodyVideoFile = haveBody ? 'body.webm' : null;

  const inputProps = {
    brand: demo.brand || {},
    captions,
    introDurationInFrames,
    fps,
    bodyVideoFile,
  };

  log(`demo:     ${DEMO_PATH}`);
  log(`timeline: ${TIMELINE_PATH}`);
  log(`captions: ${captions.length} scene(s) -> ${captions.map((c) => c.id).join(', ')}`);
  log(`body video: ${haveBody ? bodyWebm : '(none / skipped)'}`);

  log('bundling composition...');
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, 'src/index.ts'),
    // Expose the recording dir so staticFile('body.webm') resolves to the real capture.
    // symlinkPublicDir avoids copying the (multi-MB) webm into the throwaway bundle.
    publicDir: haveBody ? rawDir : undefined,
    symlinkPublicDir: true,
    onProgress: (p) => process.stdout.write(`\r[render] bundle ${p}%   `),
  });
  process.stdout.write('\n');
  log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${serveUrl}`);

  const composition = await selectComposition({
    serveUrl,
    id: 'Demo',
    inputProps,
  });
  log(
    `composition: ${composition.width}x${composition.height} @ ${composition.fps}fps, ` +
      `${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`,
  );

  const project = demo.project || 'demo';
  const outFile = path.join(__dirname, 'out', `${project}-remotion-poc.mp4`);

  log('rendering mp4...');
  const tr = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outFile,
    inputProps,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r[render] render ${Math.round(progress * 100)}%   `),
  });
  process.stdout.write('\n');
  log(`rendered in ${((Date.now() - tr) / 1000).toFixed(1)}s`);
  log(`OUTPUT: ${outFile}`);
}

main().catch((e) => {
  console.error('[render] FAILED:', e?.stack || e?.message || e);
  process.exit(1);
});
