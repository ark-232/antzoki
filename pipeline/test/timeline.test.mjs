import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTimeline, gainToTargetDb } from '../lib/timeline.mjs';

test('computeTimeline derives card lengths and offsets', () => {
  const t = computeTimeline({ introNarr: 30, outroNarr: 13, bodyDur: 350, introPad: 1.4, outroPad: 2, fade: 0.5 });
  assert.equal(t.I, 31.4);
  assert.equal(t.O, 15);
  assert.equal(t.bodyStart, 30.9); // I - fade
  assert.ok(Math.abs(t.outroStart - (31.4 + 350 - 1)) < 1e-9);
  assert.ok(Math.abs(t.programDur - (31.4 + 350 + 15 - 1)) < 1e-9);
});

test('gainToTargetDb is the difference to target', () => {
  assert.equal(gainToTargetDb(-13.04, -14), -0.96);
  assert.equal(gainToTargetDb(-22, -14), 8);
  assert.equal(gainToTargetDb(-14, -14), 0);
});
