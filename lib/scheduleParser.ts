import { ScheduleRecord } from '@/types';
import { parseCampaignDate, formatDateISO } from './dateUtils';

export interface ScheduleParseResult {
  records: ScheduleRecord[];
  warnings: string[];
  totalLines: number;
  headerRowIndex: number;
  headers: string[];
}

import { normalizeRefCode } from './refNormalizer';
export { normalizeRefCode };

/**
 * Parses schedule raw text into structured ScheduleRecord items.
 */
export function parseScheduleText(text: string, broadcastDate: Date): ScheduleParseResult {
  const warnings: string[] = [];
  const records: ScheduleRecord[] = [];

  if (!text || !text.trim()) {
    warnings.push('The schedule file is empty.');
    return { records, warnings, totalLines: 0, headerRowIndex: -1, headers: [] };
  }

  const lines = text.split(/\r?\n/);
  let headerRowIndex = -1;
  let headers: string[] = [];

  // Column index map
  let dateIdx = 0;
  let showIdx = 1;
  let timeIdx = 2;
  let placementsIdx = 3;
  let refIdx = 4;
  let advertIdx = 5;
  let secIdx = 6;
  let startIdx = 7;
  let endIdx = 8;

  // Search for the primary header row (contains "Ref", "Advert", "Placements", etc.)
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const rawLine = lines[i];
    const lower = rawLine.toLowerCase();
    if (lower.includes('ref') && (lower.includes('show') || lower.includes('advert') || lower.includes('time'))) {
      headerRowIndex = i;
      // Split on tabs first, fallback to multiple spaces
      const rawCols = rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(/\s{2,}/);
      headers = rawCols.map(c => c.trim());

      // Dynamically locate column indices if headers match
      headers.forEach((h, col) => {
        const hl = h.toLowerCase();
        if (hl === 'date') dateIdx = col;
        else if (hl === 'show' || hl === 'program') showIdx = col;
        else if (hl === 'time' || hl === 'slot') timeIdx = col;
        else if (hl.includes('placement')) placementsIdx = col;
        else if (hl === 'ref' || hl.includes('reference') || hl === 'code') refIdx = col;
        else if (hl.includes('advert') || hl.includes('title') || hl.includes('name')) advertIdx = col;
        else if (hl === 'sec' || hl.includes('dur') || hl.includes('second')) secIdx = col;
        else if (hl.includes('start')) startIdx = col;
        else if (hl.includes('end')) endIdx = col;
      });
      break;
    }
  }

  if (headerRowIndex === -1) {
    warnings.push('Header row not explicitly recognized; using standard 9-column schedule layout.');
  }

  const startLine = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || !rawLine.trim()) continue;

    const parts = rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(/\s{2,}/);
    const getCol = (idx: number) => (parts[idx] ? parts[idx].trim() : '');

    const ref = getCol(refIdx);
    const show = getCol(showIdx);
    const time = getCol(timeIdx);
    const placements = getCol(placementsIdx);
    const advert = getCol(advertIdx);
    const secStr = getCol(secIdx);
    const rawStartDate = getCol(startIdx);
    const rawEndDate = getCol(endIdx);
    const dateCol = getCol(dateIdx);

    // If there's no ref and no advert, this is likely an empty schedule time-slot row or separator
    if (!ref && !advert) {
      continue;
    }

    // Check if the ref column actually contains a non-commercial broadcast element
    // e.g. "New Transition", "Station Break Transition", "Brought to you by", "Sponsor Billboard"
    const isStationTransition = /(transition|station\s*id|break)/i.test(ref);
    const isSponsorship = /(brought\s+to\s+you\s+by|sponsor|billboard)/i.test(ref);

    let rowWarning: string | undefined;
    if (isStationTransition) {
      rowWarning = 'Broadcast transition marker (not a standard commercial advertisement).';
    } else if (isSponsorship) {
      rowWarning = 'Sponsorship lead-in / Billboard credit.';
    } else if (!ref) {
      rowWarning = 'Record missing reference code.';
    }

    const startDateObj = parseCampaignDate(rawStartDate);
    const endDateObj = parseCampaignDate(rawEndDate);

    const bDateNormalized = new Date(Date.UTC(
      broadcastDate.getUTCFullYear(),
      broadcastDate.getUTCMonth(),
      broadcastDate.getUTCDate()
    ));

    let isExpired = false;
    let isNotStarted = false;

    if (endDateObj && endDateObj.getTime() < bDateNormalized.getTime()) {
      isExpired = true;
    }
    if (startDateObj && startDateObj.getTime() > bDateNormalized.getTime()) {
      isNotStarted = true;
    }

    let sec: number | null = null;
    if (secStr) {
      const parsedSec = parseInt(secStr.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedSec)) {
        sec = parsedSec;
      }
    }

    records.push({
      id: `sched-L${i + 1}`,
      lineIndex: i + 1,
      dateCol,
      show,
      time,
      placements,
      ref,
      normRef: normalizeRefCode(ref),
      advert,
      sec,
      rawStartDate,
      rawEndDate,
      startDate: formatDateISO(startDateObj),
      endDate: formatDateISO(endDateObj),
      isExpired,
      isNotStarted,
      raw: rawLine,
      warning: rowWarning,
    });
  }

  return {
    records,
    warnings,
    totalLines: lines.length,
    headerRowIndex,
    headers,
  };
}
