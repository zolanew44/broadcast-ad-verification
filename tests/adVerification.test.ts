import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { decodeFileBuffer } from '../lib/encoding';
import { parseCampaignDate, extractBroadcastDate, formatDateISO } from '../lib/dateUtils';
import { parseScheduleText, normalizeRefCode } from '../lib/scheduleParser';
import { parseLogText, parseDurationToSeconds, extractLogRefAndAdvert } from '../lib/logParser';
import {
  normalizeUnicode,
  normalizeRefExact,
  normalizeRefCanonical,
  normalizeAdvertName,
  extractAdVersion,
} from '../lib/refNormalizer';
import { runAdComparison } from '../lib/comparisonEngine';
import { buildComparisonWorkbook, buildComparisonPDF } from '../lib/reportGenerators';
import {
  getSampleScheduleBuffer,
  getSampleLogBuffer,
  SAMPLE_SCHEDULE_FILENAME,
  SAMPLE_LOG_FILENAME,
} from '../lib/sampleData';

describe('Encoding Detector & Decoder', () => {
  it('decodes UTF-8 standard text', () => {
    const raw = Buffer.from('Date\tShow\tTime\tPlacements\tRef', 'utf8');
    const result = decodeFileBuffer(raw);
    expect(result.text).toContain('Date\tShow');
    expect(result.encoding).toBe('UTF-8');
  });

  it('decodes UTF-8 with BOM', () => {
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('BOM Schedule', 'utf8')]);
    const result = decodeFileBuffer(raw);
    expect(result.text).toBe('BOM Schedule');
    expect(result.hasBom).toBe(true);
  });

  it('decodes UTF-16LE with BOM', () => {
    const raw = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Log Entry', 'utf16le')]);
    const result = decodeFileBuffer(raw);
    expect(result.text).toBe('Log Entry');
    expect(result.hasBom).toBe(true);
  });

  it('decodes UTF-16LE without BOM using null byte heuristic', () => {
    const raw = Buffer.from('13-10-2026 00:00:33\t000002C4\tAAD-1774\t00:00:46\r\n', 'utf16le');
    const result = decodeFileBuffer(raw);
    expect(result.text).toContain('AAD-1774');
    expect(result.encoding).toContain('UTF-16LE');
  });

  it('handles empty buffer gracefully', () => {
    const result = decodeFileBuffer(new Uint8Array(0));
    expect(result.text).toBe('');
    expect(result.encoding).toBe('empty');
  });
});

describe('Date Utilities & Campaign Validation', () => {
  it('parses various campaign date formats', () => {
    const d1 = parseCampaignDate('Jul 07/2026');
    expect(d1).not.toBeNull();
    expect(formatDateISO(d1)).toBe('2026-07-07');

    const d2 = parseCampaignDate('October 12/2026');
    expect(d2).not.toBeNull();
    expect(formatDateISO(d2)).toBe('2026-10-12');

    const d3 = parseCampaignDate('Oct 3/2026');
    expect(d3).not.toBeNull();
    expect(formatDateISO(d3)).toBe('2026-10-03');

    const d4 = parseCampaignDate('2026-10-13');
    expect(d4).not.toBeNull();
    expect(formatDateISO(d4)).toBe('2026-10-13');

    // Ongoing should be null (unbounded)
    expect(parseCampaignDate('Ongoing')).toBeNull();
    expect(parseCampaignDate('ongoing')).toBeNull();
    expect(parseCampaignDate('')).toBeNull();
  });

  it('extracts broadcast date from log filename or timestamp', () => {
    const bDate1 = extractBroadcastDate(null, '2026-10-13.log');
    expect(formatDateISO(bDate1)).toBe('2026-10-13');

    const bDate2 = extractBroadcastDate('13-10-2026 00:00:33', 'random.txt');
    expect(formatDateISO(bDate2)).toBe('2026-10-13');
  });
});

describe('Reference Code Normalization (Spaces, Hyphens & Casing)', () => {
  it('normalizes space-separated, hyphen-separated, and mixed variations to the identical key', () => {
    // Exact requirement: AT-1187-1-AD1, AT-1187 -1-AD1, and AT 1187 1 AD1 must normalize to the same key
    const canonical = 'AT-1187-1-AD1';
    expect(normalizeRefCode('AT-1187-1-AD1')).toBe(canonical);
    expect(normalizeRefCode('AT-1187 -1-AD1')).toBe(canonical);
    expect(normalizeRefCode('AT 1187 1 AD1')).toBe(canonical);
    expect(normalizeRefCode('at - 1187 - 1 - ad1')).toBe(canonical);
    expect(normalizeRefCode('  AT--1187---1-AD1  ')).toBe(canonical);
    expect(normalizeRefCode('AT_1187_1_AD1')).toBe(canonical);
    expect(normalizeRefCode('AT-1086-1- AD1')).toBe('AT-1086-1-AD1');
    expect(normalizeRefCode('AT 1086 1 AD1')).toBe('AT-1086-1-AD1');

    // INAD variations
    const inadCanonical = 'INAD-081-A1';
    expect(normalizeRefCode('INAD 081-A1')).toBe(inadCanonical);
    expect(normalizeRefCode('INAD 081 A1')).toBe(inadCanonical);
    expect(normalizeRefCode('INAD-081-A1')).toBe(inadCanonical);
    expect(normalizeRefCode('inad  081  a1')).toBe(inadCanonical);

    // Two-segment codes
    expect(normalizeRefCode('AAD-1918')).toBe('AAD-1918');
    expect(normalizeRefCode('AAD 1918')).toBe('AAD-1918');
    expect(normalizeRefCode('aad - 1918 ')).toBe('AAD-1918');
    expect(normalizeRefCode('DEMO 1918')).toBe('DEMO-1918');
    expect(normalizeRefCode('DEMO-1918')).toBe('DEMO-1918');
  });

  it('strictly preserves meaningful letters and digits and never matches different codes', () => {
    // Different digits must NEVER match
    expect(normalizeRefCode('AAD-1918')).not.toBe(normalizeRefCode('AAD-1919'));
    expect(normalizeRefCode('AT-1187-1-AD1')).not.toBe(normalizeRefCode('AT-1188-1-AD1'));

    // Different prefixes must NEVER match
    expect(normalizeRefCode('AAD-1918')).not.toBe(normalizeRefCode('AT-1918'));

    // Different creative cut/version suffixes must NEVER match
    expect(normalizeRefCode('AT-1187-1-AD1')).not.toBe(normalizeRefCode('AT-1187-1-AD2'));
    expect(normalizeRefCode('INAD-081-A1')).not.toBe(normalizeRefCode('INAD-081-A2'));
    expect(normalizeRefCode('DEMO-1918')).not.toBe(normalizeRefCode('DEMO-1918A'));
  });

  it('handles empty, null, undefined, and punctuation-only inputs safely', () => {
    expect(normalizeRefCode('')).toBe('');
    expect(normalizeRefCode('   ')).toBe('');
    expect(normalizeRefCode('---')).toBe('');
    expect(normalizeRefCode(' _ - ')).toBe('');
    expect(normalizeRefCode(null)).toBe('');
    expect(normalizeRefCode(undefined)).toBe('');
  });

  it('parses duration strings into seconds', () => {
    expect(parseDurationToSeconds('00:00:46')).toBe(46);
    expect(parseDurationToSeconds('00:01:00')).toBe(60);
    expect(parseDurationToSeconds('00:19:14')).toBe(1154);
    expect(parseDurationToSeconds('30')).toBe(30);
  });

  it('correctly parses tab-separated schedule text and flags expired ads', () => {
    const broadcastDate = new Date(Date.UTC(2026, 9, 13));
    const schedText = [
      'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date',
      'Morning\tShow A\t12:00\tBeginning\tAAD-1918\tDA Tigrigna up\t30\tOct 08/2026\tOngoing',
      'Morning\tShow B\t02:40\tMiddle\tAT-1187 -1-AD1\tAwach\t69\tSep 10/2026\tOct 3/2026',
      'Morning\tShow C\t03:00\tEnding\tAAD-2000\tFuture Ad\t30\tOct 20/2026\tNov 10/2026',
    ].join('\n');

    const result = parseScheduleText(schedText, broadcastDate);
    expect(result.records.length).toBe(3);

    expect(result.records[0].isExpired).toBe(false);
    expect(result.records[0].isNotStarted).toBe(false);

    expect(result.records[1].isExpired).toBe(true);
    expect(result.records[1].normRef).toBe('AT-1187-1-AD1');

    expect(result.records[2].isNotStarted).toBe(true);
  });
});

describe('Comparison Engine Core Logic', () => {
  const broadcastDate = new Date(Date.UTC(2026, 9, 13));

  it('handles multiple placements of the same advertisement with partial delivery (AAD-1918)', () => {
    const scheduleRecords = [
      {
        id: 's1',
        lineIndex: 10,
        dateCol: 'Afternoon',
        show: 'Show 1',
        time: '7:55',
        placements: 'Middle 1',
        ref: 'AAD-1918',
        normRef: 'AAD-1918',
        advert: 'DA Tigrigna up',
        sec: 30,
        rawStartDate: 'Oct 08/2026',
        rawEndDate: 'Ongoing',
        startDate: '2026-10-08',
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
      {
        id: 's2',
        lineIndex: 20,
        dateCol: 'Evening',
        show: 'Show 2',
        time: '5:15',
        placements: 'Middle 3',
        ref: 'AAD-1918',
        normRef: 'AAD-1918',
        advert: 'DA Tigrigna up',
        sec: 30,
        rawStartDate: 'Oct 08/2026',
        rawEndDate: 'Ongoing',
        startDate: '2026-10-08',
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
    ];

    const logRecords = [
      {
        id: 'l1',
        lineIndex: 419,
        timestamp: '13-10-2026 17:35:19',
        date: '13-10-2026',
        time: '17:35:19',
        eventId: '000004D8',
        item: 'AAD-1918 DA Tigrigna up',
        ref: 'AAD-1918',
        normRef: 'AAD-1918',
        advert: 'DA Tigrigna up',
        duration: '00:00:34',
        durationSec: 34,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate });

    expect(result.summary.eligiblePlacements).toBe(2);
    expect(result.summary.matchedPlacements).toBe(1);
    expect(result.summary.potentiallyMissingPlacements).toBe(1);

    const matched = result.items.find(i => i.status === 'MATCHED');
    expect(matched).toBeDefined();
    expect(matched?.ref).toBe('AAD-1918');

    const missing = result.items.find(i => i.status === 'POTENTIALLY_MISSING');
    expect(missing).toBeDefined();
    expect(missing?.ref).toBe('AAD-1918');
  });

  it('separately categorizes expired campaign (AT-1187) and does NOT label it as confirmed missed ad', () => {
    const scheduleRecords = [
      {
        id: 's-exp',
        lineIndex: 54,
        dateCol: 'Morning',
        show: 'Show Expired',
        time: '2:40',
        placements: 'Middle',
        ref: 'AT-1187 -1-AD1',
        normRef: 'AT-1187-1-AD1',
        advert: 'Awach',
        sec: 69,
        rawStartDate: 'Sep 10/2026',
        rawEndDate: 'Oct 3/2026',
        startDate: '2026-09-10',
        endDate: '2026-10-03',
        isExpired: true,
        isNotStarted: false,
        raw: '',
      },
    ];

    const logRecords = [
      {
        id: 'l-extra',
        lineIndex: 50,
        timestamp: '13-10-2026 03:03:28',
        date: '13-10-2026',
        time: '03:03:28',
        eventId: '00006C4D',
        item: 'AT-1187 -1-AD2 Awach',
        ref: 'AT-1187 -1-AD2',
        normRef: 'AT-1187-1-AD2',
        advert: 'Awach',
        duration: '00:01:01',
        durationSec: 61,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate });

    expect(result.summary.potentiallyMissingPlacements).toBe(0);
    expect(result.summary.expiredCampaignPlacements).toBe(1);
    expect(result.summary.extraAirings).toBe(1);

    const expiredItem = result.items.find(i => i.status === 'EXPIRED_CAMPAIGN');
    expect(expiredItem).toBeDefined();
    expect(expiredItem?.ref).toBe('AT-1187 -1-AD1');
  });

  it('detects extra airings and possible duplicates', () => {
    const scheduleRecords = [
      {
        id: 's-sing',
        lineIndex: 1,
        dateCol: 'Morning',
        show: 'Morning Show',
        time: '08:00',
        placements: 'Middle',
        ref: 'AAD-1000',
        normRef: 'AAD-1000',
        advert: 'Test Ad',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
    ];

    const logRecords = [
      {
        id: 'l1',
        lineIndex: 1,
        timestamp: '13-10-2026 08:05:00',
        date: '13-10-2026',
        time: '08:05:00',
        eventId: 'E1',
        item: 'AAD-1000 Test Ad',
        ref: 'AAD-1000',
        normRef: 'AAD-1000',
        advert: 'Test Ad',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
      {
        id: 'l2',
        lineIndex: 2,
        timestamp: '13-10-2026 08:05:10',
        date: '13-10-2026',
        time: '08:05:10',
        eventId: 'E2',
        item: 'AAD-1000 Test Ad',
        ref: 'AAD-1000',
        normRef: 'AAD-1000',
        advert: 'Test Ad',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate });

    expect(result.summary.matchedPlacements).toBe(1);
    expect(result.summary.possibleDuplicates).toBe(1);
  });

  it('prevents false missing-ad results when schedule and log differ in spaces vs hyphens', () => {
    const scheduleRecords = [
      {
        id: 's-spaced-1',
        lineIndex: 1,
        dateCol: 'Morning',
        show: 'Show A',
        time: '08:00',
        placements: 'Beginning',
        ref: 'AT-1187 -1-AD1', // Hyphen with space
        normRef: normalizeRefCode('AT-1187 -1-AD1'),
        advert: 'Test Ad 1',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
      {
        id: 's-spaced-2',
        lineIndex: 2,
        dateCol: 'Morning',
        show: 'Show B',
        time: '09:00',
        placements: 'Middle',
        ref: 'INAD 081-A1', // Space then hyphen
        normRef: normalizeRefCode('INAD 081-A1'),
        advert: 'Test Ad 2',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
      {
        id: 's-spaced-3',
        lineIndex: 3,
        dateCol: 'Afternoon',
        show: 'Show C',
        time: '14:00',
        placements: 'Ending',
        ref: 'DEMO 1918', // Space-separated
        normRef: normalizeRefCode('DEMO 1918'),
        advert: 'Test Ad 3',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
    ];

    const logRecords = [
      {
        id: 'l-spaced-1',
        lineIndex: 101,
        timestamp: '13-10-2026 08:02:00',
        date: '13-10-2026',
        time: '08:02:00',
        eventId: 'E101',
        item: 'AT 1187 1 AD1  Test Ad 1', // Space-separated in log
        ref: 'AT 1187 1 AD1',
        normRef: normalizeRefCode('AT 1187 1 AD1'),
        advert: 'Test Ad 1',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
      {
        id: 'l-spaced-2',
        lineIndex: 102,
        timestamp: '13-10-2026 09:05:00',
        date: '13-10-2026',
        time: '09:05:00',
        eventId: 'E102',
        item: 'INAD 081 A1  Test Ad 2', // Space-separated in log
        ref: 'INAD 081 A1',
        normRef: normalizeRefCode('INAD 081 A1'),
        advert: 'Test Ad 2',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
      {
        id: 'l-spaced-3',
        lineIndex: 103,
        timestamp: '13-10-2026 14:02:00',
        date: '13-10-2026',
        time: '14:02:00',
        eventId: 'E103',
        item: 'DEMO-1918  Test Ad 3', // Hyphenated in log
        ref: 'DEMO-1918',
        normRef: normalizeRefCode('DEMO-1918'),
        advert: 'Test Ad 3',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate });

    // All 3 should match; zero false missing-ad results!
    expect(result.summary.eligiblePlacements).toBe(3);
    expect(result.summary.matchedPlacements).toBe(3);
    expect(result.summary.potentiallyMissingPlacements).toBe(0);
    expect(result.summary.extraAirings).toBe(0);

    // Verify original reference codes are preserved for display and export
    const item1 = result.items.find(i => i.scheduleEvidence[0]?.id === 's-spaced-1');
    expect(item1?.ref).toBe('AT-1187 -1-AD1'); // Preserves schedule original
    expect(item1?.logEvidence[0]?.ref).toBe('AT 1187 1 AD1'); // Preserves log original
  });

  it('strictly isolates codes differing in digits or letters and does not false-match them', () => {
    const scheduleRecords = [
      {
        id: 's-diff',
        lineIndex: 1,
        dateCol: 'Morning',
        show: 'Show Alpha',
        time: '08:00',
        placements: 'Beginning',
        ref: 'DEMO-1918',
        normRef: normalizeRefCode('DEMO-1918'),
        advert: 'Product A',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
    ];

    // Log has DEMO-1919 (different digit!)
    const logRecords = [
      {
        id: 'l-diff',
        lineIndex: 1,
        timestamp: '13-10-2026 08:05:00',
        date: '13-10-2026',
        time: '08:05:00',
        eventId: 'E1',
        item: 'DEMO-1919  Product B',
        ref: 'DEMO-1919',
        normRef: normalizeRefCode('DEMO-1919'),
        advert: 'Product B',
        duration: '00:00:30',
        durationSec: 30,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate });

    // Must NOT match
    expect(result.summary.matchedPlacements).toBe(0);
    expect(result.summary.potentiallyMissingPlacements).toBe(1);
    expect(result.summary.extraAirings).toBe(1);

    const missingItem = result.items.find(i => i.status === 'POTENTIALLY_MISSING');
    expect(missingItem?.ref).toBe('DEMO-1918');

    const extraItem = result.items.find(i => i.status === 'EXTRA_AIRING');
    expect(extraItem?.ref).toBe('DEMO-1919');
  });

  it('flags duration variance as NEEDS_MANUAL_REVIEW when exceeding tolerance', () => {
    const scheduleRecords = [
      {
        id: 's-var',
        lineIndex: 1,
        dateCol: 'Morning',
        show: 'Morning Show',
        time: '08:00',
        placements: 'Middle',
        ref: 'AAD-5555',
        normRef: 'AAD-5555',
        advert: 'Duration Variance Ad',
        sec: 30,
        rawStartDate: 'Ongoing',
        rawEndDate: 'Ongoing',
        startDate: null,
        endDate: null,
        isExpired: false,
        isNotStarted: false,
        raw: '',
      },
    ];

    const logRecords = [
      {
        id: 'l-var',
        lineIndex: 1,
        timestamp: '13-10-2026 08:05:00',
        date: '13-10-2026',
        time: '08:05:00',
        eventId: 'E1',
        item: 'AAD-5555 Duration Variance Ad',
        ref: 'AAD-5555',
        normRef: 'AAD-5555',
        advert: 'Duration Variance Ad',
        duration: '00:01:00',
        durationSec: 60,
        isAd: true,
        raw: '',
      },
    ];

    const result = runAdComparison(scheduleRecords, logRecords, { broadcastDate, durationToleranceSec: 5 });
    expect(result.summary.needsManualReview).toBe(1);
  });

  it('preserves mathematical consistency: totalScheduled = eligible + expired + outside + warnings', () => {
    const scheduleRecords = [
      {
        id: 's1', lineIndex: 1, dateCol: 'D', show: 'S', time: 'T', placements: 'P', ref: 'A-1', normRef: 'A-1',
        advert: 'Ad1', sec: 30, rawStartDate: '', rawEndDate: '', startDate: null, endDate: null, isExpired: false, isNotStarted: false, raw: ''
      },
      {
        id: 's2', lineIndex: 2, dateCol: 'D', show: 'S', time: 'T', placements: 'P', ref: 'A-2', normRef: 'A-2',
        advert: 'Ad2', sec: 30, rawStartDate: '', rawEndDate: '2026-09-01', startDate: null, endDate: '2026-09-01', isExpired: true, isNotStarted: false, raw: ''
      },
      {
        id: 's3', lineIndex: 3, dateCol: 'D', show: 'S', time: 'T', placements: 'P', ref: 'A-3', normRef: 'A-3',
        advert: 'Ad3', sec: 30, rawStartDate: '2026-11-01', rawEndDate: '', startDate: '2026-11-01', endDate: null, isExpired: false, isNotStarted: true, raw: ''
      },
    ];

    const result = runAdComparison(scheduleRecords, [], { broadcastDate });

    expect(result.summary.totalScheduledPlacements).toBe(
      result.summary.eligiblePlacements +
      result.summary.expiredCampaignPlacements +
      result.summary.outsideCampaignPlacements
    );
  });

  it('gracefully handles empty schedule and empty log files', () => {
    const emptySched = parseScheduleText('', broadcastDate);
    expect(emptySched.records.length).toBe(0);
    expect(emptySched.warnings.length).toBeGreaterThan(0);

    const emptyLog = parseLogText('');
    expect(emptyLog.records.length).toBe(0);
    expect(emptyLog.warnings.length).toBeGreaterThan(0);

    const res = runAdComparison(emptySched.records, emptyLog.records, { broadcastDate });
    expect(res.summary.totalScheduledPlacements).toBe(0);
    expect(res.summary.matchedPlacements).toBe(0);
    expect(res.items.length).toBe(0);
  });
});

describe('Synthetic Demonstration Data Fixtures (Company-Agnostic)', () => {
  it('verifies the embedded synthetic demo data behaves identically to production rules', () => {
    const schedBuf = getSampleScheduleBuffer();
    const logBuf = getSampleLogBuffer();

    const schedDecoded = decodeFileBuffer(schedBuf);
    const logDecoded = decodeFileBuffer(logBuf);

    // Verify synthetic log encoding is UTF-16LE
    expect(logDecoded.encoding).toContain('UTF-16LE');

    const bDate = extractBroadcastDate(null, SAMPLE_LOG_FILENAME);
    expect(formatDateISO(bDate)).toBe('2026-10-13');

    const schedResult = parseScheduleText(schedDecoded.text, bDate);
    const logResult = parseLogText(logDecoded.text);

    const result = runAdComparison(schedResult.records, logResult.records, {
      broadcastDate: bDate,
      scheduleFileName: SAMPLE_SCHEDULE_FILENAME,
      logFileName: SAMPLE_LOG_FILENAME,
    });

    // 1. Partial delivery: DEMO-1918 (Nova Solar Power 30s)
    // 2 planned placements, 1 actual playout -> 1 matched, 1 potentially missing
    const demo1918 = result.items.filter(i => i.ref === 'DEMO-1918');
    expect(demo1918.length).toBe(2);
    expect(demo1918.filter(i => i.status === 'MATCHED').length).toBe(1);
    expect(demo1918.filter(i => i.status === 'POTENTIALLY_MISSING').length).toBe(1);

    // 2. Expired campaign: DEMO-1187 (Apex Retail)
    // Ended Oct 3, 2026 vs broadcast Oct 13 -> Expired Campaign, not confirmed missed
    const demo1187 = result.items.filter(i => i.ref.includes('DEMO-1187'));
    expect(demo1187.length).toBe(1);
    expect(demo1187[0].status).toBe('EXPIRED_CAMPAIGN');
    expect(result.summary.potentiallyMissingPlacements).toBe(1); // Only DEMO-1918 is missing

    // 3. Extra Airing: DEMO-2005 (Starlight Beverages Unscheduled)
    const demo2005 = result.items.find(i => i.ref === 'DEMO-2005');
    expect(demo2005).toBeDefined();
    expect(demo2005?.status).toBe('EXTRA_AIRING');

    // 4. Duplicate: DEMO-1000 played twice in 30 seconds
    const demo1000 = result.items.find(i => i.status === 'POSSIBLE_DUPLICATE');
    expect(demo1000).toBeDefined();

    // 5. Duration variance: DEMO-1902 scheduled 30s, played 60s -> NEEDS_MANUAL_REVIEW
    const demo1902 = result.items.find(i => i.ref === 'DEMO-1902');
    expect(demo1902?.status).toBe('NEEDS_MANUAL_REVIEW');

    // 6. Test Excel and PDF report generation in memory
    const workbook = buildComparisonWorkbook(result);
    expect(workbook.SheetNames).toContain('Executive Summary');
    expect(workbook.SheetNames).toContain('Detailed Results');
    expect(workbook.SheetNames).toContain('Missing Placements');

    const pdfDoc = buildComparisonPDF(result);
    expect(pdfDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('Local Private Fixtures (October 13, 2026 - Production Data)', () => {
  const privateSchedPath = path.join(__dirname, '../private-fixtures/New Text Document.txt');
  const privateLogPath = path.join(__dirname, '../private-fixtures/2026-10-13.log');

  it('verifies the real sample files when present locally (excluded from Git)', () => {
    if (!fs.existsSync(privateSchedPath) || !fs.existsSync(privateLogPath)) {
      console.warn('Private sample files not present; skipping local production test.');
      return;
    }

    const schedBuf = fs.readFileSync(privateSchedPath);
    const schedDecoded = decodeFileBuffer(schedBuf);

    const logBuf = fs.readFileSync(privateLogPath);
    const logDecoded = decodeFileBuffer(logBuf);

    expect(logDecoded.encoding).toContain('UTF-16LE');

    const bDate = extractBroadcastDate(null, '2026-10-13.log');
    expect(formatDateISO(bDate)).toBe('2026-10-13');

    const schedResult = parseScheduleText(schedDecoded.text, bDate);
    const logResult = parseLogText(logDecoded.text);

    expect(schedResult.records.length).toBeGreaterThan(150);
    expect(logResult.adRecords.length).toBeGreaterThan(200);

    const result = runAdComparison(schedResult.records, logResult.records, {
      broadcastDate: bDate,
      scheduleFileName: 'New Text Document.txt',
      logFileName: '2026-10-13.log',
    });

    // 1. Verify AAD-1918 (DA Tigrigna up):
    const aad1918Items = result.items.filter(i => i.ref === 'AAD-1918');
    expect(aad1918Items.length).toBe(2);
    expect(aad1918Items.filter(i => i.status === 'MATCHED').length).toBe(1);
    expect(aad1918Items.filter(i => i.status === 'POTENTIALLY_MISSING').length).toBe(1);

    // 2. Verify AT-1187 -1-AD1 (Awach):
    const at1187Items = result.items.filter(i => i.ref.includes('AT-1187'));
    const at1187Expired = at1187Items.filter(i => i.status === 'EXPIRED_CAMPAIGN');
    expect(at1187Expired.length).toBeGreaterThanOrEqual(1);
    expect(at1187Expired[0].campaignEndDate).toContain('2026-10-03');

    // Make sure AT-1187 is NOT counted in potentially missing
    const at1187Missing = at1187Items.filter(i => i.status === 'POTENTIALLY_MISSING');
    expect(at1187Missing.length).toBe(0);

    // 3. Verify INAD 182-AD2 (Mixed space-and-hyphen reference code):
    // 6 scheduled placements: 5 matched on exact duration, 1 duration review, 0 missing!
    const inad182Items = result.items.filter(i => i.ref === 'INAD 182-AD2');
    expect(inad182Items.length).toBeGreaterThanOrEqual(6);
    expect(inad182Items.filter(i => i.status === 'POTENTIALLY_MISSING').length).toBe(0);
    expect(inad182Items.filter(i => i.status === 'MATCHED').length).toBe(5);

    // 4. Verify overall discrepancy totals:
    // Exactly 1 genuine missing placement remains (AAD-1918 partial delivery: 2 scheduled, 1 logged)
    expect(result.summary.potentiallyMissingPlacements).toBe(1);
    expect(result.summary.matchedPlacements).toBe(150);

    // 5. Test report builders on full production results
    const wb = buildComparisonWorkbook(result);
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(5);

    const pdf = buildComparisonPDF(result);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('Priority 3-Tier Matching Strategy & Robust Log Parsing', () => {
  const broadcastDate = new Date(Date.UTC(2026, 9, 13));

  it('normalizes Unicode characters, soft hyphens, and invisible whitespace', () => {
    // Soft hyphen (\u00AD) and invisible zero-width space (\u200B)
    const softHyphen = 'AT\u00AD1187\u00AD1\u00ADAD1';
    expect(normalizeRefCanonical(softHyphen)).toBe('AT-1187-1-AD1');

    const zeroWidth = 'AT\u200B-1187\u00A0-1-AD1\uFEFF';
    expect(normalizeRefExact(zeroWidth)).toBe('AT-1187-1-AD1');
    expect(normalizeRefCanonical(zeroWidth)).toBe('AT-1187-1-AD1');

    // Various Unicode dashes (en dash \u2013, em dash \u2014, minus \u2212)
    const unicodeDashes = 'AT\u20131187\u20141\u2212AD1';
    expect(normalizeRefCanonical(unicodeDashes)).toBe('AT-1187-1-AD1');
  });

  it('correctly extracts reference codes of arbitrary prefix lengths and various delimiters', () => {
    // Pipe delimiter
    const pipe = extractLogRefAndAdvert('GLOBAL-9000 | Ethiopian Airlines 30s');
    expect(pipe).toEqual({ ref: 'GLOBAL-9000', advert: 'Ethiopian Airlines 30s' });

    // Double slash delimiter
    const slash = extractLogRefAndAdvert('C-101 // Fresh Coffee Promo');
    expect(slash).toEqual({ ref: 'C-101', advert: 'Fresh Coffee Promo' });

    // Colon delimiter
    const colon = extractLogRefAndAdvert('AAD-1918: DA Tigrigna up');
    expect(colon).toEqual({ ref: 'AAD-1918', advert: 'DA Tigrigna up' });

    // Tab delimiter
    const tab = extractLogRefAndAdvert('K-10\tSpring Sale');
    expect(tab).toEqual({ ref: 'K-10', advert: 'Spring Sale' });

    // Hyphen with spaces
    const spacedDash = extractLogRefAndAdvert('BRAND-X-10 - Special Offer');
    expect(spacedDash).toEqual({ ref: 'BRAND-X-10', advert: 'Special Offer' });

    // Multi-space delimiter
    const multiSpace = extractLogRefAndAdvert('AT 1187 1 AD1   Awach Insurance');
    expect(multiSpace).toEqual({ ref: 'AT 1187 1 AD1', advert: 'Awach Insurance' });

    // Single-space space-token code
    const singleSpaceTokens = extractLogRefAndAdvert('AT 1187 1 AD1 Awach Insurance');
    expect(singleSpaceTokens).toEqual({ ref: 'AT 1187 1 AD1', advert: 'Awach Insurance' });

    // Single-space arbitrary length hyphenated code
    const singleSpaceHyphen = extractLogRefAndAdvert('GLOBAL-9000 Ethiopian Airlines');
    expect(singleSpaceHyphen).toEqual({ ref: 'GLOBAL-9000', advert: 'Ethiopian Airlines' });

    // Single-space mixed space-and-hyphen reference code (e.g. INAD 182-AD2 G- power up)
    const mixedSpaceHyphen = extractLogRefAndAdvert('INAD 182-AD2 G- power up');
    expect(mixedSpaceHyphen).toEqual({ ref: 'INAD 182-AD2', advert: 'G- power up' });

    // Single-space mixed code with version cut (e.g. INAD 156-AD1 Mewab Fashion)
    const mixedCut = extractLogRefAndAdvert('INAD 156-AD1 Mewab Fashion');
    expect(mixedCut).toEqual({ ref: 'INAD 156-AD1', advert: 'Mewab Fashion' });

    // Standalone code without title
    const standalone = extractLogRefAndAdvert('GLOBAL-9000');
    expect(standalone).toEqual({ ref: 'GLOBAL-9000', advert: '' });

    const standaloneSpaceTokens = extractLogRefAndAdvert('INAD 182-AD2');
    expect(standaloneSpaceTokens).toEqual({ ref: 'INAD 182-AD2', advert: '' });

    // Station interstitials, non-ad lines, and program/song titles with digits return null
    expect(extractLogRefAndAdvert('TRAN Station ID 01')).toBeNull();
    expect(extractLogRefAndAdvert('ABBAY FILM')).toBeNull();
    expect(extractLogRefAndAdvert('የማስታወቂያ ሰአት')).toBeNull();
    expect(extractLogRefAndAdvert('Evening Program News')).toBeNull();
    expect(extractLogRefAndAdvert('3D Toothpaste Brought to you by')).toBeNull();
    expect(extractLogRefAndAdvert('Dawite Mekonen -Lameenuu SEP-15')).toBeNull();
  });

  it('matches via Tier 1 (EXACT_REF) when reference code matches exactly', () => {
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Show\t08:00\tBeginning\tAT-1187-1-AD1\tAwach Insurance\t69\tOct 01/2026\tOngoing\r\n';
    const logText = '13-10-2026 08:05:00\t00000001\tAT-1187-1-AD1 Awach Insurance\t00:01:09\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.matchedPlacements).toBe(1);
    expect(res.items[0].status).toBe('MATCHED');
    expect(res.items[0].matchTier).toBe('EXACT_REF');
    expect(res.items[0].explanation).toContain('exact reference code match');
  });

  it('matches via Tier 2 (CONSTRAINED_NORM_REF) when reference code has space vs hyphen formatting differences', () => {
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Show\t08:00\tBeginning\tAT-1187 -1-AD1\tAwach Insurance\t69\tOct 01/2026\tOngoing\r\n';
    // Log has space-separated tokens: AT 1187 1 AD1
    const logText = '13-10-2026 08:05:00\t00000001\tAT 1187 1 AD1  Awach Insurance\t00:01:09\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.matchedPlacements).toBe(1);
    expect(res.items[0].status).toBe('MATCHED');
    expect(res.items[0].matchTier).toBe('CONSTRAINED_NORM_REF');
    expect(res.items[0].explanation).toContain('normalized reference match');
  });

  it('matches via Tier 3 (UNAMBIGUOUS_NAME) when reference code differs but advert title and duration uniquely match', () => {
    // Schedule has ref DEMO-A, Log has ref DEMO-B (e.g. traffic system re-coded the ref), but identical title and duration
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Show\t08:00\tBeginning\tCLIENT-CODE-A\tUnique Ethiopian Coffee Campaign\t30\tOct 01/2026\tOngoing\r\n';
    const logText = '13-10-2026 08:05:00\t00000001\tSERVER-CODE-B | Unique Ethiopian Coffee Campaign\t00:00:30\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.matchedPlacements).toBe(1);
    expect(res.items[0].status).toBe('MATCHED');
    expect(res.items[0].matchTier).toBe('UNAMBIGUOUS_NAME');
    expect(res.items[0].explanation).toContain('matched by unambiguous advert title');
  });

  it('strictly prevents cross-variant matching between AD1 and AD2, flagging for manual review', () => {
    // Schedule planned AD1, but broadcast played AD2
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Show\t08:00\tBeginning\tAT-1187-1-AD1\tAwach Insurance\t69\tOct 01/2026\tOngoing\r\n';
    const logText = '13-10-2026 08:05:00\t00000001\tAT-1187-1-AD2 Awach Insurance\t00:01:09\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    // AD1 MUST NEVER match AD2!
    expect(res.summary.matchedPlacements).toBe(0);
    expect(res.summary.needsManualReview).toBe(1);

    const reviewItem = res.items.find(i => i.status === 'NEEDS_MANUAL_REVIEW');
    expect(reviewItem).toBeDefined();
    expect(reviewItem?.explanation).toContain('Creative cut discrepancy');
    expect(reviewItem?.explanation).toContain('AD1');
    expect(reviewItem?.explanation).toContain('AD2');
  });

  it('flags ambiguous advert titles for manual review when multiple competing placements exist', () => {
    // Two different schedule slots with different refs have identical title
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Show\t08:00\tBeginning\tBANK-01\tGeneric Savings Promo\t30\tOct 01/2026\tOngoing\r\n' +
      'Evening\tEvening Show\t19:00\tBeginning\tBANK-02\tGeneric Savings Promo\t30\tOct 01/2026\tOngoing\r\n';
    // Log has single playout under unmapped code
    const logText = '13-10-2026 08:05:00\t00000001\tOTHER-999 | Generic Savings Promo\t00:00:30\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    // Must not guess which placement was aired; flag for review
    expect(res.summary.matchedPlacements).toBe(0);
    expect(res.summary.needsManualReview).toBeGreaterThanOrEqual(1);
  });

  it('strictly maintains 1-to-1 placement accounting for repeated placements and partial delivery', () => {
    // C-101 scheduled 3 times (Morning, Afternoon, Evening)
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tShow A\t08:00\tBeginning\tC-101\tCoffee Campaign\t30\tOct 01/2026\tOngoing\r\n' +
      'Afternoon\tShow B\t14:00\tMiddle\tC-101\tCoffee Campaign\t30\tOct 01/2026\tOngoing\r\n' +
      'Evening\tShow C\t20:00\tEnding\tC-101\tCoffee Campaign\t30\tOct 01/2026\tOngoing\r\n';

    // Log has only 2 airings
    const logText = '13-10-2026 08:02:00\t00000001\tC-101 // Coffee Campaign\t00:00:30\r\n' +
      '13-10-2026 14:05:00\t00000002\tC-101 // Coffee Campaign\t00:00:30\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.eligiblePlacements).toBe(3);
    expect(res.summary.matchedPlacements).toBe(2);
    expect(res.summary.potentiallyMissingPlacements).toBe(1);
    expect(res.summary.extraAirings).toBe(0);

    const missingItem = res.items.find(i => i.status === 'POTENTIALLY_MISSING');
    expect(missingItem?.program).toBe('Show C');
  });

  it('correctly classifies rapid repeats as POSSIBLE_DUPLICATE and separate playouts as EXTRA_AIRING', () => {
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tShow A\t08:00\tBeginning\tGLOBAL-9000\tEthiopian Airlines\t30\tOct 01/2026\tOngoing\r\n';

    // 1 scheduled, 3 logged:
    // Event 1 at 08:00:00 (matches scheduled)
    // Event 2 at 08:01:15 (within 75s of Event 1 -> POSSIBLE_DUPLICATE)
    // Event 3 at 18:00:00 (hours later -> EXTRA_AIRING)
    const logText = '13-10-2026 08:00:00\t00000001\tGLOBAL-9000 Ethiopian Airlines\t00:00:30\r\n' +
      '13-10-2026 08:01:15\t00000002\tGLOBAL-9000 Ethiopian Airlines\t00:00:30\r\n' +
      '13-10-2026 18:00:00\t00000003\tGLOBAL-9000 Ethiopian Airlines\t00:00:30\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.matchedPlacements).toBe(1);
    expect(res.summary.possibleDuplicates).toBe(1);
    expect(res.summary.extraAirings).toBe(1);
  });

  it('verifies mixed space-and-hyphen reference codes (e.g. INAD 182-AD2) match on-air playout and are never falsely marked missing', () => {
    // Schedule has mixed space-and-hyphen reference: "INAD 182-AD2"
    const schedText = 'Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date\r\n' +
      'Morning\tMorning Magazine\t03:00\tBeginning\tINAD 182-AD2\tEnergy Boost Promo\t70\tOct 01/2026\tOngoing\r\n' +
      'Afternoon\tAfternoon Show\t15:30\tMiddle\tINAD 182-AD2\tEnergy Boost Promo\t70\tOct 01/2026\tOngoing\r\n';

    // Log has single-space between reference and advert: "INAD 182-AD2 Energy Boost Promo"
    // Plus a third extra airing
    const logText = '13-10-2026 03:01:17\t00006C4B\tINAD 182-AD2 Energy Boost Promo\t00:01:10\r\n' +
      '13-10-2026 15:36:53\t000004B3\tINAD 182-AD2 Energy Boost Promo\t00:01:10\r\n' +
      '13-10-2026 22:23:16\t00000549\tINAD 182-AD2 Energy Boost Promo\t00:01:10\r\n';

    const sResult = parseScheduleText(schedText, broadcastDate);
    const lResult = parseLogText(logText);
    const res = runAdComparison(sResult.records, lResult.records, { broadcastDate });

    expect(res.summary.eligiblePlacements).toBe(2);
    expect(res.summary.matchedPlacements).toBe(2);
    expect(res.summary.potentiallyMissingPlacements).toBe(0);
    expect(res.summary.extraAirings).toBe(1);

    const matched = res.items.filter(i => i.status === 'MATCHED');
    expect(matched.length).toBe(2);
    expect(matched[0].ref).toBe('INAD 182-AD2');
    expect(matched[0].actualAiringTime).toBe('13-10-2026 03:01:17');
    expect(matched[1].actualAiringTime).toBe('13-10-2026 15:36:53');
  });
});
