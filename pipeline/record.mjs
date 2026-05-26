// Storyboard-driven demo recorder. Reads a demo.json (app + scenes of declarative
// steps), drives the live app with Playwright, records PAGE-ONLY 4K, paces each
// scene to its pre-synthesized narration, and writes a timeline for the audio mux.
// Soft navigations remove white flashes; assets (PDFs/images) are shown in a
// polished viewer with an eased scroll and a highlight.
//
//   node record.mjs [path/to/demo.json]      (defaults to ./demo.json)
//   TTS_PROVIDER=say node record.mjs ...      fast iteration with the local voice
//   node --env-file=.env record.mjs ...       production voice (key from .env)
import { chromium, expect } from '@playwright/test';
import { synthesizeAll } from './tts.mjs';
import { interpolate } from './lib/interpolate.mjs';
import { locatorSpec, toMatcher } from './lib/locator.mjs';
import { validateDemo } from './lib/validate.mjs';
import { readFile, writeFile, mkdir, rename, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import path from 'node:path';

const exec = promisify(execFile);
const log = (...a) => console.log(...a);

const DEMO_PATH = path.resolve(process.argv[2] || process.env.DEMO || 'demo.json');
const PROJ = path.dirname(DEMO_PATH);
const OUT = path.join(PROJ, 'out');
const RAW = path.join(OUT, 'raw');
const TTS = path.join(OUT, 'tts');
const DIAG = path.join(OUT, 'diag');
const ARTROOT = path.join(OUT, 'artifacts');
const ART_PORT = Number(process.env.ART_PORT || 8091);
const ART_BASE = `http://127.0.0.1:${ART_PORT}`;
const HEADFUL = process.env.HEADLESS ? false : true;

function startArtServer() {
  const srv = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
      const fp = path.join(OUT, rel);
      if (!fp.startsWith(OUT)) { res.statusCode = 403; return res.end(); }
      const buf = await readFile(fp);
      const ext = path.extname(fp);
      res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream');
      res.end(buf);
    } catch { res.statusCode = 404; res.end(); }
  });
  return new Promise((r) => srv.listen(ART_PORT, '127.0.0.1', () => r(srv)));
}

async function main() {
  const demo = JSON.parse(await readFile(DEMO_PATH, 'utf8'));
  const v = validateDemo(demo);
  if (!v.ok) { console.error('Invalid demo.json:\n - ' + v.errors.join('\n - ')); process.exit(1); }

  const APP = process.env.APP_URL || demo.app.url;
  const NAV_BG = demo.app.navBg || '#0a0e1a';
  const HIDE = demo.app.hideSelectors || [];
  const vp = demo.video?.viewport || { width: 1920, height: 1080 };
  const scale = demo.video?.scale || 2;
  const recSize = { width: demo.video?.width || vp.width * scale, height: demo.video?.height || vp.height * scale };
  const TAIL_PAD_MS = demo.tailPadMs ?? 800;
  const accent = demo.brand?.accent || '#c8a24a';

  await mkdir(RAW, { recursive: true });
  await mkdir(DIAG, { recursive: true });
  await mkdir(ARTROOT, { recursive: true });
  await rm(path.join(RAW, 'body.webm'), { force: true }).catch(() => {});

  log('Preflight:');
  try { const r = await fetch(APP); log(`  app ${APP}: ${r.status}`); }
  catch (e) { log(`  app ${APP}: UNREACHABLE (${e.message})`); }
  const artSrv = await startArtServer();
  log(`  artifact viewer server on ${ART_BASE}`);

  const scenes = demo.scenes;
  log(`TTS: synthesizing ${scenes.length} clips...`);
  const clips = await synthesizeAll(scenes, TTS, demo.voice || {});
  const narrMs = (id) => clips.get(id)?.durationMs ?? 0;

  const browser = await chromium.launch({
    headless: !HEADFUL,
    args: [
      '--window-size=2000,1200', '--window-position=0,0', '--hide-scrollbars', '--mute-audio',
      '--disable-features=Translate', '--no-default-browser-check', '--no-first-run',
      ...(HEADFUL ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
  });
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: scale, // viewport x scale -> the record buffer
    baseURL: APP,
    recordVideo: { dir: RAW, size: recSize },
  });
  await context.addInitScript((hideSel) => {
    const kill = () => (hideSel || []).forEach((s) =>
      document.querySelectorAll(s).forEach((el) => el.style.setProperty('display', 'none', 'important')));
    try { new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    document.addEventListener('DOMContentLoaded', kill); kill();
    const styleInject = () => {
      if (!document.head || document.getElementById('__demohide')) return;
      const s = document.createElement('style'); s.id = '__demohide';
      s.textContent = '*{caret-color:transparent!important} html{scroll-behavior:auto!important}';
      document.head.appendChild(s);
    };
    document.addEventListener('DOMContentLoaded', styleInject);
    try { window.open = () => null; } catch {}
  }, HIDE);

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  context.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });

  const vars = {};
  const recStart = Date.now();
  const timeline = [];

  function bind(step) {
    const { strategy, value } = locatorSpec(step);
    switch (strategy) {
      case 'testId': return page.getByTestId(value);
      case 'role': return page.getByRole(value, step.name != null
        ? { name: toMatcher(step.name), ...(step.exact != null ? { exact: step.exact } : {}) } : {});
      case 'selector': return page.locator(value);
      case 'text': return page.getByText(toMatcher(value));
      case 'label': return page.getByLabel(toMatcher(value));
      case 'placeholder': return page.getByPlaceholder(toMatcher(value));
      case 'altText': return page.getByAltText(toMatcher(value));
    }
  }
  function loc(step) {
    let l = bind(step);
    if (step.nth != null) l = l.nth(step.nth);
    else if (step.first) l = l.first();
    return l;
  }
  const istr = (s) => interpolate(s, vars);

  async function softNav(url, waitUntil = 'networkidle') {
    await page.evaluate((bg) => new Promise((res) => {
      const o = document.createElement('div'); o.id = '__navfade';
      o.style.cssText = `position:fixed;inset:0;z-index:2147483646;background:${bg};opacity:0;transition:opacity .28s ease`;
      (document.body || document.documentElement).appendChild(o);
      requestAnimationFrame(() => { o.style.opacity = '1'; });
      setTimeout(res, 300);
    }, NAV_BG)).catch(() => {});
    await page.goto(url, { waitUntil }).catch(() => {});
    await page.evaluate((bg) => new Promise((res) => {
      const o = document.createElement('div'); o.id = '__navfade';
      o.style.cssText = `position:fixed;inset:0;z-index:2147483646;background:${bg};opacity:1;transition:opacity .4s ease`;
      (document.body || document.documentElement).appendChild(o);
      requestAnimationFrame(() => { o.style.opacity = '0'; });
      setTimeout(() => { o.remove(); res(); }, 430);
    }, NAV_BG)).catch(() => {});
  }

  async function runGenerate(st) {
    const tries = st.retries || 3;
    for (let attempt = 1; attempt <= tries; attempt++) {
      await loc(attempt === 1 ? st.trigger : (st.retry || st.trigger)).click();
      if (st.started) await loc(st.started).waitFor({ timeout: st.startedTimeout || 120000 }).catch(() => {});
      const done = loc(st.done);
      const ok = await done.waitFor({ state: 'visible', timeout: st.doneTimeout || 25000 }).then(() => true).catch(() => false);
      if (ok) {
        log(`  generate "${st.captureHref || 'asset'}": ready (attempt ${attempt})`);
        if (st.captureHref) vars[st.captureHref] = await done.getAttribute('href');
        return;
      }
      await page.waitForTimeout(800);
    }
    throw new Error(`generate did not complete after ${tries} attempts`);
  }

  async function renderAsset(href, id, st) {
    const dir = path.join(ARTROOT, id); await mkdir(dir, { recursive: true });
    const res = await fetch(href); if (!res.ok) throw new Error(`asset fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    let imgs;
    if (ct.includes('pdf') || href.toLowerCase().endsWith('.pdf')) {
      await writeFile(path.join(dir, 'src.pdf'), buf);
      await exec('pdftocairo', ['-png', '-r', String(st.dpi || 200), path.join(dir, 'src.pdf'), path.join(dir, 'page')]);
      imgs = (await readdir(dir)).filter((f) => /^page.*\.png$/.test(f))
        .sort((a, b) => (parseInt(a.match(/\d+/)) || 0) - (parseInt(b.match(/\d+/)) || 0));
    } else {
      const ext = ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : (path.extname(href).slice(1) || 'png');
      const fn = `page.${ext}`; await writeFile(path.join(dir, fn), buf); imgs = [fn];
    }
    const tags = imgs.map((f) => `<img class=pg src="${f}">`).join('');
    const html = `<!doctype html><meta charset=utf8><style>
*{margin:0;box-sizing:border-box}html,body{background:${NAV_BG}}
body{display:flex;flex-direction:column;align-items:center;gap:30px;padding:64px 0 200px}
.pg{width:1200px;max-width:64vw;border-radius:10px;box-shadow:0 22px 80px rgba(0,0,0,.6);display:block}
#hl{position:fixed;border:3px solid ${accent};border-radius:10px;box-shadow:0 0 0 9999px rgba(7,11,20,.55);opacity:0;transition:opacity .6s ease;pointer-events:none;z-index:10}
</style><body>${tags}<div id=hl></div></body>`;
    await writeFile(path.join(dir, 'index.html'), html);
    return imgs.length;
  }

  async function showAsset(id, st) {
    await softNav(`${ART_BASE}/artifacts/${id}/index.html`, 'load');
    await page.waitForTimeout(700);
    const top = st.highlightTop ?? 0.2;
    await page.evaluate((top) => {
      const img = document.querySelector('.pg'), hl = document.getElementById('hl');
      if (img && hl) {
        const r = img.getBoundingClientRect();
        hl.style.left = r.left + 'px'; hl.style.top = (r.top + 14) + 'px';
        hl.style.width = r.width + 'px'; hl.style.height = Math.round(r.height * top) + 'px';
        requestAnimationFrame(() => hl.style.opacity = '1');
      }
    }, top);
    await page.waitForTimeout(st.holdMs ?? 3600);
    await page.evaluate(() => { const hl = document.getElementById('hl'); if (hl) hl.style.opacity = '0'; });
    await page.waitForTimeout(700);
    const dur = st.scrollMs ?? 13000;
    await page.evaluate((dur) => new Promise((res) => {
      const maxY = document.body.scrollHeight - window.innerHeight; if (maxY <= 0) return res();
      const t0 = performance.now(), ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      (function f(now) { const t = Math.min(1, (now - t0) / dur); window.scrollTo(0, Math.round(maxY * ease(t))); t < 1 ? requestAnimationFrame(f) : res(); })(performance.now());
    }), dur);
    await page.waitForTimeout(900);
  }

  async function scrollEased(st) {
    const dur = st.ms ?? 4000, sel = st.selector || null;
    await page.evaluate(({ dur, sel }) => new Promise((res) => {
      const el = sel ? document.querySelector(sel) : document.scrollingElement;
      if (!el) return res();
      const maxY = el.scrollHeight - el.clientHeight; if (maxY <= 0) return res();
      const t0 = performance.now(), ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      (function f(now) { const t = Math.min(1, (now - t0) / dur); el.scrollTo(0, Math.round(maxY * ease(t))); t < 1 ? requestAnimationFrame(f) : res(); })(performance.now());
    }), { dur, sel });
  }

  async function dispatch(st) {
    switch (st.do) {
      case 'goto': return page.goto(istr(st.url), { waitUntil: st.waitUntil || 'networkidle' });
      case 'softNav': return softNav(istr(st.url), st.waitUntil || 'networkidle');
      case 'reload': return page.reload({ waitUntil: st.waitUntil || 'networkidle' });
      case 'clearStorage': return page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
      case 'click': return loc(st).click({ timeout: st.timeout });
      case 'fill': return loc(st).fill(istr(String(st.value)), { timeout: st.timeout });
      case 'check': return loc(st).check({ timeout: st.timeout });
      case 'uncheck': return loc(st).uncheck({ timeout: st.timeout });
      case 'hover': return loc(st).hover({ timeout: st.timeout });
      case 'press': return page.keyboard.press(st.key);
      case 'wait': return page.waitForTimeout(st.ms ?? 1000);
      case 'waitFor': return loc(st).waitFor({ state: st.state || 'visible', timeout: st.timeout || 20000 });
      case 'expectVisible': return expect(loc(st)).toBeVisible({ timeout: st.timeout || 8000 });
      case 'waitForUrl': {
        await page.waitForURL(new RegExp(st.pattern), { timeout: st.timeout || 15000 });
        if (st.captureId) vars[st.captureId] = page.url().split('/').filter(Boolean).pop();
        return;
      }
      case 'captureUrlId': vars[st.var] = page.url().split('/').filter(Boolean).pop(); return;
      case 'captureHref': vars[st.var] = await loc(st).getAttribute('href'); return;
      case 'waitForResponse': {
        const res = await page.waitForResponse((r) => r.url().includes(istr(st.urlIncludes)) && r.ok(), { timeout: st.timeout || 90000 });
        if (st.captureJson) { try { const j = await res.json(); for (const [vn, key] of Object.entries(st.captureJson)) vars[vn] = j[key] ?? vars[vn]; } catch {} }
        return;
      }
      case 'scroll': return scrollEased(st);
      case 'generate': return runGenerate(st);
      case 'showAsset': { const id = st.id || 'asset'; await renderAsset(istr(st.href || st.url), id, st); return showAsset(id, st); }
      default: throw new Error(`unknown step "${st.do}"`);
    }
  }

  async function runStep(st) {
    try { await dispatch(st); }
    catch (e) { if (st.optional) { log(`  (optional ${st.do} skipped: ${e.message.split('\n')[0]})`); return; } throw e; }
  }

  async function runScene(scene) {
    const t0 = Date.now();
    try { for (const st of (scene.steps || [])) await runStep(st); }
    catch (e) { await page.screenshot({ path: path.join(DIAG, `fail-${scene.id}.png`) }).catch(() => {}); throw new Error(`scene "${scene.id}" failed: ${e.message}`); }
    const actual = Date.now() - t0;
    const need = narrMs(scene.id) + TAIL_PAD_MS;
    if (actual < need) await page.waitForTimeout(need - actual);
    timeline.push({ id: scene.id, startMs: t0 - recStart, endMs: Date.now() - recStart, actualMs: actual, narrMs: narrMs(scene.id) });
    log(`  scene ${scene.id}: action ${actual}ms, narr ${narrMs(scene.id)}ms`);
  }

  try {
    for (const scene of scenes) {
      if (scene.kind === 'card') continue; // cards are rendered by build.mjs
      await runScene(scene);
    }
    log('All scenes recorded.');
  } finally {
    const video = page.video();
    await context.close();
    if (video) { const p = await video.path(); await rename(p, path.join(RAW, 'body.webm')).catch(() => {}); }
    await browser.close();
    artSrv.close();
    await writeFile(path.join(OUT, 'timeline.json'),
      JSON.stringify({ recStartedAt: recStart, app: APP, vars, scenes: timeline }, null, 2)).catch(() => {});
    log(`timeline: ${timeline.length} scenes | video: ${path.join(RAW, 'body.webm')}`);
  }
}

main().catch((e) => { console.error('\nRECORD FAILED:', e.message); process.exit(1); });
