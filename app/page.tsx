'use client';

import React, { useState, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { FileUploadZone, UploadedFileState } from '@/components/FileUploadZone';
import { DashboardSummary } from '@/components/DashboardSummary';
import { DiscrepancyTable } from '@/components/DiscrepancyTable';
import { PrivacyModal } from '@/components/PrivacyModal';
import {
  ScheduleRecord,
  LogRecord,
  ComparisonResult,
  AdDiscrepancyItem,
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

export default function Home() {
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('ALL');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  // States to pass down to upload zone if sample data is loaded
  const [externalSchedule, setExternalSchedule] = useState<UploadedFileState | null>(null);
  const [externalLog, setExternalLog] = useState<UploadedFileState | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  const handleRunComparison = (
    scheduleRecords: ScheduleRecord[],
    logRecords: LogRecord[],
    broadcastDate: Date,
    scheduleName: string,
    logName: string
  ) => {
    setIsComparing(true);

    // Run comparison deterministically
    setTimeout(() => {
      try {
        const result = runAdComparison(scheduleRecords, logRecords, {
          broadcastDate,
          scheduleFileName: scheduleName,
          logFileName: logName,
          durationToleranceSec: 5,
        });

        setComparisonResult(result);
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

        const result = runAdComparison(schedParsed.records, logParsed.records, {
          broadcastDate: bDate,
          scheduleFileName: SAMPLE_SCHEDULE_FILENAME,
          logFileName: SAMPLE_LOG_FILENAME,
          durationToleranceSec: 5,
        });

        setComparisonResult(result);
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
    setComparisonResult(null);
    setExternalSchedule(null);
    setExternalLog(null);
    setActiveStatusFilter('ALL');
  };

  const handleToggleReviewed = (itemId: string, note?: string) => {
    if (!comparisonResult) return;

    setComparisonResult(prev => {
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
    });
  };

  const handleExportExcel = () => {
    if (!comparisonResult) return;
    exportComparisonToExcel(comparisonResult);
  };

  const handleExportPDF = () => {
    if (!comparisonResult) return;
    exportComparisonToPDF(comparisonResult);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation */}
      <Navbar
        broadcastDate={comparisonResult?.summary.broadcastDate}
        hasComparison={comparisonResult !== null}
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
        {comparisonResult && (
          <div ref={resultsRef} className="space-y-8 animate-in fade-in duration-300">
            {/* KPI Overview and Executive Summary */}
            <section aria-label="Executive Summary">
              <DashboardSummary
                summary={comparisonResult.summary}
                items={comparisonResult.items}
                onExportExcel={handleExportExcel}
                onExportPDF={handleExportPDF}
                activeFilterStatus={activeStatusFilter}
                onSelectStatusFilter={status => setActiveStatusFilter(status)}
              />
            </section>

            {/* Detailed Discrepancy Table */}
            <section aria-label="Detailed Results">
              <DiscrepancyTable
                items={comparisonResult.items}
                onToggleReviewed={handleToggleReviewed}
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
    </div>
  );
}
