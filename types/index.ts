export type VerificationStatus =
  | 'MATCHED'
  | 'POTENTIALLY_MISSING'
  | 'EXTRA_AIRING'
  | 'POSSIBLE_DUPLICATE'
  | 'EXPIRED_CAMPAIGN'
  | 'OUTSIDE_CAMPAIGN'
  | 'NEEDS_MANUAL_REVIEW'
  | 'PARSING_WARNING';

export interface ScheduleRecord {
  id: string;
  lineIndex: number;
  dateCol: string;
  show: string;
  time: string;
  placements: string;
  ref: string;
  normRef: string;
  advert: string;
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
  normRef: string;
  advert: string;
  duration: string;
  durationSec: number | null;
  isAd: boolean;
  raw: string;
  warning?: string;
}

export interface AdDiscrepancyItem {
  id: string;
  status: VerificationStatus;
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
