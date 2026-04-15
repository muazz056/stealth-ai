import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  isOptional?: boolean;
  isFilled?: boolean;
  isProcessed?: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isOptional = false,
  isFilled = false,
  isProcessed = false,
  children,
  defaultOpen = false
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Title */}
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            {title}
          </h3>

          {/* Optional Badge */}
          {isOptional && (
            <span className="text-xs text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
              Optional
            </span>
          )}
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2">
          {/* Filled Check */}
          {isFilled && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Filled
            </span>
          )}

          {/* Processed Check */}
          {isProcessed && (
            <span className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Processed
            </span>
          )}
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4 pt-0 border-t border-slate-200 dark:border-slate-800/50">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;

