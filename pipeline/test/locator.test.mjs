import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locatorSpec, toMatcher } from '../lib/locator.mjs';

test('detects the role strategy', () => {
  const s = locatorSpec({ do: 'click', role: 'button', name: 'Submit' });
  assert.equal(s.strategy, 'role');
  assert.equal(s.value, 'button');
});

test('detects the selector strategy', () => {
  assert.equal(locatorSpec({ do: 'click', selector: '.x' }).strategy, 'selector');
});

test('throws when no locator is present', () => {
  assert.throws(() => locatorSpec({ do: 'click' }), /no locator/);
});

test('throws when multiple locators are present', () => {
  assert.throws(() => locatorSpec({ do: 'click', role: 'button', selector: '.x' }), /multiple/);
});

test('toMatcher compiles regex-looking names', () => {
  assert.ok(toMatcher('^build') instanceof RegExp);
  assert.ok(toMatcher('apply|cancel') instanceof RegExp);
  assert.equal(toMatcher('Submit'), 'Submit');
});
