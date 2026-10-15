/**
 * Shared Reference Code & Advert Name Normalization Utilities
 *
 * Implements deterministic normalization to prevent false missing-ad results
 * while strictly safeguarding against false matches:
 *
 * 1. Unicode Normalization: Standardizes compatibility characters via NFKC,
 *    collapses all forms of Unicode whitespace (e.g. NBSP, thin space) and
 *    converts Unicode dash/hyphen variants (en-dash, em-dash, minus) to standard ASCII '-'.
 * 2. Exact Reference Normalization (`normalizeRefExact`):
 *    Removes harmless spaces directly around hyphens/underscores without changing
 *    separator types.
 * 3. Canonical Reference Normalization (`normalizeRefCanonical`):
 *    Treats runs of spaces, hyphens, and underscores as equivalent separators (collapsing to '-'),
 *    ensuring that formats like "AT-1187-1-AD1", "AT-1187 -1-AD1", and "AT 1187 1 AD1"
 *    produce the identical matching key.
 * 4. Advert Name Normalization (`normalizeAdvertName`):
 *    Converts to lowercase, normalizes curly/smart quotes and punctuation, and collapses whitespace.
 * 5. Creative Variant Extraction (`extractAdVersion`):
 *    Identifies distinct creative cuts (e.g. AD1 vs AD2, CUT 1 vs CUT 2) to strictly
 *    prevent cross-variant false matching.
 */

/**
 * Standardizes Unicode strings: decomposes/recomposes compatibility variants,
 * replaces non-breaking/ideographic spaces with standard ASCII space, and
 * standardizes all Unicode dashes to '-'.
 */
export function normalizeUnicode(str?: string | null): string {
  if (!str) return '';
  return str
    .normalize('NFKC')
    // Strip invisible zero-width characters (zero-width space, joiners, word joiner, BOM)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    // Replace all Unicode whitespace characters (NBSP, em/en space, thin space, ideographic space) with ASCII space
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    // Replace all Unicode dash, hyphen, minus, and soft-hyphen variants with ASCII '-'
    .replace(/[\u00AD\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
}

/**
 * Tier 1: Exact Reference Normalization.
 * Trims surrounding whitespace, standardizes to uppercase, removes whitespace
 * directly surrounding hyphens/underscores, and collapses internal spaces.
 * E.g.: "  AT - 1187 - 1 - AD1  " -> "AT-1187-1-AD1"
 *       "AT 1187 1 AD1" -> "AT 1187 1 AD1" (keeps space intact)
 */
export function normalizeRefExact(ref?: string | null): string {
  if (!ref) return '';
  const cleaned = normalizeUnicode(ref).trim().toUpperCase();
  if (!cleaned) return '';

  return cleaned
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*_\s*/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-');
}

/**
 * Tier 2: Canonical Reference Normalization.
 * Treats spaces, hyphens, and underscores between alphanumeric tokens as equivalent separators,
 * collapsing any run into a single standard '-'.
 * E.g.: "AT-1187-1-AD1"  -> "AT-1187-1-AD1"
 *       "AT-1187 -1-AD1" -> "AT-1187-1-AD1"
 *       "AT 1187 1 AD1"  -> "AT-1187-1-AD1"
 *       "INAD 081-A1"    -> "INAD-081-A1"
 *       "INAD 081 A1"    -> "INAD-081-A1"
 */
export function normalizeRefCanonical(ref?: string | null): string {
  if (!ref) return '';
  const cleaned = normalizeUnicode(ref).trim().toUpperCase();
  if (!cleaned) return '';

  return cleaned
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')
    .replace(/[\s\-_]+/g, '-');
}

/**
 * Backward-compatible alias for canonical reference normalization.
 */
export function normalizeRefCode(ref?: string | null): string {
  return normalizeRefCanonical(ref);
}

/**
 * Tier 3: Advert Name Normalization.
 * Converts to lowercase, unifies quotes/apostrophes, normalizes whitespace,
 * and preserves meaningful alphanumeric words across Unicode scripts (including Ethiopic/Amharic).
 */
export function normalizeAdvertName(name?: string | null): string {
  if (!name) return '';
  const cleaned = normalizeUnicode(name).trim().toLowerCase();
  if (!cleaned) return '';

  return cleaned
    .replace(/['’‘`]/g, "'")
    .replace(/["“”]/g, '"')
    // Keep letters, numbers, spaces, and hyphens across all Unicode character classes
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts explicit creative cut / version identifiers (such as AD1, AD2, CUT 1, V1).
 * Used to guarantee that AD1 is never falsely matched to AD2 during Tier 3 name matching.
 */
export function extractAdVersion(ref?: string | null, advert?: string | null): string | null {
  const combined = normalizeUnicode(`${ref || ''} ${advert || ''}`).toUpperCase();
  const match = combined.match(/\b(AD\s*[-_]?\s*\d+|CUT\s*[-_]?\s*\d+|V\s*[-_]?\s*\d+|VERSION\s*[-_]?\s*\d+)\b/);
  if (match) {
    return match[1].replace(/[\s\-_]+/g, '');
  }
  // Check trailing letter version e.g. -A1, -A2, _A1
  const altMatch = combined.match(/[-_ ](A\d+)\b/);
  return altMatch ? altMatch[1].replace(/[\s\-_]+/g, '') : null;
}
