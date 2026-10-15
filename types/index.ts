export type VerificationStatus =
  | 'MATCHED'
  | 'POTENTIALLY_MISSING'
  | 'EXTRA_AIRING'
  | 'POSSIBLE_DUPLICATE'
  | 'EXPIRED_CAMPAIGN'
  | 'OUTSIDE_CAMPAIGN'
  | 'NEEDS_MANUAL_REVIEW'
  | 'PARSING_WARNING';

export type MatchTier =
  | 'EXACT_REF'
  | 'CONSTRAINED_NORM_REF'
  | 'UNAMBIGUOUS_NAME'
  | 'UNMATCHED';

export interface ScheduleRecord {
  id: string;
  lineIndex: number;
  dateCol: string;
  show: string;
  time: string;
  placements: string;
  ref: string;
  exactRef: string;
  normRef: string;
  advert: string;
  normAdvert: string;
  adVersion: string | null;
  sec: number | null;
  rawStartDate: string;
  rawEndDate: string;
  startDate: string | null;
  endDate: string | null;
  isExpired: boolean;
  isNotStarted: boolean;
  raw: string;
  warning?: string;
}

export interface LogRecord {
  id: string;
  lineIndex: number;
  timestamp: string;
  date: string;
  time: string;
  eventId: string;
  item: string;
  ref: string;
  exactRef: string;
  normRef: string;
  advert: string;
  normAdvert: string;
  adVersion: string | null;
  duration: string;
  durationSec: number | null;
  isAd: boolean;
  isManuallyCorrected?: boolean;
  raw: string;
  warning?: string;
}

export interface AdDiscrepancyItem {
  id: string;
  status: VerificationStatus;
  matchTier?: MatchTier;
  isManuallyCorrected?: boolean;
  manualCorrectionNote?: string;
  ref: string;
  normRef: string;
  advertiser: string;
  advertName: string;
  program: string;
  scheduledDate: string;
  scheduledTime: string;
  actualAiringTime: string;
  expectedCount: number;
  actualCount: number;
  duration: string;
  campaignStartDate: string;
  campaignEndDate: string;
  explanation: string;
  recommendedFollowUp: string;
  scheduleEvidence: ScheduleRecord[];
  logEvidence: LogRecord[];
  isReviewed: boolean;
  reviewNote: string;
  reviewedAt?: string;
}

export interface ComparisonSummary {
  broadcastDate: string;
  scheduleFileName: string;
  logFileName: string;
  generatedAt: string;
  totalScheduleRows: number;
  totalLogRows: number;
  totalScheduledPlacements: number;
  eligiblePlacements: number;
  matchedPlacements: number;
  potentiallyMissingPlacements: number;
  extraAirings: number;
  possibleDuplicates: number;
  expiredCampaignPlacements: number;
  outsideCampaignPlacements: number;
  needsManualReview: number;
  parsingWarnings: number;
  complianceRate: number; // matched / eligible * 100
}

export interface ComparisonResult {
  summary: ComparisonSummary;
  items: AdDiscrepancyItem[];
  scheduleRecords: ScheduleRecord[];
  logRecords: LogRecord[];
  warnings: string[];
}

export interface ComparisonFilter {
  searchQuery: string;
  status: VerificationStatus | 'ALL';
  advertiser: string;
  ref: string;
  program: string;
  reviewedFilter: 'ALL' | 'REVIEWED' | 'UNREVIEWED';
}

export type CorrectionMode = 'ADD_MISSING' | 'EDIT_EXISTING';

export interface LogFormat {
  columnDelimiter: '\t' | '  ';
  lineEnding: '\r\n' | '\n';
  dateFormat: 'DD-MM-YYYY' | 'YYYY-MM-DD';
  hasEventId: boolean;
  sampleLine: string;
  itemDelimiter: 'TAB' | 'PIPE' | 'SLASH' | 'HYPHEN_SPACE' | 'MULTI_SPACE' | 'SPACE';
}

export interface LogCorrection {
  id: string;
  mode: CorrectionMode;
  targetLogId?: string; // If editing an existing log entry
  targetScheduleId?: string; // If resolving a scheduled placement
  timestamp: string; // e.g. "13-10-2026 08:00:00"
  date: string; // e.g. "13-10-2026"
  time: string; // e.g. "08:00:00"
  eventId: string; // e.g. "000002C4" or "MAN-0001"
  ref: string; // e.g. "AAD-1918"
  advert: string; // e.g. "DA Tigrigna up"
  duration: string; // e.g. "00:00:30"
  durationSec: number | null;
  originalLine?: string; // Old value if edited
  formattedLine: string; // Formatted line for TXT output
  reason: string; // User confirmation note / explanation
  createdAt: string; // ISO timestamp
  isConfirmed: boolean;
}

export interface CorrectionAuditSummary {
  totalCorrections: number;
  addedEntriesCount: number;
  editedEntriesCount: number;
  corrections: LogCorrection[];
  appliedAt?: string;
}

