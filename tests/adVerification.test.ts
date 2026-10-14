import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { decodeFileBuffer } from '../lib/encoding';
import { parseCampaignDate, extractBroadcastDate, formatDateISO } from '../lib/dateUtils';
import { parseScheduleText, normalizeRefCode } from '../lib/scheduleParser';
import { parseLogText, parseDurationToSeconds } from '../lib/logParser';
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

describe('Schedule & Log Parsers', () => {
  it('normalizes reference codes with irregular whitespace and casing', () => {
    expect(normalizeRefCode('aad-1918')).toBe('AAD-1918');
    expect(normalizeRefCode('AT-1187  -1-AD1 ')).toBe('AT-1187-1-AD1');
    expect(normalizeRefCode(' AT-1086-1-  AD1 ')).toBe('AT-1086-1-AD1');
    expect(normalizeRefCode('INAD  081-A1')).toBe('INAD 081-A1');
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

    // 3. Test report builders on full production results
    const wb = buildComparisonWorkbook(result);
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(5);

    const pdf = buildComparisonPDF(result);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
