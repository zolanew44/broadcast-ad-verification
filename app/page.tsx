'use client';

import React, { useState, useRef } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  Download,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { FileUploadZone, UploadedFileState } from '@/components/FileUploadZone';
import { DashboardSummary } from '@/components/DashboardSummary';
import { DiscrepancyTable } from '@/components/DiscrepancyTable';
import { PrivacyModal } from '@/components/PrivacyModal';
import { LogCorrectionModal } from '@/components/LogCorrectionModal';
import {
  ScheduleRecord,
  LogRecord,
  ComparisonResult,
  AdDiscrepancyItem,
  LogCorrection,
} from '@/types';
import { runAdComparison } from '@/lib/comparisonEngine';
import { decodeFileBuffer } from '@/lib/encoding';
import {
  SAMPLE_SCHEDULE_FILENAME,
  SAMPLE_LOG_FILENAME,
  getSampleScheduleBuffer,
  getSampleLogBuffer,
} from '@/lib/sampleData';
import { exportComparisonToExcel, exportComparisonToPDF } from '@/lib/reportGenerators';
import { parseScheduleText } from '@/lib/scheduleParser';
import { parseLogText } from '@/lib/logParser';
import { extractBroadcastDate } from '@/lib/dateUtils';
import {
  detectLogFormat,
  applyLogCorrections,
  downloadCorrectedLogFile,
} from '@/lib/logCorrectionEngine';

export default function Home() {
  const [baselineResult, setBaselineResult] = useState<ComparisonResult | null>(null);
  const [correctedResult, setCorrectedResult] = useState<ComparisonResult | null>(null);
  const [viewMode, setViewMode] = useState<'BASELINE' | 'CORRECTED'>('BASELINE');

  const [isComparing, setIsComparing] = useState(false);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('ALL');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // States for correction workflow and raw playout preservation
  const [originalLogRawText, setOriginalLogRawText] = useState<string>('');
  const [originalLogFilename, setOriginalLogFilename] = useState<string>('');
  const [scheduleRecords, setScheduleRecords] = useState<ScheduleRecord[]>([]);
  const [logRecords, setLogRecords] = useState<LogRecord[]>([]);
  const [activeBroadcastDate, setActiveBroadcastDate] = useState<Date>(new Date('2026-10-13T00:00:00Z'));
  const [activeScheduleName, setActiveScheduleName] = useState<string>('');

  const [stagedCorrections, setStagedCorrections] = useState<LogCorrection[]>([]);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [selectedCorrectionItemId, setSelectedCorrectionItemId] = useState<string | null>(null);

  // States to pass down to upload zone if sample data is loaded
  const [externalSchedule, setExternalSchedule] = useState<UploadedFileState | null>(null);
  const [externalLog, setExternalLog] = useState<UploadedFileState | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  const activeComparisonResult = viewMode === 'CORRECTED' && correctedResult ? correctedResult : baselineResult;

  const handleRunComparison = (
    schedRecs: ScheduleRecord[],
    logRecs: LogRecord[],
    broadcastDate: Date,
    scheduleName: string,
    logName: string,
    rawLogText?: string
  ) => {
    setIsComparing(true);
    setScheduleRecords(schedRecs);
    setLogRecords(logRecs);
    setActiveBroadcastDate(broadcastDate);
    setActiveScheduleName(scheduleName);
    setOriginalLogFilename(logName);
    setOriginalLogRawText(rawLogText || '');
    setStagedCorrections([]);
    setCorrectedResult(null);
    setViewMode('BASELINE');

    // Run comparison deterministically
    setTimeout(() => {
      try {
        const result = runAdComparison(schedRecs, logRecs, {
          broadcastDate,
          scheduleFileName: scheduleName,
          logFileName: logName,
          durationToleranceSec: 5,
        });

        setBaselineResult(result);
        setActiveStatusFilter('ALL');

        // Scroll smoothly to results
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } catch (err) {
        console.error('Comparison error:', err);
        alert('An unexpected error occurred during comparison. Please check the uploaded files.');
      } finally {
        setIsComparing(false);
      }
    }, 150);
  };

  const handleLoadSample = () => {
    setIsLoadingSample(true);
    setTimeout(() => {
      try {
        const schedBuf = getSampleScheduleBuffer();
        const logBuf = getSampleLogBuffer();

        const decodedSched = decodeFileBuffer(schedBuf);
        const decodedLog = decodeFileBuffer(logBuf);

        const schedState: UploadedFileState = {
          file: null,
          name: SAMPLE_SCHEDULE_FILENAME,
          size: schedBuf.byteLength,
          decoded: decodedSched,
          rawBuffer: schedBuf,
        };

        const logState: UploadedFileState = {
          file: null,
          name: SAMPLE_LOG_FILENAME,
          size: logBuf.byteLength,
          decoded: decodedLog,
          rawBuffer: logBuf,
        };

        setExternalSchedule(schedState);
        setExternalLog(logState);

        const bDate = extractBroadcastDate(null, SAMPLE_LOG_FILENAME);
        const schedParsed = parseScheduleText(decodedSched.text, bDate);
        const logParsed = parseLogText(decodedLog.text);

        setScheduleRecords(schedParsed.records);
        setLogRecords(logParsed.records);
        setActiveBroadcastDate(bDate);
        setActiveScheduleName(SAMPLE_SCHEDULE_FILENAME);
        setOriginalLogFilename(SAMPLE_LOG_FILENAME);
        setOriginalLogRawText(decodedLog.text);
        setStagedCorrections([]);
        setCorrectedResult(null);
        setViewMode('BASELINE');

        const result = runAdComparison(schedParsed.records, logParsed.records, {
          broadcastDate: bDate,
          scheduleFileName: SAMPLE_SCHEDULE_FILENAME,
          logFileName: SAMPLE_LOG_FILENAME,
          durationToleranceSec: 5,
        });

        setBaselineResult(result);
        setActiveStatusFilter('ALL');

        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } catch (err) {
        console.error('Error loading sample data:', err);
        alert('Failed to load sample data fixture.');
      } finally {
        setIsLoadingSample(false);
      }
    }, 200);
  };

  const handleReset = () => {
    setBaselineResult(null);
    setCorrectedResult(null);
    setViewMode('BASELINE');
    setExternalSchedule(null);
    setExternalLog(null);
    setScheduleRecords([]);
    setLogRecords([]);
    setOriginalLogRawText('');
    setOriginalLogFilename('');
    setStagedCorrections([]);
    setActiveStatusFilter('ALL');
  };

  const handleOpenFixMissing = (itemId?: string) => {
    setSelectedCorrectionItemId(itemId || null);
    setIsCorrectionModalOpen(true);
  };

  const handleApplyAndRerun = (correctedLogRawText: string, corrections: LogCorrection[]) => {
    try {
      const newLogResult = parseLogText(correctedLogRawText);
      const newComparison = runAdComparison(scheduleRecords, newLogResult.records, {
        broadcastDate: activeBroadcastDate,
        scheduleFileName: activeScheduleName,
        logFileName: originalLogFilename,
        durationToleranceSec: 5,
      });

      // Tag items that were matched to manually corrected log records
      const targetScheduleIds = new Set(corrections.map(c => c.targetScheduleId).filter(Boolean));
      const targetLogLines = new Set(corrections.map(c => c.formattedLine.trim()));
      const targetRefs = new Set(corrections.map(c => c.ref.toUpperCase()));

      const updatedItems = newComparison.items.map(item => {
        const isMatchedCorrection =
          targetScheduleIds.has(item.id) ||
          item.logEvidence.some(l => targetLogLines.has(l.raw.trim()) || targetRefs.has(l.ref.toUpperCase()));

        if (isMatchedCorrection) {
          const matchedCorrection = corrections.find(c =>
            c.targetScheduleId === item.id ||
            item.logEvidence.some(l => l.raw.trim() === c.formattedLine.trim()) ||
            c.ref.toUpperCase() === item.ref.toUpperCase()
          );

          return {
            ...item,
            isManuallyCorrected: true,
            manualCorrectionNote: matchedCorrection?.reason || 'Manually confirmed airing / corrected log entry.',
          };
        }
        return item;
      });

      const finalCorrectedResult: ComparisonResult = {
        ...newComparison,
        items: updatedItems,
      };

      setCorrectedResult(finalCorrectedResult);
      setViewMode('CORRECTED');
      setActiveStatusFilter('ALL');
    } catch (err) {
      console.error('Error re-running verification with corrections:', err);
      alert('Failed to re-run verification with the corrected log.');
    }
  };

  const handleToggleReviewed = (itemId: string, note?: string) => {
    const updateResult = (prev: ComparisonResult | null) => {
      if (!prev) return null;
      const updatedItems = prev.items.map(item => {
        if (item.id === itemId) {
          const isReviewed = note !== undefined ? true : !item.isReviewed;
          return {
            ...item,
            isReviewed,
            reviewNote: note !== undefined ? note : item.reviewNote,
            reviewedAt: isReviewed ? new Date().toISOString() : undefined,
          };
        }
        return item;
      });

      return {
        ...prev,
        items: updatedItems,
      };
    };

    if (viewMode === 'CORRECTED') {
      setCorrectedResult(updateResult);
    } else {
      setBaselineResult(updateResult);
    }
  };

  const handleExportExcel = () => {
    if (!activeComparisonResult) return;
    exportComparisonToExcel(activeComparisonResult);
  };

  const handleExportPDF = () => {
    if (!activeComparisonResult) return;
    exportComparisonToPDF(activeComparisonResult);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation */}
      <Navbar
        broadcastDate={activeComparisonResult?.summary.broadcastDate}
        hasComparison={activeComparisonResult !== null}
        onReset={handleReset}
        onLoadSample={handleLoadSample}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        isLoadingSample={isLoadingSample}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Upload Zone */}
        <section aria-label="Upload Files">
          <FileUploadZone
            onRunComparison={handleRunComparison}
            isComparing={isComparing}
            onLoadSample={handleLoadSample}
            isLoadingSample={isLoadingSample}
            externalSchedule={externalSchedule}
            externalLog={externalLog}
          />
        </section>

        {/* Dashboard and Results Section */}
        {activeComparisonResult && (
          <div ref={resultsRef} className="space-y-6 animate-in fade-in duration-300">
            {/* Corrected Playout Audit Banner */}
            {correctedResult && (
              <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 p-5 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-indigo-600 text-white flex items-center">
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                        {viewMode === 'CORRECTED' ? 'Corrected Verification View Active' : 'Baseline (Original) View Active'}
                      </span>
                      <span className="text-xs text-indigo-700 font-semibold">
                        {stagedCorrections.length} Manual Playout Adjustment(s)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 max-w-2xl">
                      {viewMode === 'CORRECTED'
                        ? 'Currently displaying compliance metrics against the user-corrected playout log. Manually recorded airings are marked with a purple badge.'
                        : 'Currently viewing the original unmodified automation log. Click "Switch to Corrected View" to see results with your adjustments.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewMode(v => (v === 'CORRECTED' ? 'BASELINE' : 'CORRECTED'))}
                      className="inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-xl border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 transition shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      {viewMode === 'CORRECTED' ? 'View Original Baseline' : 'Switch to Corrected View'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const format = detectLogFormat(originalLogRawText);
                        const { correctedText } = applyLogCorrections(originalLogRawText, stagedCorrections, format);
                        downloadCorrectedLogFile(
                          correctedText,
                          originalLogFilename,
                          baselineResult?.summary.broadcastDate || '2026-10-13'
                        );
                      }}
                      className="inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export Corrected TXT Log
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenFixMissing()}
                      className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 hover:bg-white/80 transition"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                      Studio
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Overview and Executive Summary */}
            <section aria-label="Executive Summary">
              <DashboardSummary
                summary={activeComparisonResult.summary}
                items={activeComparisonResult.items}
                onExportExcel={handleExportExcel}
                onExportPDF={handleExportPDF}
                onOpenFixMissing={() => handleOpenFixMissing()}
                activeFilterStatus={activeStatusFilter}
                onSelectStatusFilter={status => setActiveStatusFilter(status)}
              />
            </section>

            {/* Detailed Discrepancy Table */}
            <section aria-label="Detailed Results">
              <DiscrepancyTable
                items={activeComparisonResult.items}
                onToggleReviewed={handleToggleReviewed}
                onOpenFixItem={item => handleOpenFixMissing(item.id)}
                selectedStatusFilter={activeStatusFilter}
                onSelectStatusFilter={status => setActiveStatusFilter(status)}
              />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-medium text-slate-700">
            Broadcast Ad Verification System &bull; Enterprise Playout Compliance Audit
          </p>
          <p>
            100% In-Browser Deterministic Processing &bull; Compliant with Vercel Production Standards &bull; Zero Server Storage
          </p>
        </div>
      </footer>

      {/* Privacy Guarantee Modal */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* Log Correction & Export Studio Modal */}
      <LogCorrectionModal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        missingItems={baselineResult?.items.filter(i => i.status === 'POTENTIALLY_MISSING') || []}
        logRecords={logRecords}
        originalLogRawText={originalLogRawText}
        originalLogFilename={originalLogFilename}
        broadcastDate={activeComparisonResult?.summary.broadcastDate || '2026-10-13'}
        onApplyAndRerun={handleApplyAndRerun}
        stagedCorrections={stagedCorrections}
        onSetStagedCorrections={setStagedCorrections}
        initialMissingItemId={selectedCorrectionItemId}
      />
    </div>
  );
}
