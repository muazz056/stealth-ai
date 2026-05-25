/**
 * Authentication Client
 * Handles both Electron IPC and HTTP REST API calls
 * Now uses JWT tokens for secure API access
 */

import { API_CONFIG } from '../config';
import { apiClient, setAccessToken, setRefreshToken, clearTokens, getAccessToken } from './apiClient';

const API_BASE_URL = API_CONFIG.API_URL;

// Detect if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         (window as any).require !== undefined;
};

// Generic auth call handler
async function authCall(ipcEndpoint: string, httpPath: string, data: any, method: string = 'POST') {
  if (isElectron()) {
    const { ipcRenderer } = (window as any).require('electron');
    // Pass the access token along with data for IPC auth
    const token = getAccessToken();
    return await ipcRenderer.invoke(ipcEndpoint, { ...data, _token: token });
  } else {
    const response = await apiClient(httpPath, {
      method,
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    
    return await response.json();
  }
}

// Auth API methods
export const authClient = {
  register: async (userData: {
    username: string;
    name: string;
    email: string;
    password: string;
  }) => {
    return await authCall('auth-register', '/auth/register', userData, 'POST');
  },

  login: async (username: string, password: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('auth-login', { username, password });
    } else {
      const response = await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || 'Request failed');
      }
      
      const result = await response.json();
      
      // Store tokens on successful login
      if (result.accessToken) {
        setAccessToken(result.accessToken);
      }
      if (result.refreshToken) {
        setRefreshToken(result.refreshToken);
      }
      
      return result;
    }
  },

  /**
   * Store tokens after successful auth (called from AuthPage on Google OAuth, etc.)
   */
  storeTokens: (accessToken: string, refreshToken: string) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
  },

  /**
   * Log the user out (clear tokens)
   */
  logout: () => {
    clearTokens();
  },

  updateApiKey: async (userId: string, provider: string, apiKey: string) => {
    return await authCall('auth-update-api-key', '/auth/api-key', { userId, provider, apiKey }, 'PUT');
  },

  getUser: async (userId: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('auth-get-user', { userId });
    } else {
      const response = await apiClient(`/auth/user/${userId}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to get user' }));
        throw new Error(error.message || 'Failed to get user');
      }
      return await response.json();
    }
  },

  updateSettings: async (userId: string, settings: any) => {
    return await authCall('auth-update-settings', '/auth/settings', { userId, settings }, 'PUT');
  },

  updateShortcuts: async (userId: string, shortcuts: any) => {
    return await authCall('auth-update-shortcuts', '/auth/shortcuts', { userId, shortcuts }, 'PUT');
  },

  resendVerification: async (email: string) => {
    return await authCall('auth-resend-verification', '/auth/resend-verification', { email }, 'POST');
  },

  googleLogin: async (credential: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('auth-google-login', { credential });
    } else {
      const response = await apiClient('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Google login failed' }));
        throw new Error(error.message || 'Google login failed');
      }
      
      const result = await response.json();
      
      if (result.accessToken) {
        setAccessToken(result.accessToken);
      }
      if (result.refreshToken) {
        setRefreshToken(result.refreshToken);
      }
      
      return result;
    }
  }
};
