'use client';

import React from 'react';
import { ShieldCheck, Lock, Cpu, Trash2, X, Globe, EyeOff } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-5 animate-in fade-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Privacy & Local Processing Guarantee
            </h3>
            <p className="text-xs text-slate-500">
              Zero server storage &bull; 100% In-Browser Execution
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
            <Cpu className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-900">100% Local In-Browser Processing:</strong>
              <p className="mt-0.5 text-slate-600">
                Your schedule files and broadcast automation logs are read and compared entirely within your web browser using HTML5 File API and JavaScript. File contents never touch external servers, databases, or AI cloud APIs.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
            <EyeOff className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-900">No Tracking or Third-Party Telemetry:</strong>
              <p className="mt-0.5 text-slate-600">
                No user analytics, cookies, tracking scripts, or advertisement beacons are embedded. Your proprietary broadcast schedules, rates, and reference codes remain strictly confidential.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
            <Trash2 className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-900">Ephemeral Session Memory:</strong>
              <p className="mt-0.5 text-slate-600">
                Data exists only in browser RAM during your active session. Clicking "New Comparison" or closing this browser tab instantly purges all loaded files and comparison results.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3">
            <Globe className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-900">Public URL Access:</strong>
              <p className="mt-0.5 text-slate-600">
                Because this application runs client-side, any member of your broadcasting operations or traffic management team can use the public URL without needing to register accounts or set up credentials.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
