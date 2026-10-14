'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertOctagon,
  Clock,
  HelpCircle,
  PlusCircle,
  Copy,
  CalendarOff,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileCode2,
  CheckSquare,
  Square,
  MessageSquare,
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';
import { AdDiscrepancyItem, VerificationStatus } from '@/types';

interface DiscrepancyTableProps {
  items: AdDiscrepancyItem[];
  onToggleReviewed: (itemId: string, note?: string) => void;
  selectedStatusFilter: string;
  onSelectStatusFilter: (status: string) => void;
}

export const DiscrepancyTable: React.FC<DiscrepancyTableProps> = ({
  items,
  onToggleReviewed,
  selectedStatusFilter,
  onSelectStatusFilter,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('ALL');
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'UNREVIEWED' | 'REVIEWED'>('ALL');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<'status' | 'ref' | 'advert' | 'program' | 'time'>('status');
  const [sortAsc, setSortAsc] = useState(true);

  // Note draft state for the expanded item
  const [noteDraft, setNoteDraft] = useState('');

  // Extract unique programs for dropdown
  const uniquePrograms = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => {
      if (i.program && i.program !== 'N/A' && i.program !== 'Recorded in Log') {
        set.add(i.program);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Counts by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: items.length,
      POTENTIALLY_MISSING: 0,
      MATCHED: 0,
      EXTRA_AIRING: 0,
      EXPIRED_CAMPAIGN: 0,
      NEEDS_MANUAL_REVIEW: 0,
      POSSIBLE_DUPLICATE: 0,
    };
    items.forEach(i => {
      if (counts[i.status] !== undefined) counts[i.status]++;
    });
    return counts;
  }, [items]);

  // Filtering
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Status Filter
      if (selectedStatusFilter !== 'ALL' && item.status !== selectedStatusFilter) {
        return false;
      }

      // 2. Program Filter
      if (selectedProgram !== 'ALL' && item.program !== selectedProgram) {
        return false;
      }

      // 3. Review Filter
      if (reviewFilter === 'REVIEWED' && !item.isReviewed) return false;
      if (reviewFilter === 'UNREVIEWED' && item.isReviewed) return false;

      // 4. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = item.ref.toLowerCase().includes(q);
        const matchesName = item.advertName.toLowerCase().includes(q);
        const matchesShow = item.program.toLowerCase().includes(q);
        const matchesExpl = item.explanation.toLowerCase().includes(q);
        const matchesFollow = item.recommendedFollowUp.toLowerCase().includes(q);
        if (!matchesRef && !matchesName && !matchesShow && !matchesExpl && !matchesFollow) {
          return false;
        }
      }

      return true;
    });
  }, [items, selectedStatusFilter, selectedProgram, reviewFilter, searchQuery]);

  // Sorting
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortField === 'ref') cmp = a.ref.localeCompare(b.ref);
      else if (sortField === 'advert') cmp = a.advertName.localeCompare(b.advertName);
      else if (sortField === 'program') cmp = a.program.localeCompare(b.program);
      else if (sortField === 'time') cmp = a.scheduledTime.localeCompare(b.scheduledTime);
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredItems, sortField, sortAsc]);

  const handleSort = (field: 'status' | 'ref' | 'advert' | 'program' | 'time') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getStatusBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" /> Matched
          </span>
        );
      case 'POTENTIALLY_MISSING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            <AlertOctagon className="w-3 h-3 mr-1 text-rose-600" /> Potentially Missing
          </span>
        );
      case 'EXTRA_AIRING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <PlusCircle className="w-3 h-3 mr-1 text-amber-600" /> Extra Airing
          </span>
        );
      case 'EXPIRED_CAMPAIGN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <CalendarOff className="w-3 h-3 mr-1 text-purple-600" /> Expired Campaign
          </span>
        );
      case 'OUTSIDE_CAMPAIGN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <Clock className="w-3 h-3 mr-1 text-indigo-600" /> Future Campaign
          </span>
        );
      case 'NEEDS_MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
            <HelpCircle className="w-3 h-3 mr-1 text-yellow-600" /> Needs Review
          </span>
        );
      case 'POSSIBLE_DUPLICATE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            <Copy className="w-3 h-3 mr-1 text-orange-600" /> Possible Duplicate
          </span>
        );
      case 'PARSING_WARNING':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <AlertTriangle className="w-3 h-3 mr-1 text-slate-500" /> Transition / Warning
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
      {/* Top Filter & Search Controls */}
      <div className="p-5 border-b border-slate-100 space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <button
            onClick={() => onSelectStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'ALL'
                ? 'bg-slate-900 text-white font-bold shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>All Records</span>
            <span className="px-1.5 py-0.2 bg-slate-700 text-white rounded text-[10px]">
              {statusCounts.ALL}
            </span>
          </button>

          <button
            onClick={() => onSelectStatusFilter('POTENTIALLY_MISSING')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'POTENTIALLY_MISSING'
                ? 'bg-rose-600 text-white font-bold shadow-sm'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 mr-0.5" />
            <span>Potentially Missing</span>
            <span className="px-1.5 py-0.2 bg-rose-800 text-white rounded text-[10px]">
              {statusCounts.POTENTIALLY_MISSING}
            </span>
          </button>

          <button
            onClick={() => onSelectStatusFilter('MATCHED')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'MATCHED'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-0.5" />
            <span>Matched</span>
            <span className="px-1.5 py-0.2 bg-emerald-800 text-white rounded text-[10px]">
              {statusCounts.MATCHED}
            </span>
          </button>

          <button
            onClick={() => onSelectStatusFilter('EXTRA_AIRING')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'EXTRA_AIRING'
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 mr-0.5" />
            <span>Extra Airings</span>
            <span className="px-1.5 py-0.2 bg-amber-800 text-white rounded text-[10px]">
              {statusCounts.EXTRA_AIRING}
            </span>
          </button>

          <button
            onClick={() => onSelectStatusFilter('EXPIRED_CAMPAIGN')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'EXPIRED_CAMPAIGN'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <CalendarOff className="w-3.5 h-3.5 mr-0.5" />
            <span>Expired Campaigns</span>
            <span className="px-1.5 py-0.2 bg-purple-800 text-white rounded text-[10px]">
              {statusCounts.EXPIRED_CAMPAIGN}
            </span>
          </button>

          <button
            onClick={() => onSelectStatusFilter('NEEDS_MANUAL_REVIEW')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
              selectedStatusFilter === 'NEEDS_MANUAL_REVIEW'
                ? 'bg-yellow-600 text-white font-bold shadow-sm'
                : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 border border-yellow-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 mr-0.5" />
            <span>Needs Review</span>
            <span className="px-1.5 py-0.2 bg-yellow-800 text-white rounded text-[10px]">
              {statusCounts.NEEDS_MANUAL_REVIEW}
            </span>
          </button>
        </div>

        {/* Search and Secondary Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
          {/* Search box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by reference code (AAD-1918), advertiser, program, or notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Program filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedProgram}
              onChange={e => setSelectedProgram(e.target.value)}
              className="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Shows & Programs</option>
              {uniquePrograms.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Review status filter */}
          <div className="sm:col-span-3">
            <select
              value={reviewFilter}
              onChange={e => setReviewFilter(e.target.value as any)}
              className="w-full py-2 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Review Statuses</option>
              <option value="UNREVIEWED">Unreviewed Only</option>
              <option value="REVIEWED">Marked as Reviewed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
          <thead className="bg-slate-50 font-bold text-slate-700 uppercase tracking-wider text-[11px]">
            <tr>
              <th
                onClick={() => handleSort('status')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Status</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('ref')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Ref Code</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('advert')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Advertiser / Creative</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('program')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Program / Show</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('time')}
                className="py-3 px-4 cursor-pointer hover:bg-slate-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Scheduled vs Aired</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">Count (Plan/Act)</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4 text-center">Reviewed</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 text-sm">
                  No records matching the selected filters.
                </td>
              </tr>
            ) : (
              sortedItems.map(item => {
                const isExpanded = expandedItemId === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                      className={`cursor-pointer transition-colors ${
                        isExpanded
                          ? 'bg-blue-50/40'
                          : item.status === 'POTENTIALLY_MISSING'
                          ? 'bg-rose-50/20 hover:bg-rose-50/40'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.ref}
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-slate-800 font-medium">
                        {item.advertName}
                      </td>
                      <td className="py-3 px-4 max-w-[180px] truncate text-slate-600">
                        {item.program}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-[11px]">
                          <span className="text-slate-500">Plan:</span>{' '}
                          <span className="font-semibold text-slate-800">{item.scheduledTime}</span>
                        </div>
                        <div className="font-mono text-[11px]">
                          <span className="text-slate-500">Aired:</span>{' '}
                          <span
                            className={
                              item.actualAiringTime === 'NOT AIRING'
                                ? 'text-rose-600 font-bold'
                                : 'text-emerald-700 font-semibold'
                            }
                          >
                            {item.actualAiringTime}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                        {item.expectedCount} / {item.actualCount}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {item.duration}
                      </td>
                      <td
                        className="py-3 px-4 text-center"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleReviewed(item.id)}
                          className="text-slate-400 hover:text-blue-600 focus:outline-none"
                          title={item.isReviewed ? 'Marked as reviewed' : 'Click to mark as reviewed'}
                        >
                          {item.isReviewed ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 inline" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500 inline" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          className="p-1 rounded text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Drawer: Side-by-side Evidence & Review Note */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={9} className="p-4 sm:p-6 border-b border-slate-200">
                          <div className="space-y-4">
                            {/* Explanation and Recommended Follow-up */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                                  Verification Finding & Explanation
                                </h4>
                                <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                                  {item.explanation}
                                </p>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                                  Recommended Action / Follow-up
                                </h4>
                                <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                                  {item.recommendedFollowUp}
                                </p>
                              </div>
                            </div>

                            {/* Side-by-side Evidence Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Planned Schedule Evidence */}
                              <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-blue-900 uppercase">
                                    Planned Schedule Record
                                  </span>
                                  {item.scheduleEvidence.length > 0 && (
                                    <span className="text-[10px] font-mono font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                      Line #{item.scheduleEvidence[0].lineIndex}
                                    </span>
                                  )}
                                </div>
                                {item.scheduleEvidence.length > 0 ? (
                                  <div className="text-xs text-slate-700 space-y-1 font-mono">
                                    <p>
                                      <strong>Ref:</strong> {item.scheduleEvidence[0].ref} (Norm:{' '}
                                      {item.scheduleEvidence[0].normRef})
                                    </p>
                                    <p>
                                      <strong>Show:</strong> {item.scheduleEvidence[0].show}
                                    </p>
                                    <p>
                                      <strong>Time Slot:</strong> {item.scheduleEvidence[0].time} ({item.scheduleEvidence[0].placements})
                                    </p>
                                    <p>
                                      <strong>Campaign Dates:</strong>{' '}
                                      {item.scheduleEvidence[0].rawStartDate || 'N/A'} &rarr;{' '}
                                      {item.scheduleEvidence[0].rawEndDate || 'Ongoing'}
                                    </p>
                                    <div className="pt-1">
                                      <span className="text-[10px] text-slate-500 font-sans block">Raw source line:</span>
                                      <code className="text-[10px] bg-white p-1.5 rounded border border-blue-100 block break-all">
                                        {item.scheduleEvidence[0].raw}
                                      </code>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic">
                                    No planned schedule entry exists for this airing (Unscheduled broadcast).
                                  </p>
                                )}
                              </div>

                              {/* Actual Automation Log Evidence */}
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-indigo-900 uppercase">
                                    Actual Playout Log Record(s)
                                  </span>
                                  {item.logEvidence.length > 0 && (
                                    <span className="text-[10px] font-mono font-medium text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                                      {item.logEvidence.length} Playout Event(s)
                                    </span>
                                  )}
                                </div>
                                {item.logEvidence.length > 0 ? (
                                  <div className="space-y-2">
                                    {item.logEvidence.map(log => (
                                      <div
                                        key={log.id}
                                        className="text-xs text-slate-700 space-y-1 font-mono border-b border-indigo-100 pb-2 last:border-b-0 last:pb-0"
                                      >
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-bold text-indigo-800">
                                            {log.timestamp}
                                          </span>
                                          <span className="text-slate-400">
                                            Event #{log.eventId} &bull; Line #{log.lineIndex}
                                          </span>
                                        </div>
                                        <p>
                                          <strong>Item:</strong> {log.item}
                                        </p>
                                        <p>
                                          <strong>Duration:</strong> {log.duration}
                                        </p>
                                        <div className="pt-0.5">
                                          <span className="text-[10px] text-slate-500 font-sans block">Raw log line:</span>
                                          <code className="text-[10px] bg-white p-1.5 rounded border border-indigo-100 block break-all">
                                            {log.raw}
                                          </code>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-rose-600 font-medium">
                                    Zero matching playout events logged in automation server file.
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Operator Review & Session Notes */}
                            <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="flex items-center space-x-3 w-full sm:w-auto">
                                <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-slate-800">
                                  <input
                                    type="checkbox"
                                    checked={item.isReviewed}
                                    onChange={e => onToggleReviewed(item.id, noteDraft || item.reviewNote)}
                                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span>Mark Record as Reviewed</span>
                                </label>
                              </div>

                              <div className="flex items-center space-x-2 w-full sm:w-2/3">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <input
                                  type="text"
                                  placeholder="Add managerial review note (e.g. Approved make-good on Oct 14)..."
                                  defaultValue={item.reviewNote}
                                  onChange={e => setNoteDraft(e.target.value)}
                                  onBlur={e => {
                                    if (e.target.value !== item.reviewNote) {
                                      onToggleReviewed(item.id, e.target.value);
                                    }
                                  }}
                                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing <strong className="text-slate-800">{sortedItems.length}</strong> of{' '}
          <strong className="text-slate-800">{items.length}</strong> total verification records
        </span>
        <span className="hidden sm:inline">
          Click any row to inspect raw source evidence and attach review notes.
        </span>
      </div>
    </div>
  );
};
