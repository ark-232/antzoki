---
name: antzoki
description: Produce a narrated demo video of a web application. Use when the user wants a product demo, feature walkthrough, screencast, or onboarding video of a running web app. Analyzes the codebase or running app, interviews the user, generates a storyboard and narration, then records with Playwright, narrates with ElevenLabs, and composites a 4K mp4 with ffmpeg.
argument-hint: "[url-or-path] [project-name]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Antzoki: demo-video director

You direct the creation of a narrated demo video for a web application. The pipeline lives at `${CLAUDE_PLUGIN_ROOT}/pipeline`. It is data-driven: a single `demo.json` (scenes, each with a narration line and a list of declarative UI steps) feeds three stages. Synthesize the voice, record the screen paced to the voice, then master and composite. Your job is to produce a good `demo.json` for this project and run the stages.

Never invent selectors or features. Resolve real selectors from the codebase and the running app, and confirm the product's story with the user.

## Prerequisites (check once)

```bash
node --version            # >= 20
ffmpeg -version | head -1  # required
pdftocairo -v 2>&1 | head -1  # poppler, only needed if the demo shows PDFs
cd "${CLAUDE_PLUGIN_ROOT}/pipeline" && npm install && npx playwright install chromium
```

The production voice needs `ELEVENLABS_API_KEY` in the project's `.env`. Without it the pipeline uses the macOS `say` voice, which is ideal for iterating. Never print the key; load it with `node --env-file=.env`.

## Workflow

### 1. Analyze the project
Delegate deep analysis to the bundled subagent so the main thread stays clean:

> Use the `demo-analyzer` agent to study the target (a codebase path or a running URL) and draft `demo.json`.

The agent mines routes, components, `data-testid`s, and accessible roles, finds any demo or seed mode for deterministic state, and proposes 10 to 16 scenes with a narration line and storyboard steps each. It writes a draft `demo.json` next to where the video will live (default `./antzoki-demo/demo.json`).

### 2. Interview the user
Before finalizing, ask the user (use the AskUserQuestion tool, one concise round, skip anything you already know from the code):
- The single story or value the demo should land, and the audience.
- The two or three features that matter most.
- Tone (the default is neutral and understated, not salesy).
- Branding for the title cards: product name, one-line subtitle, accent color, and any points of contact for the outro.

Fold the answers into `demo.json` (`brand` block and the scene order and narration).

### 3. Write the narration well
Edit each scene's `text`. Keep it neutral and declarative. No em dashes. No exclamation marks, ALL CAPS, or quotation marks for emphasis, because a text-to-speech engine reads those as stress and it sounds salesy. One idea per scene. Let the scenes that show slow or generated results run a little long, since the recording is paced to the narration.

### 4. Validate and dry-run (no credits, fast)
Make sure the target app is running, then:

```bash
cd "${CLAUDE_PLUGIN_ROOT}/pipeline"
TTS_PROVIDER=say node record.mjs /abs/path/to/demo.json
```

This uses the local voice and exercises every selector and the pacing. Fix any failing scene (the recorder writes `out/diag/fail-<scene>.png`). Iterate here until the run is clean. See `reference/storyboard-actions.md` for the full step vocabulary.

### 5. Pick a voice (optional but recommended)
```bash
cd "${CLAUDE_PLUGIN_ROOT}/pipeline"
node voice-audition.mjs search "documentary narration"   # find neutral male/female narrators
node voice-audition.mjs sample <voiceId>:Name <voiceId>:Name   # render the audition line
```
Play the samples, pick a neutral one, and set `voice.voice` in `demo.json` (or `ELEVENLABS_VOICE_ID`). Prefer documentary or news voices over commercial ones, and keep `style` at 0.

### 6. Final render
```bash
cd "${CLAUDE_PLUGIN_ROOT}/pipeline"
node --env-file=/abs/path/to/.env record.mjs /abs/path/to/demo.json
node --env-file=/abs/path/to/.env build.mjs  /abs/path/to/demo.json
```
The result is `<demo-dir>/out/<project>-demo.mp4` at 3840x2160. Verify loudness with `ffmpeg -i <file> -af ebur128 -f null -` (expect about -14 LUFS). Open it and review with the user.

### 7. Iterate, do not re-record from scratch
A UI change means editing the affected steps or lines and re-running. Voice clips are cached by content, so only changed scenes re-synthesize. Use `SKIP_VIDEO=1 node build.mjs ...` to rebuild audio without re-encoding video.

## Notes
- The `demo.json` schema is at `${CLAUDE_PLUGIN_ROOT}/schemas/demo.schema.json`; a complete worked example is at `${CLAUDE_PLUGIN_ROOT}/examples/example/demo.json`.
- Recording is deterministic Playwright `recordVideo`, not agentic clicking, so runs are repeatable.
- Keep transitions restrained and audio mastered once. The defaults already do this.
