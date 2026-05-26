// Provider-agnostic narration TTS. ElevenLabs (eleven_multilingual_v2 + request
// stitching + a fixed seed) when a key is present, otherwise the macOS `say`
// voice for fast iteration. Clips are written RAW with NO per-clip loudness; the
// whole program is mastered exactly once in build.mjs. Cached by content hash so
// re-runs reuse audio and do not re-spend credits.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);

// Subprocess backstop: a flaky or stuck say|ffmpeg|ffprobe must fail loudly, not
// hang the whole pipeline forever (it did, on the first real run). Clips are
// cached by content hash, so a re-run resumes without re-spending work.
const EXEC_TIMEOUT = Number(process.env.ANTZOKI_TTS_TIMEOUT || 120000);

// A neutral, documentary register read. style:0 is the biggest lever against a
// salesy delivery; stability mid-high flattens upspeak without going robotic.
const DEFAULT_SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true, speed: 0.98 };

// Resolve runtime config from overrides, then environment, then sane defaults.
export function resolveConfig(over = {}) {
  return {
    key: process.env.ELEVENLABS_API_KEY || '',
    // River: a relaxed, neutral, informative premade voice. Override per project.
    voice: over.voice || process.env.ELEVENLABS_VOICE_ID || 'SAz9YHcvj6GT2YYXdXww',
    // v2 is mandatory: request stitching is unsupported on v3.
    model: over.model || process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
    seed: Number(over.seed ?? process.env.ELEVENLABS_SEED ?? 7777),
    settings: over.settings || DEFAULT_SETTINGS,
    sayVoice: over.sayVoice || process.env.SAY_VOICE || 'Samantha',
    force: over.force || process.env.TTS_PROVIDER || '',
  };
}

export function pickProvider(cfg) {
  if (cfg.force) return cfg.force;
  return cfg.key ? 'elevenlabs' : 'say';
}

// Cache key over everything that affects the audio, including the stitching
// neighbors, so changing one line only re-synthesizes the scenes it touches.
export function keyFor(cfg, text, prev, next) {
  const p = pickProvider(cfg);
  const sig = p === 'elevenlabs'
    ? `el|${cfg.voice}@${cfg.model}|${JSON.stringify(cfg.settings)}|seed${cfg.seed}|p:${prev || ''}|n:${next || ''}`
    : `say:${cfg.sayVoice}`;
  return createHash('sha1').update(`${sig}|${text}`).digest('hex').slice(0, 12);
}

async function probeMs(wav) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { timeout: EXEC_TIMEOUT });
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function elevenlabs(cfg, text, mp3Path, prev, next) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}?output_format=mp3_44100_128`;
  const payload = { text, model_id: cfg.model, voice_settings: cfg.settings, seed: cfg.seed };
  if (prev) payload.previous_text = prev; // request stitching: read as one take
  if (next) payload.next_text = next;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await writeFile(mp3Path, Buffer.from(await res.arrayBuffer()));
}

async function sayMac(cfg, text, aiffPath) {
  await exec('say', ['-v', cfg.sayVoice, '-r', '178', '-o', aiffPath, text], { timeout: EXEC_TIMEOUT });
}

// text -> { wavPath, durationMs }. RAW 48k stereo wav (no normalization).
export async function synthesize(cfg, text, outDir, id, prev = '', next = '') {
  await mkdir(outDir, { recursive: true });
  const p = pickProvider(cfg);
  const hash = keyFor(cfg, text, prev, next);
  const wavPath = path.join(outDir, `${id}.wav`);
  const metaPath = path.join(outDir, `${id}.meta.json`);
  if (existsSync(wavPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8'));
      if (meta.hash === hash) return { wavPath, durationMs: meta.durationMs, provider: p, cached: true };
    } catch {}
  }
  const tmp = path.join(outDir, `${id}.${p === 'elevenlabs' ? 'mp3' : 'aiff'}`);
  if (p === 'elevenlabs') await elevenlabs(cfg, text, tmp, prev, next);
  else await sayMac(cfg, text, tmp);
  await exec('ffmpeg', ['-nostdin', '-y', '-i', tmp, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wavPath], { timeout: EXEC_TIMEOUT });
  const durationMs = await probeMs(wavPath);
  await writeFile(metaPath, JSON.stringify({ hash, provider: p, durationMs, chars: text.length }, null, 2));
  return { wavPath, durationMs, provider: p, cached: false };
}

// Synthesize every scene with request stitching (neighbor scripts) -> Map id -> result.
export async function synthesizeAll(scenes, outDir, over = {}) {
  const cfg = resolveConfig(over);
  const out = new Map();
  let totalChars = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const prev = scenes[i - 1]?.text || '';
    const next = scenes[i + 1]?.text || '';
    const r = await synthesize(cfg, s.text, outDir, s.id, prev, next);
    out.set(s.id, r);
    if (!r.cached) totalChars += s.text.length;
    console.log(`  tts[${r.provider}${r.cached ? ',cached' : ''}] ${s.id}: ${r.durationMs}ms (${s.text.length} chars)`);
  }
  console.log(`  tts provider=${pickProvider(cfg)} voice=${cfg.voice} model=${cfg.model} new chars: ${totalChars}`);
  return out;
}
