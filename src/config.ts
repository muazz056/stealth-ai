/**
 * Application Configuration
 * Loads environment variables and provides centralized config
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  TIMEOUT: 30000, // 30 seconds
};

// Environment
export const ENV = {
  MODE: import.meta.env.MODE || 'development',
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
};

// AI Providers Configuration
export const AI_PROVIDERS = {
  GEMINI: {
    name: 'Gemini',
    model: 'gemini-2.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  OPENAI: {
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  CLAUDE: {
    name: 'Claude',
    model: 'claude-3-5-sonnet-20241022',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
};

// Storage Keys
export const STORAGE_KEYS = {
  USER: 'isa_current_user',
  BASE_PROMPT: 'isa_base_prompt',
  RESUME: 'isa_resume_content',
  JOB_DESCRIPTION: 'isa_job_description',
  COMPANY_INFO: 'isa_company_info',
  API_KEYS: 'isa_api_keys',
  API_PROVIDER: 'isa_api_provider',
};

// App Configuration
export const APP_CONFIG = {
  NAME: 'Stealth Assist',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI-powered interview assistant with stealth mode',
  DOWNLOAD_WINDOWS: import.meta.env.VITE_DOWNLOAD_WINDOWS || import.meta.env.DOWNLOAD_WINDOWS || 'https://drive.google.com/uc?export=download&id=1AMpVYXFcIEqrJm2iMEEvgZpUHCIb04kK',
  DOWNLOAD_MAC: import.meta.env.VITE_DOWNLOAD_MAC || import.meta.env.DOWNLOAD_MAC || '',
  DOWNLOAD_LINUX: import.meta.env.VITE_DOWNLOAD_LINUX || import.meta.env.DOWNLOAD_LINUX || '',
};

// Logging
export const LOG_ENABLED = ENV.IS_DEV;

export const log = (...args: any[]) => {
  if (LOG_ENABLED) {
    console.log(...args);
  }
};

export const logError = (...args: any[]) => {
  console.error(...args);
};

export default {
  API_CONFIG,
  ENV,
  AI_PROVIDERS,
  STORAGE_KEYS,
  APP_CONFIG,
  log,
  logError,
};

