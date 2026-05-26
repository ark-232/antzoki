import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDemo } from '../lib/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.join(here, '..', '..', 'examples', 'example', 'demo.json');

test('the bundled example validates', async () => {
  const demo = JSON.parse(await readFile(examplePath, 'utf8'));
  const { ok, errors } = validateDemo(demo);
  assert.ok(ok, 'errors:\n - ' + errors.join('\n - '));
});

test('rejects a missing app.url', () => {
  assert.equal(validateDemo({ scenes: [{ id: 'a', text: 't' }] }).ok, false);
});

test('rejects duplicate scene ids', () => {
  const r = validateDemo({ app: { url: 'x' }, scenes: [{ id: 'a', text: 't' }, { id: 'a', text: 't' }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate/.test(e)));
});

test('rejects an unknown action', () => {
  const r = validateDemo({ app: { url: 'x' }, scenes: [{ id: 'a', text: 't', steps: [{ do: 'frobnicate' }] }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown action/.test(e)));
});

test('rejects a click with no locator', () => {
  const r = validateDemo({ app: { url: 'x' }, scenes: [{ id: 'a', text: 't', steps: [{ do: 'click' }] }] });
  assert.equal(r.ok, false);
});
