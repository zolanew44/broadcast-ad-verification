import { LogRecord } from '@/types';
import { normalizeRefCode } from './refNormalizer';

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
const NON_AD_PREFIXES = /^(TRAN\s+|ABBAY\s+FILM|የማስታወቂያ\s+ሰአት|ID\s+|PROMO\s+|BUMPER\s+)/i;

/**
 * Extracts reference code and advert title from a broadcast playout log item string.
 * Handles both hyphenated and space-separated reference codes without confusing title words.
 */
export function extractLogRefAndAdvert(item: string): { ref: string; advert: string } | null {
  if (!item || NON_AD_PREFIXES.test(item)) return null;

  // 1. If multi-space (2+ spaces or tab) separates ref and title
  // Example: "AT 1187 1 AD1  Awach Title" or "AAD-1774  SKL Title"
  const multiSpace = item.match(/^([A-Z]{2,6}(?:[\s\-]+[A-Z0-9]+)+?)\s{2,}(.*)$/i);
  if (multiSpace && /\d/.test(multiSpace[1])) {
    return { ref: multiSpace[1].trim(), advert: multiSpace[2].trim() };
  }

  // 2. If single-space, reference tokens after prefix must be numeric, hyphenated, or specific AD-cuts
  // Example: "AT-1187-1-AD1 Awach Title", "AT 1187 1 AD1 Awach", "INAD 081 A1 Ruggas"
  const singleSpace = item.match(/^([A-Z]{2,6}(?:-(?:[A-Z0-9]+)|\s+(?:\d+|AD\d*|A\d+))+)\s+(.*)$/i);
  if (singleSpace && /\d/.test(singleSpace[1])) {
    return { ref: singleSpace[1].trim(), advert: singleSpace[2].trim() };
  }

  // 3. Fallback: standard hyphenated code
  // Example: "DEMO-1918 Title" or "AAD-1918"
  const hyphenPattern = /^([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)+)\s*(.*)$/i;
  const hm = item.match(hyphenPattern);
  if (hm && /\d/.test(hm[1])) {
    return { ref: hm[1].trim(), advert: hm[2].trim() };
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

    if (parts.length >= 4) {
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
      normRef: normalizeRefCode(ref),
      advert,
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
