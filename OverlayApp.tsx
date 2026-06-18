import React, { useEffect, useState, useLayoutEffect, useRef } from 'react';
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
import { apiClient } from './src/utils/apiClient';
import { resolveDeepgramConfig, shouldUseDeepgram } from './src/utils/deepgramChainClient';
import { getDefaultShortcuts, ShortcutConfig, ShortcutAction } from './src/utils/shortcutsManager';
import { getTierLimits } from './src/config';
import StealthModal from './components/StealthModal';
import SearchableLanguageSelect from './components/SearchableLanguageSelect';

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

    const DEFAULT_BASE_PROMPT = `You are a real-time AI interview assistant built for live mock interview conversations.

TOP PRIORITIES:
- Every answer must sound natural, confident, and human — never robotic or templated.

---

CONTEXT RULES:
1. Document = single source of truth
   - Use ONLY mentioned skills, experience, projects, education
   - NEVER invent, exaggerate, or assume details
2. Job description provided = align answers directly to its requirements and keywords
3. Candidate info provided = personalize all responses to their background
4. No context provided = apply general best practices for the role type

---

INTERVIEW ANSWER TECHNIQUES:
Apply the most suitable framework based on question type. Never name the framework out loud — just structure the answer accordingly.

**Behavioral Questions** ("Tell me about a time...", "Describe a situation..."):
Use STAR method:
- Situation: Brief context (1-2 sentences)
- Task: What the candidate was responsible for
- Action: Specific steps THEY took (focus here — use "I", not "we")
- Result: Quantified or concrete outcome where possible

**Achievement / Impact Questions** ("What's your biggest accomplishment..."):
Use CAR method:
- Challenge: The problem or obstacle
- Action: How they tackled it
- Result: The measurable outcome

**Motivation / Fit Questions** ("Why this role?", "Where do you see yourself?"):
Use the Past-Present-Future structure:
- Past: Relevant experience that led here
- Present: Current skills and what they bring
- Future: How this role fits their growth

**Strength / Competency Questions** ("What are your strengths?"):
Lead with the strength → give a specific example → tie it to the role

**Weakness Questions** ("What's your weakness?"):
Name a real but non-critical weakness → show self-awareness → describe active steps taken to improve

**Technical / Situational Questions** ("How would you handle X?", "Walk me through..."):
Use a structured approach:
- Clarify the problem
- Break down the approach step by step
- Mention trade-offs or alternatives where relevant
- Conclude with outcome or recommendation

**Coding / Technical Deep-Dives**:
- Provide correct, clean code or explanation
- Explain the approach briefly before or after
- Mention complexity or edge cases only if relevant

---

ANSWER QUALITY RULES:
- Lead with the strongest point — no long wind-ups
- Keep answers focused: 60–120 seconds of speech equivalent (~100–200 words) unless question demands more
- Don't summarize or condense — provide substantive, important information with key insights
- Use bullet points when listing important details or key takeaways
- Use "I" not "we" for personal ownership
- Quantify results wherever the context supports it (%, time saved, users, scale)
- Avoid filler phrases: "That's a great question", "As I mentioned", "Basically"
- End answers with a clear closing line — don't trail off

---

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
  - Treat it as a possible phonetic error from speech-to-text
  - Infer the most likely correct technical term
  - Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- Always treat unfamiliar or unclear terms as phonetic errors from speech-to-text
- Infer the closest matching technical term based on context and sound
- NEVER express confusion, say "I don't understand", or ask clarifying questions
- Answer directly and confidently based on the most likely intended meaning
- If a term has no clear match, ignore it and answer the rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain the correction process
- Answer confidently as if the question was clearly spoken
- Never say "I don't understand", "I'm not sure", or anything similar — always answer based on the closest phonetic match
- Never mention you are an AI

---

OUTPUT FORMAT:
- No emojis
- No framework labels (don't write "Situation:", "Task:" etc. — just flow naturally)
- Bullet points ONLY when listing multiple items or expanding a technical answer
- Use markdown for formatting when helpful
- Give examples ONLY when they improve clarity`;

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
const LS_ANALYZED_QUESTIONS_KEY = 'isa_analyzed_questions';
const QUERY_BACKEND_URL = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('backendUrl')
  : null;
const API_BASE_URL = QUERY_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [keywordsModalOpen, setKeywordsModalOpen] = useState(false);
  const [currentVoiceProvider, setCurrentVoiceProvider] = useState<'default' | 'deepgram'>('default');
  const [currentLanguage, setCurrentLanguage] = useState<string>('multi');
  const [currentKeyterms, setCurrentKeyterms] = useState<string>('');
  const [overlayUserSettings, setOverlayUserSettings] = useState<any>({});
  const [analyzedQuestions, setAnalyzedQuestions] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ANALYZED_QUESTIONS_KEY) || '[]'); }
    catch { return []; }
  });
  
  // Browser mode state
  const [browserMode, setBrowserMode] = useState(false);
  const [browseAIEnabled, setBrowseAIEnabled] = useState(false);
  const [aiProviderForBrowser, setAiProviderForBrowser] = useState<'chatgpt' | 'aistudio' | 'claude' | 'gemini' | 'google'>('google');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showOutOfTokensModal, setShowOutOfTokensModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [modalInfo, setModalInfo] = useState<{title: string; message: string; variant: 'info' | 'success' | 'error' | 'warning'; icon?: string} | null>(null);

  const transcriptionStartTimeRef = useRef<number>(0);
  const [transcriptionSecondsRemaining, setTranscriptionSecondsRemaining] = useState<number>(1500); // Default, will be updated dynamically
  
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
            language: dgLang,
            keyterms: dgKeyterms
          });
          
          console.log('✅ [Overlay] Voice provider init command sent on mount');
          
          // Also register global shortcuts (merge frontend defaults with DB overrides)
          const defaults = getDefaultShortcuts();
          const merged = { ...defaults };
          if (user.shortcuts) {
            console.log('🎹 [Overlay] Registering global shortcuts from database');
            for (const [action, val] of Object.entries(user.shortcuts)) {
              const userShortcut = val as any;
              const mappedAction = action === 'focusQuestion' ? 'focusInput' : action === 'minimizeToggle' ? 'toggleOverlay' : action === 'startStopListen' ? 'toggleListen' : action;
              merged[mappedAction] = {
                ...(defaults[mappedAction] || {}),
                action: mappedAction as any,
                modifier: userShortcut.modifier || defaults[mappedAction]?.modifier,
                defaultKey: userShortcut.defaultKey || userShortcut.key || defaults[mappedAction]?.defaultKey
              } as ShortcutConfig;
            }
          }
          ipcRenderer.invoke('update-global-shortcuts', merged);
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
  
  const [showSettingsConfirm, setShowSettingsConfirm] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentPairIndex, setCurrentPairIndex] = useState(0); // For Q&A navigation
  const [apiError, setApiError] = useState<{title: string, message: string, details?: string} | null>(null);
  const [shortcuts, setShortcuts] = useState<any>({});
  const [qaPairs, setQaPairs] = useState<Array<{question: string, answer: string}>>([]); // Q&A pairs
  const [chainAlert, setChainAlert] = useState(false);
  const chainAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newPairTrigger, setNewPairTrigger] = useState(0); // Trigger to force navigation to latest
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const isStartedRef = useRef(false);
  const answerAbortRef = useRef<AbortController | null>(null);
  const isElectronRef = useRef(false);
  const ipcRendererRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const deepgramAudioRef = useRef<MediaStream | null>(null);
  const displayCaptureStreamRef = useRef<MediaStream | null>(null);
  const micCaptureStreamRef = useRef<MediaStream | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputFieldRef = useRef<HTMLTextAreaElement>(null); // For auto-focus and auto-resize
  const analyzeScreenRef = useRef<(() => Promise<void>) | null>(null); // For shortcut access
  const wantToListenRef = useRef(false); // Track if user wants to listen
  const getAnswerRef = useRef<(() => Promise<void>) | null>(null); // For Ctrl+Enter shortcut
  const startListenRef = useRef<(() => void) | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const isListeningRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const transcribedTextRef = useRef(''); // For IPC handler access
  const manualTextInputRef = useRef(''); // For IPC handler access
  const toggleBrowseAIRef = useRef<(() => void) | null>(null); // For Ctrl+[ shortcut
  const overlayLog = (...parts: any[]) => {
    const message = parts
      .map((p) => (typeof p === 'string' ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()))
      .join(' ');
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('overlay-log', message);
      }
    } catch (e) {}
    console.log('[OVERLAY]', ...parts);
  };

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
      /^[([]/i,                       // Starts with ( or [
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

  // Shared helper: fetch user from DB and sync ALL state (settings, language, keyterms)
  // Used by mount, settings-updated IPC, and modal open handlers
  const syncUserSettings = async (source: string) => {
    try {
      const userStr = localStorage.getItem(LS_USER_KEY);
      if (!userStr) return;
      const parsed = JSON.parse(userStr);
      if (!parsed?._id) return;
      const res = await apiClient(`/auth/user/${parsed._id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data.user) {
        const freshUser = data.user;
        const mergedUser = { ...parsed, ...freshUser };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(mergedUser));
        const s = freshUser.settings || {};
        setOverlayUserSettings(s);
        // Initialize transcription remaining
        const trSeconds = freshUser.transcriptionSeconds || 0;
        const limits = getTierLimits(freshUser.plan);
        setTranscriptionSecondsRemaining(Math.max(0, limits.transcriptionSeconds - trSeconds));
        if (freshUser.deepgramLanguage) setCurrentLanguage(freshUser.deepgramLanguage);
        if (freshUser.deepgramKeyterms !== undefined) setCurrentKeyterms(freshUser.deepgramKeyterms);
        if (s.cvSummary) localStorage.setItem('isa_cv_summary', s.cvSummary);
        if (s.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', s.basePromptSummary);
        if (s.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', s.jobDescriptionSummary);
        if (s.companyInfoSummary) localStorage.setItem('isa_company_info_summary', s.companyInfoSummary);
        if (s.cvText) localStorage.setItem(LS_RESUME_CONTENT_KEY, s.cvText);
        if (s.jobDescription) localStorage.setItem(LS_JD_KEY, s.jobDescription);
        if (s.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, s.companyInfo);
        if (s.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, s.basePrompt);
        if (s.responseLanguage) localStorage.setItem('isa_response_language', s.responseLanguage);
        console.log(`✅ [Overlay] User settings synced from DB (${source}):`, {
          deepgramLanguage: freshUser.deepgramLanguage,
          deepgramKeyterms: freshUser.deepgramKeyterms,
          hasSettings: !!s
        });
      }
    } catch (e) {
      console.warn(`Failed to sync user settings from DB (${source}):`, e);
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
          localStorage.removeItem(LS_ANALYZED_QUESTIONS_KEY);
          setAnalyzedQuestions([]);
          
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

    syncUserSettings('mount');
    
    // Get API keys from localStorage (set by main app)
    const apiKeysStr = localStorage.getItem(LS_API_KEYS);
    const apiProvider = (localStorage.getItem(LS_API_PROVIDER) as 'gemini' | 'openai' | 'claude' | 'groq') || 'gemini';
    
    if (apiKeysStr) {
      try {
        const apiKeys = JSON.parse(apiKeysStr);
        const key = apiKeys[apiProvider as 'gemini' | 'openai' | 'claude' | 'groq'];
        if (key) setApiKey(key);
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
          setModalInfo({ title: 'Python Fatal Error', message: `${message.message}\nPlease ensure Python and SpeechRecognition library are installed.`, variant: 'error', icon: '🐍' });
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
      
      // Listen for settings update signal (Real-Time Sync with payload)
      ipcRenderer.on('settings-updated', (_event: any, payload?: any) => {
        console.log('⚡ Settings updated - applying changes...', payload ? 'with payload' : 'fallback to localStorage');

        // Apply payload immediately (no network round-trip) — settings, deepgramLanguage, deepgramKeyterms
        if (payload?.settings) {
          setOverlayUserSettings((prev: any) => ({ ...prev, ...payload.settings }));
          if (payload.settings.responseLanguage) {
            localStorage.setItem('isa_response_language', payload.settings.responseLanguage);
          }
          if (payload.settings.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, payload.settings.basePrompt);
          if (payload.settings.jobDescription) localStorage.setItem(LS_JD_KEY, payload.settings.jobDescription);
          if (payload.settings.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, payload.settings.companyInfo);
          if (payload.settings.cvText) localStorage.setItem(LS_RESUME_CONTENT_KEY, payload.settings.cvText);
          if (payload.settings.cvSummary) localStorage.setItem('isa_cv_summary', payload.settings.cvSummary);
          if (payload.settings.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', payload.settings.basePromptSummary);
          if (payload.settings.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', payload.settings.jobDescriptionSummary);
          if (payload.settings.companyInfoSummary) localStorage.setItem('isa_company_info_summary', payload.settings.companyInfoSummary);
          // Update user in localStorage
          const userStr = localStorage.getItem(LS_USER_KEY);
          if (userStr) {
            try {
              const u = JSON.parse(userStr);
              u.settings = { ...(u.settings || {}), ...payload.settings };
              localStorage.setItem(LS_USER_KEY, JSON.stringify(u));
            } catch (_) {}
          }
        }
        if (payload?.deepgramLanguage !== undefined) {
          setCurrentLanguage(payload.deepgramLanguage);
        }
        if (payload?.deepgramKeyterms !== undefined) {
          setCurrentKeyterms(payload.deepgramKeyterms);
        }

        // Refresh API provider/key from localStorage
        const keysStr = localStorage.getItem(LS_API_KEYS);
        const provider = (localStorage.getItem(LS_API_PROVIDER) as 'gemini' | 'openai' | 'claude' | 'groq') || 'gemini';
        if (keysStr) {
          try {
            const keys = JSON.parse(keysStr);
            const key = keys[provider];
            if (key) {
              setApiKey(key);
            }
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
              const dgLang = payload?.deepgramLanguage || user.deepgramLanguage || 'multi';
              const dgKeyterms = payload?.deepgramKeyterms !== undefined ? payload.deepgramKeyterms : (user.deepgramKeyterms || '');

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

        // Also refresh user/settings from DB to ensure all data is in sync
        syncUserSettings('settings-updated');
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
      ipcRenderer.on('toggle-listen-answer', async () => {
        console.log('🎤 Toggle Listen/Answer shortcut received in overlay');
        console.log('🔍 isStartedRef.current:', isStartedRef.current);
        
        // Check if currently listening using ref
        if (isStartedRef.current) {
          // Stop listening - ONLY transcribe, DON'T auto-send to AI
          console.log('✅ Stopping listen (transcribe only, no auto-send)');
          
          // Stop speech recognition
          if (isElectronRef.current) {
            console.log('🛑 Stopping voice capture in Electron');
            handleStopListen();
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
            console.log('🎤 Starting voice capture in Electron');
            await handleStartListen();
            console.log('✅ Voice capture start completed');
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
            handleStopListen();
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
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  // Cross-platform settings sync: pick up changes from other tabs/windows via localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_USER_KEY && e.newValue) {
        try {
          const updatedUser = JSON.parse(e.newValue);
          const s = updatedUser.settings || {};
          setOverlayUserSettings((prev: any) => ({ ...prev, ...s }));
          if (updatedUser.deepgramLanguage) setCurrentLanguage(updatedUser.deepgramLanguage);
          if (updatedUser.deepgramKeyterms !== undefined) setCurrentKeyterms(updatedUser.deepgramKeyterms);
          if (s.responseLanguage) localStorage.setItem('isa_response_language', s.responseLanguage);
          // Also update voice provider
          if (updatedUser.voiceProvider) setCurrentVoiceProvider(updatedUser.voiceProvider);
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Convert chat history to Q&A pairs whenever history changes
  useEffect(() => {
    const pairs: Array<{question: string, answer: string}> = [];

    // Pair user messages with subsequent model messages by checking roles
    for (let i = 0; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      if (msg.role === 'user' || (msg as any).role === 'user') {
        const userMsg = msg;
        // Look for the next model message
        let aiMsg = null;
        for (let j = i + 1; j < chatHistory.length; j++) {
          if (chatHistory[j].role === 'model' || (chatHistory[j] as any).role === 'model') {
            aiMsg = chatHistory[j];
            break;
          }
        }

        if (aiMsg) {
          // Extract just the question from the full prompt
          const fullText = userMsg.parts?.[0]?.text || (userMsg as any).content || '';
          const questionMatch = fullText.match(/(?:Interview|Meeting) Question: "(.+?)"/);
          const question = questionMatch ? questionMatch[1] : fullText;

          let answer = aiMsg.parts?.[0]?.text || (aiMsg as any).content || '';
          // Strip QUESTION:/ANSWER: prefixes from saved answers
          answer = answer.replace(/^QUESTION:\s*.+\n?/i, '').replace(/^ANSWER:\s*/i, '').trim();

          pairs.push({ question, answer });
        }
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
  useLayoutEffect(() => {
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

  // Persist analyzed questions
  useEffect(() => {
    try { localStorage.setItem(LS_ANALYZED_QUESTIONS_KEY, JSON.stringify(analyzedQuestions)); }
    catch {}
  }, [analyzedQuestions]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Load configurable shortcuts from localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem(LS_USER_KEY);
      if (userStr) {
        const user = JSON.parse(userStr);
        const defaults = getDefaultShortcuts();
        const merged = { ...defaults };
        if (user.shortcuts) {
          for (const [action, val] of Object.entries(user.shortcuts)) {
            const userShortcut = val as any;
            const mappedAction = action === 'focusQuestion' ? 'focusInput' : action === 'minimizeToggle' ? 'toggleOverlay' : action;
            merged[mappedAction] = {
              ...(defaults[mappedAction] || {}),
              action: mappedAction as any,
              modifier: userShortcut.modifier || defaults[mappedAction]?.modifier,
              defaultKey: userShortcut.defaultKey || userShortcut.key || defaults[mappedAction]?.defaultKey
            } as ShortcutConfig;
          }
        }
        setShortcuts(merged);
      } else {
        setShortcuts(getDefaultShortcuts());
      }
    } catch (e) {
      console.error('[Overlay] Failed to load shortcuts:', e);
      setShortcuts(getDefaultShortcuts());
    }
  }, []);

  // Configurable shortcut keydown handler
  useEffect(() => {
    const handleShortcutKeyDown = (e: KeyboardEvent) => {
      const pressedKey = e.key.toLowerCase();
      const hasCtrl = e.ctrlKey || e.metaKey;
      const hasShift = e.shiftKey;
      const hasAlt = e.altKey;

      for (const [action, config] of Object.entries(shortcuts) as [string, ShortcutConfig][]) {
        const mod = config.modifier.toLowerCase();
        const configKey = config.defaultKey.toLowerCase();

        const modMatch =
          (mod === 'control' && hasCtrl) ||
          (mod === 'meta' && (e.metaKey || hasCtrl)) ||
          (mod === 'alt' && hasAlt) ||
          (mod === 'shift' && hasShift);

        const keyMatch = config.defaultKey.trim() === ''
          ? (pressedKey === config.modifier.toLowerCase())
          : (pressedKey === configKey);

        if (modMatch && keyMatch && (!hasAlt || mod === 'alt')) {
          e.preventDefault();
          console.log(`[Overlay] Shortcut triggered: ${action}`);

          switch (action) {
            case 'toggleOverlay':
              if (isElectronRef.current) {
                ipcRendererRef.current?.send('launch-stealth-pip');
              }
              break;
            case 'toggleListen':
              if (isListeningRef.current) {
                if (stopListenRef.current) stopListenRef.current();
              } else {
                if (startListenRef.current) startListenRef.current();
              }
              break;
            case 'getAnswer':
              if (!isGeneratingRef.current) {
                const text = (isListeningRef.current ? transcribedTextRef.current : manualTextInputRef.current).trim();
                if (text && getAnswerRef.current) {
                  getAnswerRef.current();
                }
              }
              break;
            case 'clearQuestion':
              setManualTextInput('');
              setTranscribedText('');
              setCommittedText('');
              setInterimText('');
              break;
            case 'focusInput':
              if (inputFieldRef.current) inputFieldRef.current.focus();
              break;
            case 'stopOrClear':
              if (isGeneratingRef.current) {
                handleStopResponse();
              } else {
                setManualTextInput('');
                setTranscribedText('');
                setCommittedText('');
                setInterimText('');
                setAiResponse('');
              }
              break;
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown, true);
  }, [shortcuts]);

  // Global Shift, ESC, and Ctrl+Backspace shortcuts
  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      
      // Alt key - Toggle focus on input field
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement === inputFieldRef.current;
        
        if (isInputFocused) {
          inputFieldRef.current?.blur();
          console.log('⌨️ Alt pressed - Unfocusing input field (for arrow navigation)');
        } else {
          inputFieldRef.current?.focus();
          console.log('⌨️ Alt pressed - Focusing input field');
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
    if (isStartedRef.current) {
      console.log('⏭️ handleStartListen skipped - already started');
      return;
    }
    // Update UI immediately — no delay for button state change
    setIsListening(true);
    isStartedRef.current = true;

    // Record start time for tracking
    transcriptionStartTimeRef.current = Date.now();

    overlayLog('handleStartListen called', {
      isElectron: isElectronRef.current,
      provider: currentVoiceProvider,
      listening: isListening
    });
    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    // Don't clear manualTextInput - keep existing typed text
    setAiResponse('');

    // Check transcription limits (async, non-blocking for UI)
    const userForListen = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
    const isAdminUser = userForListen.role === 'admin' || userForListen.role === 'super-admin' || userForListen.tokens === -1;
    if (!isAdminUser) {
      const listenCheck = await tokensClient.checkListen(userForListen._id || '');
      if (!listenCheck.canListen) {
        isStartedRef.current = false;
        setIsListening(false);
        if (listenCheck.reason === 'out_of_tokens') {
          setShowOutOfTokensModal(true);
        } else if (listenCheck.reason === 'transcription_limit') {
          setModalInfo({
            title: 'Transcription Limit Reached',
            message: 'You have used all 25 minutes of free transcription. Upgrade to Pro for unlimited transcription.',
            variant: 'warning',
            icon: '🎤'
          });
        }
        return;
      }
    }
    
    const startDeepgramRecorder = async (stream: MediaStream, language: string, keyterms: string) => {
      // Clean up any previous capture session before starting a new one
      if (deepgramWsRef.current) {
        try { deepgramWsRef.current.close(); } catch (e) {}
        deepgramWsRef.current = null;
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (e) {}
        mediaRecorderRef.current = null;
      }
      if (deepgramAudioRef.current) {
        try { deepgramAudioRef.current.getTracks().forEach((track) => track.stop()); } catch (e) {}
        deepgramAudioRef.current = null;
      }
      deepgramAudioRef.current = stream;
      overlayLog('Deepgram recorder start. Track count:', stream.getAudioTracks().length);
      const preferredMime =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : undefined;
      overlayLog('MediaRecorder mime selected:', preferredMime || 'browser-default');
      const mediaRecorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = mediaRecorder;

      // Start recorder immediately so audio chunks are buffered while WS connects
      overlayLog('Starting MediaRecorder immediately (parallel with WS connect)');
      mediaRecorder.start(100);

      const ws = new WebSocket(
        `${API_BASE_URL}/api/deepgram-ws?language=${encodeURIComponent(language || 'en-US')}&keyterms=${encodeURIComponent(keyterms || '')}`
      );
      deepgramWsRef.current = ws;

      let chunkCount = 0;
      let byteCount = 0;
      let deepgramReady = false;
      const pendingChunks: any[] = [];
      
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunkCount += 1;
          byteCount += ev.data.size;
          if (chunkCount <= 3 || chunkCount % 5 === 0) {
            overlayLog('Audio chunk', { chunkCount, size: ev.data.size, totalBytes: byteCount });
          }
          if (deepgramReady && ws.readyState === WebSocket.OPEN) {
            ws.send(ev.data);
          } else {
            pendingChunks.push(ev.data);
          }
        } else if (chunkCount <= 3) {
          overlayLog('Empty/unsent chunk', { size: ev.data.size, wsState: ws.readyState });
        }
      };
      
      ws.onopen = () => {
        overlayLog('Deepgram WS open (recorder already running)');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          overlayLog('OverlayApp received:', data.type, data.channel?.alternatives?.[0]?.transcript || '', 'is_final:', data.is_final);
          
          if (data.type === 'connected') {
            overlayLog(`Proxy connected to Deepgram, flushing ${pendingChunks.length} buffered chunks...`);
            deepgramReady = true;
            for (const chunk of pendingChunks) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
              }
            }
            pendingChunks.length = 0;
          }
          if (data.type === 'error') {
            overlayLog('Deepgram proxy error', data.message);
            console.error('Deepgram error:', data.message);
            return;
          }
          if (data.channel) {
            const transcript = data.channel?.alternatives?.[0]?.transcript;
            if (transcript) {
              if (data.is_final) {
                setCommittedText((prev) => (prev + ' ' + transcript).trim());
                setInterimText('');
                overlayLog('Final transcript received', transcript);
              } else {
                setInterimText(transcript);
              }
            }
          }
        } catch (e) {
          // Ignore malformed ws frames
        }
      };
      ws.onerror = (event) => {
        overlayLog('Deepgram WS error', String((event as any)?.message || 'unknown'));
      };

      ws.onclose = () => {
        overlayLog('Deepgram WS closed');
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (e) {}
      };

      try {
        const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          const ctx = audioContextRef.current || new AC();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.fftSize);
          audioLevelIntervalRef.current = window.setInterval(() => {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = (dataArray[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            overlayLog('System audio RMS', Number(rms.toFixed(4)));
          }, 2000);
        }
      } catch (meterErr) {
        overlayLog('Audio meter setup failed', String(meterErr));
      }
    };

    const getOverlayDeepgramConfig = async () => {
      try {
        const userStr = localStorage.getItem(LS_USER_KEY);
        if (!userStr) return null;
        const user = JSON.parse(userStr);
        // If user has a personal key, use it
        if (user.deepgramApiKey && user.deepgramApiKey.trim()) {
          return {
            apiKey: user.deepgramApiKey,
            provider: 'deepgram',
            language: user.deepgramLanguage || currentLanguage || 'multi',
            keyterms: user.deepgramKeyterms || ''
          };
        }
        // Otherwise try to resolve from system chain (super admin configured)
        const chainConfig = await resolveDeepgramConfig(user);
        if (chainConfig.apiKey) {
          console.log('[Overlay] Using system Deepgram chain config for user');
          return chainConfig;
        }
        // No Deepgram available at all
        return null;
      } catch (e) {
        console.error('[Overlay] Failed to get Deepgram config:', e);
        return null;
      }
    };

    // Check voiceProvider from localStorage to handle race conditions with settings-updated event
    const voiceProviderFromStorage = (() => {
      try {
        const userStr = localStorage.getItem(LS_USER_KEY);
        if (userStr) {
          const user = JSON.parse(userStr);
          return user.voiceProvider || 'default';
        }
      } catch (e) {}
      return 'default';
    })();

    // ALSO resolve system Deepgram chain: if super admin configured Deepgram, use it
    // even if the user has voiceProvider='default' (they have no personal key)
    let effectiveDeepgramProvider = (currentVoiceProvider === 'deepgram' || voiceProviderFromStorage === 'deepgram');
    if (!effectiveDeepgramProvider) {
      try {
        const userStr = localStorage.getItem(LS_USER_KEY);
        const user = userStr ? JSON.parse(userStr) : null;
        const sysDgConfig = await resolveDeepgramConfig(user);
        if (sysDgConfig && sysDgConfig.apiKey) {
          console.log('🎤 [Overlay] System Deepgram chain active, overriding voice provider to deepgram');
          effectiveDeepgramProvider = true;
          // Update state to reflect deepgram is active
          setCurrentVoiceProvider('deepgram');
        }
      } catch (e) {
        console.warn('🎤 [Overlay] Failed to check system Deepgram chain:', e);
      }
    }

    if (isElectronRef.current && effectiveDeepgramProvider) {
      const deepgramConfig = await getOverlayDeepgramConfig();
      if (!deepgramConfig) {
        console.error('❌ Deepgram selected but configuration is missing');
        setIsListening(false);
        isStartedRef.current = false;
        setAiResponse('Deepgram configuration is missing. Please check system settings.');
        return;
      } else {
        try {
          // Electron system audio capture path (no picker when main process configures display media handler)
          let stream: MediaStream | null = null;
          try {
            // Attempt 1: Electron desktopCapturer + chromeMediaSource constraints (no picker)
            let captured = false;
            if ((window as any).require) {
              const { desktopCapturer } = (window as any).require('electron');
              if (desktopCapturer?.getSources) {
                overlayLog('Attempt 1: desktopCapturer.getSources + getUserMedia(chromeMediaSource)');
                const sources = await desktopCapturer.getSources({
                  types: ['screen'],
                  thumbnailSize: { width: 0, height: 0 }
                });
                overlayLog('desktop sources count', sources?.length || 0);
                if (sources && sources.length > 0) {
                  const sourceId = sources[0].id;
                  const chromeStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                      mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                      },
                    } as any,
                    video: false as any,
                  } as any);
                  const tracks = chromeStream.getAudioTracks();
                  if (tracks && tracks.length > 0) {
                    stream = chromeStream;
                    captured = true;
                    overlayLog('Attempt 1 success', tracks.map((t) => t.label).join(' | '));
                  } else {
                    try { chromeStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
                    overlayLog('Attempt 1 returned no audio tracks');
                  }
                }
              }
            }

            // Attempt 2: getDisplayMedia routed by main setDisplayMediaRequestHandler
            if (!captured) {
              overlayLog('Attempt 2: getDisplayMedia({video:true,audio:true})');
              const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                  // Key setting: suppress local playback prevents feedback with headphones
                  suppressLocalAudioPlayback: true,
                } as MediaTrackConstraints,
              });
              displayCaptureStreamRef.current = displayStream;

              const audioTracks = displayStream.getAudioTracks();
              if (!audioTracks || audioTracks.length === 0) {
                throw new Error('No system-audio track returned by getDisplayMedia');
              }
              stream = new MediaStream(audioTracks);
              overlayLog('Attempt 2 success', audioTracks.map((t) => t.label).join(' | '));
            }

            // Also capture microphone and mix with system audio so both are transcribed.
            // Use optimized mic settings that work WITH headphones connected
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                // Keep echoCancellation ON when using headphones to prevent feedback
                // This is the key setting that allows headphones + system audio
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: false },
                channelCount: { ideal: 1 },
              },
            });
            micCaptureStreamRef.current = micStream;
            overlayLog('Mic capture success', micStream.getAudioTracks().map((t) => t.label).join(' | '));

            const AC: any = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC) {
              throw new Error('AudioContext unavailable for stream mixing');
            }
            const mixCtx = new AC();
            audioContextRef.current = mixCtx;
            const systemSource = mixCtx.createMediaStreamSource(stream);
            const micSource = mixCtx.createMediaStreamSource(micStream);
            const systemGain = mixCtx.createGain();
            const micGain = mixCtx.createGain();
            const destination = mixCtx.createMediaStreamDestination();
            systemGain.gain.value = 0.8;
            micGain.gain.value = 1.2;
            systemSource.connect(systemGain).connect(destination);
            micSource.connect(micGain).connect(destination);
            stream = destination.stream;
            overlayLog('Mixed stream created (system + mic)');
          } catch (captureErr) {
            overlayLog('System audio capture unavailable in Electron', String(captureErr));
            console.error('❌ System audio capture unavailable in Electron:', captureErr);
            setIsListening(false);
            isStartedRef.current = false;
            setAiResponse(
              'System audio capture failed in Electron (both desktopCapturer and getDisplayMedia paths). No microphone fallback was used.'
            );
            return;
          }

          if (!stream) {
            throw new Error('No stream available');
          }

          await startDeepgramRecorder(stream, deepgramConfig.language, deepgramConfig.keyterms);
          setIsListening(true);
          isStartedRef.current = true;
          overlayLog('Started Deepgram in Electron renderer');
          return;
        } catch (e) {
          overlayLog('Failed to start Deepgram in Electron', String(e));
          console.error('❌ Failed to start Deepgram in Electron:', e);
          setIsListening(false);
          isStartedRef.current = false;
          setAiResponse('Failed to start Electron system-audio streaming to Deepgram. No mic fallback was used.');
          return;
        }
      }
    }

    if (isElectronRef.current) {
      // Electron fallback: Python/bridge provider path
      ipcRendererRef.current?.send('python-start-listen');
      setIsListening(true);
      isStartedRef.current = true; // Set ref for shortcut detection
      console.log('🐍 Started Python speech recognition (fallback)');
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
    wantToListenRef.current = false;

    // Track transcription time
    if (transcriptionStartTimeRef.current > 0) {
      const elapsed = Math.floor((Date.now() - transcriptionStartTimeRef.current) / 1000);
      transcriptionStartTimeRef.current = 0;
      if (elapsed > 0) {
        const userForTime = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
        const isAdminUser = userForTime.role === 'admin' || userForTime.role === 'super-admin' || userForTime.tokens === -1;
        if (!isAdminUser && userForTime._id) {
          tokensClient.addTranscriptionTime(userForTime._id, elapsed).then(result => {
            if (result.success) {
              setTranscriptionSecondsRemaining(result.transcriptionRemaining);
              // Update user in localStorage
              const current = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
              current.transcriptionSeconds = result.transcriptionSeconds;
              localStorage.setItem(LS_USER_KEY, JSON.stringify(current));
            }
          }).catch(err => console.error('Failed to add transcription time:', err));
        }
      }
    }

    if (deepgramWsRef.current || mediaRecorderRef.current || deepgramAudioRef.current) {
      const currentText = transcribedText.trim();
      isStartedRef.current = false;
      setIsListening(false);
      audioChunksRef.current = [];

      // Stop MediaRecorder first to prevent any more audio chunks
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        try {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch (e) {}
      }
      mediaRecorderRef.current = null;

      // Send CloseStream signal to backend, then close WebSocket
      const ws = deepgramWsRef.current;
      if (ws) {
        try {
          if (ws.readyState !== WebSocket.CLOSED) {
            ws.send(JSON.stringify({ type: 'CloseStream' }));
            ws.close();
          }
        } catch (e) {}
        try {
          ws.onmessage = null;
          ws.onopen = null;
          ws.onclose = null;
          ws.onerror = null;
        } catch (e) {}
      }
      deepgramWsRef.current = null;

      try {
        deepgramAudioRef.current?.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      deepgramAudioRef.current = null;
      try {
        if (audioLevelIntervalRef.current !== null) {
          window.clearInterval(audioLevelIntervalRef.current);
          audioLevelIntervalRef.current = null;
        }
      } catch (e) {}
      try {
        audioContextRef.current?.close();
      } catch (e) {}
      audioContextRef.current = null;
      try {
        displayCaptureStreamRef.current?.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      displayCaptureStreamRef.current = null;
      try {
        micCaptureStreamRef.current?.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      micCaptureStreamRef.current = null;

      if (currentText.length > 0) {
        setManualTextInput((prev) => (prev + ' ' + currentText).trim());
      }
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      console.log('🎤 Stopped Deepgram speech recognition (overlay)');
      return;
    }

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
      wantToListenRef.current = false;
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
        try {
          if (typeof recognitionRef.current.abort === 'function') {
            recognitionRef.current.abort();
          } else {
            recognitionRef.current.stop();
          }
        } catch (e) {}
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

    if (!questionToAnswer) {
      return;
    }

    // ==================== TOKEN CHECK & CONSUMPTION (OVERLAY) ====================
    // Check if user has enough tokens before generating answer
    const savedUser = localStorage.getItem('isa_current_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        
        // First check locally if user is admin (skip API call for admins)
        const isLocalAdmin = user.role === 'admin' || user.role === 'super-admin' || user.tokens === -1;
        
        if (!isLocalAdmin) {
          const tokenCheck = await tokensClient.checkTokens(user._id);
          
          console.log('🔍 Token check result (overlay):', tokenCheck);
          
          if (!tokenCheck.canSendMessage && !tokenCheck.isAdmin && !tokenCheck.hasUnlimitedTokens) {
            setShowOutOfTokensModal(true);
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
      const basePromptSummaryToUse = overlayUserSettings?.basePromptSummary || lsBasePromptSummary;
      let contextPrompt = basePromptSummaryToUse && basePromptSummaryToUse.trim() 
        ? basePromptSummaryToUse 
        : savedBasePrompt;
      
      // Inject response language into prompt
      const responseLanguage = overlayUserSettings?.responseLanguage || '';
      
      // Add keyword instructions to prompt (only for phonetic matching, not as context)
      const keywords = overlayUserSettings?.deepgramKeyterms || '';
      const langDisplay = responseLanguage ? `${responseLanguage} Language` : 'your preferred language';
      const keywordNote = keywords.trim()
        ? `\n\n[KEYWORD MATCHING RULES:
- The user may mispronounce these keywords: ${keywords}
- If a word SOUNDS like one of these keywords, REPLACE ONLY that word with the correct keyword
- Example: "jantic" sounds like "agentic" → replace only "jantic" with "agentic"
- Example: "uberates" sounds like "Kubernetes" → replace only "uberates" with "Kubernetes"
- DO NOT replace or question the other words in the sentence

CONFIDENCE RULES:
- After replacing, answer CONFIDENTLY from the FIRST sentence
- NEVER say: "I believe", "I assume", "You might be referring to", "However", "But I think", "If you meant"
- If you replaced a word, act as if the user said the correct word clearly
- Give direct answer immediately - no intro phrases like "Based on my knowledge"

Respond in ${langDisplay}.]`
          : (responseLanguage 
            ? `\n\n[CONFIDENCE RULES:
- Answer CONFIDENTLY from the FIRST sentence
- NEVER say: "I believe", "I assume", "You might be referring to", "However", "But I think", "If you meant"
- Give direct answer immediately - no intro phrases like "Based on my knowledge"

QUESTION_CLASSIFICATION:
- If the question is RELATED to previous topic (follow-up, clarification, deeper dive): Answer IN CONTEXT of previous discussion
- If the question is COMPLETELY NEW (different topic, no relation): Answer independently without referencing previous topic

Respond in ${langDisplay}.]`
            : '');
      
      // Replace {LANGUAGE} placeholder in base prompt if exists
      contextPrompt = contextPrompt.replace(/\{LANGUAGE\}/g, responseLanguage);
      
      // Ensure language instruction is always present (if no keywordNote added)
      if (!contextPrompt.includes('Respond in') && !keywordNote) {
        contextPrompt = `Respond in ${responseLanguage || 'English'} Language.\n\n` + contextPrompt;
      }
      
      // Use summaries for fast responses (fallback to full text, lightly truncated)
      const truncate = (text?: string | null, max = 4000) => (text ? text.slice(0, max) : '');
      
      const cvSummaryToUse = overlayUserSettings?.cvSummary || lsCvSummary;
      if (cvSummaryToUse) {
        contextPrompt += `\n\nCandidate Resume Summary:\n${cvSummaryToUse}`;
      } else if (savedResume) {
        contextPrompt += `\n\nCandidate Resume (truncated):\n${truncate(savedResume)}`;
      }
      
      const jdSummaryToUse = overlayUserSettings?.jobDescriptionSummary || lsJdSummary;
      if (jdSummaryToUse) {
        contextPrompt += `\n\nJob Description Summary:\n${jdSummaryToUse}`;
      } else if (savedJD) {
        contextPrompt += `\n\nJob Description (truncated):\n${truncate(savedJD)}`;
      }
      
      const companySummaryToUse = overlayUserSettings?.companyInfoSummary || lsCompanySummary;
      if (companySummaryToUse) {
        contextPrompt += `\n\nCompany Information Summary:\n${companySummaryToUse}`;
      } else if (savedCompanyInfo) {
        contextPrompt += `\n\nCompany Information (truncated):\n${truncate(savedCompanyInfo)}`;
      }

      const fullPrompt = `${keywordNote}${contextPrompt}\n\nInterview Question: "${questionToAnswer}"\n\nProvide a professional answer for this interview question.`;

      let streamedText = '';
      let formatStripped = false;

      // Prepare messages in universal OpenAI format (backend converts for Gemini if needed)
      let apiMessages: any[] = [];
      
      // Match Electron: use contextMessages setting to bound history
      const contextPairs = overlayUserSettings?.contextMessages || 5;
      const limitMessages = contextPairs * 2; // No hard cap - use full context window
      const trimmedHistory = chatHistory.length > limitMessages
        ? chatHistory.slice(-limitMessages)
        : chatHistory;
      
      apiMessages = trimmedHistory.map((msg: any) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.parts?.[0]?.text || msg.content || ''
      }));

      // Inject context instruction into the question so the AI sees it right with the prompt
      let promptWithContext = fullPrompt;
      if (trimmedHistory.length > 0) {
        promptWithContext = `[CONTEXT NOTE]\nThe conversation history above is provided for reference.\n- If the user's new question relates to the previous discussion (follow-up, clarification, deeper dive on same topic), answer IN CONTEXT of that history.\n- If it's a completely new/unrelated topic, answer independently WITHOUT referencing the history.\n\n${fullPrompt}`;
      }

      apiMessages.push({ role: 'user', content: promptWithContext });

      // Use streaming endpoint
      console.log('📡 Overlay: Starting streaming response...');
      const userForStream = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
      const response = await fetch(`${API_BASE_URL}/api/generate-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          ...(userForStream?.role === 'admin' && userForStream._id ? { userId: userForStream._id } : {})
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
              if (parsed.chainTriggered) {
                if (chainAlertTimerRef.current) clearTimeout(chainAlertTimerRef.current);
                setChainAlert(true);
                chainAlertTimerRef.current = setTimeout(() => setChainAlert(false), 2000);
              }
              if (parsed.text) {
                streamedText += parsed.text;
                if (!formatStripped) {
                  const qMatch = streamedText.match(/^QUESTION:\s*.+\n?/i);
                  if (qMatch) {
                    formatStripped = true;
                    streamedText = streamedText.replace(/^QUESTION:\s*.+\n?/i, '').replace(/^ANSWER:\s*/i, '').trim();
                  }
                }
                setAiResponse(streamedText);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      if (formatStripped) {
        streamedText = streamedText.replace(/^ANSWER:\s*/i, '').trim();
      }
      console.log('✅ Overlay: Streaming complete, total chars:', streamedText.length);

      // Save to history (Gemini format for storage)
      // Only store the actual user question, NOT the full prompt
      const newUserMessage = { role: 'user', parts: [{ text: questionToAnswer }] };
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

        const responseLanguage = overlayUserSettings?.responseLanguage || 'English';
        let contextPrompt = `You are a precise screen analyzer for a live interview.

TASK:
1. Look at the screenshot below and extract ALL questions visible on screen
2. List them in order from top to bottom as they appear
3. The following questions have ALREADY been answered in previous rounds — SKIP them:
${analyzedQuestions.length > 0 ? analyzedQuestions.map((q, i) => `   ${i + 1}. "${q}"`).join('\n') : '   (none yet)'}
4. Answer ONLY questions that are NOT in the skip list above
5. If only one question needs answering, just answer it
6. If multiple questions need answering, answer ALL of them

OUTPUT FORMAT (use EXACTLY this):
ALL_QUESTIONS: [comma-separated list of every question visible, top to bottom]

Then for each unanswered question, repeat this block:
QUESTION: [the exact question text]
ANSWER: [your detailed answer]

Prior Q&A context (for follow-up reference only):
${
  chatHistory && chatHistory.length > 0
    ? chatHistory.slice(-4).map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const text = m.content || m.parts?.[0]?.text || '';
        return `${role}: ${text}`;
      }).join('\n')
    : '(none)'
}

${savedResume ? `\nCandidate Resume Context:\n${savedResume}` : ''}
${savedJD ? `\nJob Description Context:\n${savedJD}` : ''}
${savedCompanyInfo ? `\nCompany Context:\n${savedCompanyInfo}` : ''}
${userMessage ? `\nUser's Specific Question (use as clue to find the right question in the screenshot): "${userMessage}"` : ''}

IMPORTANT RULES:
- The SCREENSHOT is the PRIMARY source — extract all questions from it
- Prior Q&A context above is ONLY for follow-up understanding, NOT for re-answering old questions
- ALL_QUESTIONS must include EVERY question visible, not just the ones you're answering
- CRITICAL: You MUST NOT output QUESTION:/ANSWER: for any question in the skip list. Only output QUESTION:/ANSWER: for questions NOT in the skip list
- When checking if a question is already answered, compare EXACT wording — if even slightly different or reworded, treat it as NEW and answer it
- If ALL questions have already been answered word-for-word, return "ALL_QUESTIONS: [all visible]" and "ANSWER: All questions on screen have been answered."
- Respond in ${responseLanguage}`;

        // Send to backend which uses system chain to determine provider
        console.log('📸 Sending screen analysis to backend...');
        const response = await fetch(`${API_BASE_URL}/api/analyze-screen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            messages: chatHistory,
            prompt: contextPrompt
          })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.text || 'No content found to analyze.';

        // Show chain triggered alert if fallback occurred
        if (data.chainTriggered) {
          if (chainAlertTimerRef.current) clearTimeout(chainAlertTimerRef.current);
          setChainAlert(true);
          chainAlertTimerRef.current = setTimeout(() => setChainAlert(false), 2000);
        }

        // Parse all Q&A pairs from response
        const qaPairs: Array<{question: string, answer: string}> = [];
        const blocks = text.split(/\n(?=QUESTION:\s*)/i);
        let allQuestions: string[] = [];

        for (const block of blocks) {
          // Extract ALL_QUESTIONS list (comes before any Q&A block)
          const allQMatch = block.match(/^ALL_QUESTIONS:\s*(.+)/im);
          if (allQMatch) {
            allQuestions = allQMatch[1].split(',').map((q: string) => q.trim()).filter(Boolean);
          }

          // Extract Q&A pair
          const qMatch = block.match(/^QUESTION:\s*(.+)/im);
          const aMatch = block.match(/^ANSWER:\s*([\s\S]*)/im);
          if (qMatch && aMatch) {
            qaPairs.push({
              question: qMatch[1].trim(),
              answer: aMatch[1].trim()
            });
          }
        }

        // CLIENT-SIDE FILTER: Remove Q&A pairs whose questions are already answered
        // This is the authoritative filter — even if the AI ignores skip instructions
        const unansweredPairs = qaPairs.filter(pair =>
          !analyzedQuestions.some(aq => aq.toLowerCase() === pair.question.toLowerCase())
        );

        // Build display from unanswered (new/changed) Q&A pairs only
        let extractedQuestion = '';
        let displayText = text;

        if (unansweredPairs.length > 0) {
          if (unansweredPairs.length > 1) {
            extractedQuestion = unansweredPairs[0].question;
            const questionsHeader = unansweredPairs.map(p => p.question).join(', ');
            displayText = `**Questions:** ${questionsHeader}\n\n---\n\n` +
              unansweredPairs.map((pair, i) =>
                `**Q${i + 1}:** ${pair.question}\n\n**A${i + 1}:** ${pair.answer}`
              ).join('\n\n---\n\n');
          } else {
            extractedQuestion = unansweredPairs[0].question;
            displayText = unansweredPairs[0].answer;
          }
        } else {
          // No new Q&A pairs — try lone ANSWER: (e.g. "all answered" case)
          const loneAnswer = text.match(/^ANSWER:\s*([\s\S]*)/im);
          if (loneAnswer) {
            displayText = loneAnswer[1].trim();
          }
          extractedQuestion = allQuestions.length > 0 ? allQuestions.join(', ') : '';
        }

        // Track all newly answered questions (only the ones we're displaying)
        const newAnswered = unansweredPairs.map(p => p.question);
        if (newAnswered.length > 0 || allQuestions.length > 0) {
          setAnalyzedQuestions(prev => {
            const combined = new Set<string>();
            prev.forEach(q => combined.add(q));
            // Add newly answered questions
            newAnswered.forEach(q => combined.add(q));
            // Add ALL questions from screen (for exact-wording comparison next round)
            allQuestions.forEach(q => combined.add(q));
            return Array.from(combined);
          });
        }

        setAiResponse(displayText);
        if (extractedQuestion) {
          setManualTextInput(extractedQuestion);
        } else {
          setManualTextInput('');
        }

        // Save chat history with extracted question as the user message
        const historyLabel = extractedQuestion || (userMessage ? `[Screen Analysis: "${userMessage}"]` : '[Analyzed Screen]');
        const updatedHistoryAfterAnalysis = [
          ...chatHistory,
          { role: 'user', parts: [{ text: historyLabel }] },
          { role: 'model', parts: [{ text: displayText }] }
        ];
        setChatHistory(updatedHistoryAfterAnalysis);
        
        // No need to navigate again - we already pre-navigated! ✅
        
        await saveChatHistory(updatedHistoryAfterAnalysis);

        // Clear other inputs but keep the extracted question visible
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');

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
    const userStr = localStorage.getItem(LS_USER_KEY);
    if (userStr) {
      try {
        const currentUser = JSON.parse(userStr);
        const plan = (currentUser.plan || '').toLowerCase();
        const role = (currentUser.role || '').toLowerCase();
        const hasAccess = ['pro', 'premium', 'lifetime'].includes(plan) || ['admin', 'super-admin'].includes(role);
        if (!hasAccess) {
          setShowUpgradeModal(true);
          return;
        }
      } catch (e) {
        console.error('❌ [BrowseAI] Failed to parse user:', e);
      }
    } else {
      setShowUpgradeModal(true);
      return;
    }
    
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      
      if (browserMode) {
        ipcRenderer.send('close-ai-browser');
        setBrowserMode(false);
        setBrowseAIEnabled(false);
      } else {
        ipcRenderer.send('open-ai-browser', 'google');
        setBrowserMode(true);
        setBrowseAIEnabled(true);
      }
    }
  };
  
  // Update ref for shortcut access
  toggleBrowseAIRef.current = handleToggleBrowseAI;
  
  const handleConfirmOpenBrowser = () => {
    const userStr = localStorage.getItem(LS_USER_KEY);
    if (userStr) {
      try {
        const currentUser = JSON.parse(userStr);
        const plan = (currentUser.plan || '').toLowerCase();
        const role = (currentUser.role || '').toLowerCase();
        const hasAccess = ['pro', 'premium', 'lifetime'].includes(plan) || ['admin', 'super-admin'].includes(role);
        if (!hasAccess) {
          setShowProviderModal(false);
          setShowUpgradeModal(true);
          return;
        }
      } catch (e) {
        console.error('❌ [BrowseAI/Confirm] Failed to parse user:', e);
      }
    }
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
          setModalInfo({ title: 'Screenshot Failed', message: `Failed to attach screenshot: ${result.error}`, variant: 'error', icon: '📸' });
        }
      } catch (error: any) {
        console.error('❌ Screenshot error:', error);
        setModalInfo({ title: 'Screenshot Error', message: `Screenshot error: ${error.message}`, variant: 'error', icon: '📸' });
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
        setModalInfo({ title: 'No Provider', message: 'Please open a provider first (GPT, Gemini, Claude, or AI Studio)', variant: 'warning', icon: '🌐' });
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
        setModalInfo({ title: 'Unsupported Provider', message: 'Please navigate to a supported provider (GPT, Gemini, Claude, or AI Studio)', variant: 'warning', icon: '🌐' });
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
        setModalInfo({ title: 'No Context', message: 'No context available to transfer. Please configure your settings first.', variant: 'warning', icon: '📋' });
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
  
  // Update refs for shortcut access
  analyzeScreenRef.current = handleAnalyzeScreen;
  getAnswerRef.current = handleGetAnswer;
  startListenRef.current = handleStartListen as unknown as () => void;
  stopListenRef.current = handleStopListen;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-gray-900/30 via-blue-900/25 to-gray-900/30 backdrop-blur-md p-4 flex flex-col relative rounded-2xl overflow-hidden border border-blue-500/30 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]">
      {/* Chain Triggered Alert */}
      {chainAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 bg-gradient-to-r from-amber-500/90 to-orange-500/90 backdrop-blur-xl rounded-xl shadow-2xl border border-amber-300/50 text-white text-sm font-semibold tracking-wide flex items-center gap-2.5 animate-pulse">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Model chain triggered
          <button onClick={() => setChainAlert(false)} className="ml-1 p-0.5 hover:bg-white/20 rounded transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
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
            className="flex items-center justify-center w-11 h-11 rounded-lg text-xs font-bold transition-all bg-blue-500/10 hover:bg-blue-500/30 text-blue-300 hover:text-white group border border-blue-400/20 hover:border-blue-400/50 backdrop-blur-sm"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          </button>
          
          {/* Close Button */}
          <button 
            onClick={handleCloseOverlay}
            className="flex items-center justify-center w-11 h-11 rounded-lg text-xs font-bold transition-all bg-red-500/10 hover:bg-red-500/40 text-red-300 hover:text-white group border border-red-400/20 hover:border-red-400/50 backdrop-blur-sm"
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
      <div className="flex items-center gap-2 mb-2 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 backdrop-blur-xl px-3 py-2 rounded-xl border border-blue-400/30 shadow-[0_4px_16px_0_rgba(59,130,246,0.3)]">
        {/* Status Indicator with Glow */}
        <div className="relative flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full shadow-lg ${isListening ? 'bg-red-500 animate-pulse shadow-red-500/70' : 'bg-emerald-400 shadow-emerald-500/70'}`}></div>
          <span className="text-white text-sm font-bold tracking-wide drop-shadow-lg">
            Meeting Assistant
          </span>
        </div>
        
        {/* BrowseAI Button with Integrated Toggle */}
        {(() => {
          const _uStr = localStorage.getItem(LS_USER_KEY);
          console.log('🔍 [BrowseAI/Button] localStorage userStr:', _uStr);
          let _isFree = true;
          let _debugPlan;
          let _debugRole;
          if (_uStr) {
            try {
              const _u = JSON.parse(_uStr);
              _debugPlan = _u.plan || 'Free';
              _debugRole = _u.role || 'none';
              const _planLower = _debugPlan.toLowerCase();
              const _roleLower = _debugRole.toLowerCase();
              _isFree = _planLower === 'free' && !['admin', 'super-admin'].includes(_roleLower);
              console.log('🔍 [BrowseAI/Button] plan=%s role=%s → _isFree=%s', _debugPlan, _debugRole, _isFree);
            } catch (_e) {
              console.error('❌ [BrowseAI/Button] JSON parse failed:', _e);
            }
          } else {
            console.log('🔍 [BrowseAI/Button] No user in localStorage, defaulting _isFree=true');
          }
          return (
            <button
              onClick={_isFree ? undefined : handleToggleBrowseAI}
              disabled={_isFree}
              title={_isFree ? 'BrowseAI is a paid feature. Upgrade to Pro to unlock.' : ''}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all backdrop-blur-sm ${
  _isFree
    ? 'bg-gray-800/30 text-white border border-gray-700/30 opacity-50 cursor-not-allowed'
    : browserMode && browseAIEnabled
      ? 'bg-green-500/40 hover:bg-green-500/60 text-white animate-pulse shadow-lg shadow-green-500/50 border border-green-400/50'
      : 'bg-gray-700/20 hover:bg-gray-600/30 text-white border border-gray-500/30'
}`}
            >
              {_isFree ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              )}
              <span>BrowseAI</span>
              <div className={`w-2 h-2 rounded-full ${_isFree ? 'bg-gray-600' : browserMode && browseAIEnabled ? 'bg-white' : 'bg-gray-500'}`}></div>
            </button>
          );
        })()}
        
        {/* Action Buttons */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {/* Language Button (always visible) */}
          <button
            onClick={async () => {
              await syncUserSettings('modal-language');
              setLanguageModalOpen(true);
              hideBrowserForModal();
            }}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all shadow-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            Language
          </button>
          
          {/* Keywords Button */}
          <button
            onClick={async () => {
              await syncUserSettings('modal-keywords');
              setKeywordsModalOpen(true);
              hideBrowserForModal();
            }}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all shadow-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Keywords
          </button>
          


          <button
            onClick={handleAnalyzeScreen}
            disabled={isAnalyzing || isGenerating}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all shadow-md ${
              isAnalyzing 
                ? 'bg-purple-600/70 text-white animate-pulse' 
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/50'
            }`}
            data-action="analyze-screen"
          >
            {isAnalyzing ? (
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
          
          <button
            onClick={handleStopResponse}
            disabled={!isGenerating && !isAnalyzing}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${
              isGenerating || isAnalyzing 
                ? 'bg-amber-500/20 text-white hover:bg-amber-500/30 border-amber-500/50 shadow-amber-500/30' 
                : 'bg-gray-800/50 text-white border-gray-700/30 cursor-not-allowed'
            }`}
          >
            Stop
          </button>
          
          <button 
            onClick={handleClear} 
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all bg-gray-700/50 hover:bg-red-600/30 text-white hover:text-red-300 border border-gray-600/30 hover:border-red-500/50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Transcription Box with Button */}
      <div className="bg-gray-800 rounded-lg p-2 mb-3">
        <div className="flex flex-col sm:flex-row gap-1.5">
          <div className="w-full relative">
            <textarea
              ref={inputFieldRef}
              value={isListening ? transcribedText : manualTextInput}
              onChange={(e) => {
                if (isListening) {
                  setTranscribedText(e.target.value);
                } else {
                  setManualTextInput(e.target.value);
                }
              }}
              placeholder={isListening ? 'Listening... (you can edit)' : 'Type a question (optional)'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isListening) {
                  handleStopListen();
                  setTimeout(() => {
                    if (!isGenerating && (manualTextInput.trim() || transcribedText.trim())) {
                      e.currentTarget?.blur();
                      handleGetAnswer();
                    }
                  }, 300);
                } else if (!isGenerating && manualTextInput.trim()) {
                  e.currentTarget.blur();
                  handleGetAnswer();
                }
              }
            }}
            rows={1}
            className={`w-full bg-gray-800/20 border border-blue-400/30 rounded-2xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/60 resize-none overflow-y-auto min-h-[40px] max-h-[40vh] backdrop-blur-lg shadow-inner [&::-webkit-scrollbar]:hidden [scrollbar-width:none] ${
              isListening ? 'opacity-90' : ''
            }`}
            style={{ lineHeight: '1.5' }}
          />
          </div>

          <div className="flex flex-col sm:flex-col gap-1.5">
            <button
              onClick={isListening ? handleStopListen : handleStartListen}
              disabled={isGenerating}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all backdrop-blur-sm border shadow-lg ${
                isListening
                  ? 'bg-red-500/40 hover:bg-red-500/60 text-white border-red-400/50 shadow-red-500/50'
                  : 'bg-green-500/40 hover:bg-green-500/60 text-white border-green-400/50 shadow-green-500/50'
              } ${isGenerating ? 'opacity-50' : ''}`}
              data-action="start-listen"
            >
              {isListening ? 'Stop' : 'Start'}
            </button>

            <button
              onClick={() => {
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                handleGetAnswer();
              }}
              disabled={isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all backdrop-blur-sm border shadow-lg bg-blue-500/40 hover:bg-blue-500/60 text-white border-blue-400/50 shadow-blue-500/50 ${
                isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())
                  ? 'opacity-50'
                  : ''
              }`}
              data-action="get-answer"
            >
              {isGenerating ? 'Generating...' : 'Get Answer'}
            </button>

            {/* Transcription time remaining indicator */}
            {(() => {
              try {
                const _u = JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}');
                const _isAdmin = _u.role === 'admin' || _u.role === 'super-admin' || _u.tokens === -1;
                if (_isAdmin) return null;
              } catch {}
              const mins = Math.floor(transcriptionSecondsRemaining / 60);
              const secs = transcriptionSecondsRemaining % 60;
              const totalMins = 25;
              const usedMins = totalMins - mins;
              const pct = (usedMins / totalMins) * 100;
              return (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 whitespace-nowrap">
                  <span>🎤</span>
                  <div className="w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: `${Math.max(0, 100 - pct)}%` }} />
                  </div>
                  <span className="font-mono text-slate-400">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} / 25:00</span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Browser Navigation Toolbar (only when browser is active) */}
      {browserMode && (
        <div className="bg-blue-500/10 backdrop-blur-lg rounded-lg px-3 py-1.5 my-1 flex flex-wrap items-center justify-center gap-1.5 border border-blue-400/20">
          {/* Back/Forward/Reload Buttons */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('browser-navigate', 'back');
              }
            }}
            className="px-3 py-1.5 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
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
            className="px-3 py-1.5 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
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
            className="px-3 py-1.5 bg-gray-600/20 hover:bg-gray-600/40 text-white rounded text-xs font-bold transition-all backdrop-blur-sm border border-gray-400/20"
          >
            ⟳
          </button>
          
          {/* Divider */}
          <div className="h-4 w-px bg-gray-600 mx-1"></div>
          
          {/* Provider Quick Links - Order: Google, GPT, Gemini, Claude, AI Studio */}
          <button
            onClick={() => handleNavigateToProvider('https://www.google.com', 'Google')}
            className="px-3 py-1.5 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded text-[11px] font-bold transition-all"
          >
            Google
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://chatgpt.com', 'ChatGPT')}
            className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-[11px] font-bold transition-all"
          >
            GPT
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://gemini.google.com', 'Gemini')}
            className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded text-[11px] font-bold transition-all"
          >
            Gemini
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://claude.ai', 'Claude')}
            className="px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 rounded text-[11px] font-bold transition-all"
          >
            Claude
          </button>
          <button
            onClick={() => handleNavigateToProvider('https://aistudio.google.com/app/prompts/new_chat', 'AI Studio')}
            className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded text-[11px] font-bold transition-all"
          >
            AI Studio
          </button>
          
          {/* Divider */}
          <div className="h-4 w-px bg-gray-600 mx-1"></div>
          
          {/* Context Transfer Button */}
          <button
            onClick={handleForceContextTransfer}
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-[11px] font-bold transition-all flex items-center gap-1"
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

      {/* Language Selection Modal */}
      {languageModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 sm:p-6 w-full max-w-md shadow-2xl space-y-4">
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
                <SearchableLanguageSelect
                  value={currentLanguage}
                  selectOnly
                  options={DEEPGRAM_LANGUAGES}
                  onChange={async (newLang) => {
                    setCurrentLanguage(newLang);
                    
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.log('🌍 [Overlay] Language change:', newLang);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    
                    // Save to backend
                    try {
                      const userStr = localStorage.getItem(LS_USER_KEY);
                      if (userStr) {
                        const user = JSON.parse(userStr);
                        
                        const response = await apiClient('/auth/deepgram-language', {
                          method: 'PUT',
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
                              language: newLang,
                              keyterms: keyterms
                            });
                            ipcRenderer.send('notify-overlay-settings-changed', { settings: user.settings || {}, deepgramLanguage: newLang, deepgramKeyterms: keyterms });
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
                  placeholder="Search language..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Response Language
                </label>
                <SearchableLanguageSelect
                  value={overlayUserSettings?.responseLanguage || ''}
                  onChange={(newLang) => {
                    setOverlayUserSettings((prev: any) => ({ ...prev, responseLanguage: newLang.toUpperCase() }));
                  }}
                  onBlur={async (newLang) => {
                    const lang = newLang.toUpperCase();
                    setOverlayUserSettings((prev: any) => ({ ...prev, responseLanguage: lang }));
                    
                    console.log('🌐 [Overlay] Response Language change:', lang);
                    
                    try {
                      const userStr = localStorage.getItem(LS_USER_KEY);
                      if (userStr) {
                        const user = JSON.parse(userStr);
                        
                        const response = await apiClient('/auth/response-language', {
                          method: 'PUT',
                          body: JSON.stringify({ 
                            userId: user._id,
                            responseLanguage: lang
                          })
                        });
                        
                        if (response.ok) {
                          console.log('✅ [Overlay] Response language saved to database');
                          
                          // Update localStorage
                          user.settings = { ...user.settings, responseLanguage: lang };
                          localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
                          localStorage.setItem('isa_response_language', lang);
                          
                          // Notify main app to refresh settings
                          if (typeof window !== 'undefined' && (window as any).require) {
                            const { ipcRenderer } = (window as any).require('electron');
                            ipcRenderer.send('notify-overlay-settings-changed', { settings: { ...user.settings, responseLanguage: lang }, deepgramLanguage: currentLanguage, deepgramKeyterms: currentKeyterms });
                          }
                        } else {
                          console.error('❌ [Overlay] Failed to save response language:', await response.text());
                        }
                      }
                    } catch (err) {
                      console.error('❌ [Overlay] Response language save error:', err);
                    }
                  }}
                  placeholder="Search language..."
                />
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

      {/* Keywords Modal */}
      {keywordsModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 sm:p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-bold">Important Keywords</h3>
              <button
                onClick={() => {
                  setKeywordsModalOpen(false);
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
                  Keywords (Optional)
                </label>
                <input
                  type="text"
                  value={currentKeyterms}
                  onChange={(e) => setCurrentKeyterms(e.target.value)}
                  placeholder="django, fastapi, restful api, kubernetes, react"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 hover:border-emerald-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Comma-separated technical terms, names, or jargon for better speech recognition.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const userStr = localStorage.getItem(LS_USER_KEY);
                    if (userStr) {
                      const user = JSON.parse(userStr);
                      const response = await apiClient('/auth/deepgram-keyterms', {
                        method: 'PUT',
                        body: JSON.stringify({ userId: user._id, deepgramKeyterms: currentKeyterms })
                      });
                      if (response.ok) {
                        user.deepgramKeyterms = currentKeyterms;
                        localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
                        setOverlayUserSettings((prev: any) => ({ ...prev, deepgramKeyterms: currentKeyterms }));
                        if (typeof window !== 'undefined' && (window as any).require) {
                          const { ipcRenderer } = (window as any).require('electron');
                          ipcRenderer.send('init-voice-provider', {
                            voiceProvider: 'deepgram',
                            language: currentLanguage,
                            keyterms: currentKeyterms
                          });
                          ipcRenderer.send('notify-overlay-settings-changed', { settings: user.settings || {}, deepgramLanguage: currentLanguage, deepgramKeyterms: currentKeyterms });
                        }
                        console.log('✅ [Overlay] Keywords saved to database');
                      }
                    }
                  } catch (err) {
                    console.error('❌ [Overlay] Keywords save error:', err);
                  }
                  setKeywordsModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
              >
                Save Keywords
              </button>
              <button
                onClick={() => {
                  setKeywordsModalOpen(false);
                  showBrowserAfterModal();
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Confirmation Modal (Stealthy) */}
      {showSettingsConfirm && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
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
            className="bg-slate-900 border border-blue-500/60 rounded-xl p-6 w-full max-w-[90vw] sm:max-w-[320px] shadow-2xl shadow-blue-500/20"
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
            className="bg-slate-900 border border-red-500/60 rounded-lg px-4 py-3 w-full max-w-[90vw] sm:max-w-[280px] shadow-lg shadow-red-500/20"
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

      {/* Out of Credits Modal - Overlay */}
      <StealthModal
        isOpen={showOutOfTokensModal}
        onClose={() => setShowOutOfTokensModal(false)}
        title="Out of Credits"
        icon="🪙"
        variant="warning"
        primaryAction={{
          label: 'Upgrade Plan',
          onClick: () => {
            setShowOutOfTokensModal(false);
            window.open('https://stealth-ai-sand.vercel.app/#/pricing', '_blank');
          }
        }}
        secondaryAction={{
          label: 'Close',
          onClick: () => setShowOutOfTokensModal(false)
        }}
      >
        <div className="space-y-3">
          <p className="text-slate-300 text-sm">
            You've used all <strong className="text-white">10 free credits</strong>.
          </p>
          <p className="text-slate-300 text-sm">
            <strong className="text-amber-400">Upgrade to Pro</strong> to get unlimited credits and unlock premium features!
          </p>
        </div>
      </StealthModal>

      {/* Upgrade to Pro Modal (BrowseAI gating) */}
      <StealthModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade to Pro"
        icon="🚀"
        variant="info"
        primaryAction={{
          label: 'Upgrade Plan',
          onClick: () => {
            setShowUpgradeModal(false);
            window.open('https://stealth-ai-sand.vercel.app/#/pricing', '_blank');
          }
        }}
        secondaryAction={{
          label: 'Close',
          onClick: () => setShowUpgradeModal(false)
        }}
      >
        <div className="space-y-3">
          <p className="text-slate-300 text-sm">
            <strong className="text-blue-300">BrowseAI</strong> is available on <strong className="text-white">Pro</strong> and higher plans.
          </p>
          <p className="text-slate-300 text-sm">
            Upgrade to unlock AI-powered browser automation and unlimited credits.
          </p>
        </div>
      </StealthModal>

      {/* Generic Alert Modal */}
      <StealthModal
        isOpen={!!modalInfo}
        onClose={() => setModalInfo(null)}
        title={modalInfo?.title || ''}
        icon={modalInfo?.icon}
        variant={modalInfo?.variant || 'info'}
        primaryAction={{
          label: 'OK',
          onClick: () => setModalInfo(null)
        }}
      >
        {modalInfo?.message}
      </StealthModal>
    </div>
  );
};

export default OverlayApp;
