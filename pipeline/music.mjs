// Generates a calm instrumental bed via the ElevenLabs Music API. Cached: if the
// output exists it is reused, so rebuilds never re-spend credits.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROMPT =
  'Calm cinematic corporate underscore. Soft sustained synth pads with gentle warm piano and subtle strings, ' +
  'slow and evolving, hopeful but composed and professional. No drums, or only a very soft low pulse. ' +
  'Minimal, unobtrusive, restrained and modern, designed to sit quietly beneath spoken narration.';

// Ensure a music bed of at least lengthMs exists at outPath. Returns outPath.
export async function ensureMusic(outPath, lengthMs, prompt = DEFAULT_PROMPT) {
  if (existsSync(outPath)) { console.log(`  music: cached ${path.basename(outPath)}`); return outPath; }
  const KEY = process.env.ELEVENLABS_API_KEY;
  if (!KEY) throw new Error('ELEVENLABS_API_KEY required to generate music (or set music.enabled=false in demo.json)');
  await mkdir(path.dirname(outPath), { recursive: true });
  const ms = Math.min(600000, Math.max(60000, Math.ceil((lengthMs + 8000) / 1000) * 1000)); // pad 8s, clamp 1..10min
  console.log(`  music: generating ${(ms / 1000).toFixed(0)}s instrumental bed ...`);
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, music_length_ms: ms, model_id: 'music_v1', force_instrumental: true }),
  });
  if (!res.ok) throw new Error(`Music API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`  music: wrote ${outPath}`);
  return outPath;
}
