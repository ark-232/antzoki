<div align="center">

# Antzoki

### Point Claude Code at a web app. Get a narrated 4K demo video.

No screen recorder. No editor. No re-shoots. One command turns a running web app into a polished, narrated product demo, and a small JSON file keeps it in sync forever.

[![tests](https://github.com/ark-232/antzoki/actions/workflows/ci.yml/badge.svg)](https://github.com/ark-232/antzoki/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#requirements)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757.svg)](#install)

</div>

```
/antzoki http://localhost:3000 my-product
```

Claude Code studies your app, asks you a few sharp questions, writes the script and the storyboard, then records, narrates, and composites a finished video while you do something else.

The name is Basque for "theater": the place where a show is staged.

---

## The pipeline

```
demo.json ──▶  tts  ──▶  record  ──▶  build  ──▶  my-product-demo.mp4
 scenes        voice     Playwright   ffmpeg        3840 x 2160
 + UI steps   (ElevenLabs) page-only   one master    narrated
              raw + cached  4K capture  + ducked bed   broadcast loudness
```

Four stages, two data files, zero manual editing. The voice is generated first, the recording is paced to the voice, and the whole program is mastered once at the end. That last discipline is what kills the loudness jumps that make automated demos sound cheap.

## Why it is different

Screen recorders capture you fumbling through a UI. Slideshow tools fake the product. Antzoki does neither.

- **Code-aware.** A subagent reads your routes, components, and test ids to script *real* selectors and *real* features, not guesses.
- **A voice that is neither robotic nor salesy.** ElevenLabs `multilingual_v2` with request stitching and a neutral, documentary voice, mastered to one broadcast loudness.
- **It interviews you.** It asks about audience, story, and branding before writing a single line.
- **Re-renderable, not re-recorded.** Your demo is a `demo.json`. When the UI changes, you edit the affected steps and re-run. Cached voice clips mean only the scenes you changed re-synthesize. Commercial screen recorders cannot do this.

## Install

The repo is a single-plugin marketplace:

```
/plugin marketplace add ark-232/antzoki
/plugin install antzoki@antzoki
```

Then, from inside any project:

```
/antzoki http://localhost:3000 my-product
```

If the target is omitted, it will ask. It confirms the app is reachable before doing anything.

## Requirements

- Node 20+, `ffmpeg`, and `poppler` (`pdftocairo`, only if your demo shows PDFs).
- Playwright Chromium: `cd pipeline && npm install && npx playwright install chromium`.
- An `ELEVENLABS_API_KEY` for the production voice (`cp .env.example .env`). Without it, the macOS `say` voice is used, which is perfect for iterating.

## Run the pipeline directly (no plugin)

Everything is also plain scripts against a `demo.json`:

```bash
cd pipeline
npm install && npx playwright install chromium

# fast iteration with the local voice, no key, no credits
TTS_PROVIDER=say node record.mjs ../examples/example/demo.json

# production voice + composite (key loaded from .env, never printed)
node --env-file=../.env record.mjs ../examples/example/demo.json
node --env-file=../.env build.mjs  ../examples/example/demo.json
# -> ../examples/example/out/example-demo.mp4
```

`SKIP_VIDEO=1 node build.mjs ...` rebuilds the audio without re-encoding the video.

## The demo spec

A `demo.json` has an `app` block, a `brand` block for the title cards, and an ordered list of `scenes`. Each scene has a narration `text` and a list of declarative `steps` (`click`, `fill`, `softNav`, `generate`, `showAsset`, and more). Cards have no steps.

- `schemas/demo.schema.json` for the full shape
- `skills/antzoki/reference/storyboard-actions.md` for the action vocabulary
- `examples/example/demo.json` for a complete, working template

## Pick a voice

```bash
cd pipeline
node voice-audition.mjs search "documentary narration"
node voice-audition.mjs sample <voiceId>:Name <voiceId>:Name
```

Play the samples, set `voice.voice` in `demo.json`. Prefer documentary or news voices, keep `style` at 0.

## Tests

```bash
cd pipeline && node --test
```

Unit tests cover variable interpolation, locator resolution, the timeline math, the demo validator (it validates the bundled example), and the TTS config and cache key. CI runs them on Node 20, 22, and 24.

## How it works

A full technical write-up is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): recording, voice, video and audio compositing, and the gotchas that took real debugging (single-master loudness, the `alimiter` auto-level trap, the `xfade` timebase fix).

## Prior art

Inspired by the Claude Code ecosystem and projects like `splitbrain/ndemo` and `digitalsamba/claude-code-video-toolkit`. Antzoki's distinctive bets are the code-aware storyboard, the neutral mastered voice, and the re-renderable spec.

## License

MIT.

<div align="center"><sub>Made by ark-232.</sub></div>
