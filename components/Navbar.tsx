'use client';

import React from 'react';
import { Radio, ShieldCheck, RefreshCw, FileText, Sparkles } from 'lucide-react';

interface NavbarProps {
  broadcastDate?: string;
  hasComparison: boolean;
  onReset: () => void;
  onLoadSample: () => void;
  onOpenPrivacy: () => void;
  isLoadingSample?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  broadcastDate,
  hasComparison,
  onReset,
  onLoadSample,
  onOpenPrivacy,
  isLoadingSample = false,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand mark and title */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  Broadcast Ad Verification
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  PROD v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Automated Schedule vs. Actual Log Comparison Engine
              </p>
            </div>
          </div>

          {/* Center: Active Broadcast Date Badge */}
          {broadcastDate && (
            <div className="hidden md:flex items-center px-3 py-1 bg-slate-100 rounded-full border border-slate-200 text-xs font-medium text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              Broadcast Date: <strong className="ml-1 text-slate-900">{broadcastDate}</strong>
            </div>
          )}

          {/* Right action controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onOpenPrivacy}
              className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="100% In-Browser Privacy"
            >
              <ShieldCheck className="w-4 h-4 mr-1 text-emerald-600" />
              <span className="hidden lg:inline">Browser Safe</span>
            </button>

            <button
              onClick={onLoadSample}
              disabled={isLoadingSample}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm disabled:opacity-50"
              title="Load October 13, 2026 Test Fixture"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              <span>{isLoadingSample ? 'Loading...' : 'Load Sample Files'}</span>
            </button>

            {hasComparison && (
              <button
                onClick={onReset}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                title="Start a new comparison session"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1 text-slate-500" />
                <span className="hidden sm:inline">New Comparison</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
