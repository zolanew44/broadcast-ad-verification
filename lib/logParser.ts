import { LogRecord } from '@/types';
import {
  normalizeUnicode,
  normalizeRefExact,
  normalizeRefCanonical,
  normalizeRefCode,
  normalizeAdvertName,
  extractAdVersion,
} from './refNormalizer';

export interface LogParseResult {
  records: LogRecord[];
  adRecords: LogRecord[];
  warnings: string[];
  totalLines: number;
  detectedBroadcastDate: string;
}

/**
 * Patterns that represent station interstitials, transition bumpers, or programs rather than commercial ads.
 */
const NON_AD_PREFIXES = /^(TRAN\s+|ABBAY\s+FILM|የማስታወቂያ\s+ሰአት|ID\s+|PROMO\s+|BUMPER\s+|STATION\s+ID)/i;

/**
 * Extracts reference code and advert title from a broadcast playout log item string.
 * Supports arbitrary prefix lengths, arbitrary delimiters (tabs, pipes, double slashes,
 * colons, dashes, multi-space), and space-separated reference codes without confusing title words.
 */
export function extractLogRefAndAdvert(item: string): { ref: string; advert: string } | null {
  if (!item) return null;
  const text = normalizeUnicode(item).trim();
  if (!text || NON_AD_PREFIXES.test(text)) return null;

  // 1. Explicit delimiter: tab (\t), pipe (|), double slash (//), colon (:)
  // Example: "GLOBAL-9000 | Ethiopian Airlines", "C-101 // Coffee Promo", "AAD-1918: DA Tigrigna up"
  const delimMatch = text.match(/^([^|\t/:/\\]+?)\s*(?:\t|\||\/\/|:\s)\s*(.+)$/);
  if (delimMatch) {
    const left = delimMatch[1].trim();
    const right = delimMatch[2].trim();
    if (left && right && !NON_AD_PREFIXES.test(left)) {
      return { ref: left, advert: right };
    }
  }

  // 2. Multi-space separation (2 or more spaces or tab) between ref and title
  // Example: "AT 1187 1 AD1  Awach Title", "AAD-1774  SKL Title", "C-101   Coffee Promo"
  const multiSpace = text.match(/^([A-Z0-9_\-]+(?:\s+[A-Z0-9_\-]+)*?)\s{2,}(.*)$/i);
  if (multiSpace && /\d/.test(multiSpace[1])) {
    return { ref: multiSpace[1].trim(), advert: multiSpace[2].trim() };
  }

  // 3. Hyphen with surrounding spaces separating ref from title
  // Example: "AAD-1918 - DA Tigrigna up", "GLOBAL-9000 - Product Launch"
  const spacedDash = text.match(/^([A-Z0-9_\-]+(?:\s+[A-Z0-9_\-]+)*?)\s+[-–—]\s+(.+)$/i);
  if (spacedDash && /\d/.test(spacedDash[1])) {
    return { ref: spacedDash[1].trim(), advert: spacedDash[2].trim() };
  }

  // 4. Single-space separation:
  // 4a. Hyphenated or delimited code of arbitrary prefix length
  // Example: "GLOBAL-9000 Launch Title", "C-101 Coffee Promo", "AT-1187-1-AD1 Awach Title"
  const hyphenMatch = text.match(/^([A-Z0-9]+(?:[\-_][A-Z0-9]+)+)\s+(.*)$/i);
  if (hyphenMatch && /\d/.test(hyphenMatch[1])) {
    return { ref: hyphenMatch[1].trim(), advert: hyphenMatch[2].trim() };
  }

  // 4b. Space-separated reference tokens:
  // Prefix followed by numeric tokens or creative version cuts (AD1, A1, CUT 1, etc.)
  // Example: "AT 1187 1 AD1 Awach Title", "INAD 081 A1 Ruggas Soft Drink"
  const spaceTokensMatch = text.match(/^([A-Z0-9]+(?:\s+(?:\d+|AD\d*|A\d+|CUT\s*\d+|V\d+|VERSION\s*\d+))+)\s+(.*)$/i);
  if (spaceTokensMatch && /\d/.test(spaceTokensMatch[1])) {
    return { ref: spaceTokensMatch[1].trim(), advert: spaceTokensMatch[2].trim() };
  }

  // 5. Standalone reference code with no trailing title
  // Example: "AAD-1918", "AT-1187-1-AD1", "GLOBAL-9000", "C-101", "AT 1187 1 AD1"
  const standaloneMatch = text.match(/^([A-Z0-9]+(?:[\s\-_]+[A-Z0-9]+)*)$/i);
  if (standaloneMatch && /\d/.test(standaloneMatch[1])) {
    return { ref: standaloneMatch[1].trim(), advert: '' };
  }

  return null;
}

/**
 * Parses duration "HH:MM:SS" into total seconds
 */
export function parseDurationToSeconds(dur?: string | null): number | null {
  if (!dur) return null;
  const parts = dur.trim().split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
      return h * 3600 + m * 60 + s;
    }
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) {
      return m * 60 + s;
    }
  }
  const directSec = parseInt(dur.replace(/[^0-9]/g, ''), 10);
  return isNaN(directSec) ? null : directSec;
}

export function parseLogText(text: string): LogParseResult {
  const warnings: string[] = [];
  const records: LogRecord[] = [];
  let detectedBroadcastDate = '';

  if (!text || !text.trim()) {
    warnings.push('The log file is empty.');
    return { records, adRecords: [], warnings, totalLines: 0, detectedBroadcastDate };
  }

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || !rawLine.trim()) continue;

    const parts = rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(/\s{2,}/);
    if (parts.length < 2) continue;

    const timestamp = parts[0] ? parts[0].trim() : '';
    const eventId = parts.length > 2 && parts[1] ? parts[1].trim() : '';
    // In standard broadcast logs:
    // col 0 = timestamp, col 1 = eventId, col 2 = item description, col 3 = duration
    let item = '';
    let duration = '';

    const lastPart = parts[parts.length - 1].trim();
    const isLastPartDuration = /^\d{1,2}:\d{2}(?::\d{2})?$|^\d+s?$/i.test(lastPart);

    if (isLastPartDuration && parts.length >= 4) {
      duration = lastPart;
      item = parts.slice(2, parts.length - 1).join('  ').trim();
    } else if (isLastPartDuration && parts.length === 3) {
      duration = lastPart;
      item = parts[1].trim();
    } else if (parts.length >= 4) {
      item = parts[2].trim();
      duration = parts[3].trim();
    } else if (parts.length === 3) {
      item = parts[1].trim();
      duration = parts[2].trim();
    } else {
      item = parts[1].trim();
    }

    // Capture detected broadcast date from first timestamp
    if (!detectedBroadcastDate && timestamp) {
      const tsMatch = timestamp.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (tsMatch) {
        // DD-MM-YYYY
        detectedBroadcastDate = `${tsMatch[3]}-${tsMatch[2].padStart(2, '0')}-${tsMatch[1].padStart(2, '0')}`;
      } else {
        const isoMatch = timestamp.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (isoMatch) {
          detectedBroadcastDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        }
      }
    }

    // Split date and time
    const tsParts = timestamp.split(/\s+/);
    const datePart = tsParts[0] || '';
    const timePart = tsParts[1] || '';

    // Check if this item is a commercial advertisement
    let isAd = false;
    let ref = '';
    let advert = item;

    const extracted = extractLogRefAndAdvert(item);
    if (extracted) {
      isAd = true;
      ref = extracted.ref;
      advert = extracted.advert;
    }

    const durationSec = parseDurationToSeconds(duration);

    records.push({
      id: `log-L${i + 1}`,
      lineIndex: i + 1,
      timestamp,
      date: datePart,
      time: timePart,
      eventId,
      item,
      ref,
      exactRef: normalizeRefExact(ref),
      normRef: normalizeRefCanonical(ref),
      advert,
      normAdvert: normalizeAdvertName(advert),
      adVersion: extractAdVersion(ref, advert),
      duration,
      durationSec,
      isAd,
      raw: rawLine,
    });
  }

  const adRecords = records.filter(r => r.isAd);

  if (records.length === 0) {
    warnings.push('No parseable lines were found in the log file.');
  } else if (adRecords.length === 0) {
    warnings.push('Log file parsed, but no commercial advertisement records matching reference patterns were identified.');
  }

  return {
    records,
    adRecords,
    warnings,
    totalLines: lines.length,
    detectedBroadcastDate,
  };
}
