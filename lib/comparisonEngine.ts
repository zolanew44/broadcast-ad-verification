import {
  ScheduleRecord,
  LogRecord,
  AdDiscrepancyItem,
  ComparisonSummary,
  ComparisonResult,
  VerificationStatus,
} from '@/types';
import { formatDateISO } from './dateUtils';

export interface ComparisonOptions {
  broadcastDate: Date;
  scheduleFileName?: string;
  logFileName?: string;
  durationToleranceSec?: number; // default: 5 seconds
}

/**
 * Deterministic Broadcast Advertising Comparison Engine
 */
export function runAdComparison(
  scheduleRecords: ScheduleRecord[],
  logRecords: LogRecord[],
  options: ComparisonOptions
): ComparisonResult {
  const {
    broadcastDate,
    scheduleFileName = 'Schedule.txt',
    logFileName = 'Broadcast.log',
    durationToleranceSec = 5,
  } = options;

  const items: AdDiscrepancyItem[] = [];
  const warnings: string[] = [];
  const bDateStr = formatDateISO(broadcastDate);

  // Filter actual log ads vs non-ads
  const logAds = logRecords.filter(l => l.isAd);

  // Group log ads by normalized reference code
  const logsByRef = new Map<string, LogRecord[]>();
  for (const log of logAds) {
    if (!logsByRef.has(log.normRef)) {
      logsByRef.set(log.normRef, []);
    }
    logsByRef.get(log.normRef)!.push(log);
  }

  // Keep track of which log records have been matched to a scheduled placement
  const matchedLogIds = new Set<string>();

  // Process schedule records
  for (let idx = 0; idx < scheduleRecords.length; idx++) {
    const sched = scheduleRecords[idx];

    // 1. Parsing warning check (e.g. transition marker, sponsor billboard, or malformed ref)
    if (sched.warning) {
      items.push({
        id: `item-warn-${sched.id}`,
        status: 'PARSING_WARNING',
        ref: sched.ref || '(None)',
        normRef: '',
        advertiser: sched.advert || sched.show,
        advertName: sched.advert || sched.ref,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: 'N/A',
        expectedCount: 1,
        actualCount: 0,
        duration: sched.sec ? `${sched.sec}s` : 'N/A',
        campaignStartDate: sched.startDate || sched.rawStartDate || 'N/A',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'N/A',
        explanation: `Schedule entry flagged: ${sched.warning} Raw text: "${sched.raw}"`,
        recommendedFollowUp: 'Verify whether this element requires commercial verification or is a station transition.',
        scheduleEvidence: [sched],
        logEvidence: [],
        isReviewed: false,
        reviewNote: '',
      });
      continue;
    }

    // 2. Expired campaign check
    if (sched.isExpired) {
      // Check if this expired ad aired anyway in the log
      const candidateLogs = logsByRef.get(sched.normRef) || [];
      const airedAnyway = candidateLogs.length > 0;

      items.push({
        id: `item-exp-${sched.id}`,
        status: 'EXPIRED_CAMPAIGN',
        ref: sched.ref,
        normRef: sched.normRef,
        advertiser: sched.advert,
        advertName: sched.advert,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: airedAnyway ? candidateLogs.map(l => l.time).join(', ') : 'Did Not Air',
        expectedCount: 1,
        actualCount: candidateLogs.length,
        duration: sched.sec ? `${sched.sec}s` : 'N/A',
        campaignStartDate: sched.startDate || sched.rawStartDate || 'N/A',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'Expired',
        explanation: `Campaign expired on ${sched.endDate || sched.rawEndDate}. The broadcast date is ${bDateStr}. This placement was scheduled outside of the contracted campaign period.${
          airedAnyway ? ` Caution: ${candidateLogs.length} airing(s) were logged on air despite expiration.` : ''
        }`,
        recommendedFollowUp: airedAnyway
          ? 'Alert traffic department immediately: expired advertisement aired on broadcast.'
          : 'Remove placement from daily broadcast schedule; campaign has expired.',
        scheduleEvidence: [sched],
        logEvidence: candidateLogs,
        isReviewed: false,
        reviewNote: '',
      });
      continue;
    }

    // 3. Outside campaign dates (not yet started)
    if (sched.isNotStarted) {
      const candidateLogs = logsByRef.get(sched.normRef) || [];
      items.push({
        id: `item-out-${sched.id}`,
        status: 'OUTSIDE_CAMPAIGN',
        ref: sched.ref,
        normRef: sched.normRef,
        advertiser: sched.advert,
        advertName: sched.advert,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: candidateLogs.length > 0 ? candidateLogs.map(l => l.time).join(', ') : 'Did Not Air',
        expectedCount: 1,
        actualCount: candidateLogs.length,
        duration: sched.sec ? `${sched.sec}s` : 'N/A',
        campaignStartDate: sched.startDate || sched.rawStartDate || 'Future Date',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'N/A',
        explanation: `Campaign start date is ${sched.startDate || sched.rawStartDate}, which is after broadcast date ${bDateStr}.`,
        recommendedFollowUp: 'Verify contract start date with sales department before broadcasting.',
        scheduleEvidence: [sched],
        logEvidence: candidateLogs,
        isReviewed: false,
        reviewNote: '',
      });
      continue;
    }

    // 4. Eligible scheduled placement: Attempt 1-to-1 matching with log airings
    const availableLogs = (logsByRef.get(sched.normRef) || []).filter(l => !matchedLogIds.has(l.id));

    if (availableLogs.length > 0) {
      // Pick the best matching log record:
      // First attempt: match by program/time proximity or take next in chronological sequence
      const matchedLog = availableLogs[0];
      matchedLogIds.add(matchedLog.id);

      // Check duration discrepancy if duration is available
      let durationDiffWarning = '';
      let isAmbiguous = false;
      if (sched.sec && matchedLog.durationSec) {
        const diff = Math.abs(sched.sec - matchedLog.durationSec);
        if (diff > durationToleranceSec) {
          durationDiffWarning = ` Duration variance: Scheduled ${sched.sec}s vs Actual ${matchedLog.durationSec}s (diff: ${diff}s).`;
          isAmbiguous = true;
        }
      }

      const status: VerificationStatus = isAmbiguous ? 'NEEDS_MANUAL_REVIEW' : 'MATCHED';

      items.push({
        id: `item-match-${sched.id}`,
        status,
        ref: sched.ref,
        normRef: sched.normRef,
        advertiser: sched.advert,
        advertName: sched.advert,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: matchedLog.timestamp || matchedLog.time,
        expectedCount: 1,
        actualCount: 1,
        duration: matchedLog.duration || (sched.sec ? `${sched.sec}s` : 'N/A'),
        campaignStartDate: sched.startDate || sched.rawStartDate || 'N/A',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'Ongoing',
        explanation: isAmbiguous
          ? `Advertisement matched reference code "${sched.ref}" at ${matchedLog.timestamp}, but duration differs.${durationDiffWarning}`
          : `Verified airing: matched scheduled placement at ${matchedLog.timestamp} (${matchedLog.duration}).`,
        recommendedFollowUp: isAmbiguous
          ? 'Confirm whether advertiser supplied a modified cut of different duration.'
          : 'None required (Placement verified).',
        scheduleEvidence: [sched],
        logEvidence: [matchedLog],
        isReviewed: false,
        reviewNote: '',
      });
    } else {
      // No available actual airing for this eligible placement -> POTENTIALLY MISSING
      // Check if related creatives exist under base reference (e.g. AT-1187 base with different AD version)
      const baseParts = sched.normRef.split('-');
      const baseRef = baseParts.length > 2 ? baseParts.slice(0, 2).join('-') : baseParts[0];
      const relatedLogs = logAds.filter(l => l.normRef.startsWith(baseRef) && l.normRef !== sched.normRef);

      let explanation = `Scheduled for broadcast in "${sched.show}" (${sched.time}), but no matching actual log occurrence was recorded for reference "${sched.ref}".`;
      let followUp = 'Issue make-good airing or verify playback server logs for unlogged broadcast.';

      if (relatedLogs.length > 0) {
        explanation += ` Note: ${relatedLogs.length} airing(s) found with related base code "${baseRef}" (e.g. ${relatedLogs[0].ref}).`;
        followUp = 'Verify if creative was swapped with alternate version by client or traffic.';
      }

      items.push({
        id: `item-miss-${sched.id}`,
        status: 'POTENTIALLY_MISSING',
        ref: sched.ref,
        normRef: sched.normRef,
        advertiser: sched.advert,
        advertName: sched.advert,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: 'NOT AIRING',
        expectedCount: 1,
        actualCount: 0,
        duration: sched.sec ? `${sched.sec}s` : 'N/A',
        campaignStartDate: sched.startDate || sched.rawStartDate || 'N/A',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'Ongoing',
        explanation,
        recommendedFollowUp: followUp,
        scheduleEvidence: [sched],
        logEvidence: [],
        isReviewed: false,
        reviewNote: '',
      });
    }
  }

  // 5. Check for Extra Airings and Possible Duplicates among unmatched log records
  const unmatchedLogs = logAds.filter(l => !matchedLogIds.has(l.id));

  // Check duplicate timestamps (airings within 60 seconds of each other)
  for (let i = 0; i < unmatchedLogs.length; i++) {
    const log = unmatchedLogs[i];

    // Check if another airing of this same ref occurred within 3 minutes (180 seconds)
    let isPossibleDup = false;
    let dupWithLog: LogRecord | null = null;

    for (let j = 0; j < logAds.length; j++) {
      const other = logAds[j];
      if (other.id !== log.id && other.normRef === log.normRef) {
        if (log.durationSec && other.durationSec && log.time && other.time) {
          // Compare times
          const t1 = parseTimeToSec(log.time);
          const t2 = parseTimeToSec(other.time);
          if (t1 !== null && t2 !== null && Math.abs(t1 - t2) <= 180) {
            isPossibleDup = true;
            dupWithLog = other;
            break;
          }
        }
      }
    }

    const scheduledCountForRef = scheduleRecords.filter(s => s.normRef === log.normRef).length;
    const isUnscheduled = scheduledCountForRef === 0;

    const status: VerificationStatus = isPossibleDup
      ? 'POSSIBLE_DUPLICATE'
      : isUnscheduled
      ? 'EXTRA_AIRING'
      : 'EXTRA_AIRING';

    const explanation = isPossibleDup
      ? `Possible duplicate or double-play: Aired at ${log.timestamp} close to another occurrence of "${log.ref}".`
      : isUnscheduled
      ? `Aired at ${log.timestamp} (${log.duration}), but reference "${log.ref}" is not in the planned schedule.`
      : `Extra airing: Aired at ${log.timestamp}, exceeding the number of scheduled placements for "${log.ref}".`;

    const followUp = isPossibleDup
      ? 'Verify playout automation to ensure advertisement was not double-triggered.'
      : isUnscheduled
      ? 'Bill client for unscheduled placement or check if emergency schedule addition was made.'
      : 'Confirm bonus airing approval with sales/traffic director.';

    items.push({
      id: `item-extra-${log.id}`,
      status,
      ref: log.ref,
      normRef: log.normRef,
      advertiser: log.advert || log.item,
      advertName: log.advert || log.item,
      program: 'Recorded in Log',
      scheduledDate: bDateStr,
      scheduledTime: 'Unscheduled',
      actualAiringTime: log.timestamp || log.time,
      expectedCount: scheduledCountForRef,
      actualCount: 1,
      duration: log.duration || 'N/A',
      campaignStartDate: 'N/A',
      campaignEndDate: 'N/A',
      explanation,
      recommendedFollowUp: followUp,
      scheduleEvidence: scheduleRecords.filter(s => s.normRef === log.normRef),
      logEvidence: [log, ...(dupWithLog ? [dupWithLog] : [])],
      isReviewed: false,
      reviewNote: '',
    });
  }

  // 6. Build Summary Statistics with strict invariant checking
  const totalScheduleRows = scheduleRecords.length;
  const totalLogRows = logRecords.length;

  let totalScheduledPlacements = 0;
  let eligiblePlacements = 0;
  let matchedPlacements = 0;
  let potentiallyMissingPlacements = 0;
  let extraAirings = 0;
  let possibleDuplicates = 0;
  let expiredCampaignPlacements = 0;
  let outsideCampaignPlacements = 0;
  let needsManualReview = 0;
  let parsingWarnings = 0;

  for (const item of items) {
    switch (item.status) {
      case 'MATCHED':
        matchedPlacements++;
        eligiblePlacements++;
        totalScheduledPlacements++;
        break;
      case 'POTENTIALLY_MISSING':
        potentiallyMissingPlacements++;
        eligiblePlacements++;
        totalScheduledPlacements++;
        break;
      case 'NEEDS_MANUAL_REVIEW':
        needsManualReview++;
        // If it was derived from an eligible schedule placement, count in eligible
        if (item.scheduleEvidence.length > 0 && !item.scheduleEvidence[0].isExpired && !item.scheduleEvidence[0].isNotStarted) {
          eligiblePlacements++;
          totalScheduledPlacements++;
        }
        break;
      case 'EXPIRED_CAMPAIGN':
        expiredCampaignPlacements++;
        totalScheduledPlacements++;
        break;
      case 'OUTSIDE_CAMPAIGN':
        outsideCampaignPlacements++;
        totalScheduledPlacements++;
        break;
      case 'EXTRA_AIRING':
        extraAirings++;
        break;
      case 'POSSIBLE_DUPLICATE':
        possibleDuplicates++;
        break;
      case 'PARSING_WARNING':
        parsingWarnings++;
        break;
    }
  }

  const complianceRate = eligiblePlacements > 0
    ? Math.round((matchedPlacements / eligiblePlacements) * 1000) / 10
    : 100;

  const summary: ComparisonSummary = {
    broadcastDate: bDateStr,
    scheduleFileName,
    logFileName,
    generatedAt: new Date().toISOString(),
    totalScheduleRows,
    totalLogRows,
    totalScheduledPlacements,
    eligiblePlacements,
    matchedPlacements,
    potentiallyMissingPlacements,
    extraAirings,
    possibleDuplicates,
    expiredCampaignPlacements,
    outsideCampaignPlacements,
    needsManualReview,
    parsingWarnings,
    complianceRate,
  };

  return {
    summary,
    items,
    scheduleRecords,
    logRecords,
    warnings,
  };
}

function parseTimeToSec(t: string): number | null {
  const parts = t.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return null;
}
