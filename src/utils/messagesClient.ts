import { apiClient } from './apiClient';

export const messagesClient = {
  saveMessage: async (userId: string, message: any) => {
    const response = await apiClient('/messages/save', {
      method: 'POST',
      body: JSON.stringify({ userId, message })
    });
    if (!response.ok) throw new Error('Failed to save message');
    return await response.json();
  },

  saveHistory: async (userId: string, history: any[]) => {
    const response = await apiClient('/messages/save-history', {
      method: 'POST',
      body: JSON.stringify({ userId, history })
    });
    if (!response.ok) throw new Error('Failed to save history');
    return await response.json();
  },

  getHistory: async (userId: string) => {
    const response = await apiClient(`/messages/history/${userId}`);
    if (!response.ok) throw new Error('Failed to get history');
    return await response.json();
  },

  clearHistory: async (userId: string) => {
    const response = await apiClient(`/messages/clear/${userId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to clear history');
    return await response.json();
  }
};
