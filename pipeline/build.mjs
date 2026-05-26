// Compositor. Reads <project>/out/timeline.json + out/tts/*.wav + out/raw/body.webm
// and demo.json (brand, audio target, music). Produces ONE mastered audio bus (no
// per-clip jumps), a ducked music bed, xfade card transitions, and the final mp4.
//
//   node build.mjs [path/to/demo.json]
//   SKIP_VIDEO=1 node build.mjs ...   reuse out/full_video.mp4, rebuild audio only
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { renderCards } from './cards.mjs';
import { ensureMusic } from './music.mjs';
import { computeTimeline, gainToTargetDb } from './lib/timeline.mjs';

const exec = promisify(execFile);
const DEMO_PATH = path.resolve(process.argv[2] || process.env.DEMO || 'demo.json');
const PROJ = path.dirname(DEMO_PATH);
const OUT = path.join(PROJ, 'out');
const RAW = path.join(OUT, 'raw');
const TTS = path.join(OUT, 'tts');
const CARDS = path.join(OUT, 'cards');

const F = 0.5, INTRO_PAD = 1.4, OUTRO_PAD = 2.0;
const PRE = 'highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=15:release=120:makeup=1'; // makeup is LINEAR
const LIMIT = '0.891'; // alimiter limit is LINEAR amplitude (~ -1 dBFS); level=false stops auto-renormalization

const FF_TIMEOUT = Number(process.env.ANTZOKI_FF_TIMEOUT || 1800000); // 30 min backstop for 4K encodes; turns a stuck ffmpeg into a clear failure
async function ff(args, label) { process.stdout.write(`  ffmpeg ${label} ... `); await exec('ffmpeg', ['-nostdin', '-y', '-hide_banner', '-loglevel', 'error', ...args], { timeout: FF_TIMEOUT }); console.log('ok'); }
async function probeSec(f) { const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { timeout: FF_TIMEOUT }); return parseFloat(stdout.trim()); }
const wav = (id) => path.join(TTS, `${id}.wav`);

async function buildCard(name, dur, W, H, VENC, fadeIn, fadeOut) {
  const frames = Math.round(dur * 30);
  let vf = `scale=8000:-1,zoompan=z='min(zoom+0.00012,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30`;
  if (fadeIn) vf += `,fade=t=in:st=0:d=1.0`;
  if (fadeOut) vf += `,fade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8`;
  vf += ',format=yuv420p';
  await ff(['-loop', '1', '-i', path.join(CARDS, `${name}.png`), '-vf', vf, '-t', dur.toFixed(2), ...VENC, '-an', path.join(OUT, `${name}.mp4`)], `${name} card (${dur.toFixed(1)}s)`);
}

async function assembleVideo(I, B, W, H, VENC, VFNORM) {
  const x1 = (I - F).toFixed(3), x2 = (I + B - 2 * F).toFixed(3);
  const fc = `[0:v]fps=30,format=yuv420p,settb=1/30[iv];` +
    `[1:v]${VFNORM},settb=1/30[bv];` +
    `[2:v]fps=30,format=yuv420p,settb=1/30[ov];` +
    `[iv][bv]xfade=transition=fade:duration=${F}:offset=${x1}[x1t];[x1t]settb=1/30[x1];` +
    `[x1][ov]xfade=transition=fade:duration=${F}:offset=${x2}[v]`;
  await ff(['-i', path.join(OUT, 'intro.mp4'), '-i', path.join(RAW, 'body.webm'), '-i', path.join(OUT, 'outro.mp4'),
    '-filter_complex', fc, '-map', '[v]', ...VENC, '-an', '-movflags', '+faststart', path.join(OUT, 'full_video.mp4')], 'assemble video (xfade)');
}

async function buildNarrDry(bodyScenes, bodyStartMs, outroStartMs) {
  const items = [{ wav: wav('intro'), d: 0 }];
  for (const s of bodyScenes) if (existsSync(wav(s.id))) items.push({ wav: wav(s.id), d: bodyStartMs + s.startMs });
  if (existsSync(wav('outro'))) items.push({ wav: wav('outro'), d: outroStartMs });
  const inArgs = items.flatMap((it) => ['-i', it.wav]);
  const delays = items.map((it, i) => `[${i}:a]adelay=${it.d}|${it.d}[a${i}]`).join(';');
  const mix = items.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${items.length}:normalize=0:dropout_transition=0[narr]`;
  await ff([...inArgs, '-filter_complex', `${delays};${mix}`, '-map', '[narr]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', path.join(OUT, 'narr_dry.wav')], 'narration dry bus');
}

async function masterAudio(I, TP) {
  const dry = path.join(OUT, 'narr_dry.wav');
  const { stderr } = await exec('ffmpeg', ['-nostdin', '-hide_banner', '-i', dry, '-af', `${PRE},loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`, '-f', 'null', '-'], { timeout: FF_TIMEOUT });
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const ln = `loudnorm=I=${I}:TP=${TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await ff(['-i', dry, '-af', `${PRE},${ln},alimiter=limit=${LIMIT}:level=false`, '-ar', '48000', '-ac', '2', path.join(OUT, 'narr_master.wav')], `master audio (measured ${m.input_i} -> ${I} LUFS)`);
}

async function buildProgramAudio(programDur, I, TP, music) {
  const master = path.join(OUT, 'narr_master.wav');
  const out = path.join(OUT, 'program.wav');
  if (music && music.enabled !== false) {
    const musicMp3 = path.join(OUT, 'music.mp3');
    await ensureMusic(musicMp3, programDur * 1000, music.prompt);
    await ff(['-stream_loop', '-1', '-i', musicMp3, '-t', programDur.toFixed(2),
      '-af', `loudnorm=I=-30:TP=-2:LRA=20,afade=t=in:st=0:d=2,afade=t=out:st=${(programDur - 2).toFixed(2)}:d=2`,
      '-ar', '48000', '-ac', '2', path.join(OUT, 'bed.wav')], 'music bed');
    const premix = path.join(OUT, 'premix.wav');
    const fc = `[1:a]asplit=2[sc][vo];[0:a][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400:detection=rms[dk];[dk][vo]amix=inputs=2:normalize=0[out]`;
    await ff(['-i', path.join(OUT, 'bed.wav'), '-i', master, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-ac', '2', premix], 'duck + mix music');
    const { stderr } = await exec('ffmpeg', ['-nostdin', '-hide_banner', '-i', premix, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`, '-f', 'null', '-'], { timeout: FF_TIMEOUT });
    const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
    const gain = gainToTargetDb(parseFloat(m.input_i), I);
    await ff(['-i', premix, '-af', `volume=${gain}dB,alimiter=limit=${LIMIT}:level=false`, '-ar', '48000', '-ac', '2', out], `re-anchor ${m.input_i} -> ${I} LUFS (${gain}dB)`);
  } else {
    await ff(['-i', master, '-c:a', 'pcm_s16le', out], 'program audio (no music)');
  }
}

async function main() {
  const demo = JSON.parse(await readFile(DEMO_PATH, 'utf8'));
  if (!existsSync(path.join(RAW, 'body.webm'))) throw new Error('missing out/raw/body.webm — run record.mjs first');
  const cardIds = (demo.scenes || []).filter((s) => s.kind === 'card').map((s) => s.id);
  for (const id of ['intro', 'outro']) {
    if (!existsSync(wav(id))) throw new Error(`build expects a card scene with id "${id}" (its narration ${path.basename(wav(id))} is missing). Card scene ids present: [${cardIds.join(', ') || 'none'}]. Name the first and last card scenes "intro" and "outro".`);
  }
  const tl = JSON.parse(await readFile(path.join(OUT, 'timeline.json'), 'utf8'));

  const W = demo.video?.width || 3840, H = demo.video?.height || 2160;
  const VENC = ['-c:v', 'libx264', '-preset', 'faster', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30'];
  const VFNORM = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`;
  const lufs = demo.audio?.lufs ?? -14, tp = demo.audio?.tp ?? -1.0;
  const project = demo.project || 'demo';
  const FINAL = path.join(OUT, `${project}-demo.mp4`);

  const introNarr = await probeSec(wav('intro'));
  const outroNarr = await probeSec(wav('outro'));
  const B = await probeSec(path.join(RAW, 'body.webm'));
  const { I, O, bodyStart, outroStart, programDur } = computeTimeline({ introNarr, outroNarr, bodyDur: B, introPad: INTRO_PAD, outroPad: OUTRO_PAD, fade: F });
  console.log(`  timeline: intro ${I.toFixed(1)}s | body ${B.toFixed(1)}s | outro ${O.toFixed(1)}s | total ${programDur.toFixed(1)}s`);

  if (process.env.SKIP_VIDEO && existsSync(path.join(OUT, 'full_video.mp4'))) {
    console.log('Video... (reusing full_video.mp4)');
  } else {
    console.log('Video...'); await renderCards(demo.brand || {}, CARDS, { width: W, height: H });
    await buildCard('intro', I, W, H, VENC, true, false);
    await buildCard('outro', O, W, H, VENC, false, true);
    await assembleVideo(I, B, W, H, VENC, VFNORM);
  }

  console.log('Audio...');
  await buildNarrDry(tl.scenes, Math.round(bodyStart * 1000), Math.round((outroStart + 0.4) * 1000));
  await masterAudio(lufs, tp);
  await buildProgramAudio(programDur, lufs, tp, demo.music || { enabled: true });

  console.log('Mux...');
  await ff(['-i', path.join(OUT, 'full_video.mp4'), '-i', path.join(OUT, 'program.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', FINAL], 'mux');

  const ms = Math.round((await probeSec(FINAL)) * 1000);
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', FINAL]);
  console.log(`\nFINAL: ${FINAL}\n  ${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s | ${stdout.trim()}`);
}

main().catch((e) => { console.error('BUILD FAILED:', e.message); process.exit(1); });
