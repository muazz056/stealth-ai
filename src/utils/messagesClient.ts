/**
 * Messages Client
 * Handles conversation history storage in MongoDB
 * Supports both Electron IPC and HTTP REST API
 */

import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.API_URL;

// Detect if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         (window as any).require !== undefined;
};

// Messages API methods
export const messagesClient = {
  /**
   * Save a single message to MongoDB
   */
  saveMessage: async (userId: string, message: any) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('messages-save', { userId, message });
    } else {
      const response = await fetch(`${API_BASE_URL}/messages/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message })
      });
      if (!response.ok) throw new Error('Failed to save message');
      return await response.json();
    }
  },

  /**
   * Save entire conversation history to MongoDB (replaces existing)
   */
  saveHistory: async (userId: string, history: any[]) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('messages-save-history', { userId, history });
    } else {
      const response = await fetch(`${API_BASE_URL}/messages/save-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, history })
      });
      if (!response.ok) throw new Error('Failed to save history');
      return await response.json();
    }
  },

  /**
   * Load conversation history from MongoDB
   */
  getHistory: async (userId: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('messages-get-history', { userId });
    } else {
      const response = await fetch(`${API_BASE_URL}/messages/history/${userId}`);
      if (!response.ok) throw new Error('Failed to get history');
      return await response.json();
    }
  },

  /**
   * Clear all conversation history for a user
   */
  clearHistory: async (userId: string) => {
    if (isElectron()) {
      const { ipcRenderer } = (window as any).require('electron');
      return await ipcRenderer.invoke('messages-clear', { userId });
    } else {
      const response = await fetch(`${API_BASE_URL}/messages/clear/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to clear history');
      return await response.json();
    }
  }
};

