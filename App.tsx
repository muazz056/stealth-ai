import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import { ResumeData } from './types';
import ResumeManager from './components/ResumeManager';
import AutoExpandTextarea from './components/AutoExpandTextarea';
import CollapsibleSection from './components/CollapsibleSection';
import AuthPage from './components/AuthPage';
import { authClient } from './src/utils/authClient';
import { messagesClient } from './src/utils/messagesClient';
import { tokensClient } from './src/utils/tokensClient';
import { resolveDeepgramConfig } from './src/utils/deepgramChainClient';
import { apiClient } from './src/utils/apiClient';
import { APP_CONFIG } from './src/config';
import { 
  getDefaultShortcuts, 
  ShortcutsState, 
  formatShortcut,
  isValidKeyCombination,
  hasConflict,
  ModifierKey,
  ShortcutAction,
  detectOS,
  ShortcutConfig
} from './src/utils/shortcutsManager';
import ShortcutRecorder from './components/ShortcutRecorder';
import StealthModal from './components/StealthModal';
import SearchableLanguageSelect from './components/SearchableLanguageSelect';

// API Base URL from environment
// Use env var - set by Vite at build time based on mode
// Electron renderer may receive backendUrl via query param from main process
const QUERY_BACKEND_URL = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('backendUrl')
  : null;
const API_BASE_URL = QUERY_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Deepgram Nova-3 supported languages
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

// English-like languages that support full Deepgram features
const ENGLISH_LANG_CODES = ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ', 'multi'];

function buildDeepgramUrl(langCode: string, keyterms: string = '', apiKey: string = '') {
  const isEnglish = ENGLISH_LANG_CODES.includes(langCode);
  // Use capital Token - matching HTTP header format!
  let url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${langCode}&interim_results=true&vad_events=true&encoding=opus&sample_rate=16000&authorization=Token%20${apiKey}`;
  
  if (isEnglish) {
    // Full features for English / Multilingual
    url += '&smart_format=true&punctuate=true&endpointing=100&diarize=true&dictation=true&utterance_end_ms=1000';
  } else {
    // Minimal features for non-English (some features may not be supported)
    url += '&endpointing=300&utterance_end_ms=1000';
  }
  
  // Add keyterms if provided (comma-separated)
  if (keyterms && keyterms.trim()) {
    const terms = keyterms.split(',').map(t => t.trim()).filter(t => t);
    terms.forEach(term => {
      url += `&keyterm=${encodeURIComponent(term)}`;
    });
  }
  
  return url;
}

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
    return <code className="bg-slate-200 dark:bg-slate-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
  }

  return (
    <div className="relative group my-3">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600 text-black dark:text-white px-3 py-1 rounded text-xs transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
      <pre className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 overflow-x-auto border border-slate-300 dark:border-slate-800" {...props}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

const LS_USER_KEY = 'isa_current_user';
    const DEFAULT_BASE_PROMPT = `You are a real-time AI assistant built for live conversations.
 
CONTEXT RULES:
1. Document = single source of truth
- Use mentioned skills, experience, projects, education
- NEVER invent, exaggerate, or assume
2. Description provided = align answers directly to it
3. Info provided = tailor responses accordingly
4. No context = use best practices

ANSWER STRUCTURE:
- Professional, confident tone , important information first

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- Intelligently analyze intent using provided context

CLARIFICATION:
- If multiple interpretations possible:
- Choose most likely one based on context (Job description or resume)
- Answer directly without asking clarifying questions or mentioning in the response.


RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain correction process
- Never mention you are AI or language model
- Answer confidently as if question was clearly spoken

CODING/TECHNICAL QUESTIONS:
- Provide correct, clean code or technical explanation
- Explain each approach if necessary

EXAMPLES:
- Give examples to improve clarity

OUTPUT:
- No emojis
-Important information first, then details
- Use markdown for formatting when helpful`;

const LS_BASE_PROMPT_KEY = 'isa_base_prompt';
const LS_RESUME_CONTENT_KEY = 'isa_resume_content';
const LS_JD_KEY = 'isa_job_description';
const LS_COMPANY_INFO_KEY = 'isa_company_info';

interface AppProps {
  user: any;
  onLogout: () => void;
  onNewSession?: () => void;
}

const App: React.FC<AppProps> = ({ user, onLogout, onNewSession }) => {
  console.log('🎨 MainApp rendering with user:', user);
  console.log('🎯 Selected provider:', user?.selectedProvider);
  console.log('️ Voice provider:', user?.voiceProvider);
  
  // State
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [basePrompt, setBasePrompt] = useState(
    user.settings?.basePrompt || 
    localStorage.getItem(LS_BASE_PROMPT_KEY) || 
    DEFAULT_BASE_PROMPT
  );
  const [jobDescription, setJobDescription] = useState(
    user.settings?.jobDescription || ''
  );
  const [companyInfo, setCompanyInfo] = useState(
    user.settings?.companyInfo || ''
  );
  const [contextMessages, setContextMessages] = useState<number>(
    user.settings?.contextMessages || 5 // Default: last 5 Q&A pairs
  );
  const [settings, setSettings] = useState({
    basePrompt: user.settings?.basePrompt || '',
    responseLanguage: user.settings?.responseLanguage || '',
    basePromptSummary: user.settings?.basePromptSummary || '',
    jobDescription: user.settings?.jobDescription || '',
    jobDescriptionSummary: user.settings?.jobDescriptionSummary || '',
    companyInfo: user.settings?.companyInfo || '',
    companyInfoSummary: user.settings?.companyInfoSummary || '',
    contextMessages: user.settings?.contextMessages || 5,
    cvText: user.settings?.cvText || '',
    cvSummary: user.settings?.cvSummary || ''
  });
  const [transcribedText, setTranscribedText] = useState('');
  const [interimText, setInterimText] = useState(''); // Current interim (not yet final) transcription
  const [committedText, setCommittedText] = useState(''); // Accumulated final transcriptions
  const [manualTextInput, setManualTextInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0); // For Q&A navigation
  const [qaPairs, setQaPairs] = useState<Array<{question: string, answer: string}>>([]); // Q&A pairs
  const [newPairTrigger, setNewPairTrigger] = useState(0); // Trigger to force navigation to latest
  const [apiProvider, setApiProvider] = useState<'gemini' | 'openai' | 'claude' | 'groq'>((user.selectedProvider && user.selectedProvider !== '' && user.selectedProvider !== 'ollama') ? user.selectedProvider as any : 'gemini');
  
  // Voice Provider State
  const [voiceProvider, setVoiceProvider] = useState<'default' | 'deepgram'>(() => {
    if (user?.voiceProvider) return user.voiceProvider;
    try {
      const saved = localStorage.getItem(LS_USER_KEY);
      if (saved) return JSON.parse(saved)?.voiceProvider || 'default';
    } catch (e) {}
    return 'default';
  });
  const [deepgramLanguage, setDeepgramLanguage] = useState(() => {
    if (user?.deepgramLanguage) return user.deepgramLanguage;
    try {
      const saved = localStorage.getItem(LS_USER_KEY);
      if (saved) return JSON.parse(saved)?.deepgramLanguage || 'multi';
    } catch (e) {}
    return 'multi';
  });
  const [deepgramKeyterms, setDeepgramKeyterms] = useState(() => {
    if (user?.deepgramKeyterms) return user.deepgramKeyterms;
    try {
      const saved = localStorage.getItem(LS_USER_KEY);
      if (saved) return JSON.parse(saved)?.deepgramKeyterms || '';
    } catch (e) {}
    return '';
  });
const [showVoiceSuccess, setShowVoiceSuccess] = useState(false);
  const [showSettingsSaved, setShowSettingsSaved] = useState(false);
  const [showContextSaved, setShowContextSaved] = useState(false);
  const [isGeneratingSummaries, setIsGeneratingSummaries] = useState(false);
  const [showManualSummarySaved, setShowManualSummarySaved] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutsState>(getDefaultShortcuts());
  const [shortcutErrors, setShortcutErrors] = useState<{[key: string]: string}>({});
  const [showShortcutsSuccess, setShowShortcutsSuccess] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);
  const [apiError, setApiError] = useState<{title: string, message: string, details?: string} | null>(null);
  const [showOutOfTokensModal, setShowOutOfTokensModal] = useState(false);
  const [modalInfo, setModalInfo] = useState<{title: string; message: string; variant: 'info' | 'success' | 'error' | 'warning'; icon?: string} | null>(null);

  // Initialize transcription time remaining from user data
  useEffect(() => {
    try {
      const saved = localStorage.getItem('isa_current_user');
      if (saved) {
        const u = JSON.parse(saved);
        const trSecs = u.transcriptionSeconds || 0;
        setTranscriptionSecondsRemaining(Math.max(0, 1500 - trSecs));
      }
    } catch {}
  }, []);

  // Helper function to parse and format API errors
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
        details: 'Please verify your API key in the Advanced Settings and ensure it\'s active in your provider\'s dashboard.'
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

  // Centralized logout that also clears local caches
  const forceLogout = () => {
    try {
      localStorage.removeItem(LS_USER_KEY);
      localStorage.removeItem(LS_BASE_PROMPT_KEY);
      localStorage.removeItem(LS_JD_KEY);
      localStorage.removeItem(LS_COMPANY_INFO_KEY);
      localStorage.removeItem('isa_cv_summary');
      localStorage.removeItem('isa_base_prompt_summary');
      localStorage.removeItem('isa_jd_summary');
      localStorage.removeItem('isa_company_info_summary');
    } catch (e) {
      console.error('Failed to clear localStorage on logout:', e);
    }
    onLogout();
  };

  // Sync user settings when user data updates (from MongoDB)
  useEffect(() => {
    if (user?.selectedProvider) {
      console.log('📡 Setting provider to:', user.selectedProvider);
      setApiProvider(user.selectedProvider);
    }
    if (user?.voiceProvider) {
      console.log('🎤 Setting voice provider to:', user.voiceProvider);
      setVoiceProvider(user.voiceProvider);
    }
    if (user?.deepgramLanguage) {
      setDeepgramLanguage(user.deepgramLanguage);
    }
    if (user?.shortcuts) {
      // Merge user shortcuts with frontend defaults preserving labels/descriptions
      const defaults = getDefaultShortcuts();
      const merged = { ...defaults };
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
      setShortcuts(merged);
    } else {
      setShortcuts(getDefaultShortcuts());
    }
  }, [user]);

  // Sync settings (basePrompt, jobDescription, companyInfo, cvText) when user data updates from MongoDB
  useEffect(() => {
    if (user?.settings && Object.keys(user.settings).length > 0) {
      console.log('⚙️ Syncing settings from MongoDB:', user.settings);
      
      if (user.settings.basePrompt) {
        console.log('📝 Updating basePrompt from MongoDB');
        setBasePrompt(user.settings.basePrompt);
        localStorage.setItem(LS_BASE_PROMPT_KEY, user.settings.basePrompt);
      }
      if (user.settings.jobDescription !== undefined) {
        console.log('📝 Updating jobDescription from MongoDB');
        setJobDescription(user.settings.jobDescription);
        if (user.settings.jobDescription) {
          localStorage.setItem(LS_JD_KEY, user.settings.jobDescription);
        } else {
          localStorage.removeItem(LS_JD_KEY);
        }
      }
      if (user.settings.companyInfo !== undefined) {
        console.log('📝 Updating companyInfo from MongoDB');
        setCompanyInfo(user.settings.companyInfo);
        if (user.settings.companyInfo) {
          localStorage.setItem(LS_COMPANY_INFO_KEY, user.settings.companyInfo);
        } else {
          localStorage.removeItem(LS_COMPANY_INFO_KEY);
        }
      }
      if (user.settings.cvText) {
        console.log('📄 Updating CV text from MongoDB');
        setResume({
          name: 'Loaded CV',
          content: user.settings.cvText,
          parsedAt: Date.now()
        });
      }
    }
    // If no settings, clear localStorage for JD and company to avoid stale defaults
    if (!user?.settings || Object.keys(user.settings).length === 0) {
      localStorage.removeItem(LS_JD_KEY);
      localStorage.removeItem(LS_COMPANY_INFO_KEY);
    }
  }, [user?.settings]);

  // Refresh latest settings from DB on mount (keeps web/electron/overlay aligned)
  useEffect(() => {
    const refreshUser = async () => {
      try {
        if (!user?._id) return;
        const latest = await authClient.getUser(user._id);
        if (!latest || latest.success === false || latest?.message === 'User not found' || !latest.user) {
          console.warn('User missing from DB, logging out.');
          forceLogout();
          return;
        }
        const freshUser = latest.user || latest;
        const s = freshUser.settings || {};

        // Update state with freshest settings
        setSettings({
          basePrompt: s.basePrompt || '',
          responseLanguage: s.responseLanguage || 'English',
          basePromptSummary: s.basePromptSummary || '',
          jobDescription: s.jobDescription || '',
          jobDescriptionSummary: s.jobDescriptionSummary || '',
          companyInfo: s.companyInfo || '',
          companyInfoSummary: s.companyInfoSummary || '',
          contextMessages: s.contextMessages || 5,
          cvText: s.cvText || '',
          cvSummary: s.cvSummary || ''
        });
        setContextMessages(s.contextMessages || 5);
        setBasePrompt(s.basePrompt || basePrompt || '');
        setJobDescription(s.jobDescription || jobDescription || '');
        setCompanyInfo(s.companyInfo || companyInfo || '');
        if (s.cvText && (!resume || !resume.content)) {
          setResume({
            name: 'Loaded CV',
            content: s.cvText,
            parsedAt: Date.now()
          });
        }

        // Persist to localStorage for overlay/web sharing
        const mergedUser = { ...user, settings: { ...user.settings, ...s } };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(mergedUser));
        if (s.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, s.basePrompt);
        if (s.jobDescription) localStorage.setItem(LS_JD_KEY, s.jobDescription);
        if (s.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, s.companyInfo);
        if (s.cvSummary) localStorage.setItem('isa_cv_summary', s.cvSummary);
        if (s.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', s.basePromptSummary);
        if (s.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', s.jobDescriptionSummary);
        if (s.companyInfoSummary) localStorage.setItem('isa_company_info_summary', s.companyInfoSummary);
      } catch (err) {
        console.error('❌ Failed to refresh user settings:', err);
        // If unable to fetch user (deleted/not found), force logout to avoid ghost sessions
        forceLogout();
      }
    };

    refreshUser();
  }, []);

  // Refresh data from DB (used by refresh button — no full page reload)
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      // Refresh user settings from DB
      const latest = await authClient.getUser(user._id);
      if (latest?.success && latest.user) {
        const freshUser = latest.user;
        const s = freshUser.settings || {};
        setSettings({
          basePrompt: s.basePrompt || '',
          responseLanguage: s.responseLanguage || 'English',
          basePromptSummary: s.basePromptSummary || '',
          jobDescription: s.jobDescription || '',
          jobDescriptionSummary: s.jobDescriptionSummary || '',
          companyInfo: s.companyInfo || '',
          companyInfoSummary: s.companyInfoSummary || '',
          contextMessages: s.contextMessages || 5,
          cvText: s.cvText || '',
          cvSummary: s.cvSummary || ''
        });
        if (freshUser.deepgramLanguage) setDeepgramLanguage(freshUser.deepgramLanguage);
        if (freshUser.deepgramKeyterms !== undefined) setDeepgramKeyterms(freshUser.deepgramKeyterms);
        const mergedUser = { ...user, ...freshUser };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(mergedUser));
      }
      // Refresh chat history from DB
      const historyResult = await messagesClient.getHistory(user._id);
      if (historyResult.success && historyResult.history) {
        setChatHistory(historyResult.history);
      }
    } catch (error) {
      console.error('❌ Data refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Manually save edited summaries (user-provided)
  const handleSaveManualSummaries = async () => {
    try {
      const updatedSettings = {
        basePrompt,
        responseLanguage: settings.responseLanguage || '',
        basePromptSummary: settings.basePromptSummary || '',
        jobDescription,  // Use separate state variable
        jobDescriptionSummary: settings.jobDescriptionSummary || '',
        companyInfo,  // Use separate state variable
        companyInfoSummary: settings.companyInfoSummary || '',
        contextMessages,
        cvText: resume?.content || settings.cvText || '',
        cvSummary: settings.cvSummary || ''
      };

      const result = await authClient.updateSettings(user._id, updatedSettings);
      if (result && result.success) {
        setSettings(prev => ({ ...prev, ...updatedSettings }));
        const updatedUser = { ...user, settings: { ...user.settings, ...updatedSettings } };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
        if (updatedSettings.basePrompt) localStorage.setItem(LS_BASE_PROMPT_KEY, updatedSettings.basePrompt);
        if (updatedSettings.jobDescription) localStorage.setItem(LS_JD_KEY, updatedSettings.jobDescription);
        if (updatedSettings.companyInfo) localStorage.setItem(LS_COMPANY_INFO_KEY, updatedSettings.companyInfo);
        if (updatedSettings.cvSummary) localStorage.setItem('isa_cv_summary', updatedSettings.cvSummary);
        if (updatedSettings.basePromptSummary) localStorage.setItem('isa_base_prompt_summary', updatedSettings.basePromptSummary);
        if (updatedSettings.jobDescriptionSummary) localStorage.setItem('isa_jd_summary', updatedSettings.jobDescriptionSummary);
        if (updatedSettings.companyInfoSummary) localStorage.setItem('isa_company_info_summary', updatedSettings.companyInfoSummary);
        if (updatedSettings.responseLanguage) localStorage.setItem('isa_response_language', updatedSettings.responseLanguage);
        // Notify other windows (Electron overlay, other browser tabs)
        if (typeof window !== 'undefined' && (window as any).require) {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.send('notify-overlay-settings-changed', { settings: updatedSettings, deepgramLanguage, deepgramKeyterms });
        }
        setShowManualSummarySaved(true);
        setTimeout(() => setShowManualSummarySaved(false), 2500);
      } else {
        setApiError({
          title: 'Save Failed',
          message: 'Could not save edited summaries',
          details: 'Please retry'
        });
      }
    } catch (error: any) {
      console.error('❌ Manual summary save error:', error);
      setApiError({
        title: 'Save Failed',
        message: error.message || 'Could not save edited summaries',
        details: 'Please retry'
      });
    }
  };

  // Load chat history from MongoDB on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!user._id) return;
      
      try {
        const result = await messagesClient.getHistory(user._id);
        if (result.success && result.history) {
          console.log('📜 Loaded conversation history:', result.count, 'messages');
          setChatHistory(result.history);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };
    
    loadHistory();
  }, [user._id]);

  // Auto-refresh chat history every 5 seconds
  // - Web app: polls MongoDB directly
  // - Electron app: polls MongoDB AND notifies overlay when changes detected
  useEffect(() => {
    if (!user._id) return;
    
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    
    const refreshInterval = setInterval(async () => {
      try {
        const result = await messagesClient.getHistory(user._id);
        if (result.success && result.history) {
          // Only update if there's a change in message count
          if (result.count !== chatHistory.length) {
            console.log('🔄 [Auto-refresh] Chat history updated:', result.count, 'messages');
            setChatHistory(result.history);
            
            // If Electron, notify overlay about the change
            if (isElectron) {
              const { ipcRenderer } = (window as any).require('electron');
              ipcRenderer.send('chat-history-updated', { userId: user._id, count: result.count });
              console.log('📢 [Electron] Notified overlay of chat history change');
            }
          }
        }
      } catch (error) {
        console.error('Failed to auto-refresh chat history:', error);
      }
    }, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(refreshInterval);
  }, [user._id, chatHistory.length]); // Re-run when user or history length changes

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

  // Keyboard navigation for Q&A pairs and Shift toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      
      // Alt key - Toggle focus on input field
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement?.tagName === 'INPUT' || 
                               activeElement?.tagName === 'TEXTAREA';
        
        if (isInputFocused) {
          (activeElement as HTMLElement).blur();
          console.log('⌨️ Alt pressed - Unfocusing input field (for arrow navigation)');
        } else {
          const questionInput = document.querySelector('textarea[placeholder*="question"]') as HTMLElement;
          if (questionInput) {
            questionInput.focus();
            console.log('⌨️ Alt pressed - Focusing input field');
          }
        }
        return;
      }
      
      // Arrow keys - Only handle if input field is not focused
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

// Global Ctrl+Enter shortcut for Get Answer (Vite app only - Electron uses IPC)
  useEffect(() => {
    if (isElectronRef.current) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const hasPrimaryMod = e.ctrlKey || e.metaKey;
      if (hasPrimaryMod && e.key === 'Enter') {
        e.preventDefault();
        
        if (isListening) {
          // While listening - stop recording first, then auto-send
          console.log('⌨️ Ctrl+Enter while listening - Stopping listen');
          handleStopListen();
          
          // Give it a moment for transcription to complete, then send
          setTimeout(() => {
            const questionText = (manualTextInput + ' ' + transcribedText).trim();
            if (questionText) {
              handleGetAnswer();
            }
          }, 500);
          
        } else {
          // Not listening - just trigger Get Answer if there's text
          const hasText = manualTextInput.trim().length > 0;
          const canAnswer = !isGenerating && hasText;
          
          if (canAnswer) {
            console.log('⌨️ Ctrl+Enter pressed - Triggering Get Answer');
            handleGetAnswer();
          } else {
            console.log('⌨️ Ctrl+Enter pressed but conditions not met:', { 
              hasText, 
              isGenerating 
            });
          }
        }
      }
    };

// Add global event listener
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
}, [manualTextInput, transcribedText, isListening, isGenerating]);

// Global Ctrl+\ (Start Listen) and Ctrl+Backspace (Clear) shortcuts (Vite app only)
  useEffect(() => {
    if (isElectronRef. current) return;
    
    console.log('🎯 Setting up keyboard shortcuts in App.tsx');
    console.log('🔍 startListenRef..current:', startListenRef.current);

    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      const hasPrimaryMod = e.ctrlKey || e.metaKey;
      // Ctrl+\ - Start/Stop Listen (local shortcut)
      // Check multiple conditions for backslash (works across different keyboards)
      const isBackslash = e.code === 'Backslash' || 
                          e.key === '\\' || 
                          e.keyCode === 220 ||
                          e.which === 220;
      
      if (hasPrimaryMod && isBackslash) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('✅ Ctrl+\\ detected in App.tsx! isListening:', isListening);
        console.log('🔍 Refs available:', {
          startListenRef: !!startListenRef.current,
          stopListenRef: !!stopListenRef.current
        });
        
        if (isListening) {
          console.log('🛑 Calling stopListenRef.current()');
          if (stopListenRef.current) {
            stopListenRef.current();
          } else {
            console.error('❌ stopListenRef.current is NULL!');
          }
        } else {
          console.log('▶️ Calling startListenRef.current()');
          if (startListenRef.current) {
            startListenRef.current();
          } else {
            console.error('❌ startListenRef.current is NULL!');
          }
        }
        return;
      }
      
      // Ctrl+Backspace - Clear question field
      if (hasPrimaryMod && e.key === 'Backspace') {
        e.preventDefault();
        console.log('🧹 Ctrl+Backspace - Clearing');
        setManualTextInput('');
        setTranscribedText('');
        setCommittedText('');
        setInterimText('');
        const questionInput = document.querySelector('textarea[placeholder*="question"]') as HTMLTextAreaElement;
        if (questionInput) {
          questionInput.focus();
        }
      }
      
      // ESC key - Stop response or Clear all
      if (e.key === 'Escape') {
        e.preventDefault();
        
        if (isGenerating) {
          // Stop the response
          console.log('🛑 ESC - Stopping response');
          if (answerAbortRef.current) {
            try {
              answerAbortRef.current.abort();
            } catch (e) {
              console.error('Failed to abort:', e);
            }
            answerAbortRef.current = null;
          }
          setIsGenerating(false);
      } else {
          // Clear all
          console.log('🧹 ESC - Clearing all');
          setManualTextInput('');
          setTranscribedText('');
          setCommittedText('');
          setInterimText('');
          setAiResponse('');
        }
      }
    };

    // Add listener with capture phase to catch events early
    window.addEventListener('keydown', handleGlobalKeyPress, true);
    console.log('✅ Keyboard listener attached in App.tsx');

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyPress, true);
      console.log('🗑️ Keyboard listener removed in App.tsx');
    };
  }, [isGenerating, isListening, shortcuts]); // Re-run when isGenerating or isListening changes

  // Handle user-defined shortcuts (including when textarea focused)
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
          console.log(`🎯 Shortcut triggered: ${action}, isGenerating: ${isGeneratingRef.current}`);
          
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
                console.log(`🎯 getAnswer triggered, text: "${text}"`);
                if (text) {
                  triggerGetAnswerRef.current = triggerGetAnswerRef.current + 1;
                }
              }
              break;
            case 'clearQuestion':
              setManualTextInput('');
              setTranscribedText('');
              setCommittedText('');
              setInterimText('');
              break;
            case 'focusInput': {
              const input = document.querySelector('textarea[placeholder*="question"]') as HTMLTextAreaElement;
              if (input) input.focus();
              break;
            }
            case 'stopOrClear':
              if (isGeneratingRef.current) {
                if (answerAbortRef.current) {
                  answerAbortRef.current.abort();
                  answerAbortRef.current = null;
                }
                setIsGenerating(false);
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

  // Sync transcribedText from committedText + interimText (streaming display)
  useEffect(() => {
    const combined = (committedText + (interimText ? ' ' + interimText : '')).trim();
    setTranscribedText(combined);
  }, [committedText, interimText]);

  // Initialize Deepgram key when voice provider changes
  useEffect(() => {
    if (voiceProvider === 'deepgram') {
      // Deepgram API key is now managed by the system/super admin
      // No user configuration needed
    }
  }, [voiceProvider]);

  // Persist settings for overlay (using localStorage for quick access)
  useEffect(() => {
    try {
      localStorage.setItem(LS_BASE_PROMPT_KEY, basePrompt);
    } catch (e) {}
  }, [basePrompt]);

  // Auto-save CV text to database when changed
  useEffect(() => {
    const saveCvToDatabase = async () => {
      if (!resume?.content || !user._id) return;
      
      try {
        localStorage.setItem(LS_RESUME_CONTENT_KEY, resume.content);
        
        // Save to MongoDB
        console.log('💾 Auto-saving CV text to database...');
        const settingsToSave = {
          ...settings,
          basePrompt,
          jobDescription,
          companyInfo,
          contextMessages,
          cvText: resume.content,
          responseLanguage: settings.responseLanguage || 'English'
        };
        
        const result = await authClient.updateSettings(user._id, settingsToSave);
        if (result?.success) {
          console.log('✅ CV text saved to MongoDB database');
          
          // Update user in localStorage
          const updatedUser = {
            ...user,
            settings: settingsToSave
          };
          localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
        }
        
        // Notify overlay of CV change (Real-Time Sync)
        if (typeof window !== 'undefined' && (window as any).require) {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.send('notify-overlay-settings-changed');
        }
      } catch (error) {
        console.error('❌ Failed to save CV to database:', error);
      }
    };
    
    if (resume?.content) {
      saveCvToDatabase();
      } else {
      try {
        localStorage.removeItem(LS_RESUME_CONTENT_KEY);
      } catch (e) {}
    }
  }, [resume?.content]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_JD_KEY, jobDescription);
    } catch (e) {}
  }, [jobDescription]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPANY_INFO_KEY, companyInfo);
    } catch (e) {}
  }, [companyInfo]);

  //  Persist API keys to localStorage for overlay access
  useEffect(() => {
  }, [apiProvider]);

  // Persistence hooks
  useEffect(() => {
    if (showSettingsSaved) {
      const timer = setTimeout(() => setShowSettingsSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSettingsSaved]);

  // Refs
  const recognitionRef = useRef<any>(null);
  const wantToListenRef = useRef(false);
  const answerAbortRef = useRef<AbortController | null>(null);
  const isElectronRef = useRef(false);
  const ipcRendererRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const deepgramAudioRef = useRef<any>(null); // MediaStream for Deepgram browser
  const displayCaptureStreamRef = useRef<MediaStream | null>(null);
  const micCaptureStreamRef = useRef<MediaStream | null>(null);
  const deepgramMixAudioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const appLog = (...parts: any[]) => {
    const message = parts
      .map((p) => (typeof p === 'string' ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()))
      .join(' ');
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('overlay-log', `[MAIN-APP] ${message}`);
      }
    } catch (e) {}
    console.log('[MAIN-APP]', ...parts);
  };
  
  // Refs for current state values (to avoid stale closures)
  const apiProviderRef = useRef(apiProvider);
  const isListeningRef = useRef(isListening);
  const manualTextInputRef = useRef(manualTextInput);
  const transcribedTextRef = useRef(transcribedText);
  const isGeneratingRef = useRef(isGenerating);
  const triggerGetAnswerRef = useRef(0);
  
  useEffect(() => { apiProviderRef.current = apiProvider; }, [apiProvider]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { manualTextInputRef.current = manualTextInput; }, [manualTextInput]);
  useEffect(() => { transcribedTextRef.current = transcribedText; }, [transcribedText]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

  // Cross-platform sync: pick up language/settings changes from overlay window
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_USER_KEY && e.newValue) {
        try {
          const updatedUser = JSON.parse(e.newValue);
          if (updatedUser.deepgramLanguage && updatedUser.deepgramLanguage !== deepgramLanguage) {
            setDeepgramLanguage(updatedUser.deepgramLanguage);
          }
          if (updatedUser.settings?.responseLanguage) {
            setSettings(prev => ({ ...prev, ...updatedUser.settings }));
          }
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  
  // Watch for shortcut trigger - call handleGetAnswer when counter changes
  useEffect(() => {
    if (triggerGetAnswerRef.current > 0) {
      handleGetAnswer();
    }
  }, [triggerGetAnswerRef.current]);

  // Ensure the question textarea grows when text is updated programmatically
  useEffect(() => {
    const el = questionInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [manualTextInput, transcribedText]);
  const startListenRef = useRef<(() => void) | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const transcriptionStartTimeRef = useRef<number>(0);
  const [transcriptionSecondsRemaining, setTranscriptionSecondsRemaining] = useState<number>(1500);

  useEffect(() => {
    try {
      localStorage.setItem(LS_JD_KEY, jobDescription);
    } catch (e) {}
  }, [jobDescription]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COMPANY_INFO_KEY, companyInfo);
    } catch (e) {}
  }, [companyInfo]);

  // Initialize Speech Recognition (Web Speech API for browser, Python Bridge for Electron)
  useEffect(() => {
    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && (window as any).require;
    isElectronRef.current = isElectron;

    if (isElectron) {
      // Electron: Use voice provider (Python or Deepgram)
      const { ipcRenderer } = (window as any).require('electron');
      ipcRendererRef.current = ipcRenderer;

      // Initialize voice provider based on user settings
      console.log('🎤 [App] Initializing voice provider...');
      console.log('🎤 [App] Voice provider:', voiceProvider);
      
      const dgLang = user.deepgramLanguage || 'multi';
      const dgKeyterms = user.deepgramKeyterms || '';
      ipcRenderer.send('init-voice-provider', {
        voiceProvider,
        apiKey: user?.deepgramApiKey || '',
        language: dgLang,
        keyterms: dgKeyterms
      });
      console.log('✅ [App] Voice provider init command sent:', voiceProvider, 'lang:', dgLang, 'keyterms:', !!dgKeyterms);

      // Listen for speech results (works for both Python and Deepgram)
      const handlePythonSpeech = (event: any, message: any) => {
        console.log('📥 [App] Voice message received:', message.type, message.message || message.text, 'is_final:', message.is_final);
        
        if (message.type === 'transcription') {
          const text = message.text.trim();
          if (text) {
            if (message.is_final) {
              // Final result: commit this text permanently, clear interim
              console.log('📝 [App] FINAL:', text);
              setCommittedText(prev => (prev + ' ' + text).trim());
              setInterimText('');
            } else {
              // Interim result: replace current interim text (same utterance evolving)
              console.log('📝 [App] INTERIM:', text);
              setInterimText(text);
            }
          }
        } else if (message.type === 'error') {
          console.error('🎤 Voice error:', message.message);
          setModalInfo({ title: 'Speech Recognition Error', message: message.message, variant: 'error', icon: '🎤' });
        } else if (message.type === 'fatal') {
          console.error('🎤 Voice fatal error:', message.message);
          setModalInfo({ title: 'Fatal Error', message: message.message, variant: 'error', icon: '⚠️' });
          setIsListening(false);
        } else if (message.type === 'ready') {
          console.log('✅ Voice bridge ready!');
        } else if (message.type === 'status') {
          console.log('🎤 Voice status:', message.message);
        } else if (message.type === 'debug') {
          console.log('🔍 Voice debug:', message.message);
        }
      };

      ipcRenderer.on('python-speech', handlePythonSpeech);

      // Handle Deepgram SOX error with custom notification
      const handleDeepgramError = (_event: any, errorData: any) => {
        console.error('❌ [App] Deepgram error received:', errorData);
        
        setModalInfo({
          title: errorData.title || 'Deepgram Error',
          message: `${errorData.message}\n\nSolutions: ${errorData.solutions.join(', ')}${errorData.autoSwitching ? '\n\nAutomatically switching to Python (DEFAULT) provider...' : ''}`,
          variant: 'error',
          icon: '⚠️'
        });
      };

      ipcRenderer.on('deepgram-sox-error', handleDeepgramError);

      // Handle chat history updates from overlay
      const handleChatHistoryUpdate = async (_event: any, { userId, count }: any) => {
        console.log('📢 [App] Chat history updated from overlay:', count, 'messages');
        if (userId === user._id) {
          try {
            const result = await messagesClient.getHistory(userId);
            if (result.success && result.history) {
              console.log('✅ [App] Reloaded chat history:', result.count, 'messages');
              setChatHistory(result.history);
            }
          } catch (error) {
            console.error('❌ [App] Failed to reload chat history:', error);
          }
        }
      };

      ipcRenderer.on('chat-history-updated', handleChatHistoryUpdate);

      // Global shortcuts routed from main process (same channels as overlay)
      const handleToggleListenAnswer = () => {
        console.log('🎤 [App] Shortcut: toggle-listen-answer');
        if (isListeningRef.current) {
          if (stopListenRef.current) stopListenRef.current();
        } else {
          if (startListenRef.current) startListenRef.current();
        }
      };

      const handleTriggerDirectAnswer = () => {
        console.log('⚡ [App] Shortcut: trigger-direct-answer');
        if (isListeningRef.current) {
          handleStopListen();
          setTimeout(() => {
            const questionText = (manualTextInputRef.current + ' ' + transcribedTextRef.current).trim();
            if (questionText && !isGeneratingRef.current) {
              handleGetAnswer();
            }
          }, 500);
          return;
        }
        const hasText = manualTextInputRef.current.trim().length > 0;
        if (hasText && !isGeneratingRef.current) {
          handleGetAnswer();
        }
      };

      ipcRenderer.on('toggle-listen-answer', handleToggleListenAnswer);
      ipcRenderer.on('trigger-direct-answer', handleTriggerDirectAnswer);

      // Handle settings updates from overlay (instant cross-platform sync)
      const handleSettingsUpdated = (_event: any, payload?: any) => {
        if (payload?.settings) {
          setSettings(prev => ({ ...prev, ...payload.settings }));
          if (payload.settings.responseLanguage) {
            localStorage.setItem('isa_response_language', payload.settings.responseLanguage);
          }
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
          setDeepgramLanguage(payload.deepgramLanguage);
        }
        if (payload?.deepgramKeyterms !== undefined) {
          setDeepgramKeyterms(payload.deepgramKeyterms);
        }
      };

      ipcRenderer.on('settings-updated', handleSettingsUpdated);

      // Cleanup
      return () => {
        ipcRenderer.removeListener('python-speech', handlePythonSpeech);
        ipcRenderer.removeListener('deepgram-sox-error', handleDeepgramError);
        ipcRenderer.removeListener('chat-history-updated', handleChatHistoryUpdate);
        ipcRenderer.removeListener('toggle-listen-answer', handleToggleListenAnswer);
        ipcRenderer.removeListener('trigger-direct-answer', handleTriggerDirectAnswer);
        ipcRenderer.removeListener('settings-updated', handleSettingsUpdated);
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
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let finalText = '';
          let interimText = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalText += event.results[i][0].transcript + ' ';
            } else {
              interimText += event.results[i][0].transcript;
            }
          }
          
          // Keyword replacement function
          const applyKeywords = (text: string) => {
            if (!deepgramKeyterms || !deepgramKeyterms.trim()) return text;
            const keywordsList = deepgramKeyterms.split(',').map((k: string) => k.trim()).filter((k: string) => k);
            let result = text;
            for (const keyword of keywordsList) {
              if (keyword) {
                const regex = new RegExp(keyword, 'gi');
                result = result.replace(regex, keyword);
              }
            }
            return result;
          };
          
          if (finalText.trim()) {
            setTranscribedText(prev => prev + applyKeywords(finalText));
          }
          if (interimText.trim()) {
            setInterimText(applyKeywords(interimText));
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        const handleError = (e: any) => {
          console.error('Speech error:', e.error);
          if (e.error === 'not-allowed') {
            setModalInfo({ title: 'Microphone Error', message: 'Microphone permission denied. Please allow microphone access in your browser settings.', variant: 'error', icon: '🎤' });
            setIsListening(false);
            wantToListenRef.current = false;
          }
        };
        recognition.onerror = handleError;

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Start Listen
  const handleStartListen = async () => {
    if (wantToListenRef.current) {
      console.log('⏭️ [App] handleStartListen skipped - already started');
      return;
    }

    // Update UI immediately — no delay for button state change
    setIsListening(true);
    wantToListenRef.current = true;

    // Record start time for tracking
    transcriptionStartTimeRef.current = Date.now();

    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    setManualTextInput('');
    setAiResponse('');

    // Check transcription limits before starting (async, non-blocking for UI)
    const userForListen = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
    const isAdminUser = userForListen.role === 'admin' || userForListen.role === 'super-admin' || userForListen.tokens === -1;
    if (!isAdminUser && userForListen._id) {
      const listenCheck = await tokensClient.checkListen(userForListen._id);
      if (!listenCheck.canListen) {
        wantToListenRef.current = false;
        setIsListening(false);
        if (listenCheck.reason === 'out_of_tokens') {
          setShowOutOfTokensModal(true);
        } else if (listenCheck.reason === 'transcription_limit') {
          setModalInfo({
            title: 'Transcription Limit Reached',
            message: 'You have used all 25 minutes of free transcription. Upgrade to Pro for unlimited transcription.',
            variant: 'warning' as const,
            icon: '🎤'
          });
        }
        return;
      }
    }
    
    // Determine effective voice provider and possible Deepgram config
    let effectiveVoiceProvider = voiceProvider;
    let effectiveDeepgramLanguage = deepgramLanguage;
    let effectiveDeepgramKeyterms = deepgramKeyterms;

    try {
      const userFromStorage = localStorage.getItem(LS_USER_KEY);
      const parsedUser = userFromStorage ? JSON.parse(userFromStorage) : user;
      const sysConfig = await resolveDeepgramConfig(parsedUser);
      if (sysConfig && sysConfig.apiKey) {
        appLog('🎤 [App] System Deepgram chain active, overriding voice provider to deepgram for this listen session');
        effectiveVoiceProvider = 'deepgram';
        effectiveDeepgramLanguage = sysConfig.language || effectiveDeepgramLanguage;
        effectiveDeepgramKeyterms = sysConfig.keyterms || effectiveDeepgramKeyterms;
        // Store for downstream use
        (window as any).__systemDeepgramLanguage = effectiveDeepgramLanguage;
        (window as any).__systemDeepgramKeyterms = effectiveDeepgramKeyterms;
      }
    } catch (e) {
      appLog('Failed to check system Deepgram chain:', e);
    }

    // Determine if Deepgram should be used: explicit voiceProvider OR system chain resolved a key
    const shouldUseDeepgram = effectiveVoiceProvider === 'deepgram';

    if (isElectronRef.current && shouldUseDeepgram) {
  // If system chain resolved, use the resolved language/keyterms
  const effectiveLanguage = (window as any).__systemDeepgramLanguage || deepgramLanguage || 'multi';
  const effectiveKeyterms = (window as any).__systemDeepgramKeyterms || deepgramKeyterms || '';
  appLog(`Effective Deepgram mode: language=${effectiveLanguage}, keyterms=${effectiveKeyterms}`);
      try {
        appLog('Start listen: Electron deepgram mixed mode');
        // 1) Capture system audio in Electron (no picker; handled in main session handler)
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as MediaTrackConstraints,
        });
        displayCaptureStreamRef.current = displayStream;

        const systemAudioTracks = displayStream.getAudioTracks();
        if (!systemAudioTracks || systemAudioTracks.length === 0) {
          throw new Error('System audio track not available from getDisplayMedia');
        }
        appLog('System tracks:', systemAudioTracks.map((t: any) => t.label).join(' | '));
        const systemAudioOnlyStream = new MediaStream(systemAudioTracks);

        // 2) Capture microphone audio
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micCaptureStreamRef.current = micStream;
        appLog('Mic tracks:', micStream.getAudioTracks().map((t: any) => t.label).join(' | '));

        // 3) Mix system + mic into a single stream
        const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) {
          throw new Error('AudioContext is not available in this Electron renderer');
        }
        const mixCtx = new AC();
        deepgramMixAudioContextRef.current = mixCtx;

        const systemSource = mixCtx.createMediaStreamSource(systemAudioOnlyStream);
        const micSource = mixCtx.createMediaStreamSource(micStream);
        const systemGain = mixCtx.createGain();
        const micGain = mixCtx.createGain();
        const destination = mixCtx.createMediaStreamDestination();

        systemGain.gain.value = 1.0;
        micGain.gain.value = 1.15;

        systemSource.connect(systemGain).connect(destination);
        micSource.connect(micGain).connect(destination);

        const mixedStream = destination.stream;
        deepgramAudioRef.current = mixedStream;
        const mediaRecorder = new MediaRecorder(mixedStream);
        mediaRecorderRef.current = mediaRecorder;
        
        const ws = new WebSocket(`${API_BASE_URL}/api/deepgram-ws?language=${encodeURIComponent(deepgramLanguage || 'multi')}&keyterms=${encodeURIComponent(deepgramKeyterms || '')}`);
        deepgramWsRef.current = ws;
        
        let deepgramReady = false;
        const pendingChunks: any[] = [];
        
        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) {
            if (deepgramReady && ws.readyState === WebSocket.OPEN) {
              ws.send(ev.data);
            } else {
              pendingChunks.push(ev.data);
            }
          }
        };
        
        ws.onopen = () => {
          appLog('Deepgram WS opened, starting recorder immediately...');
          mediaRecorder.start(100);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('🎧 App.tsx received:', data.type, data.channel?.alternatives?.[0]?.transcript || '', 'is_final:', data.is_final);
            
            if (data.type === 'connected') {
              appLog(`Deepgram proxy connected, flushing ${pendingChunks.length} buffered chunks...`);
              deepgramReady = true;
              for (const chunk of pendingChunks) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(chunk);
                }
              }
              pendingChunks.length = 0;
            } else if (data.type === 'error') {
              console.error('Deepgram error:', data.message);
            } else if (data.channel) {
              const transcript = data.channel?.alternatives?.[0]?.transcript;
              if (transcript) {
                if (data.is_final) {
                  setCommittedText(prev => (prev + ' ' + transcript).trim());
                  setInterimText('');
                } else {
                  setInterimText(transcript);
                }
              }
            }
          } catch (e) {
            console.error('Deepgram WS parse error:', e, 'raw:', event.data);
          }
        };
        
        ws.onclose = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        };
        
        setIsListening(true);
        appLog('Electron Deepgram mixed capture started');
      } catch (e) {
        appLog('Failed to start Electron Deepgram mixed capture', String(e));
        console.error('Failed to start Electron Deepgram mixed capture:', e);
        setIsListening(false);
      }
    } else if (isElectronRef.current) {  
      // Electron fallback: Use Python Bridge
      ipcRendererRef.current?.send('python-start-listen');
      setIsListening(true);
      console.log('🎤 VOICE: Python Bridge (fallback)');
    } else if (shouldUseDeepgram) {
      try {
        // Audio constraints optimized for capturing speaker audio (YouTube, meeting apps)
        // - echoCancellation: false - Don't filter out speaker audio
        // - noiseSuppression: false - Capture low sounds
        // - autoGainControl: false - Don't auto-adjust volume
        // - sampleRate: 16000 - Good for speech recognition
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 16000,
            sampleSize: 16,
          }
        });
        deepgramAudioRef.current = stream;
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        const ws = new WebSocket(`${API_BASE_URL}/api/deepgram-ws?language=${encodeURIComponent(deepgramLanguage || 'multi')}&keyterms=${encodeURIComponent(deepgramKeyterms || '')}`);
        deepgramWsRef.current = ws;
        
        let deepgramReady$ = false;
        const pendingChunks$: any[] = [];
        
        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) {
            if (deepgramReady$ && ws.readyState === WebSocket.OPEN) {
              ws.send(ev.data);
            } else {
              pendingChunks$.push(ev.data);
            }
          }
        };
        
        ws.onopen = () => {
          mediaRecorder.start(100);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              deepgramReady$ = true;
              for (const chunk of pendingChunks$) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(chunk);
                }
              }
              pendingChunks$.length = 0;
            } else if (data.type === 'error') {
              console.error('Deepgram error:', data.message);
            } else if (data.channel) {
              const transcript = data.channel?.alternatives?.[0]?.transcript;
              if (transcript) {
                if (data.is_final) {
                  setCommittedText(prev => (prev + ' ' + transcript).trim());
                  setInterimText('');
                } else {
                  setInterimText(transcript);
                }
              }
            }
          } catch (e) {
            // Ignore
          }
        };
        
        ws.onclose = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        };
        
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start Deepgram:', e);
        setIsListening(false);
      }
    } else if (recognitionRef.current) {
      // Browser: Use Web Speech API (fallback/default)
      try { 
        recognitionRef.current.start();
        setIsListening(true);
        console.log('🎤 VOICE: Web Speech API (browser built-in)');
      } catch(e) {
        console.error('Failed to start recognition:', e);
        setIsListening(false);
        // Retry once after short delay
        setTimeout(() => {
          if (wantToListenRef.current) {
            try {
              recognitionRef.current?.start();
              setIsListening(true);
            } catch (retryErr) {
              console.error('Retry failed:', retryErr);
            }
          }
        }, 500);
      }
    } else {
      console.error('❌ No speech recognition available');
    }
  };
  
  // Update ref
  startListenRef.current = handleStartListen;

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
                const current = (() => { try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}'); } catch { return {}; } })();
                current.transcriptionSeconds = result.transcriptionSeconds;
                localStorage.setItem(LS_USER_KEY, JSON.stringify(current));
              }
            }).catch(err => console.error('Failed to add transcription time:', err));
          }
        }
      }

      if (isElectronRef.current && (deepgramWsRef.current || mediaRecorderRef.current || deepgramAudioRef.current || displayCaptureStreamRef.current || micCaptureStreamRef.current)) {
        const currentText = transcribedText.trim();
        setIsListening(false);

      // Stop MediaRecorder first to prevent any more audio chunks
      try {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        }
      } catch (e) {}
      mediaRecorderRef.current = null;
      
      // Send CloseStream signal, then close WebSocket
      try {
        if (deepgramWsRef.current && deepgramWsRef.current.readyState === WebSocket.OPEN) {
          deepgramWsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        deepgramWsRef.current?.close();
      } catch (e) {}
      deepgramWsRef.current = null;
      
      try {
        if (deepgramAudioRef.current) {
          deepgramAudioRef.current.getTracks().forEach((track: any) => track.stop());
        }
      } catch (e) {}
      deepgramAudioRef.current = null;

      try {
        displayCaptureStreamRef.current?.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      displayCaptureStreamRef.current = null;

      try {
        micCaptureStreamRef.current?.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      micCaptureStreamRef.current = null;

      try {
        deepgramMixAudioContextRef.current?.close();
      } catch (e) {}
      deepgramMixAudioContextRef.current = null;
      
      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      }
      
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      console.log('🎤 Stopped Deepgram speech recognition');
      
    } else if (isElectronRef.current) {
      // Electron: Stop Python Bridge
      ipcRendererRef.current?.send('python-stop-listen');
      
      const currentText = transcribedText.trim();
      setIsListening(false);
      
      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      }
      
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      console.log('🐍 Stopped Python speech recognition');
      
    } else if (!isElectronRef.current && deepgramWsRef.current) {
      // Browser: Stop Deepgram WebSocket
      const currentText = transcribedTextRef.current.trim();
      setIsListening(false);
      
      // Stop MediaRecorder first to prevent any more audio chunks
      try {
        const mr = mediaRecorderRef.current as unknown as MediaRecorder;
        if (mr && mr.state !== 'inactive') {
          mr.ondataavailable = null;
          mr.onstop = null;
          mr.stop();
        }
      } catch (e) {}
      mediaRecorderRef.current = null;
      
      // Send CloseStream signal, then close WebSocket
      try {
        const ws = deepgramWsRef.current as unknown as WebSocket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        if (ws) {
          ws.close();
        }
      } catch (e) {}
      deepgramWsRef.current = null;
      
      // Stop audio stream
      try {
        if (deepgramAudioRef.current) {
          deepgramAudioRef.current.getTracks().forEach((track: any) => track.stop());
        }
      } catch (e) {}
      deepgramAudioRef.current = null;
      
      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      }
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      console.log('🎤 Stopped Deepgram speech recognition (browser)');
      
    } else if (recognitionRef.current) {
      // Browser: Stop Web Speech API and transfer text
      const currentText = transcribedTextRef.current.trim();
      setIsListening(false);

      if (currentText.length > 0) {
        setManualTextInput(prev => (prev + ' ' + currentText).trim());
      } else {
        console.log('⚠️ No speech detected, keeping existing text');
      }

      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      try { recognitionRef.current.abort(); } catch (e) { try { recognitionRef.current.stop(); } catch (e2) {} }
    }
  };
  
  // Update ref
  stopListenRef.current = handleStopListen;

  // Generate All Summaries
  const handleGenerateSummaries = async () => {
    setIsGeneratingSummaries(true);
    console.log('🤖 Starting summary generation for all fields...');

    try {
      let cvSummary = settings.cvSummary || '';
      let basePromptSummary = settings.basePromptSummary || '';
      let jobDescriptionSummary = settings.jobDescriptionSummary || '';
      let companyInfoSummary = settings.companyInfoSummary || '';

      // CV Summary
      if (resume?.content && resume.content.trim().length > 20) {
        console.log('🤖 Generating CV summary...');
        try {
          const response = await fetch(`${API_BASE_URL}/api/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cv',
              text: resume.content,
              apiProvider
            })
          });
          
          const data = await response.json();
          
          if (response.ok && data.success && data.summary) {
            cvSummary = data.summary;
            console.log('✅ CV summary generated');
          } else {
            console.error('❌ CV summary failed:', data.message || 'Unknown error');
            throw new Error(data.message || 'Failed to generate CV summary');
          }
        } catch (err: any) {
          console.error('❌ CV summary error:', err);
          throw err;
        }
      }

      // Base Prompt Summary
      if (basePrompt && basePrompt.trim().length > 50) {
        console.log('🤖 Generating Base Prompt summary...');
        try {
          const response = await fetch(`${API_BASE_URL}/api/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'basePrompt',
              text: basePrompt,
              apiProvider
            })
          });
          
          const data = await response.json();
          
          if (response.ok && data.success && data.summary) {
            basePromptSummary = data.summary;
            console.log('✅ Base Prompt summary generated');
          } else {
            console.error('❌ Base Prompt summary failed:', data.message || 'Unknown error');
            throw new Error(data.message || 'Failed to generate Base Prompt summary');
          }
        } catch (err: any) {
          console.error('❌ Base Prompt summary error:', err);
          throw err;
        }
      }

      // Job Description Summary
      if (jobDescription && jobDescription.trim().length > 20) {
        console.log('🤖 Generating JD summary...');
        try {
          const response = await fetch(`${API_BASE_URL}/api/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'jd',
              text: jobDescription,
              apiProvider
            })
          });
          
          const data = await response.json();
          
          if (response.ok && data.success && data.summary) {
            jobDescriptionSummary = data.summary;
            console.log('✅ JD summary generated');
          } else {
            console.error('❌ JD summary failed:', data.message || 'Unknown error');
            throw new Error(data.message || 'Failed to generate JD summary');
          }
        } catch (err: any) {
          console.error('❌ JD summary error:', err);
          throw err;
        }
      }

      // Company Info Summary
      if (companyInfo && companyInfo.trim().length > 20) {
        console.log('🤖 Generating Company Info summary...');
        try {
          const response = await fetch(`${API_BASE_URL}/api/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'company',
              text: companyInfo,
              apiProvider
            })
          });
          
          const data = await response.json();
          
          if (response.ok && data.success && data.summary) {
            companyInfoSummary = data.summary;
            console.log('✅ Company Info summary generated');
          } else {
            console.error('❌ Company Info summary failed:', data.message || 'Unknown error');
            throw new Error(data.message || 'Failed to generate Company Info summary');
          }
        } catch (err: any) {
          console.error('❌ Company Info summary error:', err);
          throw err;
        }
      }

      // Save all summaries to database and update state
      const updatedSettings = {
        basePrompt,
        responseLanguage: settings.responseLanguage || 'English',
        basePromptSummary,
        jobDescription,
        jobDescriptionSummary,
        companyInfo,
        companyInfoSummary,
        contextMessages,
        cvText: resume?.content || '',
        cvSummary
      };

      console.log('💾 Saving summaries to database...');
      const result = await authClient.updateSettings(user._id, updatedSettings);

      if (result && result.success) {
        console.log('✅ Summaries saved successfully!');
        
        // Update state immediately to refresh UI
        setSettings(prev => ({
          ...prev,
          ...updatedSettings
        }));

        // Update localStorage
        const updatedUser = { ...user, settings: { ...user.settings, ...updatedSettings } };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
        localStorage.setItem(LS_BASE_PROMPT_KEY, basePrompt);
        localStorage.setItem(LS_JD_KEY, jobDescription);
        localStorage.setItem(LS_COMPANY_INFO_KEY, companyInfo);
        localStorage.setItem('isa_cv_summary', cvSummary);
        localStorage.setItem('isa_base_prompt_summary', basePromptSummary);
        localStorage.setItem('isa_jd_summary', jobDescriptionSummary);
        localStorage.setItem('isa_company_info_summary', companyInfoSummary);
        localStorage.setItem('isa_response_language', settings.responseLanguage || 'English');

        // Notify overlay
        if (typeof window !== 'undefined' && (window as any).require) {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.send('notify-overlay-settings-changed');
        }

        setShowSettingsSaved(true);
        setTimeout(() => setShowSettingsSaved(false), 3000);
      } else {
        throw new Error('Failed to save summaries to database');
      }

    } catch (error: any) {
      console.error('❌ Summary generation error:', error);
      setApiError({
        title: 'Summarization Failed',
        message: error.message || 'Failed to generate summaries',
        details: 'Please check your API key and try again'
      });
    } finally {
      setIsGeneratingSummaries(false);
    }
  };

  // Get Answer
  const handleGetAnswer = async () => {
    // Use refs to get current values
    const currentIsListening = isListeningRef.current;
    const currentManualText = manualTextInputRef.current;
    const currentTranscribed = transcribedTextRef.current;
    const currentApiProvider = apiProviderRef.current;
    
    const questionToAnswer = (currentIsListening ? currentTranscribed : currentManualText).trim();

    if (currentIsListening) {
      wantToListenRef.current = false; // Stop auto-restart
      setIsListening(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }

    if (!questionToAnswer) {
      return;
    }

    // ==================== TOKEN CHECK & CONSUMPTION ====================
    // Check if user has enough tokens before generating answer
    // First check locally if user is admin (skip API call for admins)
    const isLocalAdmin = user.role === 'admin' || user.role === 'super-admin' || user.tokens === -1;
    
    if (!isLocalAdmin) {
      try {
        const tokenCheck = await tokensClient.checkTokens(user._id);
        
        console.log('🔍 Token check result:', tokenCheck);
        
        if (!tokenCheck.canSendMessage && !tokenCheck.isAdmin && !tokenCheck.hasUnlimitedTokens) {
          setShowOutOfTokensModal(true);
          console.log('❌ Out of tokens! Current:', tokenCheck.tokens);
          return;
        }
        
        console.log('✅ Token check passed. Tokens remaining:', tokenCheck.tokens, 'isAdmin:', tokenCheck.isAdmin);
      } catch (error) {
        console.error('❌ Failed to check tokens:', error);
        // Don't block the request if token check fails - fail open
      }
    } else {
      console.log('✅ Admin user detected - skipping token check');
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

      // Building prompt ...
      // Use base prompt summary if available, fallback to full base prompt
      let contextPrompt = settings.basePromptSummary && settings.basePromptSummary.trim() 
        ? settings.basePromptSummary 
        : basePrompt;
      
      // Inject response language into prompt
      const responseLanguage = settings.responseLanguage || 'English';
      contextPrompt = contextPrompt.replace(/\{LANGUAGE\}/g, responseLanguage);
      
      // Ensure language instruction is always present
      if (!contextPrompt.includes('Respond in')) {
        contextPrompt = `Respond in ${responseLanguage} Language.\n\n` + contextPrompt;
      }
      
      console.log('🌐 Response Language:', responseLanguage);
      
      console.log('🔍 Checking summaries availability:');
      console.log('  - Base Prompt Summary:', settings.basePromptSummary ? '✅ EXISTS (' + settings.basePromptSummary.length + ' chars)' : '❌ MISSING - Using full Base Prompt!');
      console.log('  - CV Summary:', settings.cvSummary ? '✅ EXISTS (' + settings.cvSummary.length + ' chars)' : '❌ MISSING - Using full CV!');
      console.log('  - JD Summary:', settings.jobDescriptionSummary ? '✅ EXISTS (' + settings.jobDescriptionSummary.length + ' chars)' : '❌ MISSING - Using full JD!');
      console.log('  - Company Summary:', settings.companyInfoSummary ? '✅ EXISTS (' + settings.companyInfoSummary.length + ' chars)' : '❌ MISSING - Using full text!');
      
      // Use summaries for fast responses (fallback to full text if summary not available)
      if (settings.cvSummary) {
        contextPrompt += `\n\nCandidate Resume Summary:\n${settings.cvSummary}`;
      } else if (resume) {
        contextPrompt += `\n\nCandidate Resume:\n${resume.content}`;
        console.warn('⚠️ WARNING: Using FULL CV text! Generate summary by clicking "Save Settings"');
      }
      
      if (settings.jobDescriptionSummary) {
        contextPrompt += `\n\nJob Description Summary:\n${settings.jobDescriptionSummary}`;
      } else if (jobDescription) {
        contextPrompt += `\n\nJob Description:\n${jobDescription}`;
        console.warn('⚠️ WARNING: Using FULL JD text! Generate summary by clicking "Save Settings"');
      }
      
      if (settings.companyInfoSummary) {
        contextPrompt += `\n\nCompany Information Summary:\n${settings.companyInfoSummary}`;
      } else if (companyInfo) {
        contextPrompt += `\n\nCompany Information:\n${companyInfo}`;
        console.warn('⚠️ WARNING: Using FULL company text! Generate summary by clicking "Save Settings"');
      }

      // Add keyword instructions to prompt (only for phonetic matching, not as context)
      const keywords = deepgramKeyterms || '';
      console.log('🔑 Keywords loaded:', keywords);
      const langDisplay = responseLanguage ? `${responseLanguage} Language` : 'your preferred language';
      const keywordNote = keywords.trim()
        ? `\n\n[KEYWORD MATCHING RULES:
- The user may mispronounce these keywords: ${keywords}
- If a word SOUNDS (when we speak that word) like one of these keywords, REPLACE ONLY that word with the correct keyword
- Example: "jantic" sounds like "agentic" → replace only "jantic" with "agentic"
- Example: "uberates" sounds like "Kubernetes" → replace only "uberates" with "Kubernetes"
- DO NOT replace or question the other words in the sentence

CONFIDENCE RULES:
- After replacing, answer CONFIDENTLY from the VERY FIRST sentence
- NEVER say: "I believe", "I assume", "You might be referring to", "However", "But I think", "If you meant"
- If you replaced a word, act as if the user said the correct word clearly
- Give direct answer immediately - no intro phrases like "Based on my knowledge"

Respond in ${langDisplay}.]`
        : `\n\n[CONFIDENCE RULES:
- Answer CONFIDENTLY from the FIRST sentence
- NEVER say: "I believe", "I assume", "You might be referring to", "However", "But I think", "If you meant"
- Give direct answer immediately - no intro phrases like "Based on my knowledge"

QUESTION_CLASSIFICATION:
- If the question is RELATED to previous topic (follow-up, clarification, deeper dive): Answer IN CONTEXT of previous discussion
- If the question is COMPLETELY NEW (different topic, no relation): Answer independently without referencing previous topic

Respond in ${langDisplay}.]`;
      console.log('📝 Keyword note:', keywordNote ? 'ADDED' : 'EMPTY');
      
      const fullPrompt = `${keywordNote}${contextPrompt}\n\nMeeting Question: "${questionToAnswer}"\n\nProvide a professional answer.`;

      console.log('📊 Context Prompt Stats:');
      console.log('  - Base Prompt:', basePrompt.length, 'chars');
      console.log('  - Context Added:', (contextPrompt.length - basePrompt.length), 'chars');
      console.log('  - Total Prompt:', fullPrompt.length, 'chars');
      console.log('  - Estimated Tokens:', Math.ceil(fullPrompt.length / 4));
      console.log('🤖 Using API provider:', apiProvider);
      console.log(' Chat history length:', chatHistory.length);
      console.log('🎯 Context messages limit:', contextMessages, 'pairs (', contextMessages * 2, 'messages)');

      let streamedText = '';
      let formatStripped = false;

      // Apply sliding window: keep only recent context
      const maxMessages = contextMessages * 2; // Each Q&A pair = 2 messages
      const recentHistory = chatHistory.length > maxMessages
        ? chatHistory.slice(-maxMessages)
        : chatHistory;
      
      console.log('✂️ Using', recentHistory.length, 'messages from history (trimmed from', chatHistory.length, ')');

      // Prepare messages in universal OpenAI format (backend converts for Gemini if needed)
      let apiMessages: any[] = [];

      apiMessages = recentHistory.map((msg: any) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.parts?.[0]?.text || msg.content || ''
      }));

      // Inject context instruction into the question so the AI sees it right with the prompt
      let promptWithContext = fullPrompt;
      if (recentHistory.length > 0) {
        promptWithContext = `[CONTEXT NOTE]\nThe conversation history above is provided for reference.\n- If the user's new question relates to the previous discussion (follow-up, clarification, deeper dive on same topic), answer IN CONTEXT of that history.\n- If it's a completely new/unrelated topic, answer independently WITHOUT referencing the history.\n\n${fullPrompt}`;
      }

      apiMessages.push({ role: 'user', content: promptWithContext });

      // Use streaming endpoint
      console.log('📡 Starting streaming...');
      console.log('📡 Backend URL:', API_BASE_URL);
      console.log('📡 Provider:', apiProvider);
      const response = await fetch(`${API_BASE_URL}/api/generate-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages
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
              if (parsed.provider) {
                console.log('🔐 System AI chain provider:', parsed.provider, '/', parsed.model);
              }
              if (parsed.text) {
                streamedText += parsed.text;
                // Strip QUESTION:/ANSWER: prefixes that some AI models add
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
      console.log('✅ Streaming complete, total chars:', streamedText.length);

      // Save to history (Gemini format for storage)
      // Only store the actual user question, NOT the full prompt
      const newUserMessage = { role: 'user', parts: [{ text: questionToAnswer }] };
      const newAIMessage = { role: 'model', parts: [{ text: streamedText }] };
      const updatedHistoryWithResponse = [...chatHistory, newUserMessage, newAIMessage];
      setChatHistory(updatedHistoryWithResponse);
      
      // Calculate the new pair index from the UPDATED history length
      const newPairIndex = Math.floor(updatedHistoryWithResponse.length / 2) - 1;
      setCurrentPairIndex(Math.max(0, newPairIndex));
      console.log('📍 Navigating to new pair index:', newPairIndex);

      // Save to MongoDB
      if (user._id) {
        try {
          await messagesClient.saveHistory(user._id, updatedHistoryWithResponse);
          console.log('✅ Chat history saved to MongoDB');
          
          // Notify overlay about chat history update (Electron only)
          if (typeof window !== 'undefined' && (window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('chat-history-updated', { userId: user._id, count: updatedHistoryWithResponse.length });
          }
          
          // ==================== CONSUME TOKEN AFTER SUCCESSFUL ANSWER ====================
          // Consume 1 token (1 question = 1 token)
          const consumeResult = await tokensClient.consumeTokens(user._id, 1);
          if (consumeResult.success) {
            console.log('✅ Token consumed! Remaining:', consumeResult.tokens);
            // Update user object with new token count
            const updatedUser = { ...user, tokens: consumeResult.tokens };
            localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
            // Update state to trigger UI refresh
            window.dispatchEvent(new CustomEvent('user-tokens-updated', { detail: { tokens: consumeResult.tokens } }));
          } else {
            console.warn('⚠️ Token consumption failed:', consumeResult.message);
          }
        } catch (error) {
          console.error('Failed to save chat history:', error);
        }
      }

    } catch (error: any) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Emergency stop pressed; keep whatever is already shown
        setAiResponse(prev => prev || 'Stopped.');
        return;
      }
      console.error('❌ AI Error:', error);
      
      // Parse and display user-friendly error
      const parsedError = parseApiError(error);
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
    setAiResponse(prev => prev || 'Stopped.');
  };

  // Clear
  const handleClear = async () => {
    // Only clear the question input field, keep Q&A history intact
    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    setManualTextInput('');
    console.log('🧹 Question field cleared (Q&A history preserved)');
  };

  // Shortcut Handlers
  const handleShortcutChange = (action: string, modifier: ModifierKey, key: string) => {
    // Validate
    const validation = isValidKeyCombination(modifier, key);
    if (!validation.valid) {
      setShortcutErrors({ ...shortcutErrors, [action]: validation.reason! });
      return;
    }

    // Check conflicts
    const conflict = hasConflict(shortcuts, modifier, key, action as ShortcutAction);
    if (conflict.conflict) {
      setShortcutErrors({ 
        ...shortcutErrors, 
        [action]: `Conflicts with ${conflict.conflictWith}` 
      });
      return;
    }

    // Clear error and update
    const newErrors = { ...shortcutErrors };
    delete newErrors[action];
    setShortcutErrors(newErrors);

    const newShortcuts = {
      ...shortcuts,
      [action]: { ...shortcuts[action], modifier, defaultKey: key }
    };
    setShortcuts(newShortcuts);
  };

  const handleSaveShortcuts = async () => {
    if (!user._id) return;

    try {
      const result = await authClient.updateShortcuts(user._id, shortcuts);
      if (result.success) {
        setShowShortcutsSuccess(true);
        setTimeout(() => setShowShortcutsSuccess(false), 3000);

        // Update user in localStorage
        const updatedUser = { ...user, shortcuts };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));

        // Dispatch event to update user in AppRouter
        window.dispatchEvent(new CustomEvent('user-shortcuts-updated', { detail: { shortcuts } }));

        // Re-register global shortcuts in Electron main process
        if (typeof window !== 'undefined' && (window as any).require) {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.invoke('update-global-shortcuts', shortcuts);
        }
      }
    } catch (error) {
      console.error('Failed to save shortcuts:', error);
    }
  };

  const handleResetShortcuts = () => {
    setShortcuts(getDefaultShortcuts());
    setShortcutErrors({});
  };

  // Launch Stealth PiP
  const launchStealthPip = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('launch-stealth-pip');
    }
  };

  // Handle New Session button click
  const handleNewSession = () => {
    if (onNewSession) {
      onNewSession();
    }
  };

  // Detect if running in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).require;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        
        {/* Centered Action Buttons (Electron only) */}
        {isElectron && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={launchStealthPip}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Open Overlay
            </button>
            <button
              onClick={handleNewSession}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all duration-200 shadow-md hover:shadow-lg"
            >
              New Session
            </button>
          </div>
        )}

        {/* Section 1: Voice Assist Configuration */}
        <div className="mb-6 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-4 sm:p-5 lg:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Voice Assist</h2>
            {typeof window !== 'undefined' && (window as any).require && (
              <button
                onClick={handleRefreshData}
                disabled={isRefreshing}
                title="Refresh data from database"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>

          {/* Language Selection (always visible) */}
          <div className="mt-6">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
              Transcription Language
            </label>
            <SearchableLanguageSelect
              value={deepgramLanguage}
              onChange={async (val) => {
                setDeepgramLanguage(val);
                // Save immediately and restart voice if listening
                try {
                  const langRes = await apiClient('/auth/deepgram-language', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user._id, deepgramLanguage: val })
                  });
                  if (langRes.ok) {
                    const updatedUser = { ...user, deepgramLanguage: val };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    // Notify overlay immediately
                    if (typeof window !== 'undefined' && (window as any).require) {
                      const { ipcRenderer } = (window as any).require('electron');
                      ipcRenderer.send('notify-overlay-settings-changed', { settings, deepgramLanguage: val, deepgramKeyterms });
                    }
                  }
                } catch (_) {}
                // Restart voice if currently listening
                if (isListeningRef.current) {
                  if (stopListenRef.current) stopListenRef.current();
                  setTimeout(() => {
                    if (startListenRef.current) startListenRef.current();
                  }, 500);
                }
              }}
              placeholder="Search language..."
              options={DEEPGRAM_LANGUAGES}
              selectOnly
            />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                {ENGLISH_LANG_CODES.includes(deepgramLanguage) 
                  ? '✓ Full features enabled (smart format, punctuation, diarization, dictation)'
                  : 'ℹ Basic features (some advanced features not available for this language)'}
              </p>
            </div>

          {/* Response Language */}
          <div className="mt-6">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
              Response Language
            </label>
            <SearchableLanguageSelect
              value={settings.responseLanguage || ''}
              onChange={(val) => setSettings(prev => ({ ...prev, responseLanguage: val }))}
              onBlur={async (val) => {
                if (!val || !val.trim()) return;
                try {
                  const res = await apiClient('/auth/settings', {
                    method: 'PUT',
                    body: JSON.stringify({ userId: user._id, settings: { ...settings, responseLanguage: val } })
                  });
                  if (res.ok) {
                    const updatedUser = { ...user, settings: { ...user.settings, responseLanguage: val } };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    localStorage.setItem('isa_response_language', val);
                    if (typeof window !== 'undefined' && (window as any).require) {
                      const { ipcRenderer } = (window as any).require('electron');
                      ipcRenderer.send('notify-overlay-settings-changed', { settings: { ...settings, responseLanguage: val }, deepgramLanguage, deepgramKeyterms });
                    }
                  } else {
                    const errBody = await res.json().catch(() => ({}));
                    console.error('❌ Response language save failed:', res.status, errBody);
                  }
                } catch (err) {
                  console.error('❌ Response language save error:', err);
                }
              }}
              placeholder="Search language..."
              selectOnly
            />
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
              Enter the language for AI responses (e.g. English, Spanish)
            </p>
          </div>

          {/* Important Keywords for Recognition (shown for both Deepgram and Default) */}
          {(voiceProvider === 'deepgram' || voiceProvider === 'default') && (
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
                Important Keywords (Optional)
              </label>
              <input
                type="text"
                value={deepgramKeyterms}
                onChange={(e) => setDeepgramKeyterms(e.target.value)}
                placeholder="django, fastapi, restful api, kubernetes, react"
                className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                Add comma-separated technical terms, names, or jargon for better recognition.
              </p>
            </div>
          )}

          {/* Single Save Button */}
          <div className="mt-8 flex items-center gap-4">
            <button
              onClick={async () => {
                try {
                  let allSuccess = true;

                  // Save transcription language
                  const langRes = await apiClient('/auth/deepgram-language', {
                    method: 'PUT',
                    body: JSON.stringify({ userId: user._id, deepgramLanguage })
                  });
                  const langResult = await langRes.json();
                  if (langRes.ok) {
                    const updatedUser = { ...user, deepgramLanguage };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                  } else {
                    allSuccess = false;
                    console.error('❌ Failed to save transcription language:', langResult);
                  }

                  // Save response language
                  const settingsRes = await apiClient('/auth/settings', {
                    method: 'PUT',
                    body: JSON.stringify({ userId: user._id, settings: { ...settings, responseLanguage: settings.responseLanguage } })
                  });
                  const settingsResult = await settingsRes.json();
                  if (settingsResult.success) {
                    const updatedUser = { ...user, settings: { ...user.settings, responseLanguage: settings.responseLanguage } };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    localStorage.setItem('isa_response_language', settings.responseLanguage);
                  } else {
                    allSuccess = false;
                    console.error('❌ Failed to save response language:', settingsResult);
                  }

                  // Save keywords
                  const keyRes = await apiClient('/auth/deepgram-keyterms', {
                    method: 'PUT',
                    body: JSON.stringify({ userId: user._id, deepgramKeyterms })
                  });
                  const keyResult = await keyRes.json();
                  if (keyRes.ok) {
                    const updatedUser = { ...user, deepgramKeyterms };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                  } else {
                    allSuccess = false;
                    console.error('❌ Failed to save keywords:', keyResult);
                  }

                  // Notify overlay and reinit voice provider
                  if (typeof window !== 'undefined' && (window as any).require) {
                    const { ipcRenderer } = (window as any).require('electron');
                    ipcRenderer.send('init-voice-provider', { voiceProvider, apiKey: user?.deepgramApiKey || '', language: deepgramLanguage, keyterms: deepgramKeyterms });
                    ipcRenderer.send('notify-overlay-settings-changed', { settings: { ...settings, responseLanguage: settings.responseLanguage }, deepgramLanguage, deepgramKeyterms });
                  } else if (isListeningRef.current) {
                    // Vite/web: restart voice with new settings
                    if (stopListenRef.current) stopListenRef.current();
                    setTimeout(() => {
                      if (startListenRef.current) startListenRef.current();
                    }, 500);
                  }

                  if (allSuccess) {
                    setShowVoiceSuccess(true);
                    setTimeout(() => setShowVoiceSuccess(false), 3000);
                  }
                } catch (error) {
                  console.error('Failed to save audio settings:', error);
                }
              }}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
            >
              Save Audio Settings
            </button>

            {/* Status Messages */}
            {showVoiceSuccess && (
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 rounded-xl text-sm font-semibold">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Audio Settings Saved
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Meeting Context (2-Column Layout) */}
        <div className="mb-6 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-4 sm:p-5 lg:p-6">
          <div className="mb-6">
            <h2 className="text-base font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">Meeting Context</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">Provide information for personalized AI responses</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Input Fields */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase">Input Fields</h3>
              
              {/* CV Upload */}
              <CollapsibleSection
                title="Resume / CV"
                isOptional={true}
                isFilled={!!(resume?.content && resume.content.trim().length > 0)}
                isProcessed={!!(settings.cvSummary && settings.cvSummary.trim().length > 0)}
                defaultOpen={false}
              >
            <ResumeManager onDataParsed={setResume} currentResume={resume} />
              </CollapsibleSection>

              {/* Base Prompt */}
              <CollapsibleSection
                title="Base Prompt"
                isOptional={false}
                isFilled={!!(basePrompt && basePrompt.trim().length > 50)}
                isProcessed={!!(settings.basePromptSummary && settings.basePromptSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  placeholder="Enter your base system prompt..."
                  minHeight="100px"
                  maxHeight="400px"
                />
              </CollapsibleSection>

              {/* Job Description */}
              <CollapsibleSection
                title="Job Description"
                isOptional={true}
                isFilled={!!(jobDescription && jobDescription.trim().length > 20)}
                isProcessed={!!(settings.jobDescriptionSummary && settings.jobDescriptionSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  onBlur={() => {
                    // Auto-save on blur
                    if (user._id) {
                      apiClient('/auth/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ userId: user._id, settings: { jobDescription } })
                      }).catch(err => console.error('Failed to save JD:', err));
                    }
                  }}
                  placeholder="Paste the job description here..."
                  minHeight="120px"
                  maxHeight="400px"
                />
              </CollapsibleSection>

              {/* Company Info */}
              <CollapsibleSection
                title="Company Information"
                isOptional={true}
                isFilled={!!(companyInfo && companyInfo.trim().length > 20)}
                isProcessed={!!(settings.companyInfoSummary && settings.companyInfoSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={companyInfo}
                  onChange={(e) => setCompanyInfo(e.target.value)}
                  onBlur={() => {
                    // Auto-save on blur
                    if (user._id) {
                      apiClient('/auth/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ userId: user._id, settings: { companyInfo } })
                      }).catch(err => console.error('Failed to save Company Info:', err));
                    }
                  }}
                  placeholder="Add company details..."
                  minHeight="120px"
                  maxHeight="400px"
                />
              </CollapsibleSection>
            </div>

            {/* Right Column: AI Summaries */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase">AI Summaries (Used in Prompts)</h3>
              
              {/* CV Summary */}
              <CollapsibleSection
                title="CV Summary"
                isOptional={true}
                isFilled={false}
                isProcessed={!!(settings.cvSummary && settings.cvSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={settings.cvSummary || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, cvSummary: e.target.value }))}
                  placeholder="Paste or edit your CV summary here..."
                  minHeight="100px"
                  maxHeight="500px"
                />
              </CollapsibleSection>

              {/* Base Prompt Summary */}
              <CollapsibleSection
                title="Base Prompt Summary"
                isOptional={false}
                isFilled={false}
                isProcessed={!!(settings.basePromptSummary && settings.basePromptSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={settings.basePromptSummary || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, basePromptSummary: e.target.value }))}
                  placeholder="Paste or edit your Base Prompt summary here..."
                  minHeight="100px"
                  maxHeight="500px"
                />
              </CollapsibleSection>

              {/* Job Description Summary */}
              <CollapsibleSection
                title="JD Summary"
                isOptional={true}
                isFilled={false}
                isProcessed={!!(settings.jobDescriptionSummary && settings.jobDescriptionSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={settings.jobDescriptionSummary || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, jobDescriptionSummary: e.target.value }))}
                  placeholder="Paste or edit your JD summary here..."
                  minHeight="100px"
                  maxHeight="500px"
                />
              </CollapsibleSection>

              {/* Company Info Summary */}
              <CollapsibleSection
                title="Company Summary"
                isOptional={true}
                isFilled={false}
                isProcessed={!!(settings.companyInfoSummary && settings.companyInfoSummary.trim().length > 0)}
                defaultOpen={false}
              >
                <AutoExpandTextarea
                  value={settings.companyInfoSummary || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, companyInfoSummary: e.target.value }))}
                  placeholder="Paste or edit your Company summary here..."
                  minHeight="100px"
                  maxHeight="500px"
                />
              </CollapsibleSection>
                  </div>
          </div>

          {/* Generate Summaries Button + Manual Save */}
          <div className="mt-6 bg-slate-50/80 dark:bg-slate-800/30 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700/50 p-4 sm:p-5 space-y-3">
                  <button 
              onClick={handleGenerateSummaries}
              disabled={isGeneratingSummaries}
              className={`w-full px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${
                isGeneratingSummaries 
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30'
              }`}
            >
              {isGeneratingSummaries ? (
                <span className="flex items-center justify-center gap-2.5">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Summarizing...
                </span>
              ) : (
                'Generate AI Summaries'
              )}
                  </button>
            
            {showSettingsSaved && (
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 rounded-xl text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Summaries Generated & Saved
              </div>
            )}

            <div className="pt-1">
                  <button 
                onClick={handleSaveManualSummaries}
                className="w-full px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500/50"
                  >
                Save Edited Summaries
                  </button>
              {showManualSummarySaved && (
                <div className="mt-2 text-center text-emerald-500 dark:text-emerald-400 text-xs font-semibold">Summaries saved</div>
              )}
                </div>
              </div>
            </div>

        {/* Section 3: Context Messages */}
        <div className="mb-6 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-4 sm:p-5 lg:p-6">
          <div className="mb-6">
            <h2 className="text-base font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">Context Configuration</h2>
            <p className="text-xs text-slate-500 dark:text-slate-500">Control how much conversation history the AI receives</p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Q&A Pairs:</label>
              <input
                type="number"
                min="1"
                max="50"
                value={contextMessages}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 10;
                  setContextMessages(Math.max(1, Math.min(50, val)));
                }}
                className="w-20 px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-black dark:text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
              />
              <span className="text-xs text-slate-500 dark:text-slate-500 hidden xs:inline">(= {contextMessages * 2} messages total)</span>
                </div>

            <div className="p-4 bg-blue-50/50 dark:bg-blue-500/5 rounded-xl border border-blue-100 dark:border-blue-500/10">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <strong>Recommended:</strong> 5-10 for quick meetings, 15-20 for deep technical discussions
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                Lower = Faster responses &bull; Higher = More context & continuity
              </p>
            </div>
            
            <button
              onClick={async () => {
                try {
                  const updatedSettings = { ...settings, contextMessages };
                  console.log('💾 Saving context messages:', contextMessages);
                  const result = await authClient.updateSettings(user._id, updatedSettings);
                  if (result && result.success) {
                    console.log('✅ Context settings saved to DB');
                    setSettings(updatedSettings);
                    const updatedUser = { ...user, settings: { ...user.settings, contextMessages } };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    setShowContextSaved(true);
                    setTimeout(() => setShowContextSaved(false), 3000);
                  } else {
                    throw new Error('Failed to save to database');
                  }
                } catch (error: any) {
                  console.error('❌ Context save error:', error);
                  setApiError({ title: 'Save Failed', message: error.message || 'Failed to save context settings', details: 'Please try again' });
                }
              }}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg"
            >
              Save Context Settings
                  </button>

            {showContextSaved && (
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 rounded-xl text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                Context Settings Saved
                  </div>
            )}
                </div>
                      </div>

        {/* Section 4: Shortcuts (Electron Only) */}
        {isElectron && (
        <div className="mb-6 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-4 sm:p-5 lg:p-6">
          <div className="flex items-center justify-between mb-6">
                  <div>
              <h2 className="text-base font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-1">Keyboard Shortcuts</h2>
              <p className="text-xs text-slate-500 dark:text-slate-500">OS: <strong className="text-blue-600 dark:text-blue-400">{detectOS().toUpperCase()}</strong></p>
                      </div>
                  <button 
              onClick={handleResetShortcuts}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-xs font-bold rounded-xl transition-all"
                  >
              Reset Defaults
                  </button>
                    </div>
                
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(shortcuts)
              .filter(([action]) => ['toggleOverlay', 'toggleListen', 'analyzeScreen', 'getAnswer', 'focusInput', 'toggleBrowseAI', 'clearQuestion'].includes(action))
              .map(([action, config]: [string, any]) => (
              <ShortcutRecorder
                key={action}
                label={config.label}
                modifier={config.modifier}
                currentKey={config.defaultKey}
                onModifierChange={(mod) => handleShortcutChange(action, mod, config.defaultKey)}
                onKeyChange={(key) => handleShortcutChange(action, config.modifier, key)}
                error={shortcutErrors[action]}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Tip: Click a key field to record a new shortcut
            </p>
                  <button 
              onClick={handleSaveShortcuts}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-sm"
                  >
              Save Shortcuts
                  </button>
                       </div>

          {showShortcutsSuccess && (
            <div className="mt-4 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 rounded-xl text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Shortcuts Saved
                    </div>
                  )}
                </div>
              )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-500 uppercase tracking-widest">{APP_CONFIG.NAME} • Ready for Action</p>
        </footer>
            </div>
            
      {/* Live Transcription & Response */}
      <div className="space-y-4">
            {/* Transcription Box */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-3 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Ask a Question</h3>
                  {isListening && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">REC</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleStopResponse}
                    disabled={!isGenerating}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                      isGenerating 
                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Stop
                    {isGenerating && shortcuts?.stopGeneration && <span className="ml-1 opacity-60">{formatShortcut(shortcuts.stopGeneration)}</span>}
                  </button>
                  <button 
                    onClick={handleClear} 
                    className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white"
                  >
                    Clear
                  </button>
                </div>
            </div>
            
{/* Search Bar + Buttons (Overlay-style layout) */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="w-full relative">
                  <textarea
                    ref={questionInputRef}
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
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
                        e.preventDefault();
                        setManualTextInput('');
                        setTranscribedText('');
                        setCommittedText('');
                        setInterimText('');
                      }
                      else if (e.key === 'Enter' && !e.shiftKey && !isListening) {
                        e.preventDefault();
                        if (!isGenerating && manualTextInput.trim()) {
                          e.currentTarget.blur();
                          handleGetAnswer();
                        }
                      }
                    }}
                    rows={1}
                    className={`w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-2xl px-3 py-2 text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none overflow-y-auto min-h-[40px] max-h-[40vh] placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all [&::-webkit-scrollbar]:hidden [scrollbar-width:none] ${
                      isListening ? 'ring-2 ring-red-500/30' : ''
                    }`}
                    style={{ lineHeight: '1.5' }}
                  />
                </div>

                <div className="flex flex-col sm:flex-col gap-2">
                  <button 
                    onClick={isListening ? handleStopListen : handleStartListen}
                    disabled={isGenerating}
                    className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 backdrop-blur-sm border shadow-lg ${
                      isListening
                        ? 'bg-red-600 hover:bg-red-700 text-white border-red-400/50 shadow-red-500/50'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-green-400/50 shadow-green-500/50'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <span>{isListening ? 'Stop' : 'Listen'}</span>
                    {shortcuts?.toggleListen && <span className="ml-1.5 text-[10px] opacity-70">{formatShortcut(shortcuts.toggleListen)}</span>}
                  </button>
                  
                  <button 
                    onClick={() => {
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                      handleGetAnswer();
                    }}
                    disabled={isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())}
                    className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 backdrop-blur-sm border shadow-lg bg-blue-600 hover:bg-blue-700 text-white border-blue-400/50 shadow-blue-500/50 ${
                      isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    <span>{isGenerating ? 'Generating...' : 'Get Answer'}</span>
                    {!isGenerating && shortcuts?.getAnswer && <span className="ml-1.5 text-[10px] opacity-70">{formatShortcut(shortcuts.getAnswer)}</span>}
                  </button>

                  {/* Transcription time remaining indicator */}
                  {(() => {
                    try {
                      const _u = JSON.parse(localStorage.getItem('isa_current_user') || '{}');
                      const _isAdmin = _u.role === 'admin' || _u.role === 'super-admin' || _u.tokens === -1;
                      if (_isAdmin) return null;
                    } catch {}
                    const mins = Math.floor(transcriptionSecondsRemaining / 60);
                    const secs = transcriptionSecondsRemaining % 60;
                    const usedMins = 25 - mins;
                    const pct = (usedMins / 25) * 100;
                    return (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 whitespace-nowrap">
                        <span>🎤</span>
                        <div className="w-14 h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{ width: `${Math.max(0, 100 - pct)}%` }} />
                        </div>
                        <span className="font-mono text-slate-400">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} / 25:00</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
                </div>

            {/* AI Response */}
            <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none p-3 sm:p-5 min-h-[180px] md:min-h-[250px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  {qaPairs.length > 0 ? `Q&A (${currentPairIndex + 1}/${qaPairs.length})` : 'AI Response'}
                </h3>
                
                {/* Navigation Arrows */}
                {qaPairs.length > 1 && (
                  <div className="flex items-center gap-2">
                  <button 
                      onClick={() => setCurrentPairIndex(Math.max(0, currentPairIndex - 1))}
                      disabled={currentPairIndex === 0}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                        currentPairIndex === 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                      }`}
                      title="Previous Q&A"
                    >
                      ← Prev
                  </button>
                  <button 
                      onClick={() => setCurrentPairIndex(Math.min(qaPairs.length - 1, currentPairIndex + 1))}
                      disabled={currentPairIndex === qaPairs.length - 1}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        currentPairIndex === qaPairs.length - 1
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      title="Next Q&A"
                    >
                      Next →
                  </button>
            </div>
                )}
          </div>

              {isGenerating && aiResponse ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-blue-200 dark:border-blue-900/30 rounded-xl p-5">
                    <div className="flex items-center gap-2 text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-3">
                      <div className="w-2.5 h-2.5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                      Generating...
                    </div>
                    <div className="markdown-content text-black dark:text-white text-sm leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4 text-black dark:text-white" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                          p: ({node, ...props}) => <p className="mb-3 text-slate-800 dark:text-gray-100" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                          li: ({node, ...props}) => <li className="ml-2 text-slate-800 dark:text-gray-100" {...props} />,
                          code: CodeBlock,
                          pre: ({node, ...props}) => <pre className="my-3" {...props} />,
                          a: ({node, ...props}) => <a className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-black dark:text-white" {...props} />,
                          em: ({node, ...props}) => <em className="italic text-slate-700 dark:text-gray-200" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-slate-300 dark:border-slate-700 pl-4 my-3 text-slate-600 dark:text-gray-300 italic" {...props} />,
                          hr: ({node, ...props}) => <hr className="my-4 border-slate-300 dark:border-slate-700" {...props} />,
                        }}
                      >
                        {aiResponse}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="flex items-center gap-3 py-8 justify-center text-slate-500 dark:text-slate-500">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-semibold">Generating response...</span>
                </div>
              ) : qaPairs.length > 0 && qaPairs[currentPairIndex] ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-wider mb-2">Question</div>
                    <div className="text-black dark:text-white font-semibold text-sm leading-relaxed">
                      {qaPairs[currentPairIndex].question}
                </div>
            </div>
            
                  {/* Answer Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-5">
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-500 font-bold uppercase tracking-wider mb-2">Answer</div>
                    <div className="markdown-content text-black dark:text-white text-sm leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4 text-black dark:text-white" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                          p: ({node, ...props}) => <p className="mb-3 text-slate-800 dark:text-gray-100" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                          li: ({node, ...props}) => <li className="ml-2 text-slate-800 dark:text-gray-100" {...props} />,
                          code: CodeBlock,
                          pre: ({node, ...props}) => <pre className="my-3" {...props} />,
                          a: ({node, ...props}) => <a className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-black dark:text-white" {...props} />,
                          em: ({node, ...props}) => <em className="italic text-slate-700 dark:text-gray-200" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-slate-300 dark:border-slate-700 pl-4 my-3 text-slate-600 dark:text-gray-300 italic" {...props} />,
                          hr: ({node, ...props}) => <hr className="my-4 border-slate-300 dark:border-slate-700" {...props} />,
                        }}
                      >
                        {qaPairs[currentPairIndex].answer}
                      </ReactMarkdown>
            </div>
            </div>
                  </div>
              ) : aiResponse ? (
                <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-5 markdown-content text-black dark:text-white text-sm leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4 text-black dark:text-white" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3 text-black dark:text-white" {...props} />,
                      p: ({node, ...props}) => <p className="mb-3 text-slate-800 dark:text-gray-100" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-slate-800 dark:text-gray-100" {...props} />,
                      li: ({node, ...props}) => <li className="ml-2 text-slate-800 dark:text-gray-100" {...props} />,
                      code: CodeBlock,
                      pre: ({node, ...props}) => <pre className="my-3" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-black dark:text-white" {...props} />,
                      em: ({node, ...props}) => <em className="italic text-slate-700 dark:text-gray-200" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-slate-300 dark:border-slate-700 pl-4 my-3 text-slate-600 dark:text-gray-300 italic" {...props} />,
                      hr: ({node, ...props}) => <hr className="my-4 border-slate-300 dark:border-slate-700" {...props} />,
                    }}
                  >
                    {aiResponse}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-600">
                  <div className="text-center">
                    <div className="text-3xl mb-3">💬</div>
                    <p className="text-sm font-medium">AI response will appear here</p>
                    <p className="text-xs mt-1">Type a question and click Get Answer</p>
                  </div>
                </div>
              )}
                      </div>
      </div>
            
      {/* API Error Modal */}
      {apiError && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onClick={() => setApiError(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-red-300 dark:border-red-500/60 rounded-lg px-4 py-3 w-full max-w-[90vw] sm:max-w-[320px] shadow-lg shadow-red-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-red-600 dark:text-red-400 text-lg">⚠️</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {apiError.title || 'API Error'}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                  {apiError.message || 'Rate Limit Exceeded'}
                </div>
                {apiError.details && (
                  <div className="text-xs text-slate-400 mt-2">
                    {apiError.details}
                  </div>
                )}
              </div>
              <button
                onClick={() => setApiError(null)}
                className="text-slate-400 hover:text-white text-sm p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Out of Credits Modal */}
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
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            You've used all <strong className="text-white">10 free credits</strong>.
          </p>
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            <strong className="text-amber-400 dark:text-amber-400">Upgrade to Pro</strong> to get unlimited credits and unlock premium features!
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

export default App;
