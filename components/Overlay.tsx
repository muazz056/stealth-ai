
import React, { useState, useEffect, useRef } from 'react';
import { AnswerMode, TranscriptionItem, AIResponse } from '../types';
import { useStealthWindow } from '../src/stealth/useStealthWindow';

interface OverlayProps {
  isVisible: boolean;
  transcription: TranscriptionItem[];
  aiResponse: AIResponse | null;
  mode: AnswerMode;
  onClose: () => void;
  isStealthActive: boolean;
  onPopOut: () => void;
}

const Overlay: React.FC<OverlayProps> = ({
  isVisible,
  transcription,
  aiResponse,
  mode,
  onClose,
  isStealthActive,
  onPopOut
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });
  const stealthUrl = `${window.location.origin}`;
  useStealthWindow(stealthUrl, isStealthActive);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    offset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - offset.current.x,
          y: e.clientY - offset.current.y
        });
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isVisible) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        opacity: isStealthActive ? 0.95 : 1,
      }}
      className={`fixed z-[9999] w-80 md:w-96 max-h-[500px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl transition-shadow duration-200 ${isDragging ? 'shadow-blue-500/20' : ''}`}
    >
      <div
        onMouseDown={handleMouseDown}
        className="flex cursor-move items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3 select-none"
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Stealth Assist</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPopOut}
            title="Pop out to floating window (OS Level)"
            className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-blue-500 transition-colors"
          >
            POP OUT
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto max-h-[440px]">
        {/* Detected Context */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Live Transcription</span>
          <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300 border-l-2 border-blue-500">
            {transcription.length > 0 ? (
              <div className="flex flex-col gap-1">
                {transcription.slice(-2).map((t) => (
                  <div key={t.id} className={t.role === 'user' ? 'opacity-60' : ''}>
                    <span className="font-bold text-blue-400 mr-1 uppercase text-[9px]">{t.role === 'interviewer' ? 'INT' : 'YOU'}:</span>
                    {t.text}
                  </div>
                ))}
              </div>
            ) : <span className="italic text-slate-500">Waiting for speech...</span>}
          </div>
        </div>

        {/* AI Answer Container */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Suggested Answer</span>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded uppercase font-bold border border-emerald-500/20">
              {mode} MODE
            </span>
          </div>
          <div className="rounded-lg bg-emerald-500/[0.03] p-4 text-sm leading-relaxed text-slate-100 border border-emerald-500/10 shadow-inner min-h-[100px] whitespace-pre-wrap">
            {aiResponse ? aiResponse.answer : (
              <div className="flex flex-col gap-3 py-2">
                <div className="h-2 w-full rounded bg-slate-800 animate-pulse"></div>
                <div className="h-2 w-5/6 rounded bg-slate-800 animate-pulse delay-75"></div>
                <div className="h-2 w-4/6 rounded bg-slate-800 animate-pulse delay-150"></div>
              </div>
            )}
          </div>
        </div>

        <div className="text-[9px] text-slate-500 text-center uppercase tracking-widest font-semibold border-t border-slate-800 pt-2">
          Ctrl+H: Toggle • Ctrl+C: Clear
        </div>
      </div>
    </div>
  );
};

export default Overlay;
