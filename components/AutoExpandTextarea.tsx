import React, { useEffect, useRef } from 'react';

interface AutoExpandTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  disabled?: boolean;
}

const AutoExpandTextarea: React.FC<AutoExpandTextareaProps> = ({
  value,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '80px',
  maxHeight = '400px',
  disabled = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize function
  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeightPx = parseInt(maxHeight);
      const newHeight = Math.min(scrollHeight, maxHeightPx);
      textareaRef.current.style.height = newHeight + 'px';
    }
  };

  // Auto-resize on value change
  useEffect(() => {
    autoResize();
  }, [value]);

  // Auto-resize on mount
  useEffect(() => {
    autoResize();
  }, []);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        autoResize();
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-sm focus:border-blue-500 focus:outline-none resize-none overflow-y-auto transition-all ${className}`}
      style={{
        minHeight: minHeight,
        maxHeight: maxHeight
      }}
    />
  );
};

export default AutoExpandTextarea;

