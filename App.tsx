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
import { 
  getDefaultShortcuts, 
  ShortcutsState, 
  formatShortcut,
  isValidKeyCombination,
  hasConflict,
  ModifierKey,
  ShortcutAction,
  detectOS
} from './src/utils/shortcutsManager';
import ShortcutRecorder from './components/ShortcutRecorder';

// API Base URL from environment
// Use env var - set by Vite at build time based on mode
const isDev = import.meta.env.DEV;
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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

TOP PRIORITIES:
Respond in {LANGUAGE} Language.
 
CONTEXT RULES:
1. Document = single source of truth
- Use ONLY mentioned skills, experience, projects, education
- NEVER invent, exaggerate, or assume
2. Description provided = align answers directly to it
3. Info provided = tailor responses accordingly
4. No context = use best practices

ANSWER STRUCTURE:
- Professional, confident tone

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
- Treat it as possible phonetic error from speech-to-text
- Infer the most likely correct technical term
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

CODING/TECHNICAL QUESTIONS:
- Provide correct, clean code or technical explanation
- Keep minimal but complete
- Explain approach if necessary

EXAMPLES:
- Give examples ONLY when improve clarity

BEHAVIOR:
- This is a LIVE conversation
- If unclear, infer intent and answer directly
- Never mention you are AI

OUTPUT:
- No emojis
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
  console.log('🔑 User API keys:', user?.apiKeys);
  console.log('🎯 Selected provider:', user?.selectedProvider);
  console.log('🎤 Deepgram API key:', user?.deepgramApiKey);
  console.log('🎙️ Voice provider:', user?.voiceProvider);
  
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
    responseLanguage: user.settings?.responseLanguage || 'English',
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
  const [apiKeys, setApiKeys] = useState({
    gemini: user.apiKeys?.gemini || '',
    openai: user.apiKeys?.openai || '',
    claude: user.apiKeys?.claude || '',
    groq: user.apiKeys?.groq || ''
  });
  
  console.log('💾 Initial apiKeys state:', apiKeys);
  const [tempApiKey, setTempApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSuccess, setShowApiSuccess] = useState(false);
  
  // Voice Provider State - initialize from user prop OR localStorage fallback
  const getInitialDeepgramKey = () => {
    if (user?.deepgramApiKey) return user.deepgramApiKey;
    try {
      const saved = localStorage.getItem(LS_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.deepgramApiKey || '';
      }
    } catch (e) {}
    return '';
  };
  const getInitialVoiceProvider = () => {
    if (user?.voiceProvider) return user.voiceProvider;
    try {
      const saved = localStorage.getItem(LS_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.voiceProvider || 'default';
      }
    } catch (e) {}
    return 'default';
  };
  const [voiceProvider, setVoiceProvider] = useState<'default' | 'deepgram'>(getInitialVoiceProvider());
  const [deepgramApiKey, setDeepgramApiKey] = useState(getInitialDeepgramKey());
  const [tempDeepgramKey, setTempDeepgramKey] = useState(getInitialDeepgramKey());
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);
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
  const [shortcuts, setShortcuts] = useState<ShortcutsState>(getDefaultShortcuts());
  const [shortcutErrors, setShortcutErrors] = useState<{[key: string]: string}>({});
  const [showShortcutsSuccess, setShowShortcutsSuccess] = useState(false);
  const [isApiConfigured, setIsApiConfigured] = useState(false);

  // Sync Deepgram key, voice provider, and language when user data refreshes from backend
  useEffect(() => {
    const key = user?.deepgramApiKey || '';
    const provider = user?.voiceProvider || 'default';
    const lang = user?.deepgramLanguage || 'multi';
    const keyterms = user?.deepgramKeyterms || '';
    
    // Always sync from user prop - this catches the background fetch update
    if (key) {
      setDeepgramApiKey(key);
      setTempDeepgramKey(key);
    }
    setVoiceProvider(provider as 'default' | 'deepgram');
    setDeepgramLanguage(lang);
    setDeepgramKeyterms(keyterms);
  }, [user, user?.deepgramApiKey, user?.voiceProvider, user?.deepgramLanguage, user?.deepgramKeyterms]); // Re-run when user changes
  const [apiError, setApiError] = useState<{title: string, message: string, details?: string} | null>(null);

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

  // Sync API keys when user data updates (from MongoDB)
  useEffect(() => {
    console.log('🔄 Syncing API keys from user prop:', user?.apiKeys);
    if (user?.apiKeys) {
      const updatedKeys = {
        gemini: user.apiKeys.gemini || '',
        openai: user.apiKeys.openai || '',
        claude: user.apiKeys.claude || '',
        groq: user.apiKeys.groq || ''
      };
      console.log('✨ Setting apiKeys to:', updatedKeys);
      setApiKeys(updatedKeys);
    }
    if (user?.selectedProvider) {
      console.log('📡 Setting provider to:', user.selectedProvider);
      setApiProvider(user.selectedProvider);
      setIsApiConfigured(true);
    }
    if (user?.shortcuts) {
      setShortcuts(user.shortcuts);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manually save edited summaries (user-provided)
  const handleSaveManualSummaries = async () => {
    try {
      const updatedSettings = {
        basePrompt,
        responseLanguage: settings.responseLanguage || 'English',
        basePromptSummary: settings.basePromptSummary || '',
        jobDescription,
        jobDescriptionSummary: settings.jobDescriptionSummary || '',
        companyInfo,
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

  // Keyboard navigation for Q&A pairs and Shift toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift key - Toggle focus on input field
      if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement?.tagName === 'INPUT' || 
                               activeElement?.tagName === 'TEXTAREA';
        
        if (isInputFocused) {
          // If focused, blur it (unfocus)
          (activeElement as HTMLElement).blur();
          console.log('⌨️ Shift pressed - Unfocusing input field (for arrow navigation)');
      } else {
          // If not focused, focus it - find the question input
          const questionInput = document.querySelector('textarea[placeholder*="question"]') as HTMLElement;
          if (questionInput) {
            questionInput.focus();
            console.log('⌨️ Shift pressed - Focusing input field');
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

  // Global Ctrl+Enter shortcut for Get Answer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only trigger if Ctrl+Enter is pressed
      if (e.ctrlKey && e.key === 'Enter') {
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

  // Global Ctrl+Backspace (Clear) and ESC shortcuts
  useEffect(() => {
    console.log('🎯 Setting up keyboard shortcuts in App.tsx');
    console.log('🔍 startListenRef.current:', startListenRef.current);
    console.log('🔍 stopListenRef.current:', stopListenRef.current);
    
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Ctrl+\ - Start/Stop Listen (local shortcut)
      // Check multiple conditions for backslash (works across different keyboards)
      const isBackslash = e.code === 'Backslash' || 
                          e.key === '\\' || 
                          e.keyCode === 220 ||
                          e.which === 220;
      
      if (e.ctrlKey && isBackslash) {
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
      if (e.ctrlKey && e.key === 'Backspace') {
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

  // Handle user-defined shortcuts
  useEffect(() => {
    const handleShortcutKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const pressedKey = e.key.toLowerCase();
      const hasCtrl = e.ctrlKey || e.metaKey;
      const hasShift = e.shiftKey;
      const hasAlt = e.altKey;
      
      for (const [action, config] of Object.entries(shortcuts)) {
        const mod = config.modifier.toLowerCase();
        const configKey = config.key.toLowerCase();
        
        const modMatch = 
          (mod === 'control' && hasCtrl) ||
          (mod === 'meta' && (e.metaKey || hasCtrl)) ||
          (mod === 'alt' && hasAlt) ||
          (mod === 'shift' && hasShift);
        
        if (modMatch && pressedKey === configKey && !hasAlt) {
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
            case 'focusInput':
              const input = document.querySelector('textarea[placeholder*="question"]') as HTMLTextAreaElement;
              if (input) input.focus();
              break;
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

  // Initialize API key from current provider
  useEffect(() => {
    setTempApiKey(apiKeys[apiProvider] || '');
  }, [apiProvider]);

  // Initialize Deepgram key when voice provider changes
  useEffect(() => {
    if (voiceProvider === 'deepgram') {
      // Populate with saved key (from state or localStorage)
      const savedKey = deepgramApiKey || (() => {
        try {
          const u = JSON.parse(localStorage.getItem(LS_USER_KEY) || '{}');
          return u?.deepgramApiKey || '';
        } catch { return ''; }
      })();
      setTempDeepgramKey(savedKey);
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
    localStorage.setItem('isa_api_keys', JSON.stringify(apiKeys));
    localStorage.setItem('isa_api_provider', apiProvider);
  }, [apiKeys, apiProvider]);

  // Persistence hooks
  useEffect(() => {
    if (showApiSuccess) {
      const timer = setTimeout(() => setShowApiSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showApiSuccess]);

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
  const audioChunksRef = useRef<Blob[]>([]);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  
  // Refs for current state values (to avoid stale closures)
  const apiKeysRef = useRef(apiKeys);
  const apiProviderRef = useRef(apiProvider);
  const isListeningRef = useRef(isListening);
  const manualTextInputRef = useRef(manualTextInput);
  const transcribedTextRef = useRef(transcribedText);
  const isGeneratingRef = useRef(isGenerating);
  const triggerGetAnswerRef = useRef(0);
  
  useEffect(() => { apiKeysRef.current = apiKeys; }, [apiKeys]);
  useEffect(() => { apiProviderRef.current = apiProvider; }, [apiProvider]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { manualTextInputRef.current = manualTextInput; }, [manualTextInput]);
  useEffect(() => { transcribedTextRef.current = transcribedText; }, [transcribedText]);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);
  
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

  // Get current API key
  const apiKey = apiKeys[apiProvider] || '';

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
    localStorage.setItem('isa_api_keys', JSON.stringify(apiKeys));
    localStorage.setItem('isa_api_provider', apiProvider);
  }, [apiKeys, apiProvider]);

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
      console.log('🎤 [App] User voice provider:', user.voiceProvider);
      console.log('🎤 [App] Has Deepgram key:', !!user.deepgramApiKey);
      
      const voiceProvider = user.voiceProvider || 'default';
      const deepgramKey = user.deepgramApiKey || '';
      
      const dgLang = user.deepgramLanguage || 'multi';
      const dgKeyterms = user.deepgramKeyterms || '';
      ipcRenderer.send('init-voice-provider', {
        voiceProvider,
        apiKey: deepgramKey,
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
          alert(`Speech recognition error: ${message.message}`);
        } else if (message.type === 'fatal') {
          console.error('🎤 Voice fatal error:', message.message);
          alert(`Fatal error: ${message.message}`);
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
        
        // Show user-friendly alert
        alert(
          `⚠️ ${errorData.title}\n\n` +
          `${errorData.message}\n\n` +
          `Solutions:\n${errorData.solutions.join('\n')}\n\n` +
          `${errorData.autoSwitching ? 'Automatically switching to Python (DEFAULT) provider...' : ''}`
        );
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

      // Cleanup
      return () => {
        ipcRenderer.removeListener('python-speech', handlePythonSpeech);
        ipcRenderer.removeListener('deepgram-sox-error', handleDeepgramError);
        ipcRenderer.removeListener('chat-history-updated', handleChatHistoryUpdate);
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
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalText += event.results[i][0].transcript + ' ';
            }
          }
          
          if (finalText.trim()) {
            setTranscribedText(prev => prev + finalText);
          }
        };

        recognition.onend = () => {
          if (wantToListenRef.current) {
            setTimeout(() => {
              if (wantToListenRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch(e) {
                  console.error('Failed to restart:', e);
                }
              }
            }, 100);
          } else {
            setIsListening(false);
          }
        };

        recognition.onerror = (e: any) => {
          console.error('Speech error:', e.error);
          if (e.error === 'not-allowed') {
            alert('Microphone permission denied');
          }
          setIsListening(false);
          wantToListenRef.current = false;
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Start Listen
  const handleStartListen = async () => {
    setTranscribedText('');
    setCommittedText('');
    setInterimText('');
    setManualTextInput('');
    setAiResponse('');
    wantToListenRef.current = true;
    
    if (isElectronRef.current) {
      // Electron: Use Python Bridge
      ipcRendererRef.current?.send('python-start-listen');
      setIsListening(true);
      console.log('🎤 VOICE: Python Bridge (Deepgram via Python)');
      
} else if (voiceProvider === 'deepgram' && deepgramApiKey) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        deepgramAudioRef.current = stream;
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        const ws = new WebSocket(`${API_BASE_URL}/api/deepgram-ws?apiKey=${encodeURIComponent(deepgramApiKey)}&language=${encodeURIComponent(deepgramLanguage || 'en-US')}`);
        deepgramWsRef.current = ws;
        
        ws.onopen = () => {
          mediaRecorder.start(1000);
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              // Ready
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
      }
    } else {
      console.error('❌ No speech recognition available');
    }
  };
  
  // Update ref
  startListenRef.current = handleStartListen;

  const handleStopListen = () => {
    wantToListenRef.current = false;
    
    if (isElectronRef.current) {
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
      const currentText = transcribedText.trim();
      setIsListening(false);
      
      // Close the WebSocket gracefully
      try {
        if (deepgramWsRef.current.readyState === WebSocket.OPEN) {
          // Send close signal to Deepgram
          deepgramWsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        deepgramWsRef.current.close();
      } catch (e) {}
      deepgramWsRef.current = null;
      
      // Stop MediaRecorder
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {}
      mediaRecorderRef.current = null;
      
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
      const currentText = transcribedText;
      setIsListening(false);
      setManualTextInput(currentText);
      setTranscribedText('');
      setCommittedText('');
      setInterimText('');
      try { recognitionRef.current.stop(); } catch (e) {}
    }
  };
  
  // Update ref
  stopListenRef.current = handleStopListen;

  // Generate All Summaries
  const handleGenerateSummaries = async () => {
    setIsGeneratingSummaries(true);
    console.log('🤖 Starting summary generation for all fields...');

    try {
      const activeApiKey = apiKeys[apiProvider];
      if (!activeApiKey) {
        alert('⚠️ Please configure your API key before generating summaries.');
        setIsGeneratingSummaries(false);
      return;
    }

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
              apiProvider,
              apiKey: activeApiKey
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
              apiProvider,
              apiKey: activeApiKey
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
              apiProvider,
              apiKey: activeApiKey
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
              apiProvider,
              apiKey: activeApiKey
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
    const currentApiKeys = apiKeysRef.current;
    const currentApiProvider = apiProviderRef.current;
    
    const questionToAnswer = (currentIsListening ? currentTranscribed : currentManualText).trim();

    if (currentIsListening) {
      wantToListenRef.current = false; // Stop auto-restart
      setIsListening(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }

    // Get the active API key based on selected provider
    const activeApiKey = currentApiKeys[currentApiProvider];
    
    if (!questionToAnswer || !activeApiKey) {
      if (!activeApiKey) {
        // Custom message box instead of default alert
        const messageBox = document.createElement('div');
        messageBox.innerHTML = `
          <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: #1e293b; border: 2px solid #ef4444; border-radius: 16px; padding: 32px; max-width: 400px; box-shadow: 0 20px 60px rgba(239, 68, 68, 0.4);">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h3 style="color: #ef4444; font-size: 24px; font-weight: bold; margin-bottom: 8px;">API Key Not Configured</h3>
              </div>
              <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                Please configure your AI provider API key in the <strong style="color: white;">Advanced Settings</strong> section below to start getting answers.
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

    // ==================== TOKEN CHECK & CONSUMPTION ====================
    // Check if user has enough tokens before generating answer
    // First check locally if user is admin (skip API call for admins)
    const isLocalAdmin = user.role === 'admin' || user.tokens === -1;
    
    if (!isLocalAdmin) {
      try {
        const tokenCheck = await tokensClient.checkTokens(user._id);
        
        console.log('🔍 Token check result:', tokenCheck);
        
        if (!tokenCheck.canSendMessage && !tokenCheck.isAdmin && !tokenCheck.hasUnlimitedTokens) {
          // Show "Out of Tokens" modal
          const messageBox = document.createElement('div');
          messageBox.id = 'out-of-tokens-modal';
          messageBox.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999;">
              <div style="background: #1e293b; border: 2px solid #f59e0b; border-radius: 16px; padding: 32px; max-width: 450px; box-shadow: 0 20px 60px rgba(245, 158, 11, 0.4);">
                <div style="text-align: center; margin-bottom: 24px;">
                  <div style="font-size: 48px; margin-bottom: 16px;">🪙</div>
                  <h3 style="color: #f59e0b; font-size: 24px; font-weight: bold; margin-bottom: 8px;">Out of Tokens</h3>
                </div>
                <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                  You've used all <strong style="color: white;">10 free trial tokens</strong> (1 token = 1 question).
                  <br/><br/>
                  <strong style="color: #f59e0b;">Upgrade to Pro</strong> to get unlimited tokens and unlock premium features!
                </p>
                <button id="view-pricing-btn" style="width: 100%; background: #f59e0b; color: white; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: all 0.2s; margin-bottom: 8px;" onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
                  View Pricing
                </button>
                <button id="close-modal-btn" style="width: 100%; background: transparent; color: #94a3b8; padding: 8px; border: 1px solid #475569; border-radius: 8px; font-size: 14px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#64748b'" onmouseout="this.style.borderColor='#475569'">
                  Close
                </button>
              </div>
            </div>
          `;
          document.body.appendChild(messageBox);
          
          // Add event listeners
          document.getElementById('view-pricing-btn')?.addEventListener('click', () => {
            document.getElementById('out-of-tokens-modal')?.remove();
            window.location.href = '/pricing';
          });
          document.getElementById('close-modal-btn')?.addEventListener('click', () => {
            document.getElementById('out-of-tokens-modal')?.remove();
          });
          
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

      const fullPrompt = `${contextPrompt}\n\nInterview Question: "${questionToAnswer}"\n\nProvide a professional answer for this interview question.`;

      console.log('📊 Context Prompt Stats:');
      console.log('  - Base Prompt:', basePrompt.length, 'chars');
      console.log('  - Context Added:', (contextPrompt.length - basePrompt.length), 'chars');
      console.log('  - Total Prompt:', fullPrompt.length, 'chars');
      console.log('  - Estimated Tokens:', Math.ceil(fullPrompt.length / 4));
      console.log('🤖 Using API provider:', apiProvider);
      console.log('🔑 Using API key:', activeApiKey ? activeApiKey.substring(0, 10) + '...' : 'None');
      console.log('📜 Chat history length:', chatHistory.length);
      console.log('🎯 Context messages limit:', contextMessages, 'pairs (', contextMessages * 2, 'messages)');

      let streamedText = '';

      // Apply sliding window: keep only recent context
      const maxMessages = contextMessages * 2; // Each Q&A pair = 2 messages
      const recentHistory = chatHistory.length > maxMessages
        ? chatHistory.slice(-maxMessages)
        : chatHistory;
      
      console.log('✂️ Using', recentHistory.length, 'messages from history (trimmed from', chatHistory.length, ')');

      // Prepare messages based on provider format
      let apiMessages: any[] = [];
      
      if (apiProvider === 'gemini') {
        // Gemini format
        apiMessages = recentHistory.map((msg: any) => ({
          role: msg.role,
          parts: msg.parts || [{ text: msg.content || '' }]
        }));
        apiMessages.push({ role: 'user', parts: [{ text: fullPrompt }] });
      } else {
        // OpenAI/Claude/Groq format
        apiMessages = recentHistory.map((msg: any) => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.parts?.[0]?.text || msg.content || ''
        }));
        apiMessages.push({ role: 'user', content: fullPrompt });
      }

      // Use streaming endpoint
      console.log('📡 Starting streaming...');
      console.log('📡 Backend URL:', API_BASE_URL);
      console.log('📡 Provider:', apiProvider);
      const response = await fetch(`${API_BASE_URL}/api/generate-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          apiProvider,
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

      console.log('✅ Streaming complete, total chars:', streamedText.length);

      // Save to history (Gemini format for storage)
      const newUserMessage = { role: 'user', parts: [{ text: fullPrompt }] };
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
      [action]: { ...shortcuts[action], modifier, key }
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
        
        {/* Header with Action Buttons */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left: Title */}
          <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-black dark:text-white mb-2">Interview Stealth Assist</h1>
              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">Configure your AI interview assistant</p>
            </div>
            
            {/* Right: Stealth + New Session (Electron only) */}
            {isElectron && (
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Stealth Window Button */}
                <button
                  onClick={() => {
                    const { ipcRenderer } = (window as any).require('electron');
                    ipcRenderer.send('launch-stealth-pip');
                  }}
                  className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap"
                >
                  🎯 Stealth
                </button>
                
                {/* New Session Button */}
                <button
                  onClick={handleNewSession}
                  className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap"
                >
                New Session
                </button>
              </div>
            )}
          </div>
          </div>
          
        {/* Section 1: API Settings */}
        <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wide">1. API Configuration</h2>
            {(apiKeys[apiProvider] && apiKeys[apiProvider].trim() !== '') ? (
              <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded">
                ✓ Configured
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded">
                ⚠️ Required
              </span>
            )}
            </div>
            
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">Select Provider</label>
              <select 
                value={apiProvider}
                onChange={async (e) => {
                  const newProvider = e.target.value as 'gemini' | 'openai' | 'claude' | 'groq';
                  setApiProvider(newProvider);
                  
                  try {
                    const response = await fetch(`${API_BASE_URL}/api/auth/provider`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user._id, provider: newProvider })
                    });
                    
                    if (response.ok) {
                      const updatedUser = { ...user, selectedProvider: newProvider };
                      localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                      localStorage.setItem('isa_api_provider', newProvider);
                  // notify overlay to refresh instantly
                  if (typeof window !== 'undefined' && (window as any).require) {
                    const { ipcRenderer } = (window as any).require('electron');
                    ipcRenderer.send('notify-overlay-settings-changed');
                  }
                    }
                  } catch (error) {
                    console.error('Failed to save provider:', error);
                  }
                }}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-black dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="gemini">Gemini (Google)</option>
                <option value="openai">OpenAI (GPT)</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="groq">Groq (Fast)</option>
              </select>
            </div>
            
            {/* API Key Input */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
                {apiProvider.toUpperCase()} API Key
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder={`Enter your ${apiProvider} API key...`}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 pr-10 text-black dark:text-white focus:outline-none focus:border-blue-500"
                  />
              <button 
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                    {showApiKey ? '👁️' : '👁️‍🗨️'}
              </button>
                </div>
              <button 
                  onClick={async () => {
                    const updatedKeys = { ...apiKeys, [apiProvider]: tempApiKey };
                    setApiKeys(updatedKeys);
                    setShowApiSuccess(true);
                    setTimeout(() => setShowApiSuccess(false), 3000);
                    
                    localStorage.setItem('isa_api_keys', JSON.stringify(updatedKeys));
                    
                    try {
                      const result = await authClient.updateApiKey(user._id, apiProvider, tempApiKey);
                      if (result.success) {
                        const updatedUser = { ...user, apiKeys: result.apiKeys || {}, selectedProvider: apiProvider };
                        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                      // notify overlay to refresh instantly
                      if (typeof window !== 'undefined' && (window as any).require) {
                        const { ipcRenderer } = (window as any).require('electron');
                        ipcRenderer.send('notify-overlay-settings-changed');
                      }
                      }
                    } catch (error: any) {
                      console.error('❌ API key save error:', error);
                    }
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all"
                >
                  Save
              </button>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {showApiSuccess && (
            <div className="mt-4 flex items-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-bold">✓ {apiProvider.toUpperCase()} API Key Updated Successfully</span>
            </div>
          )}
          {!apiKeys[apiProvider] && !showApiSuccess && (
            <div className="mt-4 flex items-start gap-3 text-amber-500 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-lg">
              <span className="text-xl">💡</span>
              <div className="text-sm">
                <p className="font-bold mb-1">First-time setup required</p>
                <p className="text-amber-400/70">Enter your API key to enable AI features</p>
          </div>
            </div>
          )}
          {(apiKeys[apiProvider]) && !showApiSuccess && (
            <div className="mt-4 flex items-center gap-2 text-emerald-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-bold">{apiProvider.toUpperCase()} API Key Active</span>
            </div>
          )}
        </div>

        {/* Section 1.5: Voice Assist Configuration */}
        <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wide">1.5 Voice Assist Provider</h2>
            {(voiceProvider === 'deepgram' && deepgramApiKey && deepgramApiKey.trim() !== '') ? (
              <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded">
                ✓ Configured
              </span>
            ) : (
              <span className="text-xs font-bold text-blue-500 bg-blue-500/10 px-3 py-1.5 rounded">
                ℹ Default Active
              </span>
            )}
          </div>
            
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voice Provider Selection */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">Select Voice Provider</label>
              <select 
                value={voiceProvider}
                onChange={async (e) => {
                  const newProvider = e.target.value as 'default' | 'deepgram';
                  setVoiceProvider(newProvider);
                  
                  try {
                    const response = await fetch(`${API_BASE_URL}/api/auth/voice-provider`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user._id, voiceProvider: newProvider })
                    });
                    
                    if (response.ok) {
                      const updatedUser = { ...user, voiceProvider: newProvider };
                      localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                      
                      console.log('🎤 [App] Voice provider changed to:', newProvider);
                      
                      // Re-initialize voice provider in Electron
                      if (typeof window !== 'undefined' && (window as any).require) {
                        const { ipcRenderer } = (window as any).require('electron');
                        
                        // Initialize the new provider
                        ipcRenderer.send('init-voice-provider', {
                          voiceProvider: newProvider,
                          apiKey: newProvider === 'deepgram' ? deepgramApiKey : '',
                          language: deepgramLanguage,
                          keyterms: deepgramKeyterms
                        });
                        console.log('✅ [App] Voice provider re-initialized');
                        
                        // Notify overlay to refresh
                        ipcRenderer.send('notify-overlay-settings-changed');
                      }
                    }
                  } catch (error) {
                    console.error('Failed to save voice provider:', error);
                  }
                }}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-black dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="default">Default (Python Google Speech)</option>
                <option value="deepgram">Deepgram API</option>
              </select>
            </div>
            
            {/* Deepgram API Key Input (only shown when deepgram is selected) */}
            {voiceProvider === 'deepgram' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
                  Deepgram API Key
                </label>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showDeepgramKey ? 'text' : 'password'}
                      value={tempDeepgramKey}
                      onChange={(e) => setTempDeepgramKey(e.target.value)}
                      placeholder="Enter Deepgram API key"
                      className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 pr-12 text-black dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                      {showDeepgramKey ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!tempDeepgramKey.trim()) return;
                      
                      try {
                        const response = await fetch(`${API_BASE_URL}/api/auth/deepgram-key`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: user._id, deepgramApiKey: tempDeepgramKey })
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          setDeepgramApiKey(tempDeepgramKey);
                          setShowVoiceSuccess(true);
                          setTimeout(() => setShowVoiceSuccess(false), 3000);
                          
                          const updatedUser = { ...user, deepgramApiKey: tempDeepgramKey, deepgramLanguage: deepgramLanguage || 'multi' };
                          localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                          
                          // Also save language to DB (default 'multi' if not set yet)
                          try {
                            await fetch(`${API_BASE_URL}/api/auth/deepgram-language`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user._id, deepgramLanguage: deepgramLanguage || 'multi' })
                            });
                            console.log('🌍 [App] Language auto-saved to DB:', deepgramLanguage || 'multi');
                          } catch (e) {
                            console.error('Failed to auto-save language:', e);
                          }
                          
                          console.log('🎤 [App] Deepgram API key saved');
                          
                          // Re-initialize voice provider with new key
                          if (typeof window !== 'undefined' && (window as any).require) {
                            const { ipcRenderer } = (window as any).require('electron');
                            
                            // If currently using Deepgram, reinitialize with new key
                            if (voiceProvider === 'deepgram') {
                              ipcRenderer.send('init-voice-provider', {
                                voiceProvider: 'deepgram',
                                apiKey: tempDeepgramKey,
                                language: deepgramLanguage,
                                keyterms: deepgramKeyterms
                              });
                              console.log('✅ [App] Deepgram re-initialized with new key');
                            }
                            
                            // Notify overlay to refresh
                            ipcRenderer.send('notify-overlay-settings-changed');
                          }
                        }
                      } catch (error: any) {
                        console.error('❌ Deepgram key save error:', error);
                      }
                    }}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Language Selection (only shown when deepgram is selected) */}
          {voiceProvider === 'deepgram' && (
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
                Transcription Language
              </label>
              <select
                value={deepgramLanguage}
                onChange={async (e) => {
                  const newLang = e.target.value;
                  setDeepgramLanguage(newLang);
                  
                  try {
                    // Save to backend
                    console.log('🌍 [App] Saving language to backend:', newLang, 'userId:', user._id);
                    const response = await fetch(`${API_BASE_URL}/api/auth/deepgram-language`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user._id, deepgramLanguage: newLang })
                    });
                    
                    const result = await response.json();
                    console.log('🌍 [App] Language save response:', response.status, result);
                    
                    if (response.ok) {
                      const updatedUser = { ...user, deepgramLanguage: newLang };
                      localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                      console.log('🌍 [App] Deepgram language saved to DB:', newLang);
                      
                      // Re-initialize voice provider in Electron with new language
                      if (typeof window !== 'undefined' && (window as any).require) {
                        const { ipcRenderer } = (window as any).require('electron');
                        ipcRenderer.send('init-voice-provider', {
                          voiceProvider: 'deepgram',
                          apiKey: deepgramApiKey,
                          language: newLang,
                          keyterms: deepgramKeyterms
                        });
                        ipcRenderer.send('notify-overlay-settings-changed');
                      }
                    }
                  } catch (error) {
                    console.error('Failed to save language:', error);
                  }
                }}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-black dark:text-white focus:outline-none focus:border-blue-500"
              >
                {DEEPGRAM_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                {ENGLISH_LANG_CODES.includes(deepgramLanguage) 
                  ? '✓ Full features enabled (smart format, punctuation, diarization, dictation)'
                  : 'ℹ Basic features (some advanced features not available for this language)'}
              </p>
            </div>
          )}

          {/* Response Language */}
          <div className="mt-6">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
              Response Language
            </label>
            <input
              type="text"
              value={settings.responseLanguage || 'ENGLISH'}
              onChange={(e) => {
                const newLang = e.target.value.toUpperCase();
                setSettings(prev => ({ ...prev, responseLanguage: newLang }));
              }}
              onBlur={(e) => {
                const newLang = e.target.value.toUpperCase();
                setSettings(prev => ({ ...prev, responseLanguage: newLang }));
                // Save to backend on blur
                fetch(`${API_BASE_URL}/api/auth/settings`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user._id, settings: { ...settings, responseLanguage: newLang } })
                }).then(response => response.json()).then(result => {
                  if (result.success) {
                    const updatedUser = { ...user, settings: { ...user.settings, responseLanguage: newLang } };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    localStorage.setItem('isa_response_language', newLang);
                    // Notify overlay to refresh settings
                    if (typeof window !== 'undefined' && (window as any).require) {
                      const { ipcRenderer } = (window as any).require('electron');
                      ipcRenderer.send('notify-overlay-settings-changed');
                    }
                  }
                }).catch(err => console.error('Failed to save response language:', err));
              }}
              placeholder="e.g., ENGLISH, URDU, HINDI"
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-black dark:text-white focus:outline-none focus:border-blue-500 uppercase"
            />
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
              Enter the language for AI responses (auto-converted to uppercase)
            </p>
          </div>

          {/* Important Keywords for Recognition (only shown when deepgram + English is selected) */}
          {voiceProvider === 'deepgram' && ENGLISH_LANG_CODES.includes(deepgramLanguage) && (
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-400 uppercase mb-2">
                Important Keywords (Optional)
              </label>
              <input
                type="text"
                value={deepgramKeyterms}
                onChange={(e) => setDeepgramKeyterms(e.target.value)}
                placeholder="django, fastapi, restful api, kubernetes, react"
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-black dark:text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                🔑 Add comma-separated technical terms, names, or jargon for better recognition (e.g., "PostgreSQL, Redis, FastAPI")
              </p>
              <button
                onClick={async () => {
                  try {
                    console.log('🔑 [App] Saving keyterms to backend:', deepgramKeyterms, 'userId:', user._id);
                    const response = await fetch(`${API_BASE_URL}/api/auth/deepgram-keyterms`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user._id, deepgramKeyterms: deepgramKeyterms })
                    });
                    
                    const result = await response.json();
                    console.log('🔑 [App] Keyterms save response:', response.status, result);
                    
                    if (response.ok) {
                      const updatedUser = { ...user, deepgramKeyterms: deepgramKeyterms };
                      localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                      console.log('🔑 [App] Deepgram keyterms saved to DB');
                      
                      // Re-initialize voice provider with new keyterms in Electron
                      if (typeof window !== 'undefined' && (window as any).require) {
                        const { ipcRenderer } = (window as any).require('electron');
                        ipcRenderer.send('init-voice-provider', {
                          voiceProvider: 'deepgram',
                          apiKey: deepgramApiKey,
                          language: deepgramLanguage,
                          keyterms: deepgramKeyterms
                        });
                        console.log('✅ [App] Voice provider re-initialized with new keyterms');
                        
                        // Notify overlay to refresh settings
                        ipcRenderer.send('notify-overlay-settings-changed');
                      }
                      
                      // Show success message briefly
                      setShowVoiceSuccess(true);
                      setTimeout(() => setShowVoiceSuccess(false), 3000);
                    } else {
                      console.error('Failed to save keyterms:', result);
                    }
                  } catch (error) {
                    console.error('Failed to save keyterms:', error);
                  }
                }}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Save Keywords
              </button>
            </div>
          )}

          {/* Status Messages */}
          {showVoiceSuccess && (
            <div className="mt-4 flex items-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-bold">✓ Settings Updated Successfully</span>
            </div>
          )}
          {voiceProvider === 'deepgram' && (!deepgramApiKey || !deepgramApiKey.trim()) && !showVoiceSuccess && (
            <div className="mt-4 flex items-start gap-3 text-amber-500 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-lg">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-bold">Deepgram API Key Required</p>
                <p className="text-xs mt-1">Get your API key from: <a href="https://console.deepgram.com/" target="_blank" rel="noopener noreferrer" className="underline">console.deepgram.com</a></p>
              </div>
            </div>
          )}
          {voiceProvider === 'deepgram' && deepgramApiKey && deepgramApiKey.trim() && !showVoiceSuccess && (
            <div className="mt-4 flex items-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold">Deepgram API Active</span>
            </div>
          )}
          {voiceProvider === 'default' && (
            <div className="mt-4 flex items-center gap-2 text-blue-500 bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold">Using Default Voice Recognition (Python + Google Speech API)</span>
            </div>
          )}
        </div>

        {/* Section 2: Interview Context (2-Column Layout) */}
        <div className="mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wide mb-2">2. Interview Context</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Provide information for personalized AI responses</p>
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
          <div className="mt-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
                  <button 
              onClick={handleGenerateSummaries}
              disabled={isGeneratingSummaries || !apiKeys[apiProvider]}
              className={`w-full px-6 py-4 rounded-lg font-bold text-lg transition-all ${
                isGeneratingSummaries 
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-purple-500/50'
              }`}
            >
              {isGeneratingSummaries ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Summaries...
                </span>
              ) : (
                '🤖 Generate AI Summaries'
              )}
                  </button>
            
            {showSettingsSaved && (
              <div className="mt-4 flex items-center justify-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-bold">✓ Summaries Generated & Saved Successfully!</span>
                </div>
            )}
            
            {!apiKeys[apiProvider] && (
              <p className="mt-4 text-center text-sm text-amber-500">
                ⚠️ Please configure your API key above before generating summaries
              </p>
            )}

            <div className="pt-2 text-center">
                  <button 
                onClick={handleSaveManualSummaries}
                className="w-full px-6 py-3 rounded-lg font-bold text-sm transition-all bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-black dark:text-white border border-slate-300 dark:border-slate-700"
                  >
                💾 Save Edited Summaries
                  </button>
              {showManualSummarySaved && (
                <div className="mt-2 text-emerald-400 text-xs font-bold">✓ Summaries saved</div>
              )}
                </div>
              </div>
            </div>

        {/* Section 3: Context Messages */}
        <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wide mb-2">3. Context Configuration</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Control how much conversation history the AI receives</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-400">Q&A Pairs to Send:</label>
              <input
                type="number"
                min="1"
                max="50"
                value={contextMessages}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 10;
                  setContextMessages(Math.max(1, Math.min(50, val)));
                }}
                className="w-24 px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-center focus:border-blue-500 focus:outline-none"
              />
              <span className="text-sm text-slate-500">
                (= {contextMessages * 2} messages total)
              </span>
                </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-300">💡 Recommended:</strong> 5-10 for quick interviews, 15-20 for deep technical discussions
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Lower = Faster & cheaper responses | Higher = More context & continuity
              </p>
            </div>
            
            <button
              onClick={async () => {
                try {
                  const updatedSettings = {
                    ...settings,
                    contextMessages
                  };
                  
                  console.log('💾 Saving context messages:', contextMessages);
                  const result = await authClient.updateSettings(user._id, updatedSettings);
                  
                  if (result && result.success) {
                    console.log('✅ Context settings saved to DB');
                    
                    // Update local state
                    setSettings(updatedSettings);
                    
                    // Update user in localStorage
                    const updatedUser = { 
                      ...user, 
                      settings: { ...user.settings, contextMessages } 
                    };
                    localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                    
                    // Show success message
                    setShowContextSaved(true);
                    setTimeout(() => setShowContextSaved(false), 3000);
                  } else {
                    throw new Error('Failed to save to database');
                  }
                } catch (error: any) {
                  console.error('❌ Context save error:', error);
                  setApiError({
                    title: 'Save Failed',
                    message: error.message || 'Failed to save context settings',
                    details: 'Please try again'
                  });
                }
              }}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all"
            >
              💾 Save Context Settings
                  </button>

            {showContextSaved && (
              <div className="flex items-center justify-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                <span className="text-sm font-bold">✓ Context Settings Saved!</span>
                  </div>
            )}
                </div>
                      </div>

        {/* Section 4: Shortcuts (Electron Only) */}
        {isElectron && (
        <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-6">
                  <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wide mb-2">4. Keyboard Shortcuts</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Customize shortcuts • Detected OS: <strong className="text-blue-600 dark:text-blue-400">{detectOS().toUpperCase()}</strong></p>
                      </div>
                  <button 
              onClick={handleResetShortcuts}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-all"
                  >
              Reset to Defaults
                  </button>
                    </div>
                
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(shortcuts).map(([action, config]: [string, any]) => (
              <ShortcutRecorder
                key={action}
                label={config.label}
                modifier={config.modifier}
                currentKey={config.key}
                onModifierChange={(mod) => handleShortcutChange(action, mod, config.key)}
                onKeyChange={(key) => handleShortcutChange(action, config.modifier, key)}
                error={shortcutErrors[action]}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              💡 <strong>Tip:</strong> Click "Record" or click the key field to record a new shortcut
            </p>
                  <button 
              onClick={handleSaveShortcuts}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all"
                  >
              💾 Save Shortcuts
                  </button>
                       </div>

          {showShortcutsSuccess && (
            <div className="mt-4 flex items-center justify-center gap-2 text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-bold">✓ Shortcuts Saved Successfully!</span>
                    </div>
                  )}
                </div>
              )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-500 uppercase tracking-widest">Interview Stealth Assist • Ready for Action</p>
        </footer>
            </div>
            
      {/* Right Column: Live Transcription & Response */}
      <div className="space-y-6">
            {/* Transcription Box */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wide">Live Transcription</h3>
                <div className="flex items-center gap-2">
                  {isListening && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-red-500 dark:text-red-400">Listening</span>
                </div>
              )}
                  <button 
                    onClick={handleStopResponse}
                    disabled={!isGenerating}
                    className={`text-xs font-bold ${isGenerating ? 'text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300' : 'text-slate-400 dark:text-slate-700'} transition-colors`}
                  >
                    Stop
                  </button>
                  <button onClick={handleClear} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white">Clear</button>
                </div>
            </div>
            
              {/* Search Bar + Buttons */}
              <div className="flex items-start gap-3">
                <textarea
                  ref={questionInputRef}
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
                    // Ctrl+Backspace - Clear only the question field
                    if (e.ctrlKey && e.key === 'Backspace') {
                      e.preventDefault();
                      console.log('⌨️ Ctrl+Backspace pressed - Clearing question field only');
                      setManualTextInput('');
                      setTranscribedText('');
                      setCommittedText('');
                      setInterimText('');
                      e.currentTarget.style.height = 'auto';
                    }
                    // Enter (without Shift) - Submit question
                    else if (e.key === 'Enter' && !e.shiftKey && !isListening) {
                      e.preventDefault();
                      if (!isGenerating && manualTextInput.trim()) {
                        // Blur the input field after submitting (so arrows work immediately)
                        e.currentTarget.blur();
                        console.log('⌨️ Enter pressed - Submitting and unfocusing input');
                        handleGetAnswer();
                      }
                    }
                    // Shift+Enter - New line (default behavior, just allow it)
                  }}
                  rows={1}
                  className={`flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-3 text-black dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none overflow-hidden min-h-[48px] max-h-[200px] ${
                    isListening ? 'opacity-90' : ''
                  }`}
                  style={{ lineHeight: '1.5' }}
                />

                  <button 
                  onClick={isListening ? handleStopListen : handleStartListen}
                  disabled={isGenerating}
                  className={`px-5 py-3 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                    isListening
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  } ${isGenerating ? 'opacity-50' : ''}`}
                >
                  {isListening ? 'Stop Listen' : 'Start Listen'}
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
                  className={`px-5 py-3 rounded-lg text-sm font-bold whitespace-nowrap transition-all bg-blue-600 hover:bg-blue-700 text-white ${
                    isGenerating || !(isListening ? transcribedText.trim() : manualTextInput.trim())
                      ? 'opacity-50'
                      : ''
                  }`}
                >
                  {isGenerating ? 'Generating...' : 'Get Answer'}
                  </button>
            </div>
                </div>

            {/* AI Response */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6 min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">
                  {qaPairs.length > 0 ? `Q&A History (${currentPairIndex + 1}/${qaPairs.length})` : 'AI Answer'}
                </h3>
                
                {/* Navigation Arrows */}
                {qaPairs.length > 1 && (
                  <div className="flex items-center gap-2">
                  <button 
                      onClick={() => setCurrentPairIndex(Math.max(0, currentPairIndex - 1))}
                      disabled={currentPairIndex === 0}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        currentPairIndex === 0
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      title="Previous Q&A"
                    >
                      ← Prev
                  </button>
                  <button 
                      onClick={() => setCurrentPairIndex(Math.min(qaPairs.length - 1, currentPairIndex + 1))}
                      disabled={currentPairIndex === qaPairs.length - 1}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
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
                /* Show streaming response in real-time */
                <div className="space-y-4">
                  <div className="bg-slate-100 dark:bg-slate-800/50 border border-blue-200 dark:border-blue-900/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
                      <div className="w-3 h-3 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
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
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  Generating response...
                </div>
              ) : qaPairs.length > 0 && qaPairs[currentPairIndex] ? (
                <div className="space-y-4">
                  {/* Question Card */}
                  <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-lg p-4">
                    <div className="text-xs text-slate-600 dark:text-slate-500 uppercase tracking-wide mb-2">Question</div>
                    <div className="text-black dark:text-white font-bold text-base leading-relaxed">
                      {qaPairs[currentPairIndex].question}
                </div>
            </div>
            
                  {/* Answer Card */}
                  <div className="bg-slate-100 dark:bg-slate-800/50 border border-green-200 dark:border-green-900/30 rounded-lg p-4">
                    <div className="text-xs text-green-600 dark:text-green-500 uppercase tracking-wide mb-2">Answer</div>
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
              ) : (
                <p className="text-slate-600 dark:text-slate-500 text-sm italic">AI response will appear here...</p>
              )}
                      </div>
        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-500 uppercase tracking-widest">Interview Stealth Assist • Ready for Action</p>
        </footer>
      </div>
            
      {/* API Error Modal */}
      {apiError && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setApiError(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-red-300 dark:border-red-500/60 rounded-lg px-4 py-3 w-[280px] max-w-[90vw] shadow-lg shadow-red-500/20"
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

export default App;
