/**
 * Shared reference-code normalization utility.
 *
 * Implements conservative, deterministic normalization to prevent false
 * missing-ad discrepancies caused by inconsistent spacing and hyphen formatting:
 *
 * 1. Trims leading and trailing whitespace and punctuation.
 * 2. Converts text to uppercase.
 * 3. Treats runs of spaces, hyphens, and underscores as equivalent separators (standardizes to a single '-').
 *    For example: "AT-1187-1-AD1", "AT-1187 -1-AD1", and "AT 1187 1 AD1" normalize to the exact same key "AT-1187-1-AD1".
 * 4. Preserves all meaningful letters and digits verbatim.
 * 5. Never uses fuzzy, substring, or speculative guessing.
 */
export function normalizeRefCode(ref?: string | null): string {
  if (!ref) return '';
  const trimmed = ref.trim();
  if (!trimmed) return '';

  return trimmed
    .toUpperCase()
    // Strip leading or trailing non-alphanumeric punctuation
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')
    // Standardize any sequence of whitespace, hyphens, or underscores between alphanumeric tokens into a single hyphen
    .replace(/[\s\-_]+/g, '-');
}
