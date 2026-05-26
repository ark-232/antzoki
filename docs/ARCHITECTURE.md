# Architecture

Antzoki is four independent stages joined by two small data files. Keep the stages separate and each one stays simple, cheap to re-run, and easy to reason about.

```
demo.json ──▶  tts.mjs  ──▶  record.mjs  ──▶  build.mjs  ──▶  <project>-demo.mp4
 scenes        narration      Playwright       ffmpeg          4K, narrated
 + steps       (ElevenLabs)   page-only 4K     one master
               raw clips      paced to voice   + ducked music
```

The voice is generated before the browser opens. That ordering is the backbone: the recorder reads each clip's duration and holds the matching scene on screen for at least that long, so the picture is always paced to the words. The compositor never touches the voice until the end, when it masters the whole program in one pass.

## 1. The script and storyboard (`demo.json`)

One file holds the whole demo: an `app` block, a `brand` block for the title cards, and an ordered list of `scenes`. Each scene has a narration `text` and a list of declarative `steps` (`click`, `fill`, `softNav`, `generate`, `showAsset`, and so on). Scene ids join the stages. See `schemas/demo.schema.json` and `skills/antzoki/reference/storyboard-actions.md`.

## 2. The voice (`tts.mjs`)

ElevenLabs `eleven_multilingual_v2` with request stitching: every clip is sent its neighbors' text plus a fixed seed, so 16 separately generated clips read as one continuous take. Choose a neutral, documentary register voice and keep `style` at 0, which is the biggest lever against a salesy delivery. Clips are written RAW with no per-clip loudness, and cached by a content hash so only changed scenes re-synthesize. Without a key the pipeline uses the local macOS `say` voice for fast iteration.

## 3. The recording (`record.mjs`)

Playwright `recordVideo` captures the page surface only, never the desktop. True 4K comes from a 1920x1080 viewport at `deviceScaleFactor: 2` recorded at 3840x2160. Each scene runs its steps, then holds until the narration finishes plus a short tail. In-app navigations fade through a dark overlay so there is no white flash. Documents are fetched, rasterized to crisp pages, and shown in a dark viewer with a highlight and an eased scroll. Recording is deterministic, not agentic clicking, so runs are repeatable.

## 4. Compositing (`build.mjs`)

The single most important rule: never normalize per clip. Lay the raw clips onto a silent timeline, mix them dry, and master the whole bus once with a two-pass `loudnorm` to a broadcast target (default -14 LUFS, -1 dBTP). A calm instrumental bed is ducked under the voice with a sidechain compressor. Title cards get a slow push-in and the seams crossfade. The body is hard, continuous capture.

### Audio gotchas worth knowing
- `acompressor` `makeup` is linear gain, not decibels. Use `1` for unity.
- `alimiter` `limit` is a linear amplitude (`0.891` is about -1 dBFS).
- `alimiter` `level` defaults to true and renormalizes peaks back up, silently undoing your gain. Set `level=false`.
- `xfade` fails unless both inputs share a timebase. Force `settb=1/30` on every branch.

## Re-renderable, not re-recorded

Because the script and the step storyboard are data, a UI change means editing the affected steps or lines and re-running, not re-cutting a video. Cached clips mean only changed scenes re-synthesize. The demo becomes a build target that stays current with the product.
