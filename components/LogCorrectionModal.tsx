'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  RefreshCw,
  Trash2,
  Edit3,
  PlusCircle,
  Sparkles,
  History,
  Calendar,
  Clock,
  ArrowRight,
  Undo2,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import {
  AdDiscrepancyItem,
  LogRecord,
  LogCorrection,
  LogFormat,
} from '@/types';
import {
  detectLogFormat,
  buildFormattedLogLine,
  applyLogCorrections,
  downloadCorrectedLogFile,
  createSuggestedCorrection,
  formatDurationHHMMSS,
} from '@/lib/logCorrectionEngine';

interface LogCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingItems: AdDiscrepancyItem[];
  logRecords: LogRecord[];
  originalLogRawText: string;
  originalLogFilename: string;
  broadcastDate: string;
  onApplyAndRerun: (correctedLogRawText: string, corrections: LogCorrection[]) => void;
  stagedCorrections: LogCorrection[];
  onSetStagedCorrections: React.Dispatch<React.SetStateAction<LogCorrection[]>>;
  initialMissingItemId?: string | null;
}

export const LogCorrectionModal: React.FC<LogCorrectionModalProps> = ({
  isOpen,
  onClose,
  missingItems,
  logRecords,
  originalLogRawText,
  originalLogFilename,
  broadcastDate,
  onApplyAndRerun,
  stagedCorrections,
  onSetStagedCorrections,
  initialMissingItemId,
}) => {
  const [activeTab, setActiveTab] = useState<'MISSING' | 'EDIT_LOG' | 'AUDIT'>('MISSING');
  const [selectedMissingId, setSelectedMissingId] = useState<string | null>(null);

  // Edit existing log search & selection
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Form states for active editing/addition
  const [formMode, setFormMode] = useState<'ADD_MISSING' | 'EDIT_EXISTING'>('ADD_MISSING');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formEventId, setFormEventId] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formAdvert, setFormAdvert] = useState('');
  const [formDuration, setFormDuration] = useState('00:00:30');
  const [formReason, setFormReason] = useState('');
  const [formOriginalLine, setFormOriginalLine] = useState<string | undefined>(undefined);
  const [formTargetLogId, setFormTargetLogId] = useState<string | undefined>(undefined);
  const [formTargetScheduleId, setFormTargetScheduleId] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Detect format of the original log
  const detectedFormat = useMemo(() => {
    return detectLogFormat(originalLogRawText);
  }, [originalLogRawText]);

  // Initialize draft for a missing placement
  const handleSelectMissingForCorrection = (item: AdDiscrepancyItem) => {
    setSelectedMissingId(item.id);
    const draft = createSuggestedCorrection(item, broadcastDate, logRecords.length + stagedCorrections.length);

    setFormMode('ADD_MISSING');
    setFormDate(draft.date);
    setFormTime(draft.time);
    setFormEventId(draft.eventId);
    setFormRef(draft.ref);
    setFormAdvert(draft.advert);
    setFormDuration(draft.duration);
    setFormReason(`Confirmed airing of scheduled placement in "${item.program}" (${item.scheduledTime}).`);
    setFormOriginalLine(undefined);
    setFormTargetLogId(undefined);
    setFormTargetScheduleId(item.id);
    setValidationError(null);
    setSuccessMessage(null);
  };

  // Initialize draft for editing an existing log record
  const handleSelectLogForEdit = (log: LogRecord) => {
    setSelectedLogId(log.id);
    setFormMode('EDIT_EXISTING');
    setFormDate(log.date || (broadcastDate ? broadcastDate.split('-').reverse().join('-') : '13-10-2026'));
    setFormTime(log.time || '08:00:00');
    setFormEventId(log.eventId || '00000001');
    setFormRef(log.ref);
    setFormAdvert(log.advert);
    setFormDuration(log.duration || '00:00:30');
    setFormReason(`Corrected log entry: fixed metadata for reference "${log.ref}".`);
    setFormOriginalLine(log.raw);
    setFormTargetLogId(log.id);
    setFormTargetScheduleId(undefined);
    setValidationError(null);
    setSuccessMessage(null);
  };

  // Validate and stage the current correction
  const handleStageCorrection = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formRef.trim()) {
      setValidationError('Reference code is required.');
      return;
    }
    if (!formTime.trim() || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(formTime.trim())) {
      setValidationError('Airing time must be in HH:MM:SS or HH:MM format.');
      return;
    }
    if (!formDate.trim()) {
      setValidationError('Broadcast date is required.');
      return;
    }

    const durFormatted = formatDurationHHMMSS(formDuration);
    const timeCleaned = formTime.trim().length === 5 ? `${formTime.trim()}:00` : formTime.trim();
    const timestamp = `${formDate.trim()} ${timeCleaned}`;

    const formattedLine = buildFormattedLogLine(
      {
        timestamp,
        eventId: formEventId.trim() || '00000001',
        ref: formRef.trim(),
        advert: formAdvert.trim(),
        duration: durFormatted,
      },
      detectedFormat
    );

    const newCorrection: LogCorrection = {
      id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode: formMode,
      targetLogId: formTargetLogId,
      targetScheduleId: formTargetScheduleId,
      timestamp,
      date: formDate.trim(),
      time: timeCleaned,
      eventId: formEventId.trim() || '00000001',
      ref: formRef.trim(),
      advert: formAdvert.trim(),
      duration: durFormatted,
      durationSec: null,
      originalLine: formOriginalLine,
      formattedLine,
      reason: formReason.trim() || 'Manually confirmed correction.',
      createdAt: new Date().toISOString(),
      isConfirmed: true,
    };

    onSetStagedCorrections(prev => {
      // If editing existing and already staged, replace it
      if (formTargetLogId) {
        const filtered = prev.filter(c => c.targetLogId !== formTargetLogId);
        return [...filtered, newCorrection];
      }
      return [...prev, newCorrection];
    });

    setSuccessMessage(
      formMode === 'ADD_MISSING'
        ? `Airing for "${formRef}" staged successfully.`
        : `Correction for "${formRef}" staged successfully.`
    );
    setSelectedMissingId(null);
    setSelectedLogId(null);
    setValidationError(null);
  };

  const handleRemoveCorrection = (id: string) => {
    onSetStagedCorrections(prev => prev.filter(c => c.id !== id));
  };

  const handleClearAllCorrections = () => {
    if (confirm('Are you sure you want to discard all staged corrections?')) {
      onSetStagedCorrections([]);
      setSelectedMissingId(null);
      setSelectedLogId(null);
    }
  };

  // Download corrected TXT
  const handleDownloadCorrectedTXT = () => {
    const { correctedText } = applyLogCorrections(originalLogRawText, stagedCorrections, detectedFormat);
    downloadCorrectedLogFile(correctedText, originalLogFilename, broadcastDate);
  };

  // Apply corrections and re-run comparison
  const handleApplyAndRerun = () => {
    const { correctedText } = applyLogCorrections(originalLogRawText, stagedCorrections, detectedFormat);
    onApplyAndRerun(correctedText, stagedCorrections);
    onClose();
  };

  // Filtered logs for Tab 2
  const filteredLogRecords = useMemo(() => {
    if (!logSearchQuery.trim()) return logRecords.slice(0, 50);
    const q = logSearchQuery.toLowerCase();
    return logRecords
      .filter(l => l.ref.toLowerCase().includes(q) || l.item.toLowerCase().includes(q) || l.timestamp.includes(q))
      .slice(0, 50);
  }, [logRecords, logSearchQuery]);

  // Handle external trigger with a specific missing item pre-selected
  React.useEffect(() => {
    if (isOpen && initialMissingItemId) {
      const target = missingItems.find(m => m.id === initialMissingItemId);
      if (target) {
        setActiveTab('MISSING');
        handleSelectMissingForCorrection(target);
      }
    }
  }, [isOpen, initialMissingItemId, missingItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Fix Missing Ads & Log Correction Studio
              </h3>
              <p className="text-xs text-slate-500">
                Record verified airings, adjust timestamps or reference codes, and export a clean, corrected broadcast log (.txt).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center space-x-2 pt-2">
          <button
            onClick={() => setActiveTab('MISSING')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'MISSING'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-rose-500" />
            <span>Fix Missing Ads ({missingItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('EDIT_LOG')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'EDIT_LOG'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-4 h-4 text-amber-500" />
            <span>Edit Playout Log ({logRecords.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'AUDIT'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-emerald-600" />
            <span>Staged Corrections</span>
            {stagedCorrections.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-mono">
                {stagedCorrections.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Privacy & Operator Advisory Banner */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start space-x-2 text-xs text-blue-900 leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Operator Review Standard:</span> Corrections are staged in memory only. All additions and edits will be tagged with a distinct “Manually corrected” audit trail. Unaffected log lines and formatting remain untouched.
            </div>
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: FIX MISSING PLACEMENTS */}
          {activeTab === 'MISSING' && (
            <div className="space-y-6">
              {missingItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <p className="font-semibold text-slate-700">Zero missing commercial placements detected!</p>
                  <p className="text-xs text-slate-500 mt-1">All eligible contracted placements were verified on broadcast airings.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Missing Ads Selection */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                      <span>Placements Classified as Missing ({missingItems.length})</span>
                    </h4>
                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                      {missingItems.map(item => {
                        const isSelected = selectedMissingId === item.id;
                        const hasStaged = stagedCorrections.some(c => c.targetScheduleId === item.id);

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectMissingForCorrection(item)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                : hasStaged
                                ? 'bg-emerald-50/40 border-emerald-300'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                {item.ref}
                              </span>
                              {hasStaged ? (
                                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Staged
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                                  Missing
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-slate-800 mt-1 truncate">
                              {item.advertName}
                            </p>
                            <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between font-mono">
                              <span>Show: {item.program}</span>
                              <span>Plan: {item.scheduledTime} ({item.duration})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Pre-filled Correction Editor */}
                  <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col justify-between">
                    {selectedMissingId ? (
                      <form onSubmit={handleStageCorrection} className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                            <Sparkles className="w-4 h-4 mr-1 text-blue-600" /> Record Confirmed Airing
                          </h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                            Pre-filled from Schedule
                          </span>
                        </div>

                        {validationError && (
                          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{validationError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Broadcast Date
                            </label>
                            <input
                              type="text"
                              value={formDate}
                              onChange={e => setFormDate(e.target.value)}
                              className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                              placeholder="DD-MM-YYYY"
                              required
                            />
                            <span className="text-[10px] text-slate-400">e.g. 13-10-2026</span>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Actual Airing Time (HH:MM:SS)
                            </label>
                            <input
                              type="text"
                              value={formTime}
                              onChange={e => setFormTime(e.target.value)}
                              className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                              placeholder="08:00:00"
                              required
                            />
                            <span className="text-[10px] text-slate-400">User-confirmed time</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Reference Code
                            </label>
                            <input
                              type="text"
                              value={formRef}
                              onChange={e => setFormRef(e.target.value)}
                              className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Duration (HH:MM:SS)
                            </label>
                            <input
                              type="text"
                              value={formDuration}
                              onChange={e => setFormDuration(e.target.value)}
                              className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                              placeholder="00:00:30"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Advertiser / Creative Title
                          </label>
                          <input
                            type="text"
                            value={formAdvert}
                            onChange={e => setFormAdvert(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                            placeholder="Advert title"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Event ID / Playout Index
                          </label>
                          <input
                            type="text"
                            value={formEventId}
                            onChange={e => setFormEventId(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                            placeholder="000003E0"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Operator Confirmation Note & Justification
                          </label>
                          <textarea
                            rows={2}
                            value={formReason}
                            onChange={e => setFormReason(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                            placeholder="State reason: e.g. Logged manually from video master tape verification..."
                            required
                          />
                        </div>

                        <div className="pt-2 flex items-center space-x-2">
                          <button
                            type="submit"
                            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center space-x-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm & Stage Airing</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMissingId(null)}
                            className="py-2 px-3 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center py-16 text-center text-slate-400 text-xs">
                        <FileText className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">Select a Missing Placement</p>
                        <p className="text-slate-400 max-w-xs mt-1">
                          Click any placement on the left to review its pre-filled details and record its verified airing.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EDIT EXISTING PLAYOUT LOG */}
          {activeTab === 'EDIT_LOG' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Search & Select Log Record */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Playout Automation Log Records
                    </h4>
                  </div>
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={e => setLogSearchQuery(e.target.value)}
                    placeholder="Search by ref code, advert title, or timestamp..."
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {filteredLogRecords.map(log => {
                      const isSelected = selectedLogId === log.id;
                      const hasStaged = stagedCorrections.some(c => c.targetLogId === log.id);

                      return (
                        <div
                          key={log.id}
                          onClick={() => handleSelectLogForEdit(log)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-50/60 border-amber-500 ring-2 ring-amber-500/20'
                              : hasStaged
                              ? 'bg-emerald-50/40 border-emerald-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {log.ref || '(No Ref)'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {log.timestamp}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1 truncate">
                            {log.advert || log.item}
                          </p>
                          <div className="mt-1 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                            <span>Event #{log.eventId}</span>
                            <span>{log.duration}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Edit Log Entry Form */}
                <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col justify-between">
                  {selectedLogId ? (
                    <form onSubmit={handleStageCorrection} className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                          <Edit3 className="w-4 h-4 mr-1 text-amber-600" /> Edit Playout Record
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                          Modify Playout Metadata
                        </span>
                      </div>

                      {validationError && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{validationError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Date
                          </label>
                          <input
                            type="text"
                            value={formDate}
                            onChange={e => setFormDate(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Time (HH:MM:SS)
                          </label>
                          <input
                            type="text"
                            value={formTime}
                            onChange={e => setFormTime(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Reference Code
                          </label>
                          <input
                            type="text"
                            value={formRef}
                            onChange={e => setFormRef(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Duration
                          </label>
                          <input
                            type="text"
                            value={formDuration}
                            onChange={e => setFormDuration(e.target.value)}
                            className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Advertiser / Title
                        </label>
                        <input
                          type="text"
                          value={formAdvert}
                          onChange={e => setFormAdvert(e.target.value)}
                          className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Reason for Correction
                        </label>
                        <textarea
                          rows={2}
                          value={formReason}
                          onChange={e => setFormReason(e.target.value)}
                          className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                          placeholder="State reason: e.g. Fixed typo in reference code..."
                          required
                        />
                      </div>

                      <div className="pt-2 flex items-center space-x-2">
                        <button
                          type="submit"
                          className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm & Stage Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedLogId(null)}
                          className="py-2 px-3 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-16 text-center text-slate-400 text-xs">
                      <Edit3 className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-600">Select a Playout Entry to Edit</p>
                      <p className="text-slate-400 max-w-xs mt-1">
                        Pick any log record on the left to modify its reference code, title, duration, or airing timestamp.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STAGED CORRECTIONS & AUDIT TRAIL */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Active Session Corrections Audit Trail ({stagedCorrections.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Review all user-confirmed changes staged in memory for this session before downloading or re-running.
                  </p>
                </div>

                {stagedCorrections.length > 0 && (
                  <button
                    onClick={handleClearAllCorrections}
                    className="py-1.5 px-3 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discard All</span>
                  </button>
                )}
              </div>

              {stagedCorrections.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-slate-200">
                  <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-slate-600">No corrections staged yet in this session.</p>
                  <p className="text-slate-400 mt-1">Use the "Fix Missing Ads" or "Edit Playout Log" tabs above to stage corrections.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {stagedCorrections.map((corr, idx) => (
                    <div
                      key={corr.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-500 text-[11px]">#{idx + 1}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              corr.mode === 'ADD_MISSING'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {corr.mode === 'ADD_MISSING' ? 'Added Missing Airing' : 'Edited Log Entry'}
                          </span>
                          <span className="font-mono font-bold text-slate-900">{corr.ref}</span>
                          <span className="text-slate-600 truncate max-w-xs">{corr.advert}</span>
                        </div>

                        <button
                          onClick={() => handleRemoveCorrection(corr.id)}
                          className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded flex items-center space-x-1 text-xs"
                          title="Undo this correction"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Undo</span>
                        </button>
                      </div>

                      {/* Diff display if edited */}
                      {corr.mode === 'EDIT_EXISTING' && corr.originalLine && (
                        <div className="bg-slate-50 p-2 rounded-lg font-mono text-[10px] space-y-1">
                          <div className="text-rose-700">
                            <strong>Before:</strong> {corr.originalLine}
                          </div>
                          <div className="text-emerald-700">
                            <strong>After: </strong> {corr.formattedLine}
                          </div>
                        </div>
                      )}

                      {/* Display added line */}
                      {corr.mode === 'ADD_MISSING' && (
                        <div className="bg-slate-50 p-2 rounded-lg font-mono text-[10px] text-emerald-800">
                          <strong>New Entry: </strong> {corr.formattedLine}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>
                          <strong>Reason:</strong> {corr.reason}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {new Date(corr.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Action Bar */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {stagedCorrections.length > 0 ? (
              <span className="font-medium text-emerald-700 flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {stagedCorrections.length} correction(s) ready to export or verify.
              </span>
            ) : (
              <span>Stage additions or edits to generate a corrected log.</span>
            )}
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto">
            <button
              onClick={handleDownloadCorrectedTXT}
              disabled={stagedCorrections.length === 0}
              className={`py-2 px-4 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1.5 ${
                stagedCorrections.length > 0
                  ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Corrected Log (.txt)</span>
            </button>

            <button
              onClick={handleApplyAndRerun}
              disabled={stagedCorrections.length === 0}
              className={`py-2 px-4 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1.5 ${
                stagedCorrections.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Apply & Re-run Verification</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
