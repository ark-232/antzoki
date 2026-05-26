// Replace ${name} tokens in a value using a vars object. Recurses into arrays
// and plain objects so a whole step can be interpolated at once. Unknown tokens
// are left intact (so a missing capture surfaces as a visible ${name}).
export function interpolate(value, vars = {}) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, vars));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolate(v, vars);
    return out;
  }
  return value;
}
