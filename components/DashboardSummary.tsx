'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  Clock,
  HelpCircle,
  FileSpreadsheet,
  FileDown,
  PlusCircle,
  Copy,
  CalendarOff,
  AlertTriangle,
  Award,
  SlidersHorizontal,
} from 'lucide-react';
import { ComparisonSummary, AdDiscrepancyItem } from '@/types';

interface DashboardSummaryProps {
  summary: ComparisonSummary;
  items: AdDiscrepancyItem[];
  onExportExcel: () => void;
  onExportPDF: () => void;
  onOpenFixMissing?: () => void;
  activeFilterStatus: string;
  onSelectStatusFilter: (status: string) => void;
}

export const DashboardSummary: React.FC<DashboardSummaryProps> = ({
  summary,
  items,
  onExportExcel,
  onExportPDF,
  onOpenFixMissing,
  activeFilterStatus,
  onSelectStatusFilter,
}) => {
  const isAllGood = summary.potentiallyMissingPlacements === 0;

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-100 text-blue-800">
                Audit Results
              </span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs font-medium text-slate-500">
                Broadcast Date: <strong className="text-slate-800">{summary.broadcastDate}</strong>
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              Commercial Broadcast Verification Summary
            </h1>

            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Evaluated <strong className="text-slate-900">{summary.totalScheduleRows}</strong> schedule rows against{' '}
              <strong className="text-slate-900">{summary.totalLogRows}</strong> automation log events.{' '}
              {isAllGood ? (
                <span className="text-emerald-700 font-semibold">
                  All {summary.eligiblePlacements} eligible scheduled placements were verified on air (100% compliance).
                </span>
              ) : (
                <span>
                  Achieved <strong className="text-blue-700">{summary.complianceRate}%</strong> compliance.{' '}
                  <span className="text-rose-600 font-bold">
                    {summary.potentiallyMissingPlacements} placement(s) potentially missing
                  </span>{' '}
                  requiring management attention or make-good scheduling.
                </span>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            {onOpenFixMissing && (
              <button
                onClick={onOpenFixMissing}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm hover:shadow active:scale-98"
                title="Fix Missing Ads and Export Corrected TXT Log"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Fix Missing Ads &amp; Correct Log
                {summary.potentiallyMissingPlacements > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    {summary.potentiallyMissingPlacements}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onExportExcel}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm hover:shadow active:scale-98"
              title="Download Excel audit workbook"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel (.xlsx)
            </button>

            <button
              onClick={onExportPDF}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm hover:shadow active:scale-98"
              title="Generate printable PDF audit report"
            >
              <FileDown className="w-4 h-4 mr-2 text-rose-400" />
              Export PDF Report
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Eligible Placements & Compliance */}
        <div
          onClick={() => onSelectStatusFilter('ALL')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'ALL'
              ? 'ring-2 ring-blue-600 border-blue-400 bg-blue-50/40 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Eligible Ads</span>
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 font-mono">
            {summary.eligiblePlacements}
          </p>
          <div className="mt-2 flex items-center text-[11px] text-blue-700 font-medium">
            <span>{summary.complianceRate}% Compliance</span>
          </div>
        </div>

        {/* 2. Matched Placements */}
        <div
          onClick={() => onSelectStatusFilter('MATCHED')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'MATCHED'
              ? 'ring-2 ring-emerald-600 border-emerald-400 bg-emerald-50/40 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Matched</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2 font-mono">
            {summary.matchedPlacements}
          </p>
          <div className="mt-2 text-[11px] text-slate-500">Verified on air</div>
        </div>

        {/* 3. Potentially Missing Placements (High Priority) */}
        <div
          onClick={() => onSelectStatusFilter('POTENTIALLY_MISSING')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'POTENTIALLY_MISSING'
              ? 'ring-2 ring-rose-600 border-rose-400 bg-rose-50/60 shadow-md'
              : summary.potentiallyMissingPlacements > 0
              ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Missing</span>
            <AlertOctagon className="w-4 h-4 text-rose-600 animate-pulse" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-2 font-mono">
            {summary.potentiallyMissingPlacements}
          </p>
          <div className="mt-2 text-[11px] font-semibold text-rose-700">
            {summary.potentiallyMissingPlacements > 0 ? 'Requires Make-Good' : 'Zero Missed'}
          </div>
        </div>

        {/* 4. Extra Airings */}
        <div
          onClick={() => onSelectStatusFilter('EXTRA_AIRING')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'EXTRA_AIRING'
              ? 'ring-2 ring-amber-600 border-amber-400 bg-amber-50/40 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Extra Airings</span>
            <PlusCircle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 mt-2 font-mono">
            {summary.extraAirings}
          </p>
          <div className="mt-2 text-[11px] text-slate-500">Unscheduled spots</div>
        </div>

        {/* 5. Expired Campaigns */}
        <div
          onClick={() => onSelectStatusFilter('EXPIRED_CAMPAIGN')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'EXPIRED_CAMPAIGN'
              ? 'ring-2 ring-purple-600 border-purple-400 bg-purple-50/40 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expired</span>
            <CalendarOff className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-600 mt-2 font-mono">
            {summary.expiredCampaignPlacements}
          </p>
          <div className="mt-2 text-[11px] text-slate-500">Past contract end</div>
        </div>

        {/* 6. Needs Manual Review */}
        <div
          onClick={() => onSelectStatusFilter('NEEDS_MANUAL_REVIEW')}
          className={`cursor-pointer rounded-xl p-4 border transition-all ${
            activeFilterStatus === 'NEEDS_MANUAL_REVIEW'
              ? 'ring-2 ring-yellow-600 border-yellow-400 bg-yellow-50/40 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Review Flag</span>
            <HelpCircle className="w-4 h-4 text-yellow-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-yellow-600 mt-2 font-mono">
            {summary.needsManualReview}
          </p>
          <div className="mt-2 text-[11px] text-slate-500">Duration variance</div>
        </div>
      </div>
    </div>
  );
};
