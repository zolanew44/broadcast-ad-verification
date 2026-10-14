/**
 * Robust date utilities for broadcast schedules and automation logs.
 */

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Normalizes date to midnight UTC for clean comparison without timezone skew.
 */
export function normalizeDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Parse campaign date string from schedule.
 * Handles formats like:
 * - "Oct 08/2026"
 * - "October 12/2026"
 * - "Jul 07/2026"
 * - "Oct 3/2026"
 * - "2026-10-13"
 * - "13-10-2026"
 * - "13/10/2026"
 * - "Ongoing" -> returns null (not bounded)
 */
export function parseCampaignDate(val?: string | null): Date | null {
  if (!val) return null;
  const s = val.trim();
  if (!s || /^(ongoing|on\s+going|open|tbd|none|-|\s*)$/i.test(s)) {
    return null;
  }

  // 1. Month Name Day/Year e.g. "Oct 08/2026", "October 12/2026", "Jul 7/2026"
  const monthDayYear = s.match(/^([A-Za-z]+)\s+(\d{1,2})[\/\-](\d{4})$/);
  if (monthDayYear) {
    const mStr = monthDayYear[1].toLowerCase();
    const day = parseInt(monthDayYear[2], 10);
    const year = parseInt(monthDayYear[3], 10);
    const mNum = MONTH_MAP[mStr];
    if (mNum !== undefined && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, mNum, day));
    }
  }

  // 2. ISO format YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(Date.UTC(year, month, day));
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(Date.UTC(year, month, day));
  }

  // 4. Fallback standard parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return normalizeDateOnly(parsed);
  }

  return null;
}

/**
 * Extracts the broadcast date from log timestamps or filename.
 * E.g. "2026-10-13.log" -> Date(2026, 9, 13)
 * E.g. "13-10-2026 00:00:33" -> Date(2026, 9, 13)
 */
export function extractBroadcastDate(
  firstLogTimestamp?: string | null,
  fileName?: string | null
): Date {
  // Check filename first for YYYY-MM-DD
  if (fileName) {
    const fnMatch = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (fnMatch) {
      return new Date(Date.UTC(parseInt(fnMatch[1], 10), parseInt(fnMatch[2], 10) - 1, parseInt(fnMatch[3], 10)));
    }
  }

  // Check log timestamp "13-10-2026 00:00:33" or "2026-10-13 00:00:00"
  if (firstLogTimestamp) {
    const tsMatch = firstLogTimestamp.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (tsMatch) {
      const day = parseInt(tsMatch[1], 10);
      const month = parseInt(tsMatch[2], 10) - 1;
      const year = parseInt(tsMatch[3], 10);
      return new Date(Date.UTC(year, month, day));
    }
    const isoTs = firstLogTimestamp.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoTs) {
      const year = parseInt(isoTs[1], 10);
      const month = parseInt(isoTs[2], 10) - 1;
      const day = parseInt(isoTs[3], 10);
      return new Date(Date.UTC(year, month, day));
    }
  }

  // Fallback to current UTC date
  const now = new Date();
  return normalizeDateOnly(now);
}

/**
 * Formats a date to YYYY-MM-DD string
 */
export function formatDateISO(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a date to human readable "Oct 13, 2026"
 */
export function formatDateFriendly(date: Date | null): string {
  if (!date) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
