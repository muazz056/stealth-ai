import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

interface TransparentOverlayProps {
  apiKey?: string;
  resume?: any;
  mode?: string;
  onShowSettings?: () => void;
}

interface TranscriptionState {
  isListening: boolean;
  streamingText: string; // Real-time streaming text that keeps updating
  isProcessing: boolean;
}

interface AIResponse {
  answer: string;
  isLoading: boolean;
  error?: string;
}

const TransparentOverlay: React.FC<TransparentOverlayProps> = ({ apiKey, resume, mode = 'SHORT', onShowSettings }) => {
  const [transcription, setTranscription] = useState<TranscriptionState>({
    isListening: false,
    streamingText: '',
    isProcessing: false
  });

  // Component is ready
  
  const [aiResponse, setAiResponse] = useState<AIResponse>({
    answer: '',
    isLoading: false
  });
  
  const [isMinimized, setIsMinimized] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const genAI = useRef<GoogleGenAI | null>(null);

  // Initialize Gemini AI
  useEffect(() => {
    if (apiKey) {
      genAI.current = new GoogleGenAI({ apiKey });
    }
  }, [apiKey]);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionConstructor();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setTranscription(prev => ({ ...prev, isListening: true }));
      };
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let fullTranscript = '';
        
        // Build the complete transcript from all results
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          fullTranscript += transcript;
          
          // Add space between final results for better readability
          if (event.results[i].isFinal && i < event.results.length - 1) {
            fullTranscript += ' ';
          }
        }
        
        // Update streaming text with the complete transcript
        setTranscription(prev => ({
          ...prev,
          streamingText: fullTranscript
        }));
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setTranscription(prev => ({ ...prev, isListening: false }));
      };
      
      recognition.onend = () => {
        setTranscription(prev => ({ ...prev, isListening: false }));
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !transcription.isListening) {
      setTranscription(prev => ({ ...prev, streamingText: '' }));
      setAiResponse({ answer: '', isLoading: false });
      recognitionRef.current.start();
    }
  }, [transcription.isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && transcription.isListening) {
      recognitionRef.current.stop();
    }
  }, [transcription.isListening]);

  const getAIAnswer = useCallback(async () => {
    if (!genAI.current || !transcription.streamingText.trim()) {
      return;
    }

    setAiResponse({ answer: '', isLoading: true });
    
    try {
      const gen = genAI.current;
      if (!gen) throw new Error('AI not initialized');

      const prompt = `You are an AI interview assistant. Provide concise, professional answers to interview questions. 
Keep responses under 100 words and focus on practical, actionable advice. 
The user is currently in an interview and needs quick, helpful responses.

Interview Question/Context: "${transcription.streamingText}"

Please provide a brief, professional answer that would be appropriate for a job interview. Focus on:
- Key technical concepts if it's a technical question
- Behavioral examples using STAR method if it's a behavioral question
- Professional tone and confidence
- Concise but complete response`;

      const result = await gen.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const text = result.text || '';
      
      setAiResponse({ answer: text, isLoading: false });
    } catch (error) {
      console.error('AI response error:', error);
      setAiResponse({ 
        answer: '', 
        isLoading: false, 
        error: 'Failed to get AI response. Check your API key.' 
      });
    }
  }, [transcription.streamingText]);

  const clearAll = useCallback(() => {
    setTranscription(prev => ({ ...prev, streamingText: '' }));
    setAiResponse({ answer: '', isLoading: false });
    if (recognitionRef.current && transcription.isListening) {
      recognitionRef.current.stop();
    }
  }, [transcription.isListening]);

  // Listen for Electron IPC messages
  useEffect(() => {
    const handleToggleTranscription = () => {
      if (transcription.isListening) {
        stopListening();
      } else {
        startListening();
      }
    };

    // Check if we're in Electron
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.on('toggle-transcription', handleToggleTranscription);
      
      return () => {
        ipcRenderer.removeListener('toggle-transcription', handleToggleTranscription);
      };
    }
  }, [transcription.isListening, startListening, stopListening]);

  if (isMinimized) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-all duration-200"
          title="Expand Interview Assistant"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>
    );
  }

  // Window control functions
  const minimizeWindow = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('window-minimize');
    }
  };

  const closeWindow = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('window-close');
    }
  };

  const toggleAlwaysOnTop = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('window-toggle-always-on-top');
    }
  };

  return (
    <div className="fixed top-4 right-4 w-96 bg-gray-900/80 backdrop-blur-sm border border-gray-600/50 rounded-lg shadow-2xl z-50 text-white">
      {/* Custom Window Header with Controls */}
      <div className="flex items-center justify-between p-3 border-b border-gray-600/50 bg-gray-800/60 rounded-t-lg cursor-move" 
           style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${transcription.isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
          <span className="text-sm font-semibold">Interview Assistant</span>
        </div>
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={transcription.isListening ? stopListening : startListening}
            className={`px-3 py-1 text-xs font-medium rounded transition-all ${
              transcription.isListening
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {transcription.isListening ? 'Stop' : 'Listen'}
          </button>
          <button
            onClick={onShowSettings}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="Settings"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={toggleAlwaysOnTop}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="Toggle Always on Top"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
          <button
            onClick={minimizeWindow}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="Minimize"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={closeWindow}
            className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
            title="Close"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Real-time Streaming Transcription */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Live Transcription</h3>
          <div className="bg-gray-800/40 border border-gray-600/30 rounded-lg p-4 min-h-[100px] max-h-[150px] overflow-y-auto">
            <div className="text-white text-sm leading-relaxed">
              {transcription.streamingText || (
                <span className="text-gray-400 italic">
                  {transcription.isListening ? 'Listening for speech...' : 'Click "Listen" to start real-time transcription'}
                </span>
              )}
              {transcription.isListening && transcription.streamingText && (
                <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse"></span>
              )}
            </div>
          </div>
        </div>

        {/* Get Answer Button */}
        <div className="flex justify-center">
          <button
            onClick={getAIAnswer}
            disabled={!transcription.streamingText.trim() || aiResponse.isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all shadow-lg"
          >
            {aiResponse.isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </div>
            ) : (
              'Get Answer'
            )}
          </button>
        </div>

        {/* AI Response Section */}
        {(aiResponse.answer || aiResponse.error || aiResponse.isLoading) && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide">AI Response</h3>
            <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4 min-h-[80px] max-h-[200px] overflow-y-auto">
              {aiResponse.error && (
                <div className="text-red-400 text-sm">{aiResponse.error}</div>
              )}
              {aiResponse.answer && !aiResponse.isLoading && (
                <div className="text-white text-sm leading-relaxed">{aiResponse.answer}</div>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-600/30">
          <button
            onClick={clearAll}
            className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-all"
          >
            Clear All
          </button>
          <div className="text-xs text-gray-500">
            Ctrl+Shift+I: Toggle • Ctrl+Shift+T: Listen
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransparentOverlay;
