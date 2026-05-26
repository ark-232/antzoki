// Audition ElevenLabs voices before committing one to a project. Self-contained:
// reads ELEVENLABS_API_KEY from the repo-root .env so it does not depend on shell
// env injection.
//   node pipeline/voice-audition.mjs search [query]   list Voice Library male narrators
//   node pipeline/voice-audition.mjs voices           list voices on your account
//   node pipeline/voice-audition.mjs sample id:Name id:Name ...   render the audition line
// Tuned NEUTRAL by default. Override: STAB, STYLE, SPEED, MODEL, LINE.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'audition');

async function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = await readFile(path.join(ROOT, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY not found (env or .env)');
  return m[1].replace(/^["']|["']$/g, '');
}

const MODEL = process.env.MODEL || 'eleven_multilingual_v2';
const SETTINGS = {
  stability: Number(process.env.STAB || 0.55),
  similarity_boost: 0.8,
  style: Number(process.env.STYLE || 0.0),
  use_speaker_boost: true,
  speed: Number(process.env.SPEED || 0.98),
};
const SEED = Number(process.env.SEED || 7777);

const LINE = process.env.LINE ||
  'This is the core of the product. You give it a short description, and it builds a complete, editable result in seconds. ' +
  'Nothing is locked in. You review everything and change whatever you want before committing. That control is the point.';

async function search(query) {
  const key = await loadKey();
  const params = new URLSearchParams({ gender: 'male', page_size: '40' });
  if (query) params.set('search', query);
  const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`shared-voices ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const voices = (data.voices || []).filter((v) =>
    /narrat|document|news|audiobook|neutral|professional|informative/i.test(
      `${v.category} ${(v.use_cases || []).join(' ')} ${v.descriptive || ''} ${v.description || ''}`));
  console.log(`# ${voices.length} candidates for "${query || ''}"`);
  for (const v of voices.slice(0, 24)) {
    console.log(`${v.voice_id}\t${v.name}\t[${v.accent || '?'} ${v.age || ''} ${v.descriptive || ''}]\tclones=${v.cloned_by_count || 0}`);
  }
}

async function listVoices() {
  const key = await loadKey();
  const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`voices ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  for (const v of data.voices || []) {
    const l = v.labels || {};
    console.log(`${v.voice_id}\t${v.name}\t[${l.gender || ''} ${l.accent || ''} ${l.descriptive || ''}]\t${v.category}`);
  }
}

async function sample(pairs) {
  const key = await loadKey();
  await mkdir(OUT, { recursive: true });
  console.log(`model=${MODEL} settings=${JSON.stringify(SETTINGS)} seed=${SEED}`);
  for (const pair of pairs) {
    const [id, name = id] = pair.split(':');
    const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const mp3 = path.join(OUT, `${safe}.mp3`);
    process.stdout.write(`  ${name} (${id}) ... `);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: LINE, model_id: MODEL, voice_settings: SETTINGS, seed: SEED }),
    });
    if (!res.ok) { console.log(`FAIL ${res.status}`); continue; }
    await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
    console.log(`ok -> ${path.relative(ROOT, mp3)}`);
  }
  console.log(`\nplay with:  for f in ${path.relative(ROOT, OUT)}/*.mp3; do echo $f; afplay $f; done`);
}

const [mode, ...args] = process.argv.slice(2);
const run = mode === 'search' ? search(args.join(' '))
  : mode === 'voices' ? listVoices()
  : mode === 'sample' ? sample(args)
  : Promise.reject(new Error('usage: search [q] | voices | sample id:Name ...'));
run.catch((e) => { console.error(e.message); process.exit(1); });
