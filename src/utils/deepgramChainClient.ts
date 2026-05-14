/**
 * Deepgram Chain Client
 * Fetches the system Deepgram config (configured by super admin) for ALL users.
 * If the user has their own personal deepgramApiKey, it takes priority.
 * Otherwise, the system-configured Deepgram key from app_config is used.
 */

const API_BASE_URL = typeof window !== 'undefined'
  ? (import.meta as any)?.env?.VITE_BACKEND_URL || 'http://localhost:3001'
  : 'http://localhost:3001';

export interface DeepgramConfig {
  apiKey: string;
  provider: string;
  language: string;
  keyterms: string;
}

interface DeepgramChainResponse {
  success: boolean;
  config: DeepgramConfig;
  message?: string;
}

/**
 * Resolve the effective Deepgram config for any user.
 * Priority:
 * 1. User's personal deepgramApiKey (if non-empty)
 * 2. System chain's active entry (super admin configured)
 * 3. Empty config (fallback to default)
 */
export async function resolveDeepgramConfig(user?: any): Promise<DeepgramConfig> {
  // Priority 1: User's personal Deepgram key
  if (user?.deepgramApiKey && user.deepgramApiKey.trim()) {
    return {
      apiKey: user.deepgramApiKey,
      provider: 'deepgram',
      language: user.deepgramLanguage || 'multi',
      keyterms: user.deepgramKeyterms || ''
    };
  }

  // Priority 2: System chain from super admin
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/deepgram-chain-public`);
    if (!res.ok) {
      console.warn('[DG-CHAIN] Public config fetch failed:', res.status);
      return emptyConfig();
    }
    const data: DeepgramChainResponse = await res.json();
    if (data?.success && data.config?.apiKey) {
      console.log('[DG-CHAIN] Using system Deepgram chain config:', {
        hasKey: !!data.config.apiKey,
        provider: data.config.provider,
        language: data.config.language
      });
      // If the user sets the voice provider but has no personal key,
      // the voiceProvider field should still be honored.
      // Return the chain config with the system key.
    return {
        apiKey: data.config.apiKey,
        provider: 'deepgram',
        language: user?.deepgramLanguage || 'multi',
        keyterms: user?.deepgramKeyterms || data.config.keyterms || ''
    };
    }
  } catch (err) {
    console.warn('[DG-CHAIN] Failed to fetch system config:', err);
  }

  // Priority 3: No Deepgram available
  return emptyConfig();
}

function emptyConfig(): DeepgramConfig {
  return { apiKey: '', provider: '', language: 'multi', keyterms: '' };
}

/**
 * Check if the user should use Deepgram (either personal or system chain).
 * Returns true only if a valid Deepgram API key is available.
 */
export async function shouldUseDeepgram(user?: any): Promise<boolean> {
  const config = await resolveDeepgramConfig(user);
  return !!config.apiKey;
}