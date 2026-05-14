import React, { useState, useRef, useEffect } from 'react';

const LANGUAGES = [
  'ENGLISH', 'SPANISH', 'FRENCH', 'GERMAN', 'ITALIAN', 'PORTUGUESE', 'RUSSIAN',
  'JAPANESE', 'KOREAN', 'CHINESE', 'ARABIC', 'HINDI', 'URDU', 'TURKISH',
  'DUTCH', 'POLISH', 'SWEDISH', 'DANISH', 'NORWEGIAN', 'FINNISH', 'GREEK',
  'HEBREW', 'THAI', 'VIETNAMESE', 'INDONESIAN', 'MALAY', 'TAGALOG',
  'CZECH', 'ROMANIAN', 'HUNGARIAN', 'UKRAINIAN', 'BULGARIAN', 'CROATIAN',
  'SERBIAN', 'SLOVAK', 'SLOVENIAN', 'LITHUANIAN', 'LATVIAN', 'ESTONIAN',
  'ICELANDIC', 'MALTESE', 'ALBANIAN', 'ARMENIAN', 'GEORGIAN', 'PERSIAN',
  'BENGALI', 'TAMIL', 'TELUGU', 'MARATHI', 'GUJARATI', 'KANNADA', 'MALAYALAM',
  'PUNJABI', 'SWAHILI', 'AMHARIC', 'ZULU', 'YORUBA', 'HAUSA', 'MONGOLIAN',
  'NEPALI', 'SINHALA', 'KHMER', 'LAO', 'BURMESE', 'UZBEK', 'KAZAKH',
  'AZERBAIJANI', 'PASHTO', 'KURDISH', 'SOMALI', 'TAJIK', 'TURKMEN',
  'KYRGYZ', 'MULTI'
];

interface LanguageOption {
  code: string;
  label: string;
}

interface SearchableLanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  placeholder?: string;
  options?: LanguageOption[];
  selectOnly?: boolean;
}

const SearchableLanguageSelect: React.FC<SearchableLanguageSelectProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Search language...',
  options,
  selectOnly = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = options
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : LANGUAGES.filter(l => l.toLowerCase().includes(search.toLowerCase()));

  const displayValue = options
    ? options.find(o => o.code === value)?.label || value
    : value;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && selectOnly && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, selectOnly]);

  const handleSelect = (selected: string) => {
    onChange(selected);
    if (onBlur) onBlur(selected);
    setIsOpen(false);
    setSearch('');
  };

  const handleComboInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (!isOpen) setIsOpen(true);
    setSearch(val);
  };

  const handleComboFocus = () => {
    setIsOpen(true);
    setSearch(value || '');
  };

  const handleComboBlur = () => {
    setTimeout(() => {
      if (onBlur) onBlur(value);
    }, 200);
  };

  return (
    <div ref={containerRef} className="relative">
      {selectOnly ? (
        <button
          type="button"
          onClick={() => { setIsOpen(!isOpen); if (!isOpen) setSearch(''); }}
          className="w-full bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-purple-500/40 transition-all flex items-center justify-between gap-2"
        >
          <span className="truncate">{displayValue || placeholder}</span>
          <svg className={`w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={value || ''}
            onChange={handleComboInputChange}
            onFocus={handleComboFocus}
            onBlur={handleComboBlur}
            placeholder={placeholder}
            className="w-full bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-xl px-4 py-3 pr-10 text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-purple-500 transition-all"
          />
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden">
          {selectOnly && (
            <div className="p-2 border-b border-slate-200 dark:border-gray-700">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-purple-500/40"
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-xs text-slate-400 dark:text-gray-500 text-center">No languages found</div>
            ) : (
              filtered.map((item) => {
                const itemValue = options ? (item as LanguageOption).code : (item as string);
                const itemLabel = options ? (item as LanguageOption).label : (item as string);
                const selectedValue = options
                  ? value
                  : value.toUpperCase();
                const isSelected = options
                  ? selectedValue === itemValue
                  : selectedValue === item;
                return (
                  <button
                    key={itemValue}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(itemValue); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-purple-600/20 text-blue-700 dark:text-purple-300 font-semibold'
                        : 'text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {itemLabel}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableLanguageSelect;