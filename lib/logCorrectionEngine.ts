import { LogCorrection, LogFormat, AdDiscrepancyItem, LogRecord } from '@/types';
import { parseDurationToSeconds } from './logParser';

/**
 * Detects the structural format of the uploaded broadcast playout log
 * (delimiters, line endings, timestamp formats, and column arrangements).
 */
export function detectLogFormat(rawText: string): LogFormat {
  const lineEnding: '\r\n' | '\n' = rawText.includes('\r\n') ? '\r\n' : '\n';
  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);

  let columnDelimiter: '\t' | '  ' = '\t';
  let hasEventId = true;
  let dateFormat: 'DD-MM-YYYY' | 'YYYY-MM-DD' = 'DD-MM-YYYY';
  let itemDelimiter: 'TAB' | 'PIPE' | 'SLASH' | 'HYPHEN_SPACE' | 'MULTI_SPACE' | 'SPACE' = 'MULTI_SPACE';
  let sampleLine = '';

  if (lines.length > 0) {
    sampleLine = lines[0];

    // Detect column delimiter
    const tabCount = (sampleLine.match(/\t/g) || []).length;
    if (tabCount >= 2) {
      columnDelimiter = '\t';
    } else {
      columnDelimiter = '  ';
    }

    // Detect date format in first column
    const firstCol = sampleLine.split(columnDelimiter)[0] || '';
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(firstCol)) {
      dateFormat = 'YYYY-MM-DD';
    } else {
      dateFormat = 'DD-MM-YYYY';
    }

    // Detect columns layout (check if column 1 looks like an event ID / hex number / code)
    const cols = columnDelimiter === '\t' ? sampleLine.split('\t') : sampleLine.split(/\s{2,}/);
    if (cols.length >= 4) {
      hasEventId = true;
      const itemCol = cols[2];
      if (itemCol.includes(' | ')) itemDelimiter = 'PIPE';
      else if (itemCol.includes(' // ')) itemDelimiter = 'SLASH';
      else if (itemCol.includes(' - ')) itemDelimiter = 'HYPHEN_SPACE';
      else if (/\s{2,}/.test(itemCol)) itemDelimiter = 'MULTI_SPACE';
      else itemDelimiter = 'SPACE';
    } else if (cols.length === 3) {
      hasEventId = false;
      const itemCol = cols[1];
      if (itemCol.includes(' | ')) itemDelimiter = 'PIPE';
      else if (itemCol.includes(' // ')) itemDelimiter = 'SLASH';
      else if (itemCol.includes(' - ')) itemDelimiter = 'HYPHEN_SPACE';
      else if (/\s{2,}/.test(itemCol)) itemDelimiter = 'MULTI_SPACE';
      else itemDelimiter = 'SPACE';
    }
  }

  return {
    columnDelimiter,
    lineEnding,
    dateFormat,
    hasEventId,
    sampleLine,
    itemDelimiter,
  };
}

/**
 * Standardizes a duration string or seconds number into "HH:MM:SS" format.
 */
export function formatDurationHHMMSS(dur?: string | number | null): string {
  if (dur === null || dur === undefined || dur === '') return '00:00:30';

  if (typeof dur === 'number') {
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    const s = dur % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const str = String(dur).trim();
  const parts = str.split(':');
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  } else if (parts.length === 2) {
    return `00:${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }

  const sec = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(sec)) {
    return formatDurationHHMMSS(sec);
  }

  return '00:00:30';
}

/**
 * Builds an exact, correctly delimited log line matching the source file format.
 */
export function buildFormattedLogLine(
  entry: {
    timestamp: string;
    eventId: string;
    ref: string;
    advert: string;
    duration: string;
  },
  format: LogFormat
): string {
  let itemStr = entry.ref.trim();
  const advertTrimmed = entry.advert.trim();

  if (advertTrimmed) {
    switch (format.itemDelimiter) {
      case 'PIPE':
        itemStr = `${entry.ref} | ${advertTrimmed}`;
        break;
      case 'SLASH':
        itemStr = `${entry.ref} // ${advertTrimmed}`;
        break;
      case 'HYPHEN_SPACE':
        itemStr = `${entry.ref} - ${advertTrimmed}`;
        break;
      case 'MULTI_SPACE':
        itemStr = `${entry.ref}  ${advertTrimmed}`;
        break;
      case 'SPACE':
      default:
        itemStr = `${entry.ref} ${advertTrimmed}`;
        break;
    }
  }

  const durFormatted = formatDurationHHMMSS(entry.duration);
  const delim = format.columnDelimiter;

  if (format.hasEventId) {
    const eventId = entry.eventId || '00000001';
    return `${entry.timestamp}${delim}${eventId}${delim}${itemStr}${delim}${durFormatted}`;
  } else {
    return `${entry.timestamp}${delim}${itemStr}${delim}${durFormatted}`;
  }
}

/**
 * Parses timestamp string (e.g. "13-10-2026 08:30:00" or "2026-10-13 08:30:00") to unix milliseconds.
 */
export function parseTimestampToMillis(ts?: string | null): number {
  if (!ts) return 0;
  const parts = ts.trim().split(/\s+/);
  const datePart = parts[0] || '';
  const timePart = parts[1] || '00:00:00';

  let year = 2026;
  let month = 1;
  let day = 1;

  if (datePart.includes('-') || datePart.includes('/')) {
    const dp = datePart.split(/[-/]/);
    if (dp[0].length === 4) {
      year = parseInt(dp[0], 10);
      month = parseInt(dp[1], 10);
      day = parseInt(dp[2], 10);
    } else {
      day = parseInt(dp[0], 10);
      month = parseInt(dp[1], 10);
      year = parseInt(dp[2], 10);
    }
  }

  const tp = timePart.split(':');
  const hour = parseInt(tp[0] || '0', 10);
  const min = parseInt(tp[1] || '0', 10);
  const sec = parseInt(tp[2] || '0', 10);

  return new Date(Date.UTC(year, month - 1, day, hour, min, sec)).getTime();
}

/**
 * Applies log corrections to the original raw text:
 * - Preserves every unaffected line verbatim (including original spacing, tabs, and line endings).
 * - Replaces modified entries.
 * - Inserts newly added entries in chronological order based on timestamp.
 */
export function applyLogCorrections(
  originalRawText: string,
  corrections: LogCorrection[],
  format: LogFormat
): { correctedText: string; appliedCount: number } {
  if (!originalRawText || corrections.length === 0) {
    return { correctedText: originalRawText, appliedCount: 0 };
  }

  // Split into lines preserving line endings
  const lines = originalRawText.split(/\r?\n/);
  const lineEnding = format.lineEnding;

  const edits = corrections.filter(c => c.mode === 'EDIT_EXISTING');
  const additions = corrections.filter(c => c.mode === 'ADD_MISSING');

  // Map edits by originalLine or targetLogId
  const editMap = new Map<string, LogCorrection>();
  for (const edit of edits) {
    if (edit.originalLine) {
      editMap.set(edit.originalLine.trim(), edit);
    }
  }

  // Step 1: Apply edits to existing lines
  const modifiedLines: string[] = [];
  let appliedEdits = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (editMap.has(trimmed)) {
      const correction = editMap.get(trimmed)!;
      modifiedLines.push(correction.formattedLine);
      appliedEdits++;
    } else {
      modifiedLines.push(line);
    }
  }

  // Step 2: Insert additions in chronological order
  // Sort additions by timestamp
  const sortedAdditions = [...additions].sort(
    (a, b) => parseTimestampToMillis(a.timestamp) - parseTimestampToMillis(b.timestamp)
  );

  let finalLines = [...modifiedLines];

  for (const addition of sortedAdditions) {
    const addMillis = parseTimestampToMillis(addition.timestamp);
    let inserted = false;

    // Search for insertion point among non-empty log lines
    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i].trim();
      if (!line) continue;

      const firstToken = line.split(/\t|\s{2,}/)[0];
      const lineMillis = parseTimestampToMillis(firstToken);

      if (lineMillis > addMillis) {
        finalLines.splice(i, 0, addition.formattedLine);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      // If after all lines, append before trailing blank line if exists
      if (finalLines.length > 0 && finalLines[finalLines.length - 1].trim() === '') {
        finalLines.splice(finalLines.length - 1, 0, addition.formattedLine);
      } else {
        finalLines.push(addition.formattedLine);
      }
    }
  }

  return {
    correctedText: finalLines.join(lineEnding),
    appliedCount: appliedEdits + additions.length,
  };
}

/**
 * Pre-fills suggested fields for a missing placement with a clean draft.
 */
export function createSuggestedCorrection(
  missingItem: AdDiscrepancyItem,
  broadcastDateStr: string,
  existingLogsCount: number
): LogCorrection {
  // Format default date (DD-MM-YYYY)
  let dateFormatted = '13-10-2026';
  if (broadcastDateStr) {
    const dp = broadcastDateStr.split('-');
    if (dp.length === 3) {
      dateFormatted = `${dp[2]}-${dp[1]}-${dp[0]}`;
    }
  }

  // Time extraction from scheduled slot (e.g. "08:00" or "02:40 - 02:45")
  let timeFormatted = '08:00:00';
  if (missingItem.scheduledTime) {
    const timeMatch = missingItem.scheduledTime.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const h = timeMatch[1].padStart(2, '0');
      const m = timeMatch[2].padStart(2, '0');
      timeFormatted = `${h}:${m}:00`;
    }
  }

  // Generated event ID formatted in hex similar to automation servers (e.g. 000004A0)
  const hexNum = (1000 + existingLogsCount).toString(16).toUpperCase().padStart(8, '0');
  const eventId = `0000${hexNum.slice(-4)}`;

  const durStr = missingItem.duration || '00:00:30';
  const durationFormatted = formatDurationHHMMSS(durStr);
  const durSec = parseDurationToSeconds(durationFormatted);

  const timestamp = `${dateFormatted} ${timeFormatted}`;

  // Default formatted line using standard tab delimiter
  const formattedLine = `${timestamp}\t${eventId}\t${missingItem.ref}  ${missingItem.advertName}\t${durationFormatted}`;

  return {
    id: `corr-add-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    mode: 'ADD_MISSING',
    targetScheduleId: missingItem.id,
    timestamp,
    date: dateFormatted,
    time: timeFormatted,
    eventId,
    ref: missingItem.ref,
    advert: missingItem.advertName,
    duration: durationFormatted,
    durationSec: durSec,
    formattedLine,
    reason: `User-confirmed record of scheduled placement in "${missingItem.program}" (${missingItem.scheduledTime}).`,
    createdAt: new Date().toISOString(),
    isConfirmed: false,
  };
}

/**
 * Triggers in-browser text download of the corrected log file.
 */
export function downloadCorrectedLogFile(
  correctedText: string,
  originalFilename: string,
  broadcastDate: string
): { filename: string } {
  const baseName = originalFilename ? originalFilename.replace(/\.[^/.]+$/, '') : 'broadcast-log';
  const ext = originalFilename && originalFilename.endsWith('.log') ? '.log' : '.txt';
  const filename = `${baseName}-corrected-${broadcastDate || 'export'}${ext}`;

  if (typeof window !== 'undefined') {
    const blob = new Blob([correctedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { filename };
}
