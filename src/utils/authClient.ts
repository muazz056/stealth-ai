/**
 * Authentication Client
 * Handles both Electron IPC and HTTP REST API calls
 */

import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.API_URL;

// Detect if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         (window as any).require !== undefined;
};

// Generic auth call handler
async function authCall(ipcEndpoint: string, httpPath: string, data: any, method: string = 'POST') {
  if (isElectron()) {
    // Use Electron IPC
    console.log(`🖥️ Using Electron IPC for: ${ipcEndpoint}`);
    const { ipcRenderer } = (window as any).require('electron');
    return await ipcRenderer.invoke(ipcEndpoint, data);
  } else {
    // Use HTTP REST API
    console.log(`🌐 Using HTTP API for: ${httpPath}`);
    const response = await fetch(`${API_BASE_URL}${httpPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.json();
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
    return await authCall('auth-login', '/auth/login', { username, password }, 'POST');
  },

  updateApiKey: async (userId: string, provider: string, apiKey: string) => {
    return await authCall('auth-update-api-key', '/auth/api-key', { userId, provider, apiKey }, 'PUT');
  },

  getUser: async (userId: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('auth-get-user', { userId });
    } else {
      const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`);
      if (!response.ok) {
        const error = await response.json();
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
  }
};

