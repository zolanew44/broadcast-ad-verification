'use client';

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import {
  UploadCloud,
  FileCheck2,
  FileWarning,
  ArrowLeftRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Play,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { decodeFileBuffer, DecodedResult } from '@/lib/encoding';
import { parseScheduleText, ScheduleParseResult } from '@/lib/scheduleParser';
import { parseLogText, LogParseResult } from '@/lib/logParser';
import { extractBroadcastDate, formatDateISO } from '@/lib/dateUtils';
import { ScheduleRecord, LogRecord } from '@/types';

export interface UploadedFileState {
  file: File | null;
  name: string;
  size: number;
  decoded: DecodedResult | null;
  rawBuffer: ArrayBuffer | null;
}

interface FileUploadZoneProps {
  onRunComparison: (
    scheduleRecords: ScheduleRecord[],
    logRecords: LogRecord[],
    broadcastDate: Date,
    scheduleName: string,
    logName: string,
    rawLogText?: string
  ) => void;
  isComparing: boolean;
  onLoadSample: () => void;
  isLoadingSample: boolean;
  externalSchedule?: UploadedFileState | null;
  externalLog?: UploadedFileState | null;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onRunComparison,
  isComparing,
  onLoadSample,
  isLoadingSample,
  externalSchedule,
  externalLog,
}) => {
  const [scheduleState, setScheduleState] = useState<UploadedFileState | null>(null);
  const [logState, setLogState] = useState<UploadedFileState | null>(null);

  // Sync external files if loaded via "Load Sample Files"
  React.useEffect(() => {
    if (externalSchedule) setScheduleState(externalSchedule);
  }, [externalSchedule]);

  React.useEffect(() => {
    if (externalLog) setLogState(externalLog);
  }, [externalLog]);

  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [showLogPreview, setShowLogPreview] = useState(false);
  const [customBroadcastDate, setCustomBroadcastDate] = useState<string>('');

  const [scheduleParseResult, setScheduleParseResult] = useState<ScheduleParseResult | null>(null);
  const [logParseResult, setLogParseResult] = useState<LogParseResult | null>(null);

  const [dragOverA, setDragOverA] = useState(false);
  const [dragOverB, setDragOverB] = useState(false);

  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const logInputRef = useRef<HTMLInputElement>(null);

  // Parse whenever either file changes
  React.useEffect(() => {
    if (!scheduleState?.decoded && !logState?.decoded) {
      setScheduleParseResult(null);
      setLogParseResult(null);
      return;
    }

    // Determine broadcast date
    let bDate: Date;
    if (customBroadcastDate) {
      bDate = new Date(`${customBroadcastDate}T00:00:00Z`);
    } else {
      bDate = extractBroadcastDate(
        logState?.decoded?.text ? logState.decoded.text.slice(0, 500) : null,
        logState?.name || scheduleState?.name
      );
    }

    if (scheduleState?.decoded?.text) {
      const res = parseScheduleText(scheduleState.decoded.text, bDate);
      setScheduleParseResult(res);
    } else {
      setScheduleParseResult(null);
    }

    if (logState?.decoded?.text) {
      const res = parseLogText(logState.decoded.text);
      setLogParseResult(res);
      if (!customBroadcastDate && res.detectedBroadcastDate) {
        setCustomBroadcastDate(res.detectedBroadcastDate);
      }
    } else {
      setLogParseResult(null);
    }
  }, [scheduleState, logState, customBroadcastDate]);

  // Check for misplaced files (e.g. user put log into schedule slot or vice-versa)
  const isMisplacedSchedule = React.useMemo(() => {
    if (!scheduleState?.decoded?.text) return false;
    // If schedule text starts with timestamps like "13-10-2026 00:00:00" and hex IDs, it is likely a log!
    const sample = scheduleState.decoded.text.slice(0, 1000);
    return /\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}\s+[0-9A-Fa-f]{6,8}/.test(sample);
  }, [scheduleState]);

  const isMisplacedLog = React.useMemo(() => {
    if (!logState?.decoded?.text) return false;
    // If log text has "Show", "Placements", "Ref", "Advert" headers, it is likely a schedule!
    const sample = logState.decoded.text.slice(0, 1000).toLowerCase();
    return sample.includes('placements') && sample.includes('advert') && sample.includes('show');
  }, [logState]);

  const handleProcessFile = async (
    file: File,
    type: 'schedule' | 'log'
  ) => {
    try {
      const buffer = await file.arrayBuffer();
      const decoded = decodeFileBuffer(buffer);
      const stateObj: UploadedFileState = {
        file,
        name: file.name,
        size: file.size,
        decoded,
        rawBuffer: buffer,
      };

      if (type === 'schedule') {
        setScheduleState(stateObj);
      } else {
        setLogState(stateObj);
      }
    } catch (err) {
      console.error(`Error decoding ${type} file:`, err);
      alert(`Could not decode ${file.name}. Please ensure it is a valid text or log file.`);
    }
  };

  const handleSwapFiles = () => {
    const temp = scheduleState;
    setScheduleState(logState);
    setLogState(temp);
  };

  const handleStartComparison = () => {
    if (!scheduleParseResult || !logParseResult || !scheduleState || !logState) return;

    let bDate: Date;
    if (customBroadcastDate) {
      bDate = new Date(`${customBroadcastDate}T00:00:00Z`);
    } else {
      bDate = extractBroadcastDate(null, logState.name || scheduleState.name);
    }

    onRunComparison(
      scheduleParseResult.records,
      logParseResult.records,
      bDate,
      scheduleState.name,
      logState.name,
      logState.decoded?.text || ''
    );
  };

  const isReadyToCompare =
    scheduleState !== null &&
    logState !== null &&
    (scheduleParseResult?.records.length ?? 0) > 0 &&
    (logParseResult?.records.length ?? 0) > 0 &&
    !isMisplacedSchedule &&
    !isMisplacedLog;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
      {/* Header and description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center">
            <Layers className="w-5 h-5 mr-2 text-blue-600" />
            Upload Daily Broadcast Files
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Compare planned commercial advertising schedule against actual playout automation log files (.txt, .log).
          </p>
        </div>

        {/* 1-Click Load Sample Button */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onLoadSample}
            disabled={isLoadingSample}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-indigo-600" />
            {isLoadingSample ? 'Loading Fixtures...' : 'Load Sample Fixtures (Oct 13, 2026)'}
          </button>
        </div>
      </div>

      {/* Misplacement Alert / Swap Notification */}
      {(isMisplacedSchedule || isMisplacedLog) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Files appear to be swapped!</span>
              <p className="text-xs text-amber-700 mt-0.5">
                The file uploaded in Area A resembles a broadcast playout log, while Area B resembles a schedule.
              </p>
            </div>
          </div>
          <button
            onClick={handleSwapFiles}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
            Swap Files Now
          </button>
        </div>
      )}

      {/* Two Upload Zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Area A: Planned Schedule */}
        <div
          onDragOver={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOverA(true);
          }}
          onDragLeave={() => setDragOverA(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOverA(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleProcessFile(e.dataTransfer.files[0], 'schedule');
            }
          }}
          className={`relative rounded-xl border-2 border-dashed p-6 transition-all duration-200 ${
            dragOverA
              ? 'border-blue-500 bg-blue-50/50 shadow-inner'
              : scheduleState
              ? 'border-blue-200 bg-blue-50/20'
              : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={scheduleInputRef}
            type="file"
            accept=".txt,.log"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files[0]) {
                handleProcessFile(e.target.files[0], 'schedule');
              }
            }}
          />

          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                A
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Planned Advertising Schedule
              </h3>
            </div>
            {scheduleState && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
              </span>
            )}
          </div>

          {!scheduleState ? (
            <div
              onClick={() => scheduleInputRef.current?.click()}
              className="mt-4 flex flex-col items-center justify-center py-6 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="mt-3 text-xs font-medium text-slate-700">
                Drop planned schedule (.txt) here or <span className="text-blue-600 font-semibold underline">browse</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports UTF-8, UTF-8 BOM, UTF-16LE, tab-separated
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-900 truncate">{scheduleState.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(scheduleState.size / 1024).toFixed(1)} KB &bull;{' '}
                    <span className="font-medium text-slate-700">{scheduleState.decoded?.encoding}</span> &bull;{' '}
                    {scheduleParseResult?.records.length || 0} scheduled ad records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => scheduleInputRef.current?.click()}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 underline flex-shrink-0"
                >
                  Replace
                </button>
              </div>

              {/* Toggle Preview */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowSchedulePreview(!showSchedulePreview)}
                  className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  {showSchedulePreview ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 mr-1 text-slate-400" /> Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 mr-1 text-slate-400" /> Preview Parsed Records ({Math.min(5, scheduleParseResult?.records.length || 0)})
                    </>
                  )}
                </button>
              </div>

              {/* Preview table */}
              {showSchedulePreview && scheduleParseResult && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead>
                      <tr className="text-left text-slate-500 font-semibold">
                        <th className="p-1">Time</th>
                        <th className="p-1">Ref</th>
                        <th className="p-1">Advert</th>
                        <th className="p-1">Placement</th>
                        <th className="p-1">End Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scheduleParseResult.records.slice(0, 5).map(r => (
                        <tr key={r.id} className="text-slate-700">
                          <td className="p-1 font-mono">{r.time}</td>
                          <td className="p-1 font-mono font-bold text-blue-700">{r.ref}</td>
                          <td className="p-1 truncate max-w-[120px]">{r.advert}</td>
                          <td className="p-1">{r.placements}</td>
                          <td className="p-1">
                            {r.isExpired ? (
                              <span className="text-red-600 font-semibold">{r.rawEndDate} (Expired)</span>
                            ) : (
                              r.rawEndDate || 'Ongoing'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload Area B: Actual Broadcast Automation Log */}
        <div
          onDragOver={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOverB(true);
          }}
          onDragLeave={() => setDragOverB(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOverB(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleProcessFile(e.dataTransfer.files[0], 'log');
            }
          }}
          className={`relative rounded-xl border-2 border-dashed p-6 transition-all duration-200 ${
            dragOverB
              ? 'border-indigo-500 bg-indigo-50/50 shadow-inner'
              : logState
              ? 'border-indigo-200 bg-indigo-50/20'
              : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={logInputRef}
            type="file"
            accept=".txt,.log"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files[0]) {
                handleProcessFile(e.target.files[0], 'log');
              }
            }}
          />

          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">
                B
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Actual Broadcast Log
              </h3>
            </div>
            {logState && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
              </span>
            )}
          </div>

          {!logState ? (
            <div
              onClick={() => logInputRef.current?.click()}
              className="mt-4 flex flex-col items-center justify-center py-6 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="mt-3 text-xs font-medium text-slate-700">
                Drop actual log (.txt, .log) here or <span className="text-indigo-600 font-semibold underline">browse</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports UTF-16LE, UTF-8, timestamps, playout events
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-900 truncate">{logState.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(logState.size / 1024).toFixed(1)} KB &bull;{' '}
                    <span className="font-medium text-slate-700">{logState.decoded?.encoding}</span> &bull;{' '}
                    {logParseResult?.adRecords.length || 0} commercial airings logged
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => logInputRef.current?.click()}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline flex-shrink-0"
                >
                  Replace
                </button>
              </div>

              {/* Toggle Preview */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowLogPreview(!showLogPreview)}
                  className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  {showLogPreview ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 mr-1 text-slate-400" /> Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 mr-1 text-slate-400" /> Preview Parsed Airings ({Math.min(5, logParseResult?.adRecords.length || 0)})
                    </>
                  )}
                </button>
              </div>

              {/* Preview table */}
              {showLogPreview && logParseResult && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead>
                      <tr className="text-left text-slate-500 font-semibold">
                        <th className="p-1">Timestamp</th>
                        <th className="p-1">Event ID</th>
                        <th className="p-1">Ref</th>
                        <th className="p-1">Title</th>
                        <th className="p-1">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logParseResult.adRecords.slice(0, 5).map(r => (
                        <tr key={r.id} className="text-slate-700">
                          <td className="p-1 font-mono text-[10px]">{r.timestamp}</td>
                          <td className="p-1 font-mono text-slate-400">{r.eventId}</td>
                          <td className="p-1 font-mono font-bold text-indigo-700">{r.ref}</td>
                          <td className="p-1 truncate max-w-[120px]">{r.advert}</td>
                          <td className="p-1 font-mono">{r.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Broadcast Date Setting & Compare Action Bar */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Broadcast Date override */}
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <Calendar className="w-4 h-4 text-slate-400" />
          <label htmlFor="broadcastDate" className="font-medium text-slate-700">
            Target Broadcast Date:
          </label>
          <input
            id="broadcastDate"
            type="date"
            value={customBroadcastDate}
            onChange={e => setCustomBroadcastDate(e.target.value)}
            className="px-2 py-1 border border-slate-300 rounded text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Start Comparison Button */}
        <button
          type="button"
          onClick={handleStartComparison}
          disabled={!isReadyToCompare || isComparing}
          className={`w-full sm:w-auto inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all ${
            isReadyToCompare && !isComparing
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25 cursor-pointer active:scale-98'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          {isComparing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Comparing Placements...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2 fill-current" />
              Compare Advertisements
            </>
          )}
        </button>
      </div>
    </div>
  );
};
