// Lightweight, dependency-free validator for a demo.json spec. Checks the shape
// the pipeline relies on and validates each step's locator via locatorSpec.
import { locatorSpec } from './locator.mjs';

export const ACTIONS = new Set([
  'goto', 'softNav', 'reload', 'clearStorage', 'click', 'fill', 'check', 'uncheck',
  'hover', 'press', 'scroll', 'wait', 'waitFor', 'waitForUrl', 'waitForResponse',
  'expectVisible', 'captureUrlId', 'captureHref', 'generate', 'showAsset',
]);

// Actions that must target an element.
const TARGETED = new Set(['click', 'fill', 'check', 'uncheck', 'hover', 'waitFor', 'expectVisible', 'captureHref']);

export function validateDemo(demo) {
  const errors = [];
  if (!demo || typeof demo !== 'object') return { ok: false, errors: ['demo must be an object'] };
  if (!demo.app || !demo.app.url) errors.push('app.url is required');
  if (!Array.isArray(demo.scenes) || demo.scenes.length === 0) {
    errors.push('scenes[] is required and must be non-empty');
    return { ok: false, errors };
  }
  const ids = new Set();
  demo.scenes.forEach((s, i) => {
    const where = `scene[${i}]${s && s.id ? ` (${s.id})` : ''}`;
    if (!s || !s.id) errors.push(`${where}: id is required`);
    else if (ids.has(s.id)) errors.push(`${where}: duplicate id "${s.id}"`);
    else ids.add(s.id);
    if (!s || typeof s.text !== 'string' || !s.text.trim()) errors.push(`${where}: non-empty text is required`);
    if (!s || s.kind === 'card') return;
    if (s.steps != null && !Array.isArray(s.steps)) { errors.push(`${where}: steps must be an array`); return; }
    (s.steps || []).forEach((st, j) => {
      const w2 = `${where} step[${j}]`;
      if (!st || !st.do || !ACTIONS.has(st.do)) { errors.push(`${w2}: unknown action "${st && st.do}"`); return; }
      if (TARGETED.has(st.do)) { try { locatorSpec(st); } catch (e) { errors.push(`${w2}: ${e.message}`); } }
      if (st.do === 'fill' && st.value == null) errors.push(`${w2}: fill requires a value`);
      if (st.do === 'press' && !st.key) errors.push(`${w2}: press requires a key`);
      if ((st.do === 'goto' || st.do === 'softNav') && !st.url) errors.push(`${w2}: ${st.do} requires a url`);
      if (st.do === 'waitForUrl') {
        if (!st.pattern) errors.push(`${w2}: waitForUrl requires a pattern`);
        else { try { new RegExp(st.pattern); } catch (e) { errors.push(`${w2}: waitForUrl pattern is not a valid regex (${e.message})`); } }
      }
      if (st.do === 'generate' && (!st.trigger || !st.done)) errors.push(`${w2}: generate requires trigger and done locators`);
      if (st.do === 'showAsset' && !st.href && !st.url) errors.push(`${w2}: showAsset requires href or url`);
    });
  });
  return { ok: errors.length === 0, errors };
}
