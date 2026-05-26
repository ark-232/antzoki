// Renders config-driven intro and outro title cards as 4K PNGs via Playwright.
// All copy and the accent color come from demo.json's `brand` block, so the cards
// carry the target project's identity rather than anything hard-coded.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function styles(accent) {
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1920px; height:1080px; }
  body { background: linear-gradient(135deg,#0e1a2f 0%,#1a2c4e 60%,#16243f 100%);
         color:#fff; font-family:'Helvetica Neue','Inter',Arial,sans-serif; overflow:hidden; }
  .pad { padding:120px 150px; height:100%; display:flex; flex-direction:column; }
  .kicker { color:${accent}; letter-spacing:.32em; font-size:24px; font-weight:700; }
  .rule { width:300px; height:4px; background:${accent}; margin:28px 0 0; }
  .title { font-size:150px; font-weight:800; line-height:1; margin-top:54px; letter-spacing:-2px; }
  .sub { font-size:46px; font-weight:500; color:#d6e0f0; margin-top:30px; }
  .muted { color:#9fb0c9; }
  .arch { margin-top:64px; font-size:30px; color:#c5d2e6; font-weight:500; }
  .arch b { color:#fff; font-weight:700; }
  .arrow { color:${accent}; margin:0 18px; font-weight:700; }
  .spacer { flex:1; }
  .stats { display:flex; gap:90px; }
  .stat .n { color:${accent}; font-size:40px; font-weight:800; letter-spacing:.04em; }
  .stat .l { color:#9fb0c9; font-size:24px; margin-top:8px; letter-spacing:.06em; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:50px; }
  .beta { color:${accent}; letter-spacing:.22em; font-size:22px; font-weight:700; }
  .brand { color:#76869f; letter-spacing:.2em; font-size:22px; }
  .pocs { display:flex; gap:70px; margin-top:50px; flex-wrap:wrap; }
  .poc { border-left:4px solid ${accent}; padding-left:28px; }
  .poc .name { font-size:36px; font-weight:700; }
  .poc .row { font-size:24px; color:#aebccf; margin-top:14px; }
  .poc .row b { color:${accent}; font-weight:600; letter-spacing:.04em; }`;
}

function introHTML(b) {
  const i = b.intro || {};
  const stats = (i.stats || []).map((s) => `<div class="stat"><div class="n">${esc(s.n)}</div><div class="l">${esc(s.l)}</div></div>`).join('');
  return page(b, `
    ${b.kicker ? `<div class="kicker">${esc(b.kicker)}</div><div class="rule"></div>` : ''}
    <div class="title">${esc(i.title || 'Product')}</div>
    ${i.subtitle ? `<div class="sub">${esc(i.subtitle)}</div>` : ''}
    ${i.arch ? `<div class="arch">${i.arch}</div>` : ''}
    <div class="spacer"></div>
    ${stats ? `<div class="stats">${stats}</div>` : ''}
    <div class="foot"><span class="beta">${esc(b.beta || '')}</span><span class="brand"></span></div>`);
}

function outroHTML(b) {
  const o = b.outro || {};
  const pocs = (o.pocs || []).map((p) =>
    `<div class="poc"><div class="name">${esc(p.name)}</div>${p.role ? `<div class="row"><b>${esc(p.role)}</b></div>` : ''}${p.base ? `<div class="row">${esc(p.base)}</div>` : ''}</div>`).join('');
  return page(b, `
    ${b.kicker ? `<div class="kicker">${esc(b.kicker)}</div><div class="rule"></div>` : ''}
    <div class="title" style="font-size:96px;margin-top:40px;">${esc(o.title || 'Thank you')}</div>
    ${o.subtitle ? `<div class="sub muted">${esc(o.subtitle)}</div>` : ''}
    ${pocs ? `<div class="kicker" style="margin-top:70px;">POINTS OF CONTACT</div><div class="pocs">${pocs}</div>` : ''}
    <div class="spacer"></div>
    <div class="foot"><span class="beta">${esc(b.beta || '')}</span><span class="brand">${esc(o.footer || '')}</span></div>`);
}

function page(b, inner) {
  return `<!doctype html><html><head><meta charset="utf8"><style>${styles(b.accent || '#c8a24a')}</style></head><body><div class="pad">${inner}</div></body></html>`;
}

export async function renderCards(brand = {}, outDir, size = { width: 3840, height: 2160 }) {
  await mkdir(outDir, { recursive: true });
  const vw = Math.round(size.width / 2), vh = Math.round(size.height / 2); // render at half res, dsf 2 -> full
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const [name, html] of [['intro', introHTML(brand)], ['outro', outroHTML(brand)]]) {
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`  card: ${name}.png`);
  }
  await browser.close();
}
