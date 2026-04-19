import React, { useState, useEffect, useRef } from 'react';
import { ResumeData } from '../types';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface ResumeManagerProps {
  onDataParsed: (data: ResumeData) => void;
  currentResume: ResumeData | null;
}

const ResumeManager: React.FC<ResumeManagerProps> = ({ onDataParsed, currentResume }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedText, setParsedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [parsedText]);

  // Load existing CV text
  useEffect(() => {
    if (currentResume?.content) {
      setParsedText(currentResume.content);
    }
  }, [currentResume]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    try {
      // Send file to backend for parsing
      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch(`${API_BASE_URL}/api/cv/parse`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        const extractedText = result.text;
        setParsedText(extractedText);
        
        // Pass to parent
      onDataParsed({
          name: result.filename || file.name,
          content: extractedText,
        parsedAt: Date.now()
      });

        // Show success notification
        console.log('✅ CV parsed successfully:', result.filename, `(${result.length} chars)`);
      } else {
        alert(`Failed to parse CV: ${result.message}`);
      }
    } catch (err: any) {
      console.error("Failed to parse CV:", err);
      alert('Failed to parse CV. Please try again or ensure the backend is running.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setParsedText(newText);
    
    // Update parent immediately
    if (currentResume) {
      onDataParsed({
        ...currentResume,
        content: newText
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <div className="flex flex-col gap-4">
        {currentResume ? (
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 p-3 border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-500 dark:text-emerald-400">{currentResume.name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-500">CV active - {currentResume.content.length} characters</p>
              </div>
            </div>
            <button 
              onClick={() => (document.getElementById('cv-upload') as HTMLInputElement)?.click()}
              className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors px-3 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700"
            >
              Replace
            </button>
          </div>
        ) : (
          <label 
            htmlFor="cv-upload"
            className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="mb-3 h-8 w-8 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold">Click to upload CV</span> (PDF or DOC/DOCX)
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-500">Text will be extracted and displayed below</p>
            </div>
          </label>
        )}
        
        <input 
          id="cv-upload" 
          type="file" 
          className="hidden" 
          accept=".pdf,.docx,.doc" 
          onChange={handleFileUpload} 
          disabled={isUploading} 
        />

        {isUploading && (
          <div className="flex items-center justify-center gap-2 p-3 bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20 rounded-lg">
            <div className="w-4 h-4 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-blue-700 dark:text-blue-400">Parsing CV...</span>
          </div>
        )}
      </div>

      {/* Parsed CV Text Display/Edit */}
      {parsedText && (
        <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-300 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wide">Extracted CV Text</h4>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              {isEditing ? 'Done Editing' : 'Edit'}
            </button>
          </div>
          
          <textarea
            ref={textareaRef}
            value={parsedText}
            onChange={handleTextChange}
            readOnly={!isEditing}
            placeholder="CV text will appear here after upload..."
            className={`w-full p-3 bg-white dark:bg-slate-900 border rounded-lg text-black dark:text-white text-sm focus:border-blue-500 focus:outline-none resize-none overflow-hidden transition-all ${
              isEditing 
                ? 'border-blue-500 shadow-lg shadow-blue-500/20' 
                : 'border-slate-300 dark:border-slate-700 cursor-default'
            }`}
            style={{ minHeight: '120px' }}
          />
          
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-500">
            <span>{parsedText.length} characters</span>
            <span className="text-amber-600 dark:text-amber-400">💡 You can edit this text if needed</span>
          </div>
        </div>
      )}

      {/* Privacy Note */}
        <div className="flex items-start gap-2 bg-amber-500/5 p-3 rounded border border-amber-500/10">
        <svg className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        <p className="text-[10px] text-amber-500/80 uppercase font-bold">CV text is stored in database and used for AI context.</p>
      </div>
    </div>
  );
};

export default ResumeManager;
