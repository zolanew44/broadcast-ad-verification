import { LogRecord } from '@/types';
import { normalizeRefCode } from './scheduleParser';

export interface LogParseResult {
  records: LogRecord[];
  adRecords: LogRecord[];
  warnings: string[];
  totalLines: number;
  detectedBroadcastDate: string;
}

/**
 * Regex to recognize advertising reference codes in the Item column:
 * Matches patterns like:
 * - AAD-1774
 * - AT-1292-1-AD1
 * - AT-1187 -1-AD2
 * - AT-1086-1- AD1
 * - INAD 081-A2
 * - EAD-087-AD6
 * - FTAD-021
 * - FAD-018
 */
const AD_REF_PATTERN = /^((?:[A-Z]{2,6}\s*(?:-\s*\d+|\s+\d+)(?:\s*-\s*[A-Z0-9]+)*))\s+(.*)$/i;

/**
 * Patterns that represent station interstitials, transition bumpers, or programs rather than commercial ads.
 */
const NON_AD_PREFIXES = /^(TRAN\s+|ABBAY\s+FILM|የማስታወቂያ\s+ሰአት|ID\s+|PROMO\s+|BUMPER\s+)/i;

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

    if (!NON_AD_PREFIXES.test(item)) {
      const match = item.match(AD_REF_PATTERN);
      if (match) {
        isAd = true;
        ref = match[1].trim();
        advert = match[2] ? match[2].trim() : '';
      }
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
