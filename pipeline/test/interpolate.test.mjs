import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolate } from '../lib/interpolate.mjs';

test('replaces ${var} in strings', () => {
  assert.equal(interpolate('/${id}/run/view', { id: 'abc' }), '/abc/run/view');
});

test('leaves unknown tokens intact', () => {
  assert.equal(interpolate('/${missing}', {}), '/${missing}');
});

test('recurses into objects and arrays', () => {
  const out = interpolate({ url: '/${id}', list: ['${id}', 'x'] }, { id: '7' });
  assert.deepEqual(out, { url: '/7', list: ['7', 'x'] });
});

test('passes non-strings through unchanged', () => {
  assert.equal(interpolate(42, {}), 42);
  assert.equal(interpolate(true, {}), true);
  assert.equal(interpolate(null, {}), null);
});
