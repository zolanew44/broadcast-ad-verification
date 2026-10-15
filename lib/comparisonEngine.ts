import {
  ScheduleRecord,
  LogRecord,
  AdDiscrepancyItem,
  ComparisonSummary,
  ComparisonResult,
  VerificationStatus,
  MatchTier,
} from '@/types';
import { formatDateISO } from './dateUtils';

export interface ComparisonOptions {
  broadcastDate: Date;
  scheduleFileName?: string;
  logFileName?: string;
  durationToleranceSec?: number; // default: 5 seconds
}

interface EligibleSlot {
  sched: ScheduleRecord;
  matchedLog?: LogRecord;
  matchTier: MatchTier;
  isAmbiguous?: boolean;
  needsReviewReason?: string;
}

/**
 * Deterministic Broadcast Advertising Priority Matching & Comparison Engine
 *
 * Implements strict, conservative matching across 3 prioritized tiers:
 *   Tier 1: Exact reference code match after safe normalization (normalizeRefExact)
 *   Tier 2: Constrained separator-equivalent normalized reference match (normalizeRefCanonical)
 *   Tier 3: Unambiguous normalized advert name match (normalizeAdvertName) supported by duration,
 *           with strict variant protection (AD1 vs AD2 never matched).
 *
 * Ambiguities and duration variances are flagged for manual review rather than guessing.
 * Strict 1-to-1 placement accounting is guaranteed: one playout satisfies at most one placement.
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

  // Set of log IDs that have been assigned to scheduled placements
  const matchedLogIds = new Set<string>();

  // 1. Separate schedule records into pre-categorized elements (warnings, expired, outside campaign)
  // and eligible placements for commercial verification.
  const eligibleSlots: EligibleSlot[] = [];

  for (let idx = 0; idx < scheduleRecords.length; idx++) {
    const sched = scheduleRecords[idx];

    // 1a. Parsing / format warning check
    if (sched.warning) {
      items.push({
        id: `item-warn-${sched.id}`,
        status: 'PARSING_WARNING',
        matchTier: 'UNMATCHED',
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

    // 1b. Expired campaign check
    if (sched.isExpired) {
      const candidateLogs = logAds.filter(l => l.normRef === sched.normRef);
      const airedAnyway = candidateLogs.length > 0;

      items.push({
        id: `item-exp-${sched.id}`,
        status: 'EXPIRED_CAMPAIGN',
        matchTier: 'UNMATCHED',
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

    // 1c. Outside campaign dates (not yet started)
    if (sched.isNotStarted) {
      const candidateLogs = logAds.filter(l => l.normRef === sched.normRef);
      items.push({
        id: `item-out-${sched.id}`,
        status: 'OUTSIDE_CAMPAIGN',
        matchTier: 'UNMATCHED',
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

    // Eligible placement for matching
    eligibleSlots.push({
      sched,
      matchTier: 'UNMATCHED',
    });
  }

  // 2. PASS 1 (Tier 1): Exact Reference Match (normalizeRefExact)
  for (const slot of eligibleSlots) {
    if (slot.matchedLog || !slot.sched.exactRef) continue;

    const candidate = logAds.find(
      l => !matchedLogIds.has(l.id) && l.exactRef === slot.sched.exactRef
    );

    if (candidate) {
      matchedLogIds.add(candidate.id);
      slot.matchedLog = candidate;
      slot.matchTier = 'EXACT_REF';
    }
  }

  // 3. PASS 2 (Tier 2): Constrained Normalized Reference Match (normalizeRefCanonical)
  // Handles space vs hyphen equivalence (e.g. AT-1187-1-AD1 vs AT 1187 1 AD1)
  for (const slot of eligibleSlots) {
    if (slot.matchedLog || !slot.sched.normRef) continue;

    const candidate = logAds.find(
      l => !matchedLogIds.has(l.id) && l.normRef === slot.sched.normRef
    );

    if (candidate) {
      matchedLogIds.add(candidate.id);
      slot.matchedLog = candidate;
      slot.matchTier = 'CONSTRAINED_NORM_REF';
    }
  }

  // 4. PASS 3 (Tier 3): Unambiguous Normalized Advert Name Match
  // Guardrails:
  // - normAdvert must match exactly
  // - Duration must be compatible (|sec - durationSec| <= tolerance)
  // - Creative cut versions (AD1 vs AD2) MUST NOT CONFLICT.
  //   If advert names match but creative cuts conflict (e.g. AD1 vs AD2), flag for manual review.
  for (const slot of eligibleSlots) {
    if (slot.matchedLog || !slot.sched.normAdvert || slot.sched.normAdvert.length < 3) continue;

    // Check if available logs have the same normalized advert name
    const candidateLogs = logAds.filter(
      l => !matchedLogIds.has(l.id) && l.normAdvert && l.normAdvert === slot.sched.normAdvert
    );

    if (candidateLogs.length === 0) continue;

    // Separate into version-compatible candidates vs version-conflicting candidates
    const versionCompatible = candidateLogs.filter(l => {
      if (!slot.sched.adVersion || !l.adVersion) return true;
      return slot.sched.adVersion === l.adVersion;
    });

    const versionConflicting = candidateLogs.filter(l => {
      return (
        slot.sched.adVersion &&
        l.adVersion &&
        slot.sched.adVersion !== l.adVersion
      );
    });

    // If no version-compatible candidate exists, but a version-conflicting candidate does (e.g. AD1 scheduled vs AD2 logged):
    if (versionCompatible.length === 0 && versionConflicting.length > 0) {
      const conflictLog = versionConflicting[0];
      matchedLogIds.add(conflictLog.id);
      slot.matchedLog = conflictLog;
      slot.matchTier = 'UNMATCHED';
      slot.isAmbiguous = true;
      slot.needsReviewReason = `Creative cut discrepancy: Scheduled variant "${slot.sched.adVersion}" but broadcast log recorded variant "${conflictLog.adVersion}" for advert "${slot.sched.advert}". Flagged for manual review.`;
      continue;
    }

    // Check duration compatibility on version-compatible candidates
    const compatibleCandidates = versionCompatible.filter(l => {
      if (slot.sched.sec && l.durationSec) {
        return Math.abs(slot.sched.sec - l.durationSec) <= durationToleranceSec;
      }
      return true;
    });

    // Also check other remaining unmatched schedule slots competing for the same advert name
    const competingScheduleSlots = eligibleSlots.filter(
      s => !s.matchedLog && s.sched.normAdvert === slot.sched.normAdvert
    );

    if (compatibleCandidates.length === 1 && competingScheduleSlots.length === 1) {
      // Completely unambiguous 1-to-1 match by advert name!
      const candidate = compatibleCandidates[0];
      matchedLogIds.add(candidate.id);
      slot.matchedLog = candidate;
      slot.matchTier = 'UNAMBIGUOUS_NAME';
    } else if (compatibleCandidates.length > 0) {
      // Multiple candidates or multiple schedule slots with same name -> Ambiguous!
      const candidate = compatibleCandidates[0];
      matchedLogIds.add(candidate.id);
      slot.matchedLog = candidate;
      slot.matchTier = 'UNMATCHED';
      slot.isAmbiguous = true;
      slot.needsReviewReason = `Ambiguous title match: Multiple matching entries for advert "${slot.sched.advert}". Flagged for manual verification.`;
    }
  }

  // 5. Evaluate eligible placements and duration variance
  for (const slot of eligibleSlots) {
    const { sched, matchedLog, matchTier } = slot;

    if (slot.isAmbiguous) {
      // Flagged for manual review (e.g. AD1 vs AD2 or ambiguous title)
      items.push({
        id: `item-rev-${sched.id}`,
        status: 'NEEDS_MANUAL_REVIEW',
        matchTier,
        ref: sched.ref,
        normRef: sched.normRef,
        advertiser: sched.advert,
        advertName: sched.advert,
        program: sched.show,
        scheduledDate: sched.dateCol,
        scheduledTime: sched.time,
        actualAiringTime: matchedLog ? (matchedLog.timestamp || matchedLog.time) : 'Needs Review',
        expectedCount: 1,
        actualCount: matchedLog ? 1 : 0,
        duration: matchedLog?.duration || (sched.sec ? `${sched.sec}s` : 'N/A'),
        campaignStartDate: sched.startDate || sched.rawStartDate || 'N/A',
        campaignEndDate: sched.endDate || sched.rawEndDate || 'Ongoing',
        explanation: slot.needsReviewReason || `Discrepancy detected for reference "${sched.ref}". Flagged for review.`,
        recommendedFollowUp: slot.needsReviewReason?.includes('Creative cut')
          ? 'Confirm with client or traffic whether alternate creative version was authorized.'
          : 'Manual operator verification required to resolve ambiguous match.',
        scheduleEvidence: [sched],
        logEvidence: matchedLog ? [matchedLog] : [],
        isReviewed: false,
        reviewNote: '',
      });
      continue;
    }

    if (matchedLog) {
      // Check duration discrepancy on matched placement
      let durationDiffWarning = '';
      let isDurationMismatch = false;

      if (sched.sec && matchedLog.durationSec) {
        const diff = Math.abs(sched.sec - matchedLog.durationSec);
        if (diff > durationToleranceSec) {
          durationDiffWarning = ` Duration variance: Scheduled ${sched.sec}s vs Actual ${matchedLog.durationSec}s (diff: ${diff}s).`;
          isDurationMismatch = true;
        }
      }

      const status: VerificationStatus = isDurationMismatch ? 'NEEDS_MANUAL_REVIEW' : 'MATCHED';

      let explanationText = '';
      if (isDurationMismatch) {
        explanationText = `Advertisement matched reference code "${sched.ref}" at ${matchedLog.timestamp}, but duration differs.${durationDiffWarning}`;
      } else if (matchTier === 'EXACT_REF') {
        explanationText = `Verified airing: exact reference code match (${sched.exactRef}) at ${matchedLog.timestamp} (${matchedLog.duration}).`;
      } else if (matchTier === 'CONSTRAINED_NORM_REF') {
        explanationText = `Verified airing: normalized reference match (${sched.normRef} ≈ ${matchedLog.ref}) at ${matchedLog.timestamp} (${matchedLog.duration}).`;
      } else if (matchTier === 'UNAMBIGUOUS_NAME') {
        explanationText = `Verified airing: matched by unambiguous advert title ("${sched.advert}") with compatible duration (${matchedLog.duration}) at ${matchedLog.timestamp}.`;
      } else {
        explanationText = `Verified airing: matched scheduled placement at ${matchedLog.timestamp} (${matchedLog.duration}).`;
      }

      items.push({
        id: `item-match-${sched.id}`,
        status,
        matchTier,
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
        explanation: explanationText,
        recommendedFollowUp: isDurationMismatch
          ? 'Confirm whether advertiser supplied a modified cut of different duration.'
          : 'None required (Placement verified).',
        scheduleEvidence: [sched],
        logEvidence: [matchedLog],
        isReviewed: false,
        reviewNote: '',
      });
    } else {
      // No available actual airing for this eligible placement -> POTENTIALLY MISSING
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
        matchTier: 'UNMATCHED',
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

  // 6. Check for Extra Airings and Possible Duplicates among unmatched log records
  const unmatchedLogs = logAds.filter(l => !matchedLogIds.has(l.id));

  for (let i = 0; i < unmatchedLogs.length; i++) {
    const log = unmatchedLogs[i];

    // Check if another airing of this same ref occurred within 3 minutes (180 seconds)
    let isPossibleDup = false;
    let dupWithLog: LogRecord | null = null;

    for (let j = 0; j < logAds.length; j++) {
      const other = logAds[j];
      if (other.id !== log.id && other.normRef === log.normRef) {
        if (log.durationSec && other.durationSec && log.time && other.time) {
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
      ? `Unscheduled airing: Aired at ${log.timestamp} (${log.duration}), but reference "${log.ref}" is not in the planned schedule.`
      : `Extra airing: Aired at ${log.timestamp}, exceeding the number of scheduled placements for "${log.ref}".`;

    const followUp = isPossibleDup
      ? 'Verify playout automation to ensure advertisement was not double-triggered.'
      : isUnscheduled
      ? 'Bill client for unscheduled placement or check if emergency schedule addition was made.'
      : 'Confirm bonus airing approval with sales/traffic director.';

    items.push({
      id: `item-extra-${log.id}`,
      status,
      matchTier: 'UNMATCHED',
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

  // 7. Build Summary Statistics with strict mathematical invariant checking
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
        if (item.scheduleEvidence.length > 0 && !item.scheduleEvidence[0].isExpired && !item.scheduleEvidence[0].isNotStarted && !item.scheduleEvidence[0].warning) {
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
        if (item.scheduleEvidence.length > 0) {
          totalScheduledPlacements++;
        }
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
