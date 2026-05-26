// A step targets at most one element, via exactly one of these strategies.
export const STRATEGIES = ['testId', 'role', 'selector', 'text', 'label', 'placeholder', 'altText'];

// Validate the targeting fields of a step and report which strategy it uses.
// Throws if zero or more than one strategy is present, so authoring mistakes
// fail fast and loud rather than silently clicking the wrong thing.
export function locatorSpec(step) {
  const present = STRATEGIES.filter((s) => step[s] != null);
  if (present.length === 0) {
    throw new Error(`step "${step.do || '?'}" has no locator (need one of: ${STRATEGIES.join(', ')})`);
  }
  if (present.length > 1) {
    throw new Error(`step "${step.do || '?'}" has multiple locators: ${present.join(', ')}`);
  }
  return { strategy: present[0], value: step[present[0]] };
}

// A name/text matcher: regex-looking strings ("^build", "foo|bar") become a
// case-insensitive RegExp (mirrors how the reference build targeted controls);
// plain strings stay strings.
export function toMatcher(name) {
  if (name == null) return name;
  if (name instanceof RegExp) return name;
  const s = String(name);
  if (s.length > 1 && (s.startsWith('^') || s.endsWith('$') || /[\\.*+?()[\]|]/.test(s))) {
    try { return new RegExp(s, 'i'); } catch { return s; }
  }
  return s;
}
