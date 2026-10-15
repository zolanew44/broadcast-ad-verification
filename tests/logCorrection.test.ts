import { describe, it, expect } from 'vitest';
import {
  detectLogFormat,
  formatDurationHHMMSS,
  buildFormattedLogLine,
  parseTimestampToMillis,
  applyLogCorrections,
  createSuggestedCorrection,
  downloadCorrectedLogFile,
} from '../lib/logCorrectionEngine';
import { parseLogText } from '../lib/logParser';
import { parseScheduleText } from '../lib/scheduleParser';
import { runAdComparison } from '../lib/comparisonEngine';
import { buildComparisonWorkbook, buildComparisonPDF } from '../lib/reportGenerators';
import { LogCorrection, LogFormat, AdDiscrepancyItem } from '../types';

describe('Log Correction Engine & Workflow', () => {
  describe('detectLogFormat', () => {
    it('detects tab-delimited playout logs with event IDs and DD-MM-YYYY dates', () => {
      const sample = [
        '13-10-2026 06:15:00\t000000A1\tAT-1001-AD1  Promo A\t00:00:30',
        '13-10-2026 06:30:00\t000000A2\tAT-1002-AD2  Promo B\t00:00:15',
      ].join('\r\n');

      const format = detectLogFormat(sample);
      expect(format.columnDelimiter).toBe('\t');
      expect(format.lineEnding).toBe('\r\n');
      expect(format.dateFormat).toBe('DD-MM-YYYY');
      expect(format.hasEventId).toBe(true);
      expect(format.itemDelimiter).toBe('MULTI_SPACE');
    });

    it('detects space-delimited playout logs with YYYY-MM-DD dates', () => {
      const sample = [
        '2026-10-13 08:00:00  00000001  REF-99 | Brand Commercial  00:00:45',
        '2026-10-13 08:30:00  00000002  REF-100 | Brand Commercial 2  00:00:30',
      ].join('\n');

      const format = detectLogFormat(sample);
      expect(format.columnDelimiter).toBe('  ');
      expect(format.lineEnding).toBe('\n');
      expect(format.dateFormat).toBe('YYYY-MM-DD');
      expect(format.itemDelimiter).toBe('PIPE');
    });
  });

  describe('formatDurationHHMMSS', () => {
    it('formats seconds numbers to HH:MM:SS', () => {
      expect(formatDurationHHMMSS(30)).toBe('00:00:30');
      expect(formatDurationHHMMSS(90)).toBe('00:01:30');
      expect(formatDurationHHMMSS(3665)).toBe('01:01:05');
    });

    it('standardizes existing duration strings', () => {
      expect(formatDurationHHMMSS('00:30')).toBe('00:00:30');
      expect(formatDurationHHMMSS('1:15')).toBe('00:01:15');
      expect(formatDurationHHMMSS('00:00:45')).toBe('00:00:45');
      expect(formatDurationHHMMSS('20s')).toBe('00:00:20');
      expect(formatDurationHHMMSS(null)).toBe('00:00:30');
      expect(formatDurationHHMMSS('')).toBe('00:00:30');
    });
  });

  describe('buildFormattedLogLine', () => {
    it('constructs a line adhering to detected format columns and delimiters', () => {
      const format: LogFormat = {
        columnDelimiter: '\t',
        lineEnding: '\r\n',
        dateFormat: 'DD-MM-YYYY',
        hasEventId: true,
        sampleLine: '',
        itemDelimiter: 'MULTI_SPACE',
      };

      const line = buildFormattedLogLine(
        {
          timestamp: '13-10-2026 09:15:00',
          eventId: '000004BF',
          ref: 'AT-2005-AD1',
          advert: 'Spring Campaign Spot',
          duration: '30',
        },
        format
      );

      expect(line).toBe('13-10-2026 09:15:00\t000004BF\tAT-2005-AD1  Spring Campaign Spot\t00:00:30');
    });

    it('supports pipe delimiters between ref and advert', () => {
      const format: LogFormat = {
        columnDelimiter: '\t',
        lineEnding: '\n',
        dateFormat: 'YYYY-MM-DD',
        hasEventId: true,
        sampleLine: '',
        itemDelimiter: 'PIPE',
      };

      const line = buildFormattedLogLine(
        {
          timestamp: '2026-10-13 14:00:00',
          eventId: '000008A1',
          ref: 'AUT-500',
          advert: 'Auto Dealership',
          duration: '00:00:20',
        },
        format
      );

      expect(line).toBe('2026-10-13 14:00:00\t000008A1\tAUT-500 | Auto Dealership\t00:00:20');
    });
  });

  describe('parseTimestampToMillis', () => {
    it('correctly compares timestamps across different hours and minutes', () => {
      const t1 = parseTimestampToMillis('13-10-2026 08:00:00');
      const t2 = parseTimestampToMillis('13-10-2026 08:30:00');
      const t3 = parseTimestampToMillis('13-10-2026 09:00:00');

      expect(t1).toBeLessThan(t2);
      expect(t2).toBeLessThan(t3);
    });

    it('correctly parses ISO/hyphenated dates', () => {
      const tA = parseTimestampToMillis('2026-10-13 10:00:00');
      const tB = parseTimestampToMillis('13-10-2026 10:00:00');
      expect(tA).toBe(tB);
    });
  });

  describe('applyLogCorrections', () => {
    const rawOriginalLog = [
      '13-10-2026 08:00:00\t00000001\tAD-101  Brand Alpha\t00:00:30',
      '13-10-2026 10:00:00\t00000002\tAD-102  Brand Beta\t00:00:30',
      '13-10-2026 12:00:00\t00000003\tAD-103  Brand Gamma\t00:00:30',
    ].join('\r\n');

    const format: LogFormat = {
      columnDelimiter: '\t',
      lineEnding: '\r\n',
      dateFormat: 'DD-MM-YYYY',
      hasEventId: true,
      sampleLine: '',
      itemDelimiter: 'MULTI_SPACE',
    };

    it('preserves all unaffected lines verbatim when inserting a missing entry in chronological order', () => {
      const addition: LogCorrection = {
        id: 'corr-1',
        mode: 'ADD_MISSING',
        timestamp: '13-10-2026 09:00:00',
        date: '13-10-2026',
        time: '09:00:00',
        eventId: '0000001A',
        ref: 'AD-999',
        advert: 'Brand Missing',
        duration: '00:00:30',
        durationSec: 30,
        formattedLine: '13-10-2026 09:00:00\t0000001A\tAD-999  Brand Missing\t00:00:30',
        reason: 'Confirmed manual broadcast entry',
        createdAt: new Date().toISOString(),
        isConfirmed: true,
      };

      const { correctedText, appliedCount } = applyLogCorrections(rawOriginalLog, [addition], format);

      expect(appliedCount).toBe(1);
      const lines = correctedText.split('\r\n');
      expect(lines).toHaveLength(4);

      // Line 0 is untouched
      expect(lines[0]).toBe('13-10-2026 08:00:00\t00000001\tAD-101  Brand Alpha\t00:00:30');
      // Line 1 is the inserted chronological addition (09:00:00 between 08:00 and 10:00)
      expect(lines[1]).toBe('13-10-2026 09:00:00\t0000001A\tAD-999  Brand Missing\t00:00:30');
      // Line 2 is untouched
      expect(lines[2]).toBe('13-10-2026 10:00:00\t00000002\tAD-102  Brand Beta\t00:00:30');
      // Line 3 is untouched
      expect(lines[3]).toBe('13-10-2026 12:00:00\t00000003\tAD-103  Brand Gamma\t00:00:30');
    });

    it('edits an existing log line while keeping all other lines unaltered', () => {
      const edit: LogCorrection = {
        id: 'corr-edit-1',
        mode: 'EDIT_EXISTING',
        originalLine: '13-10-2026 10:00:00\t00000002\tAD-102  Brand Beta\t00:00:30',
        timestamp: '13-10-2026 10:00:00',
        date: '13-10-2026',
        time: '10:00:00',
        eventId: '00000002',
        ref: 'AD-102-CORRECTED',
        advert: 'Brand Beta Fixed',
        duration: '00:00:30',
        durationSec: 30,
        formattedLine: '13-10-2026 10:00:00\t00000002\tAD-102-CORRECTED  Brand Beta Fixed\t00:00:30',
        reason: 'Typo in ref code',
        createdAt: new Date().toISOString(),
        isConfirmed: true,
      };

      const { correctedText, appliedCount } = applyLogCorrections(rawOriginalLog, [edit], format);

      expect(appliedCount).toBe(1);
      const lines = correctedText.split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('13-10-2026 08:00:00\t00000001\tAD-101  Brand Alpha\t00:00:30');
      expect(lines[1]).toBe('13-10-2026 10:00:00\t00000002\tAD-102-CORRECTED  Brand Beta Fixed\t00:00:30');
      expect(lines[2]).toBe('13-10-2026 12:00:00\t00000003\tAD-103  Brand Gamma\t00:00:30');
    });

    it('returns original text verbatim when corrections array is empty', () => {
      const res = applyLogCorrections(rawOriginalLog, [], format);
      expect(res.correctedText).toBe(rawOriginalLog);
      expect(res.appliedCount).toBe(0);
    });
  });

  describe('createSuggestedCorrection', () => {
    it('creates pre-filled suggestion from a missing schedule item without auto-confirming', () => {
      const fakeMissing: AdDiscrepancyItem = {
        id: 'sched-row-42',
        status: 'POTENTIALLY_MISSING',
        ref: 'AT-8819-AD1',
        normalizedRef: 'AT-8819-AD1',
        advertName: 'Premium Motor Oil',
        program: 'Morning Drive',
        scheduledTime: '08:15',
        expectedCount: 1,
        actualCount: 0,
        duration: '00:00:30',
        durationDiffSec: 0,
        explanation: 'Scheduled commercial did not appear in playout automation log.',
        recommendedFollowUp: 'Verify transmission log with master control.',
        isReviewed: false,
        scheduleEvidence: [],
        logEvidence: [],
      };

      const suggestion = createSuggestedCorrection(fakeMissing, '2026-10-13', 50);

      expect(suggestion.mode).toBe('ADD_MISSING');
      expect(suggestion.targetScheduleId).toBe('sched-row-42');
      expect(suggestion.ref).toBe('AT-8819-AD1');
      expect(suggestion.advert).toBe('Premium Motor Oil');
      expect(suggestion.time).toBe('08:15:00');
      expect(suggestion.date).toBe('13-10-2026');
      expect(suggestion.duration).toBe('00:00:30');
      expect(suggestion.isConfirmed).toBe(false); // MUST not silently mark as confirmed
      expect(suggestion.formattedLine).toContain('AT-8819-AD1');
    });
  });

  describe('End-to-End Verification Re-run with Corrected Log', () => {
    it('verifies that re-running comparison with a corrected log updates metrics and tags manual entries', () => {
      // 1. Create a synthetic planned schedule with 2 placements
      const scheduleText = [
        'Planned Advertising Schedule',
        'Date: 13-10-2026',
        '',
        'Show\tTime\tPlacements\tRef\tAdvert\tLength',
        'Morning Show\t08:00\t1\tAT-101-AD1\tFirst Commercial\t00:00:30',
        'Afternoon Show\t14:00\t1\tAT-202-AD2\tSecond Commercial\t00:00:30',
      ].join('\r\n');

      // 2. Create an initial log that only aired the first placement (second is missing!)
      const originalLogText = [
        '13-10-2026 08:00:10\t00000001\tAT-101-AD1  First Commercial\t00:00:30',
      ].join('\r\n');

      const broadcastDate = new Date('2026-10-13T00:00:00Z');
      const parsedSched = parseScheduleText(scheduleText, broadcastDate);
      const parsedLog1 = parseLogText(originalLogText);

      // 3. Baseline comparison
      const baseline = runAdComparison(parsedSched.records, parsedLog1.records, {
        broadcastDate,
        scheduleFileName: 'Schedule.txt',
        logFileName: 'Playout.log',
      });

      expect(baseline.summary.totalScheduleRows).toBe(2);
      expect(baseline.summary.matchedPlacements).toBe(1);
      expect(baseline.summary.potentiallyMissingPlacements).toBe(1);

      const missingItem = baseline.items.find(i => i.status === 'POTENTIALLY_MISSING');
      expect(missingItem).toBeDefined();
      expect(missingItem?.ref).toBe('AT-202-AD2');

      // 4. Operator stages a confirmed correction for the missing ad
      const format = detectLogFormat(originalLogText);
      const correction: LogCorrection = {
        id: 'corr-test-1',
        mode: 'ADD_MISSING',
        targetScheduleId: missingItem!.id,
        timestamp: '13-10-2026 14:00:15',
        date: '13-10-2026',
        time: '14:00:15',
        eventId: '00000002',
        ref: missingItem!.ref,
        advert: missingItem!.advertName,
        duration: '00:00:30',
        durationSec: 30,
        formattedLine: buildFormattedLogLine(
          {
            timestamp: '13-10-2026 14:00:15',
            eventId: '00000002',
            ref: missingItem!.ref,
            advert: missingItem!.advertName,
            duration: '00:00:30',
          },
          format
        ),
        reason: 'Operator verified tape playback on transmission line',
        createdAt: new Date().toISOString(),
        isConfirmed: true,
      };

      // 5. Generate corrected log text
      const { correctedText, appliedCount } = applyLogCorrections(originalLogText, [correction], format);
      expect(appliedCount).toBe(1);

      // Verify the corrected text contains both lines in order
      const correctedLines = correctedText.split(/\r?\n/).filter(Boolean);
      expect(correctedLines).toHaveLength(2);
      expect(correctedLines[0]).toContain('AT-101-AD1');
      expect(correctedLines[1]).toContain('AT-202-AD2');

      // 6. Re-parse corrected log and re-run comparison
      const parsedLog2 = parseLogText(correctedText);
      const reComparison = runAdComparison(parsedSched.records, parsedLog2.records, {
        broadcastDate,
        scheduleFileName: 'Schedule.txt',
        logFileName: 'Playout-corrected.log',
      });

      // 7. Verify all placements are now matched (100% compliance)
      expect(reComparison.summary.matchedPlacements).toBe(2);
      expect(reComparison.summary.potentiallyMissingPlacements).toBe(0);
      expect(reComparison.summary.complianceRate).toBe(100);

      // 8. Tag manually corrected items (as done in Home page)
      const correctedItems = reComparison.items.map(item => {
        if (item.ref === correction.ref) {
          return {
            ...item,
            isManuallyCorrected: true,
            manualCorrectionNote: correction.reason,
          };
        }
        return item;
      });

      const matchedManually = correctedItems.find(i => i.ref === 'AT-202-AD2');
      expect(matchedManually?.isManuallyCorrected).toBe(true);
      expect(matchedManually?.manualCorrectionNote).toBe('Operator verified tape playback on transmission line');

      // 9. Excel and PDF reports can be built with the corrected result without error
      const wb = buildComparisonWorkbook({
        ...reComparison,
        items: correctedItems,
      });
      expect(wb.SheetNames).toContain('Matched Airings');

      const doc = buildComparisonPDF({
        ...reComparison,
        items: correctedItems,
      });
      expect(doc).toBeDefined();
    });
  });
});
