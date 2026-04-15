import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css'; // Code highlighting theme
import 'katex/dist/katex.min.css'; // Math rendering styles
import { messagesClient } from './src/utils/messagesClient';
import { tokensClient } from './src/utils/tokensClient';

// Custom Code Component with Copy Button
const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  
  // Extract plain text from children (handles React elements)
  const getTextContent = (node: any): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (node?.props?.children) return getTextContent(node.props.children);
    return '';
  };
  
  const codeString = getTextContent(children).replace(/\n$/, '');
  
  const handleCopy = async () => {
    try {
      // Check if running in Electron
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        const result = await ipcRenderer.invoke('clipboard-write', codeString);
        if (result.success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        // Browser fallback
        await navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (inline) {
    return <code className="bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
  }

  return (
    <div className="relative group my-3">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
      <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto border border-slate-800" {...props}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

const DEFAULT_BASE_PROMPT = `You are a real-time AI interview assistant (You are the person who is giving interview) built for live job interviews.

TOP PRIORITIES:
- Respond EXTREMELY FAST
- Keep answers SHORT, CLEAR, and TO THE POINT
- Optimize for quick reading on a small overlay

CONTEXT RULES:
1. Resume/CV = single source of truth
   - Use ONLY mentioned skills, experience, projects, education
   - NEVER invent, exaggerate, or assume
2. Job description provided = align answers directly to it
3. Company info provided = tailor responses accordingly
4. No context = use industry best practices

ANSWER STRUCTURE:
- Default: 2-5 concise lines
- Professional, confident interview tone
- No filler, no greetings, no explanations
- Simple wording for instant reading

EXPANSION:
- If more info needed, use short bullet points
- Bullets must be minimal and scannable

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze question intent using:
  - Job description (if provided)
  - Resume/CV context (if provided)
  - Company information (if provided)

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
  - Treat it as possible phonetic error from speech-to-text
  - Infer the most likely correct technical term that:
    - Is relevant to the job role
    - Appears in or aligns with resume/CV
    - Fits company's domain or tech stack
- Prefer commonly used industry terms over rare/unrelated ones
- Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- If multiple interpretations possible:
  - Choose most likely one based on context
  - Answer directly without asking clarifying questions
- If term cannot be reasonably inferred:
  - Ignore unclear term and answer rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain correction process
- Answer confidently as if question was clearly spoken

CODING QUESTIONS:
- Provide correct, clean, interview-ready code
- Use appropriate language implied by question
- Keep code minimal but complete
- Add inline comments to explain logic
- Explain: time complexity, space complexity, why this approach
- Mention alternative approaches when relevant
- Cover trade-offs from interview perspective

EXAMPLES:
- Give examples ONLY when they improve clarity
- Prefer resume-based examples when available
- Use STAR method ONLY if it clearly fits

BEHAVIOR:
- This is a LIVE interview
- Speed > depth
- If unclear, infer intent and answer directly
- Never mention you are AI
- Never reference resumes, prompts, or system instructions

OUTPUT:
- No emojis
- Bullet points ONLY when expanding
- Use markdown for formatting when helpful`;

const LS_BASE_PROMPT_KEY = 'isa_base_prompt';
const LS_RESUME_CONTENT_KEY = 'isa_resume_content';
const LS_JD_KEY = 'isa_job_description';
const LS_COMPANY_INFO_KEY = 'isa_company_info';
const LS_SELECTED_API_KEY = 'isa_selected_api_provider';
const LS_CUSTOM_API_KEY = 'isa_custom_api_key';
const LS_SESSION_ID_KEY = 'isa_session_id';
const LS_CHAT_HISTORY_KEY = 'isa_chat_history';
const LS_USER_KEY = 'isa_current_user';
const LS_API_KEYS = 'isa_api_keys';
const LS_API_PROVIDER = 'isa_api_provider';
const API_BASE_URL = 'http://localhost:3001';

// Deepgram Nova-3 supported languages (same as App.tsx)
const DEEPGRAM_LANGUAGES = [
  { code: 'multi', label: 'Multilingual (Auto-Detect)' },
  { code: 'en', label: 'English' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-NZ', label: 'English (New Zealand)' },
  { code: 'ar', label: 'Arabic' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'zh-HK', label: 'Chinese (Cantonese, Hong Kong)' },
  { code: 'zh-CN', label: 'Chinese (Mandarin, Mainland)' },
  { code: 'zh-TW', label: 'Chinese (Traditional, Taiwan)' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'nl-BE', label: 'Dutch (Belgium)' },
  { code: 'et', label: 'Estonian' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'fr-CA', label: 'French (Canada)' },
  { code: 'de', label: 'German' },
  { code: 'de-CH', label: 'German (Switzerland)' },
  { code: 'el', label: 'Greek' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ko', label: 'Korean' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'ms', label: 'Malay' },
  { code: 'mr', label: 'Marathi' },
  { code: 'no', label: 'Norwegian' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'es', label: 'Spanish' },
  { code: 'es-419', label: 'Spanish (Latin America)' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'taq', label: 'Tamasheq' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'vi', label: 'Vietnamese' },
];

const ENGLISH_LANG_CODES = ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ', 'multi'];

const OverlayApp: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [transcribedText, setTranscribedText] = useState('');
  const [interimText, setInterimText] = useState(''); // Current interim transcription
  const [committedText, setCommittedText] = useState(''); // Accumulated final transcriptions
  const [manualTextInput, setManualTextInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [currentVoiceProvider, setCurrentVoiceProvider] = useState<'default' | 'deepgram'>('default');
  const [currentLanguage, setCurrentLanguage] = useState<string>('multi');
  const [currentKeyterms, setCurrentKeyterms] = useState<string>('');
  const [overlayApiProvider, setOverlayApiProvider] = useState<'gemini' | 'openai' | 'claude' | 'groq'>('gemini');
  const [overlayApiKey, setOverlayApiKey] = useState('');
  const [overlaySaveSuccess, setOverlaySaveSuccess] = useState(false);
  const [overlaySaveError, setOverlaySaveError] = useState<string | null>(null);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const [overlayUserSettings, setOverlayUserSettings] = useState<any>({});
  
  // Browser mode state
  const [browserMode, setBrowserMode] = useState(false);
  const [browseAIEnabled, setBrowseAIEnabled] = useState(false);
  const [aiProviderForBrowser, setAiProviderForBrowser] = useState<'chatgpt' | 'aistudio' | 'claude' | 'gemini' | 'google'>('google');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  
  // Track which providers have received context (persists per user)
  const [providersSentContext, setProvidersSentContext] = useState<Set<string>>(() => {
    try {
      // Get current user ID
      const currentUserStr = localStorage.getItem(LS_USER_KEY);
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const userId = currentUser._id;
        
        // Load providers state for THIS user
        const savedProviders = localStorage.getItem(`isa_providers_sent_context_${userId}`);
        if (savedProviders) {
          return new Set(JSON.parse(savedProviders));
        }
      }
    } catch (e) {
      console.error('Failed to load providers state:', e);
    }
    return new Set();
  });
  
  // Track last visited URL for each provider (preserves chat rooms)
  const [providerLastUrls, setProviderLastUrls] = useState<Map<string, string>>(() => {
    try {
      const currentUserStr = localStorage.getItem(LS_USER_KEY);
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const userId = currentUser._id;
        
        const savedUrls = localStorage.getItem(`isa_provider_urls_${userId}`);
        if (savedUrls) {
          const urlsObj = JSON.parse(savedUrls);
          return new Map(Object.entries(urlsObj));
        }
      }
    } catch (e) {
      console.error('Failed to load provider URLs:', e);
    }
    return new Map();
  });

  // ==================== OVERLAY MODE SETUP ====================
  // Ensure overlay is ALWAYS transparent, ignoring dark/light mode from main app
  useEffect(() => {
    // Add overlay-mode class to body for transparent background
    document.body.classList.add('overlay-mode');
    
    // Remove dark class from documentElement (overlay should always be transparent)
    document.documentElement.classList.remove('dark');
    
    // Set transparent background explicitly
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    
    console.log('✅ Overlay mode initialized - transparent background forced');
    
    // Initialize voice provider based on user settings
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    if (isElectron) {
      try {
        const userStr = localStorage.getItem(LS_USER_KEY);
        if (userStr) {
          const user = JSON.parse(userStr);
          const voiceProvider = user.voiceProvider || 'default';
          const deepgramKey = user.deepgramApiKey || '';
          const dgLang = user.deepgramLanguage || 'multi';
          const dgKeyterms = user.deepgramKeyterms || '';
          
          // Set state for UI display
          setCurrentVoiceProvider(voiceProvider as 'default' | 'deepgram');
          setCurrentLanguage(dgLang);
          setCurrentKeyterms(dgKeyterms);
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🎤 [Overlay] Initial voice provider setup');
          console.log('🎤 [Overlay] Provider:', voiceProvider);
          console.log('🎤 [Overlay] Has Deepgram key:', !!deepgramKey);
          console.log('🎤 [Overlay] Language:', dgLang);
          console.log('🎤 [Overlay] Keyterms:', !!dgKeyterms);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.send('init-voice-provider', {
            voiceProvider,
            apiKey: deepgramKey,
            language: dgLang,
            keyterms: dgKeyterms
          });
          
          console.log('✅ [Overlay] Voice provider init command sent on mount');
        }
      } catch (e) {
        console.error('❌ [Overlay] Failed to initialize voice provider on mount:', e);
      }
    }
    
    return () => {
      document.body.classList.remove('overlay-mode');
    };
  }, []);

  // Save providers state to localStorage whenever it changes (user-specific)
  useEffect(() => {
    try {
      const currentUserStr = localStorage.getItem(LS_USER_KEY);
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const userId = currentUser._id;
        
        const providersArray = Array.from(providersSentContext);
        localStorage.setItem(`isa_providers_sent_context_${userId}`, JSON.stringify(providersArray));
      }
    } catch (e) {
      console.error('Failed to save providers state:', e);
    }
  }, [providersSentContext]);
  
  // Save provider URLs to localStorage whenever they change (user-specific)
  useEffect(() => {
    try {
      const currentUserStr = localStorage.getItem(LS_USER_KEY);
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const userId = currentUser._id;
        
        const urlsObj = Object.fromEntries(providerLastUrls);
        localStorage.setItem(`isa_provider_urls_${userId}`, JSON.stringify(urlsObj));
      }
    } catch (e) {
      console.error('Failed to save provider URLs:', e);
    }
  }, [providerLastUrls]);
  
  // Track current browser URL and save it for the active provider
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      // Poll current URL every 5 seconds and save it
      const urlTracker = setInterval(async () => {
        try {
          const currentUrl = await ipcRenderer.invoke('get-browser-url');
          
          if (currentUrl) {
            let providerName = null;
            
            // Detect which provider based on URL
            if (currentUrl.includes('chatgpt.com')) {
              providerName = 'ChatGPT';
            } else if (currentUrl.includes('gemini.google.com')) {
              providerName = 'Gemini';
            } else if (currentUrl.includes('claude.ai')) {
              providerName = 'Claude';
            } else if (currentUrl.includes('aistudio.google.com')) {
              providerName = 'AI Studio';
            }
            
            if (providerName) {
              setProviderLastUrls(prev => {
                const newMap = new Map(prev);
                const oldUrl = newMap.get(providerName);
                
                // Only update if URL actually changed (avoid unnecessary re-renders)
                if (oldUrl !== currentUrl) {
                  newMap.set(providerName, currentUrl);
                }
                
                return newMap;
              });
            }
          }
        } catch (e) {
          // Silently ignore errors (browser might not be active)
        }
      }, 5000); // Check every 5 seconds
      
      return () => clearInterval(urlTracker);
    }
  }, []);
  
  const handleSaveOverlayApiSettings = async () => {
    try {
      setOverlaySaving(true);
      setOverlaySaveError(null);
      setOverlaySaveSuccess(false);

      const userStr = localStorage.getItem(LS_USER_KEY);
      if (!userStr) throw new Error('User not logged in');
      const user = JSON.parse(userStr);
      if (!user._id) throw new Error('User ID missing');

      // Update API key in DB
      const responseKey = await fetch(`${API_BASE_URL}/api/auth/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          provider: overlayApiProvider,
          apiKey: overlayApiKey
        })
      });
      if (!responseKey.ok) {
        const err = await responseKey.json();
        throw new Error(err.message || 'Failed to save API key');
      }

      // Update provider in DB
      const responseProvider = await fetch(`${API_BASE_URL}/api/auth/provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id, provider: overlayApiProvider })
      });
      if (!responseProvider.ok) {
        const err = await responseProvider.json();
        throw new Error(err.message || 'Failed to save provider');
      }

      // Update localStorage
      const updatedKeys = (() => {
        const existing = localStorage.getItem(LS_API_KEYS);
        let parsed: any = {};
        try { parsed = existing ? JSON.parse(existing) : {}; } catch (e) {}
        return { ...parsed, [overlayApiProvider]: overlayApiKey };
      })();
      localStorage.setItem(LS_API_KEYS, JSON.stringify(updatedKeys));
      localStorage.setItem(LS_API_PROVIDER, overlayApiProvider);

      // Update local state
      setApiKey(overlayApiKey);
      setOverlaySaveSuccess(true);
      setTimeout(() => setOverlaySaveSuccess(false), 2000);

      // Notify main window/overlay listeners
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('notify-overlay-settings-changed');
      }
    } catch (err: any) {
      console.error('❌ Overlay API save error:', err);
      setOverlaySaveError(err.message || 'Failed to save settings');
    } finally {
      setOverlaySaving(false);
    }
  };
  const [showSettingsConfirm, setShowSettingsConfirm] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentPairIndex, setCurrentPairIndex] = useState(0); // For Q&A navigation
  const [apiError, setApiError] = useState<{title: string, message: string, details?: string} | null>(null);
  const [qaPairs, setQaPairs] = useState<Array<{question: string, answer: string}>>([]); // Q&A pairs
  const [newPairTrigger, setNewPairTrigger] = useState(0); // Trigger to force navigation to latest
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const isStartedRef = useRef(false);
  const answerAbortRef = useRef<AbortController | null>(null);
  const isElectronRef = useRef(false);
  const ipcRendererRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputFieldRef = useRef<HTMLTextAreaElement>(null); // For auto-focus and auto-resize
  const analyzeScreenRef = useRef<(() => Promise<void>) | null>(null); // For shortcut access
  const wantToListenRef = useRef(false); // Track if user wants to listen
  const getAnswerRef = useRef<(() => Promise<void>) | null>(null); // For Ctrl+Enter shortcut
  const transcribedTextRef = useRef(''); // For IPC handler access
  const manualTextInputRef = useRef(''); // For IPC handler access
  const toggleBrowseAIRef = useRef<(() => void) | null>(null); // For Ctrl+[ shortcut

  // Helper functions to hide/show browser when modals open
  const hideBrowserForModal = () => {
    if (browserMode && typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('hide-ai-browser');
    }
  };

  const showBrowserAfterModal = () => {
    if (browserMode && typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('show-ai-browser');
    }
  };

  // Keep textarea height in sync when text changes programmatically
  useEffect(() => {
    const el = inputFieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [manualTextInput, transcribedText]);

  // Helper: Parse API errors into user-friendly messages
  const parseApiError = (error: any): {title: string, message: string, details?: string} => {
    const errorMsg = error.message || String(error);
    
    // Rate limit errors
    if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota exceeded')) {
      return {
        title: '⏳ Rate Limit Exceeded',
        message: 'You\'ve hit your API rate limit. Please wait a few minutes before trying again.',
        details: errorMsg.includes('quota exceeded') 
          ? 'Your free tier quota has been exceeded. Consider upgrading your plan or waiting for the quota to reset.'
          : 'Too many requests in a short time. Rate limits typically reset within 1-5 minutes.'
      };
    }
    
    // Invalid API key
    if (errorMsg.includes('401') || errorMsg.includes('API Key not found') || errorMsg.includes('invalid') || errorMsg.includes('INVALID_ARGUMENT')) {
      return {
        title: '🔑 Invalid API Key',
        message: 'Your API key appears to be invalid or has been revoked.',
        details: 'Please verify your API key in the main app settings and ensure it\'s active in your provider\'s dashboard.'
      };
    }
    
    // Network errors
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('network') || errorMsg.includes('NetworkError')) {
      return {
        title: '🌐 Network Error',
        message: 'Unable to connect to the AI service. Please check your internet connection.',
        details: 'If your connection is stable, the service might be temporarily unavailable.'
      };
    }
    
    // Model not found
    if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
      return {
        title: '🤖 Model Not Available',
        message: 'The requested AI model is not available or has been deprecated.',
        details: 'This might be a temporary issue or the model name has changed. Try again later.'
      };
    }
    
    // Timeout
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      return {
        title: '⏱️ Request Timeout',
        message: 'The request took too long to complete.',
        details: 'The AI service might be experiencing high load. Please try again.'
      };
    }
    
    // Content filter/policy
    if (errorMsg.includes('content') || errorMsg.includes('policy') || errorMsg.includes('safety')) {
      return {
        title: '🛡️ Content Policy Violation',
        message: 'Your request was blocked by the AI provider\'s content policy.',
        details: 'Try rephrasing your question in a more neutral way.'
      };
    }
    
    // Generic error
    return {
      title: '❌ API Error',
      message: 'An unexpected error occurred while generating the response.',
      details: errorMsg.substring(0, 200) // Truncate long errors
    };
  };

  // Helper: Generate session ID
  const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Helper: Filter out non-speech transcriptions (music, sounds, etc.)
  const isActualSpeech = (text: string): boolean => {
    const trimmed = text.trim().toLowerCase();
    
    // Check if it's empty
    if (trimmed.length === 0) return false;
    
    // Filter out common non-speech patterns
    const nonSpeechPatterns = [
      /^\(.*music.*\)$/i,           // (music), (dramatic music), etc.
      /^\(.*sound.*\)$/i,            // (sound), (background sound), etc.
      /^\(.*applause.*\)$/i,         // (applause)
      /^\(.*laughter.*\)$/i,         // (laughter)
      /^\(.*noise.*\)$/i,            // (noise)
      /^\(.*silence.*\)$/i,          // (silence)
      /^\(.*coughing.*\)$/i,         // (coughing)
      /^\(.*breathing.*\)$/i,        // (breathing)
      /^\(.*static.*\)$/i,           // (static)
      /^\[.*music.*\]$/i,            // [music]
      /^\[.*sound.*\]$/i,            // [sound]
      /^[\(\[].*[\)\]]$/,            // Anything in parentheses/brackets only
    ];
    
    // Check against patterns
    for (const pattern of nonSpeechPatterns) {
      if (pattern.test(trimmed)) {
        console.log('🚫 Filtered non-speech:', trimmed);
        return false;
      }
    }
    
    // If it's ONLY punctuation/special characters (excluding asterisks), filter it out
    // BUT allow asterisk-wrapped content (base prompt handles this)
    const textWithoutAsterisks = trimmed.replace(/\*/g, '').trim();
    if (textWithoutAsterisks.length === 0) {
      // Only asterisks, keep it (AI will handle)
      console.log('⚠️ Only asterisks detected, but allowing (AI will handle)');
      return true;
    }
    
    if (/^[^\w\s]+$/.test(trimmed)) {
      console.log('🚫 Filtered punctuation only:', trimmed);
      return false;
    }
    
    // It's actual speech
    return true;
  };

  // Helper: Save chat history to MongoDB and localStorage
  const saveChatHistory = async (history: any[]) => {
    try {
      // Save to localStorage as fallback
      localStorage.setItem(LS_CHAT_HISTORY_KEY, JSON.stringify(history));
      
      // Save to MongoDB if user is logged in
      const userStr = localStorage.getItem(LS_USER_KEY);
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user._id) {
            const result = await messagesClient.saveHistory(user._id, history);
            if (result.success) {
              console.log('✅ Chat history saved to MongoDB:', result.count, 'messages');
              
              // Notify main app and overlay about chat history update
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('chat-history-updated', { userId: user._id, count: result.count });
              }
              
              // ==================== CONSUME TOKEN AFTER SUCCESSFUL ANSWER (OVERLAY) ====================
              // Consume 1 token (1 question = 1 token)
              const consumeResult = await tokensClient.consumeTokens(user._id, 1);
              if (consumeResult.success) {
                console.log('✅ Token consumed in overlay! Remaining:', consumeResult.tokens);
                // Update user object with new token count
                const updatedUser = { ...user, tokens: consumeResult.tokens };
                localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                // Notify main app of token update
                if (typeof window !== 'undefined' && (window as any).require) {
                  const { ipcRenderer } = (window as any).require('electron');
                  ipcRenderer.send('token-updated', consumeResult.tokens);
                }
              } else {
                console.warn('⚠️ Token consumption failed in overlay:', consumeResult.message);
              }
            }
          }
        } catch (e) {
          console.warn('Failed to save to MongoDB, using localStorage:', e);
        }
      }
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  };

  // Helper: Load chat history from MongoDB or localStorage
  const loadChatHistory = async (): Promise<any[]> => {
    try {
      // Try loading from MongoDB first
      const userStr = localStorage.getItem(LS_USER_KEY);
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user._id) {
            const result = await messagesClient.getHistory(user._id);
            if (result.success && result.history && result.history.length > 0) {
              console.log('✅ Loaded', result.count, 'messages from MongoDB');
              return result.history;
            }
          }
        } catch (e) {
          console.warn('Failed to load from MongoDB, using localStorage:', e);
        }
      }
      
      // Fallback to localStorage
      const saved = localStorage.getItem(LS_CHAT_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  };

  // Initialize
  useEffect(() => {
    document.body.classList.add('overlay-mode');
    
    // Check if user changed (detect user switch/logout/new signup)
    const currentUserStr = localStorage.getItem(LS_USER_KEY);
    const lastKnownUserId = localStorage.getItem('isa_last_known_user_id');
    
    if (currentUserStr) {
      try {
        const currentUser = JSON.parse(currentUserStr);
        const currentUserId = currentUser._id;
        
        // If user changed, clear ALL user-specific data EXCEPT provider context tracking
        // Provider context is only reset on explicit logout or "New Session"
        if (lastKnownUserId && lastKnownUserId !== currentUserId) {
          console.log('🔄 User changed! Clearing previous user data...');
          console.log('   Previous user:', lastKnownUserId);
          console.log('   New user:', currentUserId);
          
          // Clear chat history
          localStorage.removeItem(LS_CHAT_HISTORY_KEY);
          setChatHistory([]);
          
          // Clear Q&A state
          setManualTextInput('');
          setTranscribedText('');
          setCommittedText('');
          setInterimText('');
          setAiResponse('');
          setQaPairs([]);
          setCurrentPairIndex(0);
          
          // NOTE: Do NOT clear provider context tracking here
          // It will be cleared only on explicit logout or "New Session" button
          
          console.log('✅ Previous user data cleared (provider context preserved)');
        }
        
        // Update last known user ID
        localStorage.setItem('isa_last_known_user_id', currentUserId);
        
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
    
    // Get or create session ID
    let currentSessionId = localStorage.getItem(LS_SESSION_ID_KEY);
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      localStorage.setItem(LS_SESSION_ID_KEY, currentSessionId);
    }
    setSessionId(currentSessionId);

    // Load chat history from MongoDB or localStorage
    loadChatHistory().then(history => {
      setChatHistory(history);
      console.log('📜 Loaded conversation history:', history.length, 'messages');
    });

    // Fetch latest user/settings from DB to keep summaries synced
    const refreshUserFromDB = async () => {
      try {
        const userStr = localStorage.getItem(LS_USER_KEY);
        if (!userStr) return;
        const parsed = JSON.parse(userStr);
        if (!parsed?._id) return;
        const res = await fetch(`${API_BASE_URL}/api/auth/user/${parsed._id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.success && data.user) {
          const mergedUser = { ...parsed, ...data.user };
          localStorage.setItem(LS_USER_KEY, JSON.stringify(mergedUser));
          const s = data.user.settings || {};
          setOverlayUserSettings(s);
          // persist summaries individually for compatibility
          if (s.cvSummary) localStorage.setItem('isa_cv_summary', s.cvSummary);
          if (s.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', s.basePromptSummary);
          if (s.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', s.jobDescriptionSummary);
          if (s.companyInfoSummary) localStorage.setItem('isa_company_info_summary', s.companyInfoSummary);
          if (s.cvText) localStorage.setItem(LS_RESUME_CONTENT_KEY, s.cvText);
          if (s.jobDescription) localStorage.setItem(LS_JD_KEY, s.jobDescription);
          if (s.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, s.companyInfo);
          if (s.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, s.basePrompt);
        }
      } catch (e) {
        console.warn('Failed to refresh user from DB in overlay:', e);
      }
    };
    refreshUserFromDB();
    
    // Get API keys from localStorage (set by main app)
    const apiKeysStr = localStorage.getItem(LS_API_KEYS);
    const apiProvider = (localStorage.getItem(LS_API_PROVIDER) as 'gemini' | 'openai' | 'claude' | 'groq') || 'gemini';
    
    if (apiKeysStr) {
      try {
        const apiKeys = JSON.parse(apiKeysStr);
        const key = apiKeys[apiProvider as 'gemini' | 'openai' | 'claude' | 'groq'];
        if (key) setApiKey(key);
        setOverlayApiProvider(apiProvider);
        if (key) setOverlayApiKey(key);
      } catch (e) {
        console.error('Failed to parse API keys:', e);
      }
    }

    // Setup speech recognition (Python Bridge for Electron, Web Speech API for browser)
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    isElectronRef.current = isElectron;

    if (isElectron) {
      // Electron: Use Python Bridge (Google Speech API - FREE & REAL-TIME!)
      const { ipcRenderer } = (window as any).require('electron');
      ipcRendererRef.current = ipcRenderer;

      // Listen for Python speech results
      const handlePythonSpeech = (event: any, message: any) => {
        if (message.type === 'transcription') {
          const text = message.text.trim();
          if (text) {
            if (message.is_final) {
              // Final: commit permanently, clear interim
              console.log('📝 [Overlay] FINAL:', text);
              setCommittedText(prev => (prev + ' ' + text).trim());
              setInterimText('');
            } else {
              // Interim: replace current interim (same utterance evolving)
              console.log('📝 [Overlay] INTERIM:', text);
              setInterimText(text);
            }
          }
        } else if (message.type === 'error') {
          console.error('🐍 Python error:', message.message);
        } else if (message.type === 'fatal') {
          console.error('🐍 Python fatal error:', message.message);
          alert(`Fatal error: ${message.message}\nPlease ensure Python and SpeechRecognition library are installed.`);
          setIsListening(false);
        } else if (message.type === 'ready') {
          console.log('✅ Python speech bridge ready!');
        } else if (message.type === 'status') {
          console.log('🐍 Python status:', message.message);
          // Update listening state based on status
          if (message.message === 'calibrating') {
            console.log('🎤 Calibrating microphone...');
          } else if (message.message === 'listening') {
            console.log('🎤 ✅ Now listening for speech! Speak clearly...');
          } else if (message.message === 'stopped') {
            console.log('🛑 Python stopped listening');
          } else if (message.message === 'started') {
            console.log('🚀 Speech recognition started');
          }
        } else if (message.type === 'debug') {
          console.log('🐍 Debug:', message.message);
        }
      };

      ipcRenderer.on('python-speech', handlePythonSpeech);
      
      // Listen for reload signal (when overlay is reopened after session clear)
      ipcRenderer.on('reload-overlay-data', async () => {
        console.log('🔄 Reload signal received - reloading fresh data...');
        
        // Reload chat history from MongoDB
        const freshHistory = await loadChatHistory();
        setChatHistory(freshHistory);
        console.log('✅ Reloaded conversation history:', freshHistory.length, 'messages');
        
        // Clear current Q&A display
        setManualTextInput('');
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');
        setAiResponse('');
        
        // Reset to first Q&A pair (or empty if no history)
        setCurrentPairIndex(0);
      });
      
      // Listen for settings update signal (Real-Time Sync)
      ipcRenderer.on('settings-updated', () => {
        console.log('⚡ Settings updated - reloading from localStorage...');
        
        // Refresh API provider/key from localStorage
        const keysStr = localStorage.getItem(LS_API_KEYS);
        const provider = (localStorage.getItem(LS_API_PROVIDER) as 'gemini' | 'openai' | 'claude' | 'groq') || 'gemini';
        if (keysStr) {
          try {
            const keys = JSON.parse(keysStr);
            const key = keys[provider];
            if (key) {
              setApiKey(key);
              setOverlayApiKey(key);
            }
            setOverlayApiProvider(provider);
          } catch (e) {
            console.error('Failed to parse API keys on settings-updated:', e);
          }
        }

        // Refresh voice provider settings
        (async () => {
          try {
            const userStr = localStorage.getItem(LS_USER_KEY);
            if (userStr) {
              const user = JSON.parse(userStr);
              const voiceProvider = user.voiceProvider || 'default';
              const apiKey = user.deepgramApiKey || '';
              const dgLang = user.deepgramLanguage || 'multi';
              const dgKeyterms = user.deepgramKeyterms || '';
              
              // Update state for UI
              setCurrentVoiceProvider(voiceProvider as 'default' | 'deepgram');
              setCurrentLanguage(dgLang);
              setCurrentKeyterms(dgKeyterms);
              
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('🎤 [Overlay] Voice provider settings update');
              console.log('🎤 [Overlay] Provider:', voiceProvider);
              console.log('🎤 [Overlay] Has API key:', !!apiKey);
              console.log('🎤 [Overlay] Language:', dgLang);
              console.log('🎤 [Overlay] Keyterms:', !!dgKeyterms);
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              
              ipcRenderer.send('init-voice-provider', {
                voiceProvider,
                apiKey,
                language: dgLang,
                keyterms: dgKeyterms
              });
              
              console.log('✅ [Overlay] Voice provider init command sent');
            }
          } catch (e) {
            console.error('❌ [Overlay] Failed to initialize voice provider:', e);
          }
        })();

        // Refresh context values (optional logging)
        const freshBasePrompt = localStorage.getItem(LS_BASE_PROMPT_KEY);
        const freshJD = localStorage.getItem(LS_JD_KEY);
        const freshCompanyInfo = localStorage.getItem(LS_COMPANY_INFO_KEY);
        const freshCV = localStorage.getItem(LS_RESUME_CONTENT_KEY);
        console.log('✅ Settings synced:', {
          hasBasePrompt: !!freshBasePrompt,
          hasJD: !!freshJD,
          hasCompanyInfo: !!freshCompanyInfo,
          hasCV: !!freshCV,
          provider
        });
        console.log('💫 Overlay settings are now up-to-date!');

        // Also refresh user/settings from DB to ensure summaries persist
        (async () => {
          try {
            const userStr = localStorage.getItem(LS_USER_KEY);
            if (!userStr) return;
            const parsed = JSON.parse(userStr);
            if (!parsed?._id) return;
            const res = await fetch(`${API_BASE_URL}/api/auth/user/${parsed._id}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data?.success && data.user) {
              const mergedUser = { ...parsed, ...data.user };
              localStorage.setItem(LS_USER_KEY, JSON.stringify(mergedUser));
              const s = data.user.settings || {};
              setOverlayUserSettings(s);
              if (s.cvSummary) localStorage.setItem('isa_cv_summary', s.cvSummary);
              if (s.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', s.basePromptSummary);
              if (s.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', s.jobDescriptionSummary);
              if (s.companyInfoSummary) localStorage.setItem('isa_company_info_summary', s.companyInfoSummary);
              if (s.cvText) localStorage.setItem(LS_RESUME_CONTENT_KEY, s.cvText);
              if (s.jobDescription) localStorage.setItem(LS_JD_KEY, s.jobDescription);
              if (s.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, s.companyInfo);
              if (s.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, s.basePrompt);
            }
          } catch (e) {
            console.warn('Failed to refresh user from DB (settings-updated):', e);
          }
        })();
      });

      // Listen for chat history updates from main app (Real-Time Sync)
      ipcRenderer.on('chat-history-updated', async (event: any, { userId, count }: any) => {
        console.log('📢 [Overlay] Chat history updated from main app:', count, 'messages');
        
        // Reload chat history from MongoDB
        try {
          const userStr = localStorage.getItem(LS_USER_KEY);
          if (userStr) {
            const user = JSON.parse(userStr);
            if (user._id === userId) {
              const freshHistory = await loadChatHistory();
              setChatHistory(freshHistory);
              console.log('✅ [Overlay] Reloaded chat history:', freshHistory.length, 'messages');
            }
          }
        } catch (error) {
          console.error('❌ [Overlay] Failed to reload chat history:', error);
        }
      });

      // Listen for Ctrl+\ shortcut
      ipcRenderer.on('toggle-listen-answer', () => {
        console.log('🎤 Toggle Listen/Answer shortcut received in overlay');
        console.log('🔍 isStartedRef.current:', isStartedRef.current);
        
        // Check if currently listening using ref
        if (isStartedRef.current) {
          // Stop listening - ONLY transcribe, DON'T auto-send to AI
          console.log('✅ Stopping listen (transcribe only, no auto-send)');
          
          // Stop speech recognition
          if (isElectronRef.current) {
            console.log('🐍 Sending python-stop-listen IPC');
            ipcRendererRef.current?.send('python-stop-listen');
            
            // Transfer transcribed text to input using refs
            const currentText = transcribedTextRef.current.trim();
            setIsListening(false);
            isStartedRef.current = false;
            
            if (currentText.length > 0) {
              const newText = (manualTextInputRef.current + ' ' + currentText).trim();
              setManualTextInput(newText);
              manualTextInputRef.current = newText;
            }
            setTranscribedText('');
            setCommittedText('');
            setInterimText('');
            transcribedTextRef.current = '';
            
          } else if (recognitionRef.current) {
            console.log('🌐 Stopping Web Speech API');
            try { 
              recognitionRef.current.stop();
              isStartedRef.current = false;
            } catch (e) {}
          }
          
        } else {
          // Start listening - Call handleStartListen directly
          console.log('✅ Starting listen via shortcut');
          
          // Clear fields
          setTranscribedText('');
          setCommittedText('');
          setInterimText('');
          transcribedTextRef.current = '';
          setManualTextInput('');
          manualTextInputRef.current = '';
          setAiResponse('');
          wantToListenRef.current = true;
          
          if (isElectronRef.current) {
            // Electron: Use Python Bridge
            ipcRendererRef.current?.send('python-start-listen');
            setIsListening(true);
            isStartedRef.current = true;
            console.log('🐍 Started Python speech recognition via shortcut');
            
          } else if (recognitionRef.current) {
            // Browser: Use Web Speech API
            try {
              recognitionRef.current.start();
              isStartedRef.current = true;
              console.log('🌐 Started Web Speech API via shortcut');
            } catch (e) {
              console.error('Failed to start recognition:', e);
            }
          }
        }
      });

      // Listen for Ctrl+] shortcut (Analyze Screen)
      ipcRenderer.on('trigger-analyze-screen', () => {
        console.log('📸 Analyze Screen shortcut received in overlay');
        console.log('🔍 analyzeScreenRef.current:', analyzeScreenRef.current);
        if (analyzeScreenRef.current) {
          console.log('✅ Calling handleAnalyzeScreen directly');
          analyzeScreenRef.current();
        } else {
          console.error('❌ analyzeScreenRef.current is NULL!');
        }
      });
      
      // Listen for Ctrl+[ shortcut (Toggle BrowseAI)
      ipcRenderer.on('trigger-browse-ai-toggle', () => {
        console.log('🌐 BrowseAI toggle shortcut received in overlay');
        
        // Call the toggle handler using ref
        if (toggleBrowseAIRef.current) {
          toggleBrowseAIRef.current();
        } else {
          console.error('❌ toggleBrowseAIRef.current is NULL!');
        }
      });
      
      // Listen for Ctrl+Enter shortcut (Direct Answer)
      ipcRenderer.on('trigger-direct-answer', () => {
        console.log('⚡ Direct Answer shortcut received in overlay');
        console.log('🔍 isStartedRef.current:', isStartedRef.current);
        console.log('🔍 transcribedTextRef.current:', transcribedTextRef.current);
        console.log('🔍 manualTextInputRef.current:', manualTextInputRef.current);
        
        // If currently listening, stop and then send to AI
        if (isStartedRef.current) {
          console.log('🛑 Stopping listen + sending to AI');
          
          // Stop speech recognition
          if (isElectronRef.current) {
            ipcRendererRef.current?.send('python-stop-listen');
          } else if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
          }
          
          // Transfer text using refs (not stale state!)
          const currentText = transcribedTextRef.current.trim();
          setIsListening(false);
          isStartedRef.current = false;
          
          if (currentText.length > 0) {
            const newText = (manualTextInputRef.current + ' ' + currentText).trim();
            setManualTextInput(newText);
            manualTextInputRef.current = newText; // Update ref immediately
          }
          setTranscribedText('');
          setCommittedText('');
          setInterimText('');
          transcribedTextRef.current = '';
          
          // Trigger Get Answer after a short delay for state to update
          setTimeout(() => {
            console.log('⚡ Auto-triggering Get Answer after stop');
            console.log('🔍 Final manualTextInputRef:', manualTextInputRef.current);
            if (getAnswerRef.current && manualTextInputRef.current.trim()) {
              getAnswerRef.current();
            } else {
              console.log('⚠️ No text to send or getAnswerRef is null');
            }
          }, 500);
          
        } else {
          // Not listening - only trigger Get Answer if there's text
          const questionText = manualTextInputRef.current.trim();
          if (questionText) {
            console.log('⚡ Triggering Get Answer directly');
            if (getAnswerRef.current) {
              getAnswerRef.current();
            }
          } else {
            console.log('⚠️ Ctrl+Enter ignored: no text and not listening');
          }
        }
      });

      // Cleanup
      return () => {
        ipcRenderer.removeListener('python-speech', handlePythonSpeech);
        ipcRenderer.removeAllListeners('reload-overlay-data');
        ipcRenderer.removeAllListeners('settings-updated');
        ipcRenderer.removeAllListeners('toggle-listen-answer');
        ipcRenderer.removeAllListeners('trigger-analyze-screen');
        ipcRenderer.removeAllListeners('trigger-direct-answer');
        ipcRenderer.removeAllListeners('trigger-browse-ai-toggle');
      };

    } else {
      // Browser: Use Web Speech API
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          isStartedRef.current = true;
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              text += event.results[i][0].transcript + ' ';
            }
          }
          if (text.trim()) {
            setTranscribedText(prev => prev + text);
          }
        };

        recognition.onend = () => {
          isStartedRef.current = false;
          setIsListening(false);
        };

        recognition.onerror = (e: any) => {
          console.log('Speech error:', e.error);
          isStartedRef.current = false;
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      document.body.classList.remove('overlay-mode');
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  // Convert chat history to Q&A pairs whenever history changes
  useEffect(() => {
    const pairs: Array<{question: string, answer: string}> = [];
    
    for (let i = 0; i < chatHistory.length; i += 2) {
      const userMsg = chatHistory[i];
      const aiMsg = chatHistory[i + 1];
      
      if (userMsg && aiMsg) {
        // Extract just the question from the full prompt
        const fullText = userMsg.parts?.[0]?.text || userMsg.content || '';
        const questionMatch = fullText.match(/Interview Question: "(.+?)"/);
        const question = questionMatch ? questionMatch[1] : fullText;
        
        const answer = aiMsg.parts?.[0]?.text || aiMsg.content || '';
        
        pairs.push({ question, answer });
      }
    }
    
    // Detect if a new pair was added
    const oldLength = qaPairs.length;
    const newLength = pairs.length;
    
    setQaPairs(pairs);
    console.log(`📦 Q&A pairs updated: ${pairs.length} pairs total`);
    
    // Navigate to latest ONLY if a new pair was added
    if (newLength > oldLength && newLength > 0) {
      setCurrentPairIndex(newLength - 1);
      console.log(`✨ New pair added! Navigating to latest: ${newLength - 1} of ${newLength}`);
    }
  }, [chatHistory, newPairTrigger]);

  // Auto-refresh chat history every 5 seconds (detect changes from web app)
  useEffect(() => {
    const userStr = localStorage.getItem(LS_USER_KEY);
    if (!userStr) return;
    
    try {
      const user = JSON.parse(userStr);
      if (!user._id) return;
      
      const refreshInterval = setInterval(async () => {
        try {
          const result = await messagesClient.getHistory(user._id);
          if (result.success && result.history) {
            // Only update if there's a change in message count
            if (result.count !== chatHistory.length) {
              console.log('🔄 [Overlay Auto-refresh] Chat history updated:', result.count, 'messages');
              setChatHistory(result.history);
            }
          }
        } catch (error) {
          console.error('[Overlay] Failed to auto-refresh chat history:', error);
        }
      }, 5000); // Refresh every 5 seconds
      
      return () => clearInterval(refreshInterval);
    } catch (e) {
      console.error('[Overlay] Failed to parse user for auto-refresh:', e);
    }
  }, [chatHistory.length]); // Re-run when history length changes

  // Keyboard navigation for Q&A pairs (when input not focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys if input field is not focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || 
                             activeElement?.tagName === 'TEXTAREA';
      
      if (isInputFocused || qaPairs.length <= 1) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPairIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPairIndex(prev => Math.min(qaPairs.length - 1, prev + 1));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [qaPairs.length]);

  // Auto-resize textarea when text changes
  useEffect(() => {
    if (inputFieldRef.current) {
      inputFieldRef.current.style.height = 'auto';
      inputFieldRef.current.style.height = inputFieldRef.current.scrollHeight + 'px';
    }
  }, [manualTextInput, transcribedText]);

  // Note: Ctrl+Enter is handled by GLOBAL shortcut in main.cjs -> 'trigger-direct-answer' IPC
  
  // Sync transcribedText from committedText + interimText (streaming display)
  useEffect(() => {
    const combined = (committedText + (interimText ? ' ' + interimText : '')).trim();
    setTranscribedText(combined);
  }, [committedText, interimText]);

  // Keep refs in sync with state (for IPC handlers that have stale closures)
  useEffect(() => {
    transcribedTextRef.current = transcribedText;
  }, [transcribedText]);
  
  useEffect(() => {
    manualTextInputRef.current = manualTextInput;
  }, [manualTextInput]);

  // Global Shift, ESC, and Ctrl+Backspace shortcuts
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Shift key - Toggle focus on input field
      if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement === inputFieldRef.current;
        
        if (isInputFocused) {
          // If focused, blur it (unfocus)
          inputFieldRef.current?.blur();
          console.log('⌨️ Shift pressed - Unfocusing input field (for arrow navigation)');
        } else {
          // If not focused, focus it
          inputFieldRef.current?.focus();
          console.log('⌨️ Shift pressed - Focusing input field');
        }
      }
      
      // Ctrl+Backspace - Clear only the question field
      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        console.log('⌨️ Ctrl+Backspace pressed - Clearing question field only');
        setManualTextInput('');
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');
        inputFieldRef.current?.focus();
      }
      
      // ESC key - Stop response or Clear all
      if (e.key === 'Escape') {
        e.preventDefault();
        
        if (isGenerating) {
          // Stop the response
          console.log('⌨️ ESC pressed - Stopping response');
          handleStopResponse();
        } else {
          // Clear all
          console.log('⌨️ ESC pressed - Clearing all');
          handleClear();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyPress);
    };
  }, [isGenerating]); // Re-run when isGenerating changes

  // Start Listen
  const handleStartListen = async () => {
    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    // Don't clear manualTextInput - keep existing typed text
    setAiResponse('');
    
    if (isElectronRef.current) {
      // Electron: Use Python Bridge (Google Speech API - FREE & REAL-TIME!)
      ipcRendererRef.current?.send('python-start-listen');
      setIsListening(true);
      isStartedRef.current = true; // Set ref for shortcut detection
      console.log('🐍 Started Python speech recognition (real-time, free!)');
      
    } else if (recognitionRef.current) {
      // Browser: Use Web Speech API
      isStartedRef.current = true;
      try {
        recognitionRef.current.start();
        console.log('Speech recognition started');
      } catch (e) {
        console.log('Failed to start recognition:', e);
      }
    } else {
      console.error('❌ No speech recognition available');
    }
  };

  const handleStopListen = () => {
    if (isElectronRef.current) {
      // Electron: Stop Python Bridge
      ipcRendererRef.current?.send('python-stop-listen');
      
      const currentText = transcribedText.trim();
      isStartedRef.current = false;
      setIsListening(false);
      
      // Only update if we got actual transcription
      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      }
      
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      console.log('🐍 Stopped Python speech recognition');
      
      // Check if we should auto-send to AI (from Ctrl+Enter while listening)
      if ((window as any).__autoSendAfterTranscribe) {
        const finalText = currentText.length > 0 
          ? (manualTextInput + ' ' + currentText).trim()
          : manualTextInput.trim();
          
        if (finalText.length > 0) {
          console.log('🚀 Auto-sending to AI after transcription');
          (window as any).__autoSendAfterTranscribe = false;
          
          setTimeout(() => {
            handleGetAnswer();
          }, 100);
        }
      }
      
    } else {
      // Browser: Stop Web Speech API and transfer text
      const currentText = transcribedText.trim();
      isStartedRef.current = false;
      setIsListening(false);
      
      // Only update if we got actual transcription, otherwise keep existing text
      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      } else {
        console.log('⚠️ No speech detected, keeping existing text');
      }
      
      setTranscribedText(''); // Clear transcribed text
      setCommittedText('');
      setInterimText('');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      
      // Check if we should auto-send to AI (from Ctrl+Enter while listening)
      if ((window as any).__autoSendAfterTranscribe) {
        const finalText = currentText.length > 0 
          ? (manualTextInput + ' ' + currentText).trim()
          : manualTextInput.trim();
          
        if (finalText.length > 0) {
          console.log('🚀 Auto-sending to AI after transcription (Web Speech)');
          (window as any).__autoSendAfterTranscribe = false; // Clear flag
          
          // Directly call AI with the text
          setTimeout(() => {
            handleGetAnswer();
          }, 100);
        } else {
          console.log('⚠️ No text to send to AI');
          (window as any).__autoSendAfterTranscribe = false; // Clear flag
        }
      }
    }
  };

  // Get Answer (stop listening + generate)
  const handleGetAnswer = async () => {
    const questionToAnswer = (isListening ? transcribedText : manualTextInput).trim();

    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }

      // If BrowseAI is enabled, send to AI provider instead of database
      if (browserMode && browseAIEnabled && questionToAnswer && typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('send-text-to-ai', questionToAnswer, true); // true = auto-submit
        console.log('📤 Sent to AI provider with auto-submit:', questionToAnswer);
        
        // Show a note for AI Studio users
        if (questionToAnswer.length > 0) {
          setAiResponse('Text sent and submitted to AI provider.\n\nNote: If using Google AI Studio and getting "permission denied", please use ChatGPT, Gemini, or Claude instead. AI Studio has security restrictions for embedded browsers.');
        }
        
        // Clear input after sending
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');
        setManualTextInput('');
        return;
      }

    const savedCustomKey = localStorage.getItem('isa_api_keys');
    const savedProvider = localStorage.getItem('isa_api_provider') || 'gemini';
    let activeApiKey = apiKey;
    
    console.log('🔍 Overlay - Checking localStorage for API keys');
    console.log('📦 isa_api_keys:', savedCustomKey);
    console.log('📡 isa_api_provider:', savedProvider);
    
    if (savedCustomKey) {
      try {
        const keys = JSON.parse(savedCustomKey);
        activeApiKey = keys[savedProvider as 'gemini' | 'openai' | 'claude' | 'groq'] || apiKey;
        console.log('🔑 Active API key:', activeApiKey ? activeApiKey.substring(0, 10) + '...' : 'NONE');
      } catch (e) {
        console.error('Failed to parse API keys:', e);
      }
    } else {
      console.warn('⚠️ No API keys found in localStorage!');
    }

    if (!questionToAnswer || !activeApiKey) {
      if (!activeApiKey) {
        // Custom message box for overlay
        const messageBox = document.createElement('div');
        messageBox.innerHTML = `
          <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: #1f2937; border: 2px solid #ef4444; border-radius: 16px; padding: 32px; max-width: 400px; box-shadow: 0 20px 60px rgba(239, 68, 68, 0.4);">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h3 style="color: #ef4444; font-size: 24px; font-weight: bold; margin-bottom: 8px;">API Key Not Configured</h3>
              </div>
              <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                Please configure your AI provider API key in the <strong style="color: white;">Main App Settings</strong> to start getting answers.
              </p>
              <button onclick="this.parentElement.parentElement.remove()" style="width: 100%; background: #ef4444; color: white; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
                Got It
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(messageBox);
      }
      return;
    }

    // ==================== TOKEN CHECK & CONSUMPTION (OVERLAY) ====================
    // Check if user has enough tokens before generating answer
    const savedUser = localStorage.getItem('isa_current_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        
        // First check locally if user is admin (skip API call for admins)
        const isLocalAdmin = user.role === 'admin' || user.tokens === -1;
        
        if (!isLocalAdmin) {
          const tokenCheck = await tokensClient.checkTokens(user._id);
          
          console.log('🔍 Token check result (overlay):', tokenCheck);
          
          if (!tokenCheck.canSendMessage && !tokenCheck.isAdmin && !tokenCheck.hasUnlimitedTokens) {
            // Show "Out of Tokens" modal in overlay
            const messageBox = document.createElement('div');
            messageBox.id = 'out-of-tokens-modal-overlay';
            messageBox.innerHTML = `
              <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                <div style="background: #1f2937; border: 2px solid #f59e0b; border-radius: 16px; padding: 32px; max-width: 450px; box-shadow: 0 20px 60px rgba(245, 158, 11, 0.4);">
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🪙</div>
                    <h3 style="color: #f59e0b; font-size: 24px; font-weight: bold; margin-bottom: 8px;">Out of Tokens</h3>
                  </div>
                  <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                    You've used all <strong style="color: white;">10 free trial tokens</strong> (1 token = 1 question).
                    <br/><br/>
                    <strong style="color: #f59e0b;">Upgrade to Pro</strong> in the main app to get unlimited tokens!
                  </p>
                  <button id="close-overlay-modal-btn" style="width: 100%; background: #f59e0b; color: white; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
                    Close
                  </button>
                </div>
              </div>
            `;
            document.body.appendChild(messageBox);
            
            // Add event listener
            document.getElementById('close-overlay-modal-btn')?.addEventListener('click', () => {
              document.getElementById('out-of-tokens-modal-overlay')?.remove();
            });
            
            console.log('❌ Out of tokens! Current:', tokenCheck.tokens);
            return;
          }
          
          console.log('✅ Token check passed (overlay). Tokens remaining:', tokenCheck.tokens, 'isAdmin:', tokenCheck.isAdmin);
        } else {
          console.log('✅ Admin user detected (overlay) - skipping token check');
        }
      } catch (error) {
        console.error('❌ Failed to check tokens:', error);
        // Don't block the request if token check fails - fail open
      }
    }

    setIsGenerating(true);
    setAiResponse('');

    try {
      // Cancel any in-flight answer request
      if (answerAbortRef.current) {
        try { answerAbortRef.current.abort(); } catch (e) {}
      }
      const controller = new AbortController();
      answerAbortRef.current = controller;

      const savedBasePrompt =
        (typeof window !== 'undefined' && window.localStorage)
          ? (localStorage.getItem(LS_BASE_PROMPT_KEY) || DEFAULT_BASE_PROMPT)
          : DEFAULT_BASE_PROMPT;
      
      // Get user settings for summaries (from canonical key)
      const savedUser = typeof window !== 'undefined' && window.localStorage
        ? (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })()
        : {};
      const settings = savedUser.settings || {};
      
      // Fallback summaries saved individually by main app
      const lsCvSummary = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem('isa_cv_summary')
        : null;
      const lsBasePromptSummary = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem('isa_base_prompt_summary')
        : null;
      const lsJdSummary = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem('isa_jd_summary')
        : null;
      const lsCompanySummary = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem('isa_company_info_summary')
        : null;
      
      const savedResume = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem(LS_RESUME_CONTENT_KEY)
        : null;
      const savedJD = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem(LS_JD_KEY)
        : null;
      const savedCompanyInfo = (typeof window !== 'undefined' && window.localStorage)
        ? localStorage.getItem(LS_COMPANY_INFO_KEY)
        : null;

      // Use base prompt summary if available, fallback to full base prompt
      const basePromptSummaryToUse = settings.basePromptSummary || lsBasePromptSummary;
      let contextPrompt = basePromptSummaryToUse && basePromptSummaryToUse.trim() 
        ? basePromptSummaryToUse 
        : savedBasePrompt;
      
      // Use summaries for fast responses (fallback to full text, lightly truncated)
      const truncate = (text?: string | null, max = 4000) => (text ? text.slice(0, max) : '');
      
      const cvSummaryToUse = settings.cvSummary || lsCvSummary;
      if (cvSummaryToUse) {
        contextPrompt += `\n\nCandidate Resume Summary:\n${cvSummaryToUse}`;
      } else if (savedResume) {
        contextPrompt += `\n\nCandidate Resume (truncated):\n${truncate(savedResume)}`;
      }
      
      const jdSummaryToUse = settings.jobDescriptionSummary || lsJdSummary;
      if (jdSummaryToUse) {
        contextPrompt += `\n\nJob Description Summary:\n${jdSummaryToUse}`;
      } else if (savedJD) {
        contextPrompt += `\n\nJob Description (truncated):\n${truncate(savedJD)}`;
      }
      
      const companySummaryToUse = settings.companyInfoSummary || lsCompanySummary;
      if (companySummaryToUse) {
        contextPrompt += `\n\nCompany Information Summary:\n${companySummaryToUse}`;
      } else if (savedCompanyInfo) {
        contextPrompt += `\n\nCompany Information (truncated):\n${truncate(savedCompanyInfo)}`;
      }

      const prompt = `${contextPrompt}\n\nInterview Question: "${questionToAnswer}"\n\nProvide a professional answer for this interview question.`;

      let streamedText = '';

      // Prepare messages based on provider format
      let apiMessages: any[] = [];
      
      // Match Electron: use contextMessages setting to bound history
      const contextPairs = overlayUserSettings?.contextMessages || 5;
      const limitMessages = Math.max(2, Math.min(contextPairs * 2, 20));
      const trimmedHistory = chatHistory.slice(-limitMessages);
      
      if (savedProvider === 'gemini') {
        // Gemini format
        apiMessages = trimmedHistory.map((msg: any) => ({
          role: msg.role,
          parts: msg.parts || [{ text: msg.content || '' }]
        }));
        apiMessages.push({ role: 'user', parts: [{ text: prompt }] });
      } else {
        // OpenAI/Claude/Groq format
        apiMessages = trimmedHistory.map((msg: any) => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts?.[0]?.text || msg.content || ''
        }));
        apiMessages.push({ role: 'user', content: prompt });
      }

      // Use streaming endpoint
      console.log('📡 Overlay: Starting streaming response...');
      const response = await fetch(`${API_BASE_URL}/api/generate-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          apiProvider: savedProvider,
          apiKey: activeApiKey
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Stream API error: ${response.status} - ${errorData}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (!data) continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                streamedText += parsed.text;
                setAiResponse(streamedText); // Update UI in real-time
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      console.log('✅ Overlay: Streaming complete, total chars:', streamedText.length);

      // Save to history (Gemini format for storage)
      const newUserMessage = { role: 'user', parts: [{ text: prompt }] };
      const newModelMessage = { role: 'model', parts: [{ text: streamedText }] };
      const updatedHistoryWithResponse = [...chatHistory, newUserMessage, newModelMessage];
      setChatHistory(updatedHistoryWithResponse);
      
      await saveChatHistory(updatedHistoryWithResponse);
      
      // No need for setTimeout navigation - we already pre-navigated! ✅

    } catch (error: any) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setAiResponse(prev => prev || 'Stopped.');
        return;
      }
      console.error('Error in handleGetAnswer:', error);
      
      // Parse and display user-friendly error
      const parsedError = parseApiError(error);
      hideBrowserForModal();
      setApiError(parsedError);
      
      // Also set a brief error message in the response area
      setAiResponse(`❌ ${parsedError.title}\n${parsedError.message}`);
    } finally {
      answerAbortRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleStopResponse = () => {
    if (answerAbortRef.current) {
      try { answerAbortRef.current.abort(); } catch (e) {}
      answerAbortRef.current = null;
    }
    setIsGenerating(false);
    setIsAnalyzing(false);
    setAiResponse(prev => prev || 'Stopped.');
  };

  // Analyze Screen (silent screenshot + AI vision)
  const handleAnalyzeScreen = async () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      // If BrowseAI is enabled, attach screenshot to AI provider
      if (browserMode && browseAIEnabled) {
        try {
          const result = await ipcRenderer.invoke('analyze-screen');
          if (result.success) {
            console.log('✅ Screenshot attached to AI provider');
            setAiResponse('Screenshot attached to AI provider chat!');
          } else {
            console.error('❌ Failed to attach screenshot:', result.error);
            setAiResponse(`Failed to attach screenshot: ${result.error}`);
          }
        } catch (error: any) {
          console.error('❌ Screenshot error:', error);
          setAiResponse(`Screenshot error: ${error.message}`);
        }
        return;
      }
      
      setIsAnalyzing(true);
      setAiResponse('Analyzing screen content...');
      
      const savedCustomKey = localStorage.getItem('isa_api_keys');
      const savedProvider = localStorage.getItem('isa_api_provider') || 'gemini';
      let activeApiKey = apiKey;
      
      console.log('🔍 Analyze Screen - Checking localStorage for API keys');
      console.log('📦 isa_api_keys:', savedCustomKey);
      console.log('📡 isa_api_provider:', savedProvider);
      
      if (savedCustomKey) {
        try {
          const keys = JSON.parse(savedCustomKey);
          activeApiKey = keys[savedProvider as 'gemini' | 'openai' | 'claude' | 'groq'] || apiKey;
          console.log('🔑 Active API key:', activeApiKey ? activeApiKey.substring(0, 10) + '...' : 'NONE');
        } catch (e) {
          console.error('Failed to parse API keys:', e);
        }
      } else {
        console.warn('⚠️ No API keys found in localStorage!');
      }

      // Get user's optional message/question
      const userMessage = (isListening ? transcribedText : manualTextInput).trim();

      try {
        // 1. Capture screen silently
        const screenshotBase64 = await ipcRenderer.invoke('capture-screen');
        if (!screenshotBase64) throw new Error('Capture failed');

        // 2. Prepare for API
        const base64Data = screenshotBase64.split(',')[1];
        
        const savedBasePrompt =
          (typeof window !== 'undefined' && window.localStorage)
            ? (localStorage.getItem(LS_BASE_PROMPT_KEY) || DEFAULT_BASE_PROMPT)
            : DEFAULT_BASE_PROMPT;
        const savedResume = (typeof window !== 'undefined' && window.localStorage)
          ? localStorage.getItem(LS_RESUME_CONTENT_KEY)
          : null;
        const savedJD = (typeof window !== 'undefined' && window.localStorage)
          ? localStorage.getItem(LS_JD_KEY)
          : null;
        const savedCompanyInfo = (typeof window !== 'undefined' && window.localStorage)
          ? localStorage.getItem(LS_COMPANY_INFO_KEY)
          : null;

        let contextPrompt = `${savedBasePrompt} You will be given a screenshot containing one or more questions. Carefully analyze the image and provide accurate, clear, and to-the-point answers.`;
        
        if (savedResume) contextPrompt += `\n\nCandidate Resume Context:\n${savedResume}`;
        if (savedJD) contextPrompt += `\n\nJob Description Context:\n${savedJD}`;
        if (savedCompanyInfo) contextPrompt += `\n\nCompany Context:\n${savedCompanyInfo}`;

        // Add user's specific question if provided
        if (userMessage) {
          contextPrompt += `\n\nUser's Specific Question: "${userMessage}"`;
        }

        let text = '';

        // API call based on provider
        if (savedProvider === 'gemini') {
          // Build message with image (Gemini format)
          const currentTurn = {
            role: 'user',
            parts: [
              { text: contextPrompt },
              { inline_data: { mime_type: "image/png", data: base64Data } }
            ]
          };

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [...chatHistory, currentTurn]
              })
            }
          );

          if (!response.ok) throw new Error(`API error: ${response.status}`);

          const data = await response.json();
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No content found to analyze.';

        } else if (savedProvider === 'openai') {
          // OpenAI Vision format
          const openaiHistory = chatHistory.map((msg: any) => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.parts?.[0]?.text || msg.content || ''
          }));

          openaiHistory.push({
            role: 'user',
            content: [
              { type: 'text', text: contextPrompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
            ]
          });

          const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activeApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: openaiHistory,
                max_tokens: 4000
              })
            }
          );

          if (!response.ok) throw new Error(`API error: ${response.status}`);

          const data = await response.json();
          text = data.choices?.[0]?.message?.content || 'No content found to analyze.';

        } else if (savedProvider === 'claude') {
          // Claude Vision format
          const claudeHistory = chatHistory.map((msg: any) => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.parts?.[0]?.text || msg.content || ''
          }));

          claudeHistory.push({
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
              { type: 'text', text: contextPrompt }
            ]
          });

          const response = await fetch(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': activeApiKey,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4000,
                messages: claudeHistory
              })
            }
          );

          if (!response.ok) throw new Error(`API error: ${response.status}`);

          const data = await response.json();
          text = data.content?.[0]?.text || 'No content found to analyze.';
        } else if (savedProvider === 'groq') {
          // Groq Vision format (OpenAI-compatible)
          const groqHistory = chatHistory.map((msg: any) => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.parts?.[0]?.text || msg.content || ''
          }));

          groqHistory.push({
            role: 'user',
            content: [
              { type: 'text', text: contextPrompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
            ]
          });

          const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activeApiKey}`
              },
              body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Groq Llama 4 Scout model
                messages: groqHistory,
                max_tokens: 4000
              })
            }
          );

          if (!response.ok) throw new Error(`API error: ${response.status}`);

          const data = await response.json();
          text = data.choices?.[0]?.message?.content || 'No content found to analyze.';
        }

        setAiResponse(text);

        // Update local chat history (lightweight text-only version) and save
        const historyLabel = userMessage ? `[Screen Analysis: "${userMessage}"]` : '[Analyzed Screen]';
        const updatedHistoryAfterAnalysis = [
          ...chatHistory,
          { role: 'user', parts: [{ text: historyLabel }] },
          { role: 'model', parts: [{ text }] }
        ];
        setChatHistory(updatedHistoryAfterAnalysis);
        
        // No need to navigate again - we already pre-navigated! ✅
        
        await saveChatHistory(updatedHistoryAfterAnalysis);

        // Clear the input after analysis
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');
        setManualTextInput('');

      } catch (error: any) {
        console.error('Analysis error:', error);
        
        // Parse and display user-friendly error
        const parsedError = parseApiError(error);
        hideBrowserForModal();
        setApiError(parsedError);
        
        // Also set a brief error message in the response area
        setAiResponse(`❌ ${parsedError.title}\n${parsedError.message}`);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  // Browser Control Functions - Toggle BrowseAI
  const handleToggleBrowseAI = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      if (browserMode) {
        // Close browser and turn off toggle
        ipcRenderer.send('close-ai-browser');
        setBrowserMode(false);
        setBrowseAIEnabled(false);
      } else {
        // Open browser and turn on toggle
        ipcRenderer.send('open-ai-browser', 'google');
        setBrowserMode(true);
        setBrowseAIEnabled(true);
      }
    }
  };
  
  // Update ref for shortcut access
  toggleBrowseAIRef.current = handleToggleBrowseAI;
  
  const handleConfirmOpenBrowser = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('open-ai-browser', aiProviderForBrowser);
      setBrowserMode(true);
      setShowProviderModal(false);
    }
  };

  const handleCloseBrowser = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('close-ai-browser');
      setBrowserMode(false);
      setBrowseAIEnabled(false);
      // NOTE: Don't reset providersSentContext here
      // It persists so context is only sent once per provider per user
      // Reset only happens on "New Session"
    }
  };

  const handleAnalyzeScreenForBrowser = async () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      try {
        const result = await ipcRenderer.invoke('analyze-screen');
        if (result.success) {
          console.log('✅ Screenshot attached to AI provider');
        } else {
          console.error('❌ Failed to attach screenshot:', result.error);
          alert(`Failed to attach screenshot: ${result.error}`);
        }
      } catch (error: any) {
        console.error('❌ Screenshot error:', error);
        alert(`Screenshot error: ${error.message}`);
      }
    }
  };

  // Close overlay window
  const handleCloseOverlay = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('close-overlay');
    }
  };

  // Force context transfer to current provider (bypass "already sent" check)
  const handleForceContextTransfer = async () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      // Get current provider from browser URL
      const currentUrl = await ipcRenderer.invoke('get-browser-url');
      
      if (!currentUrl) {
        alert('Please open a provider first (GPT, Gemini, Claude, or AI Studio)');
        return;
      }
      
      let providerName = 'Unknown';
      if (currentUrl.includes('chatgpt.com')) {
        providerName = 'ChatGPT';
      } else if (currentUrl.includes('gemini.google.com')) {
        providerName = 'Gemini';
      } else if (currentUrl.includes('claude.ai')) {
        providerName = 'Claude';
      } else if (currentUrl.includes('aistudio.google.com')) {
        providerName = 'AI Studio';
      } else {
        alert('Please navigate to a supported provider (GPT, Gemini, Claude, or AI Studio)');
        return;
      }
      
      // Show loading alert
      const loadingAlert = document.createElement('div');
      loadingAlert.id = 'context-transfer-alert';
      loadingAlert.innerHTML = `
        <div style="position: fixed; top: 240px; left: 50%; transform: translateX(-50%); width: 85%; max-width: 500px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 8px; padding: 10px 16px; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.6); z-index: 2147483647; display: flex; align-items: center; gap: 10px;">
          <div style="width: 18px; height: 18px; border: 3px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="flex: 1;">
            <p style="color: white; font-size: 13px; font-weight: 600; margin: 0;">
              Transferring context to ${providerName}...
            </p>
          </div>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      `;
      document.body.appendChild(loadingAlert);
      
      // Get context from localStorage
      const savedUser = localStorage.getItem(LS_USER_KEY);
      let contextText = '';
      
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          const settings = user.settings || {};
          
          const basePromptSummary = settings.basePromptSummary || localStorage.getItem('isa_base_prompt_summary') || 'Not provided';
          const cvSummary = settings.cvSummary || localStorage.getItem('isa_cv_summary') || 'Not provided';
          const jdSummary = settings.jobDescriptionSummary || localStorage.getItem('isa_jd_summary') || 'Not provided';
          const companyInfoSummary = settings.companyInfoSummary || localStorage.getItem('isa_company_info_summary') || 'Not provided';
          
          contextText = `BASE PROMPT:
${basePromptSummary}

CV:
${cvSummary}

JOB DESCRIPTION:
${jdSummary}

COMPANY INFO:
${companyInfoSummary}`;
          
        } catch (e) {
          console.error('Failed to load context:', e);
        }
      }
      
      // Send context directly (no page load wait - already on provider page)
      if (contextText) {
        ipcRenderer.send('send-text-to-ai', contextText, false);
        
        setTimeout(() => {
          loadingAlert?.remove();
        }, 1000);
      } else {
        loadingAlert?.remove();
        alert('No context available to transfer. Please configure your settings first.');
      }
    }
  };

  // Navigate to provider and auto-paste context (ONCE per provider per user)
  const handleNavigateToProvider = async (defaultUrl: string, providerName: string) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      // Send provider name to main process for dynamic spacing
      ipcRenderer.send('set-browser-provider', providerName);
      
      // Check if we have a saved URL for this provider (to preserve chat rooms)
      const savedUrl = providerLastUrls.get(providerName);
      const targetUrl = savedUrl || defaultUrl;
      
      // Check if context already sent to this provider BEFORE navigating
      if (providersSentContext.has(providerName)) {
        // Show brief alert that context was already sent
        const loadingAlert = document.createElement('div');
        loadingAlert.id = 'loading-context-alert';
        loadingAlert.innerHTML = `
          <div style="position: fixed; top: 240px; left: 50%; transform: translateX(-50%); width: 85%; max-width: 500px; background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%); border-radius: 8px; padding: 10px 16px; box-shadow: 0 4px 20px rgba(148, 163, 184, 0.6); z-index: 2147483647; display: flex; align-items: center; gap: 10px;">
            <div style="flex: 1;">
              <p style="color: white; font-size: 13px; font-weight: 600; margin: 0;">
                Context already sent to ${providerName}
              </p>
            </div>
          </div>
        `;
        
        document.body.appendChild(loadingAlert);
        
        // Navigate to provider
        ipcRenderer.send('browser-navigate', targetUrl);
        
        // For Claude specifically: Clear any draft/auto-filled input after navigation
        if (providerName === 'Claude') {
          setTimeout(() => {
            ipcRenderer.send('clear-claude-input');
          }, 2000);
        }
        
        // Remove alert after navigation
        setTimeout(() => {
          loadingAlert?.remove();
        }, 1000);
        
        return; // DON'T send context
      }
      
      // Context NOT sent yet - show loading alert
      const loadingAlert = document.createElement('div');
      loadingAlert.id = 'loading-context-alert';
      loadingAlert.innerHTML = `
        <div style="position: fixed; top: 240px; left: 50%; transform: translateX(-50%); width: 85%; max-width: 500px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 8px; padding: 10px 16px; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.6); z-index: 2147483647; display: flex; align-items: center; gap: 10px;">
          <div style="width: 18px; height: 18px; border: 3px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="flex: 1;">
            <p style="color: white; font-size: 13px; font-weight: 600; margin: 0;">
              Loading ${providerName}... Please wait
            </p>
          </div>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      `;
      
      document.body.appendChild(loadingAlert);
      
      // Navigate to provider
      ipcRenderer.send('browser-navigate', targetUrl);
      
      // Get context from localStorage
      const savedUser = localStorage.getItem(LS_USER_KEY);
      let contextText = '';
      
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          const settings = user.settings || {};
          
          // Build context document
          const basePromptSummary = settings.basePromptSummary || localStorage.getItem('isa_base_prompt_summary') || 'Not provided';
          const cvSummary = settings.cvSummary || localStorage.getItem('isa_cv_summary') || 'Not provided';
          const jdSummary = settings.jobDescriptionSummary || localStorage.getItem('isa_jd_summary') || 'Not provided';
          const companyInfoSummary = settings.companyInfoSummary || localStorage.getItem('isa_company_info_summary') || 'Not provided';
          
          contextText = `BASE PROMPT:
${basePromptSummary}

CV:
${cvSummary}

JOB DESCRIPTION:
${jdSummary}

COMPANY INFO:
${companyInfoSummary}`;
          
        } catch (e) {
          console.error('Failed to load context:', e);
        }
      }
      
      // Wait for page to fully load using IPC
      const pageLoaded = await ipcRenderer.invoke('wait-for-page-load');
      
      if (!pageLoaded) {
        loadingAlert?.remove();
        return;
      }
      
      // Send context to provider (don't submit - user can review)
      if (contextText) {
        ipcRenderer.send('send-text-to-ai', contextText, false);
      }
      
      // Remove loading alert after a short delay
      setTimeout(() => {
        loadingAlert?.remove();
      }, 300);
      
      // Mark as sent IMMEDIATELY after pasting (no delay)
      setProvidersSentContext(prev => new Set(prev).add(providerName));
    }
  };

  // Clear all
  const handleClear = async () => {
    // Only clear the question input field, keep Q&A history intact
    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    setManualTextInput('');
    console.log('🧹 Question field cleared (Q&A history preserved)');
  };
  
  // Update ref for shortcut access
  analyzeScreenRef.current = handleAnalyzeScreen;
  getAnswerRef.current = handleGetAnswer;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-gray-900/30 via-blue-900/25 to-gray-900/30 backdrop-blur-md p-4 flex flex-col relative rounded-2xl overflow-hidden border border-blue-500/30 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]">
      {/* Custom Title Bar for Dragging - Enhanced with Glassmorphism */}
      <div 
        className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 backdrop-blur-xl cursor-move z-0 flex items-center justify-between transition-all duration-300 rounded-t-2xl border-b border-blue-400/30 shadow-lg px-3 hover:border-blue-400/50"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Side - Settings Button */}
        <button
          onClick={() => {
            setShowSettingsConfirm(true);
            // Hide browser view when modal opens
            if (browserMode && typeof window !== 'undefined' && (window as any).require) {
              const { ipcRenderer } = (window as any).require('electron');
              ipcRenderer.send('hide-ai-browser');
            }
          }}
          className="px-4 py-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-100 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-blue-400/40 hover:border-blue-300/60 backdrop-blur-sm flex items-center gap-2 shadow-lg"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>

        {/* Center - Drag Indicator */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-300 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span className="text-blue-100 text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity tracking-wider">
            DRAG TO MOVE
          </span>
          <svg className="w-4 h-4 text-blue-300 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </div>
        
        {/* Right Side - Window Control Buttons */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Minimize Button */}
          <button 
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('toggle-overlay-minimize');
              }
            }}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold transition-all bg-blue-500/10 hover:bg-blue-500/30 text-blue-300 hover:text-white group border border-blue-400/20 hover:border-blue-400/50 backdrop-blur-sm"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          </button>
          
          {/* Close Button */}
          <button 
            onClick={handleCloseOverlay}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold transition-all bg-red-500/10 hover:bg-red-500/40 text-red-300 hover:text-white group border border-red-400/20 hover:border-red-400/50 backdrop-blur-sm"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* All interactive content must be non-draggable */}
      <div className="relative z-10 flex flex-col h-full mt-12" style={{ WebkitAppRegion: 'no-drag' } as any}>
      
      {/* Enhanced Header with Glassmorphism */}
      <div className="flex items-center gap-3 mb-3 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 backdrop-blur-xl px-4 py-3 rounded-xl border border-blue-400/30 shadow-[0_4px_16px_0_rgba(59,130,246,0.3)]">
        {/* Status Indicator with Glow */}
        <div className="relative flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full shadow-lg ${isListening ? 'bg-red-500 animate-pulse shadow-red-500/70' : 'bg-emerald-400 shadow-emerald-500/70'}`}></div>
          <span className="text-white text-sm font-bold tracking-wide drop-shadow-lg">
            Interview Assistant
          </span>
        </div>
        
        {/* BrowseAI Button with Integrated Toggle */}
        <button
          onClick={handleToggleBrowseAI}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all backdrop-blur-sm ${
            browserMode && browseAIEnabled
              ? 'bg-green-500/40 hover:bg-green-500/60 text-white animate-pulse shadow-lg shadow-green-500/50 border border-green-400/50'
              : 'bg-gray-700/20 hover:bg-gray-600/30 text-gray-200 border border-gray-500/30'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span>BrowseAI</span>
          <div className={`w-2 h-2 rounded-full ${browserMode && browseAIEnabled ? 'bg-white' : 'bg-gray-500'}`}></div>
        </button>
        
        {/* Action Buttons */}
        <div className="ml-auto flex items-center gap-2">
          {/* Language Button (show only if Deepgram is selected) */}
          {currentVoiceProvider === 'deepgram' && (
            <button
              onClick={() => {
                setLanguageModalOpen(true);
                hideBrowserForModal();
              }}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/50"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              Language
            </button>
          )}
          
          <button
            onClick={() => {
              setModelsModalOpen(true);
              hideBrowserForModal();
            }}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Models
          </button>

          <button
            onClick={handleAnalyzeScreen}
            disabled={isAnalyzing || isGenerating}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-md ${
              isAnalyzing 
                ? 'bg-purple-600/70 text-purple-200 animate-pulse' 
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/50'
            }`}
            data-action="analyze-screen"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
          
          <button
            onClick={handleStopResponse}
            disabled={!isGenerating && !isAnalyzing}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border ${
              isGenerating || isAnalyzing 
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/50 shadow-amber-500/30' 
                : 'bg-gray-800/50 text-gray-600 border-gray-700/30 cursor-not-allowed'
            }`}
          >
            Stop
          </button>
          
          <button 
            onClick={handleClear} 
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-gray-700/50 hover:bg-red-600/30 text-gray-400 hover:text-red-300 border border-gray-600/30 hover:border-red-500/50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Transcription Box with Button */}
      <div className="bg-gray-800 rounded-lg p-3 mb-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputFieldRef}
              value={isListening ? transcribedText : manualTextInput}
              onChange={(e) => {
                if (isListening) {
                  setTranscribedText(e.target.value);
                } else {
                  setManualTextInput(e.target.value);
                }
                // Auto-expand textarea
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              placeholder={isListening ? 'Listening... (you can edit)' : 'Type a question (optional)'}
            onKeyDown={(e) => {
              // Enter (without Shift) - Submit question
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Always prevent new line
                
                if (isListening) {
                  // If listening, stop and submit
                  console.log('⌨️ Enter pressed while listening - Stop and submit');
                  handleStopListen();
                  // Submit after short delay
                  setTimeout(() => {
                    if (!isGenerating && (manualTextInput.trim() || transcribedText.trim())) {
                      e.currentTarget?.blur();
                      handleGetAnswer();
                    }
                  }, 300);
                } else if (!isGenerating && manualTextInput.trim()) {
                  // Not listening and has text - submit
                  e.currentTarget.blur();
                  console.log('⌨️ Enter pressed - Submitting and unfocusing input');
                  handleGetAnswer();
                }
              }
              // Shift+Enter - New line (default behavior)
            }}
            rows={1}
            className={`w-full bg-gray-800/20 border border-blue-400/30 rounded-2xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/60 resize-none overflow-hidden min-h-[40px] max-h-[150px] backdrop-blur-lg shadow-inner ${
              isListening ? 'opacity-90' : ''
            }`}
            style={{ lineHeight: '1.5' }}
          />
          </div>

          <button
            onClick={isListening ? handleStopListen : handleStartListen}
            disabled={isGenerating}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all backdrop-blur-sm border shadow-lg ${
              isListening
                ? 'bg-red-500/40 hover:bg-red-500/60 text-white border-red-400/50 shadow-red-500/50'
                : 'bg-green-500/40 hover:bg-green-500/60 text-white border-green-400/50 shadow-green-500/50'
            } ${isGenerating ? 'opacity-50' : ''}`}
            data-action="start-listen"
          >
            {isListening ? 'Stop' : 'Start Listen'}
          </button>

          <button
            onClick={() => {
              // Blur any focused input so arrows work immediately
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              handleGetAnswer();
            }}
            disabled={isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all backdrop-blur-sm border shadow-lg bg-blue-500/40 hover:bg-blue-500/60 text-white border-blue-400/50 shadow-blue-500/50 ${
              isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())
                ? 'opacity-50'
                : ''
            }`}
            data-action="get-answer"
          >
            {isGenerating ? 'Generating...' : 'Get Answer'}
          </button>
        </div>
      </div>

      {/* Browser Navigation Toolbar (only when browser is active) */}
      {browserMode && (
        <div className="bg-blue-500/10 backdrop-blur-lg rounded-lg px-3 py-0.1 my-0.1 flex items-center justify-center gap-2 border border-blue-400/20">
          {/* Back/Forward/Reload Buttons */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('browser-navigate', 'back');
              }
            }}
            className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
          >
            ←
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('browser-navigate', 'forward');
              }
            }}
            className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
          >
            →
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('browser-navigate', 'reload');
              }
            }}
            className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
          >
            ⟳
          </button>
          
          {/* Divider */}
          <div className="h-4 w-px bg-gray-600 mx-1"></div>
          
          {/* Provider Quick Links - Order: Google, GPT, Gemini, Claude, AI Studio */}
          <button
            onClick={() => handleNavigateToProvider('https://www.google.com', 'Google')}
            className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded text-[10px] font-bold transition-all"
          >
            Google
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://chatgpt.com', 'ChatGPT')}
            className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-[10px] font-bold transition-all"
          >
            GPT
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://gemini.google.com', 'Gemini')}
            className="px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded text-[10px] font-bold transition-all"
          >
            Gemini
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://claude.ai', 'Claude')}
            className="px-2 py-1 bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 rounded text-[10px] font-bold transition-all"
          >
            Claude
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://aistudio.google.com/app/prompts/new_chat', 'AI Studio')}
            className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded text-[10px] font-bold transition-all"
          >
            AI Studio
          </button>
          
          {/* Divider */}
          <div className="h-4 w-px bg-gray-600 mx-1"></div>
          
          {/* Context Transfer Button */}
          <button
            onClick={handleForceContextTransfer}
            className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-[10px] font-bold transition-all flex items-center gap-1"
          >
            <span>📋</span>
            <span>Context Transfer</span>
          </button>
        </div>
      )}

      {/* AI Response - Hide when browser is active */}
      {!browserMode && (aiResponse || isGenerating || isAnalyzing || qaPairs.length > 0) && (
        <div className="flex-1 bg-gray-800/15 backdrop-blur-xl rounded-lg p-4 overflow-y-auto border border-blue-400/20 shadow-inner">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-green-300 text-xs font-bold uppercase drop-shadow-lg">
              {qaPairs.length > 0 ? `Q&A (${currentPairIndex + 1}/${qaPairs.length})` : 'AI Answer'}
            </h3>
            
            {/* Navigation Arrows */}
            {qaPairs.length > 1 && !isGenerating && !isAnalyzing && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPairIndex(Math.max(0, currentPairIndex - 1))}
                  disabled={currentPairIndex === 0}
                  className={`px-2 py-1 text-xs rounded-lg transition-all backdrop-blur-sm border ${
                    currentPairIndex === 0
                      ? 'bg-gray-700/20 text-gray-500 cursor-not-allowed border-gray-600/20'
                      : 'bg-blue-500/30 hover:bg-blue-500/50 text-white border-blue-400/40'
                  }`}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setCurrentPairIndex(Math.min(qaPairs.length - 1, currentPairIndex + 1))}
                  disabled={currentPairIndex === qaPairs.length - 1}
                  className={`px-2 py-1 text-xs rounded-lg transition-all backdrop-blur-sm border ${
                    currentPairIndex === qaPairs.length - 1
                      ? 'bg-gray-700/20 text-gray-500 cursor-not-allowed border-gray-600/20'
                      : 'bg-blue-500/30 hover:bg-blue-500/50 text-white border-blue-400/40'
                  }`}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
          
          {isGenerating || isAnalyzing ? (
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              {isAnalyzing ? 'Analyzing screen...' : 'Generating...'}
            </div>
          ) : qaPairs.length > 0 && qaPairs[currentPairIndex] ? (
            <div className="space-y-3">
              {/* Question Card */}
              <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-3 backdrop-blur-sm">
                <div className="text-xs text-blue-300 uppercase tracking-wide mb-1.5 drop-shadow">Question</div>
                <div className="text-white font-bold text-sm leading-relaxed drop-shadow-lg">
                  {qaPairs[currentPairIndex].question}
                </div>
              </div>
              
              {/* Answer Card */}
              <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-3 backdrop-blur-sm">
                <div className="text-xs text-green-300 uppercase tracking-wide mb-1.5 drop-shadow">Answer</div>
                <div className="markdown-content text-white text-sm leading-relaxed drop-shadow-lg">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
                    components={{
                      // Headings
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4 text-white" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-2 mt-3 text-white" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3 text-white" {...props} />,
                      
                      // Paragraphs
                      p: ({node, ...props}) => <p className="mb-3 text-gray-100" {...props} />,
                      
                      // Lists
                      ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-100" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-100" {...props} />,
                      li: ({node, ...props}) => <li className="ml-2 text-gray-100" {...props} />,
                      
                      // Code blocks
                      code: CodeBlock,
                      pre: ({node, ...props}) => <pre className="my-3" {...props} />,
                      
                      // Links
                      a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                      
                      // Bold, Italic
                      strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                      em: ({node, ...props}) => <em className="italic text-gray-200" {...props} />,
                      
                      // Blockquote
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-600 pl-4 my-3 text-gray-300 italic" {...props} />,
                      
                      // Horizontal rule
                      hr: ({node, ...props}) => <hr className="my-4 border-gray-700" {...props} />,
                    }}
                  >
                    {qaPairs[currentPairIndex].answer}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="markdown-content text-white text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
                components={{
                  // Headings
                  h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4 text-white" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-2 mt-3 text-white" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3 text-white" {...props} />,
                  
                  // Paragraphs
                  p: ({node, ...props}) => <p className="mb-3 text-gray-100" {...props} />,
                  
                  // Lists
                  ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-100" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-100" {...props} />,
                  li: ({node, ...props}) => <li className="ml-2 text-gray-100" {...props} />,
                  
                  // Code blocks
                  code: CodeBlock,
                  pre: ({node, ...props}) => <pre className="my-3" {...props} />,
                  
                  // Links
                  a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                  
                  // Bold, Italic
                  strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                  em: ({node, ...props}) => <em className="italic text-gray-200" {...props} />,
                  
                  // Blockquote
                  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-600 pl-4 my-3 text-gray-300 italic" {...props} />,
                  
                  // Horizontal rule
                  hr: ({node, ...props}) => <hr className="my-4 border-gray-700" {...props} />,
                }}
              >
                {aiResponse}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Models / API Settings Modal */}
      {modelsModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-bold">Models / API Settings</h3>
              <button
                onClick={() => {
                  setModelsModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Provider</label>
                <select
                  value={overlayApiProvider}
                  onChange={(e) => {
                    const provider = e.target.value as 'gemini' | 'openai' | 'claude' | 'groq';
                    setOverlayApiProvider(provider);
                    // auto-populate API key if saved
                    try {
                      const keysStr = localStorage.getItem(LS_API_KEYS);
                      if (keysStr) {
                        const keys = JSON.parse(keysStr);
                        const key = keys[provider];
                        if (key) setOverlayApiKey(key);
                        else setOverlayApiKey('');
                      } else {
                        setOverlayApiKey('');
                      }
                    } catch {
                      setOverlayApiKey('');
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-blue-500 hover:border-blue-500 transition-colors"
                >
                  <option className="bg-gray-800 text-white" value="gemini">Gemini</option>
                  <option className="bg-gray-800 text-white" value="openai">OpenAI</option>
                  <option className="bg-gray-800 text-white" value="claude">Claude</option>
                  <option className="bg-gray-800 text-white" value="groq">Groq</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {overlayApiProvider.toUpperCase()} API Key
                </label>
                <input
                  type="password"
                  value={overlayApiKey}
                  onChange={(e) => setOverlayApiKey(e.target.value)}
                  placeholder="Enter API key"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 hover:border-blue-500 transition-colors"
                  style={{ letterSpacing: '0.5px' }}
                />
              </div>

              {overlaySaveError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {overlaySaveError}
                </div>
              )}
              {overlaySaveSuccess && (
                <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                  ✓ Saved
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveOverlayApiSettings}
                disabled={overlaySaving}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  overlaySaving
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {overlaySaving ? 'Saving...' : 'Save & Sync'}
              </button>
              <button
                onClick={() => {
                  setModelsModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {languageModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-bold">Deepgram Language</h3>
              <button
                onClick={() => {
                  setLanguageModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Recognition Language
                </label>
                <select
                  value={currentLanguage}
                  onChange={async (e) => {
                    const newLang = e.target.value;
                    setCurrentLanguage(newLang);
                    
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('🌍 [Overlay] Language change:', newLang);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    // Save to backend
                    try {
                      const userStr = localStorage.getItem(LS_USER_KEY);
                      if (userStr) {
                        const user = JSON.parse(userStr);
                        const token = localStorage.getItem('token');
                        
                        const response = await fetch(`${API_BASE_URL}/api/auth/deepgram-language`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({ 
                            userId: user._id,
                            deepgramLanguage: newLang 
                          })
                        });
                        
                        if (response.ok) {
                          console.log('✅ [Overlay] Language saved to database');
                          
                          // Update localStorage
                          user.deepgramLanguage = newLang;
                          localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
                          
                          // Re-init voice provider with new language
                          if (typeof window !== 'undefined' && (window as any).require) {
                            const { ipcRenderer } = (window as any).require('electron');
                            const deepgramKey = user.deepgramApiKey || '';
                            const keyterms = user.deepgramKeyterms || '';
                            ipcRenderer.send('init-voice-provider', {
                              voiceProvider: 'deepgram',
                              apiKey: deepgramKey,
                              language: newLang,
                              keyterms: keyterms
                            });
                            console.log('✅ [Overlay] Voice provider re-initialized with new language');
                          }
                        } else {
                          console.error('❌ [Overlay] Failed to save language:', await response.text());
                        }
                      }
                    } catch (err) {
                      console.error('❌ [Overlay] Language save error:', err);
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-purple-500 hover:border-purple-500 transition-colors max-h-60 overflow-y-auto"
                >
                  {DEEPGRAM_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code} className="bg-gray-800 text-white">
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="text-xs text-gray-400 bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <p className="font-semibold mb-1">ℹ️ Current: {DEEPGRAM_LANGUAGES.find(l => l.code === currentLanguage)?.label}</p>
                <p className="text-[10px] text-gray-500">
                  {ENGLISH_LANG_CODES.includes(currentLanguage) 
                    ? '🔥 Full Features: Smart Format, Punctuation, Diarization, Dictation' 
                    : '⚡ Basic Features: Endpointing enabled'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLanguageModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Confirmation Modal (Stealthy) */}
      {showSettingsConfirm && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-xs w-full shadow-2xl">
            <p className="text-white text-center font-medium mb-6">Do you really wanna go to Settings?</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSettingsConfirm(false);
                  if (typeof window !== 'undefined' && (window as any).require) {
                    const { ipcRenderer } = (window as any).require('electron');
                    ipcRenderer.send('show-main-window');
                  }
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-sm font-bold transition-all"
              >
                Yes
              </button>
              <button
                onClick={() => {
                  setShowSettingsConfirm(false);
                  // Show browser view when modal closes
                  if (browserMode && typeof window !== 'undefined' && (window as any).require) {
                    const { ipcRenderer } = (window as any).require('electron');
                    ipcRenderer.send('show-ai-browser');
                  }
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-xl text-sm font-bold transition-all"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
      
      </div> {/* End of non-draggable wrapper */}
      
      {/* Functional Resize Handles - All Directions */}
      
      {/* Bottom-Right Corner */}
      <div 
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-50 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY, direction: 'se' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="absolute bottom-1 right-1 w-4 h-4 flex items-center justify-center">
          <svg className="w-full h-full text-blue-400 opacity-40 group-hover:opacity-100 group-hover:text-blue-300 transition-all drop-shadow-lg" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9 0v2h2.5L7 6.5 8.5 8 13 3.5V6h2V0H9zm-4 7L0 11.5V9H-2v6h6v-2H1.5L6 8.5 4.5 7z" transform="translate(0.5, 0.5)" />
          </svg>
        </div>
        <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[24px] border-l-transparent border-b-[24px] border-b-blue-900/40 group-hover:border-b-blue-700/60 transition-all rounded-br-2xl"></div>
      </div>
      
      {/* Bottom-Left Corner */}
      <div 
        className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-50 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY, direction: 'sw' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="absolute bottom-0 left-0 w-0 h-0 border-r-[24px] border-r-transparent border-b-[24px] border-b-blue-900/40 group-hover:border-b-blue-700/60 transition-all rounded-bl-2xl"></div>
      </div>
      
      {/* Top-Right Corner */}
      <div 
        className="absolute top-0 right-0 w-6 h-6 cursor-nesw-resize z-50 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY, direction: 'ne' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="absolute top-0 right-0 w-0 h-0 border-l-[24px] border-l-transparent border-t-[24px] border-t-blue-900/40 group-hover:border-t-blue-700/60 transition-all rounded-tr-2xl"></div>
      </div>
      
      {/* Top-Left Corner */}
      <div 
        className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-50 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY, direction: 'nw' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="absolute top-0 left-0 w-0 h-0 border-r-[24px] border-r-transparent border-t-[24px] border-t-blue-900/40 group-hover:border-t-blue-700/60 transition-all rounded-tl-2xl"></div>
      </div>
      
      {/* Right Edge */}
      <div 
        className="absolute top-12 right-0 bottom-6 w-2 cursor-ew-resize z-40 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY: 0, direction: 'e' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="w-full h-full bg-blue-900/0 group-hover:bg-blue-700/30 transition-all"></div>
      </div>
      
      {/* Left Edge */}
      <div 
        className="absolute top-12 left-0 bottom-6 w-2 cursor-ew-resize z-40 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.screenX;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.screenX - startX;
              ipcRenderer.send('overlay-resize', { deltaX, deltaY: 0, direction: 'w' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="w-full h-full bg-blue-900/0 group-hover:bg-blue-700/30 transition-all"></div>
      </div>
      
      {/* Bottom Edge */}
      <div 
        className="absolute bottom-0 left-6 right-6 h-2 cursor-ns-resize z-40 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX: 0, deltaY, direction: 's' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="w-full h-full bg-blue-900/0 group-hover:bg-blue-700/30 transition-all"></div>
      </div>
      
      {/* Top Edge (below drag bar) */}
      <div 
        className="absolute top-12 left-6 right-6 h-2 cursor-ns-resize z-40 group"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.screenY;
          
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('overlay-resize-start');
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaY = moveEvent.screenY - startY;
              ipcRenderer.send('overlay-resize', { deltaX: 0, deltaY, direction: 'n' });
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              ipcRenderer.send('overlay-resize-end');
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        }}
      >
        <div className="w-full h-full bg-blue-900/0 group-hover:bg-blue-700/30 transition-all"></div>
      </div>

      {/* No floating buttons needed anymore */}

      {/* Provider Selection Modal */}
      {showProviderModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setShowProviderModal(false)}
        >
          <div 
            className="bg-slate-900 border border-blue-500/60 rounded-xl p-6 w-[320px] max-w-[90vw] shadow-2xl shadow-blue-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-4">Select Browser Start Page</h3>
            
            <div className="space-y-2 mb-6">
              {[
                { value: 'google', label: '🔍 Google Search', desc: 'Start with Google search' },
                { value: 'chatgpt', label: '🤖 ChatGPT', desc: 'OpenAI ChatGPT' },
                { value: 'aistudio', label: '🎨 AI Studio', desc: 'Google AI Studio' },
                { value: 'gemini', label: '💎 Gemini', desc: 'Google Gemini' },
                { value: 'claude', label: '🧠 Claude', desc: 'Anthropic Claude' }
              ].map((provider) => (
                <button
                  key={provider.value}
                  onClick={() => setAiProviderForBrowser(provider.value as any)}
                  className={`w-full text-left p-3 rounded-lg transition-all border-2 ${
                    aiProviderForBrowser === provider.value
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-blue-500/50 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-sm">{provider.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{provider.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowProviderModal(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOpenBrowser}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all"
              >
                Open Browser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Error Modal */}
      {apiError && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => {
            setApiError(null);
            showBrowserAfterModal();
          }}
        >
          <div 
            className="bg-slate-900 border border-red-500/60 rounded-lg px-4 py-3 w-[280px] max-w-[90vw] shadow-lg shadow-red-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-red-400 text-lg">⚠️</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-300">
                  {apiError.title || 'API Error'}
                </div>
                <div className="text-sm text-slate-200 mt-1">
                  {apiError.message || 'Rate Limit Exceeded'}
                </div>
                {apiError.details && (
                  <div className="text-xs text-slate-400 mt-2">
                    {apiError.details}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setApiError(null);
                  showBrowserAfterModal();
                }}
                className="text-slate-400 hover:text-white text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverlayApp;
