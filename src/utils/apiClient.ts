/**
 * API Client
 * Centralized fetch wrapper with automatic JWT auth
 * Access token stored in memory + localStorage (for Electron overlay)
 * Refresh token stored in localStorage for session persistence
 */

import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.API_URL;
const LS_ACCESS_KEY = 'isa_access_token';
const LS_REFRESH_KEY = 'isa_refresh_token';

// In-memory access token
let accessToken: string | null = null;
let onTokenExpiredCallback: (() => void) | null = null;

// Initialize from localStorage (for overlay / page reload)
function initToken(): void {
  if (!accessToken) {
    accessToken = localStorage.getItem(LS_ACCESS_KEY);
  }
}
initToken();

// Detect if running in Electron
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' &&
    (window as any).require !== undefined;
};

// Set access token in memory + localStorage (for overlay process)
export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) {
    localStorage.setItem(LS_ACCESS_KEY, token);
  } else {
    localStorage.removeItem(LS_ACCESS_KEY);
  }
}

// Get stored access token
export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem(LS_ACCESS_KEY);
  }
  return accessToken;
}

// Store refresh token in localStorage
export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(LS_REFRESH_KEY, token);
  } else {
    localStorage.removeItem(LS_REFRESH_KEY);
  }
}

// Get refresh token from localStorage
export function getRefreshToken(): string | null {
  return localStorage.getItem(LS_REFRESH_KEY);
}

// Clear all tokens
export function clearTokens(): void {
  accessToken = null;
  localStorage.removeItem(LS_ACCESS_KEY);
  localStorage.removeItem(LS_REFRESH_KEY);
}

// Register callback for when token refresh fails (forces logout)
export function onTokenExpired(callback: () => void): void {
  onTokenExpiredCallback = callback;
}

// Try to refresh the access token
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      clearTokens();
      onTokenExpiredCallback?.();
      return false;
    }

    const data = await response.json();
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
      }
      return true;
    }
    return false;
  } catch {
    // Network error — don't clear tokens, backend might be waking up
    return false;
  }
}

// Helper: fetch with timeout + retry on network errors
async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 3000): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      // Network error — wait and retry (handles Railway cold start)
      console.warn(`[apiClient] Retry ${attempt}/${retries - 1} for ${url}:`, (err as Error)?.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Failed to fetch');
}

// Main fetch wrapper
export async function apiClient(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<Response> {
  let url = `${API_BASE_URL}${path}`;

  // Append query params
  if (options.params) {
    const searchParams = new URLSearchParams(options.params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Attach auth header if we have a token
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (let browser set it)
  if (!(options.body instanceof FormData)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  let response = await fetchWithRetry(url, { ...options, headers });

  // If 401 (token expired), try to refresh
  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));
    if (data.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry with new token
        const newToken = getAccessToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, {
          ...options,
          headers,
        });
      }
    }
  }

  return response;
}

// Convenience methods
export const api = {
  get: async (path: string, params?: Record<string, string>) => {
    const res = await apiClient(path, { method: 'GET', params });
    return res.json();
  },

  post: async (path: string, body?: any) => {
    const res = await apiClient(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  },

  put: async (path: string, body?: any) => {
    const res = await apiClient(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  },

  delete: async (path: string) => {
    const res = await apiClient(path, { method: 'DELETE' });
    return res.json();
  },
};

export default apiClient;
