import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProvider, keyFor, resolveConfig } from '../tts.mjs';

test('pickProvider honors an explicit force', () => {
  assert.equal(pickProvider({ force: 'say', key: 'abc' }), 'say');
});

test('pickProvider uses elevenlabs when a key is present', () => {
  assert.equal(pickProvider({ force: '', key: 'abc' }), 'elevenlabs');
});

test('pickProvider falls back to say without a key', () => {
  assert.equal(pickProvider({ force: '', key: '' }), 'say');
});

test('keyFor is deterministic and text-sensitive', () => {
  const cfg = resolveConfig({ voice: 'v', model: 'm', seed: 1 });
  const a = keyFor(cfg, 'hello', '', 'next');
  const b = keyFor(cfg, 'hello', '', 'next');
  const c = keyFor(cfg, 'world', '', 'next');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('keyFor changes when the voice changes', () => {
  const k1 = keyFor(resolveConfig({ voice: 'v1', force: 'elevenlabs' }), 't', '', '');
  const k2 = keyFor(resolveConfig({ voice: 'v2', force: 'elevenlabs' }), 't', '', '');
  assert.notEqual(k1, k2);
});
