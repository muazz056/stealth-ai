const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const tokensClient = {
  // Check if user has enough tokens
  async checkTokens(userId: string): Promise<{
    success: boolean;
    tokens: number;
    canSendMessage: boolean;
    isAdmin: boolean;
    hasUnlimitedTokens: boolean;
    role: string;
    plan: string;
    transcriptionLimit?: number;
    transcriptionSeconds?: number;
    message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tokens/check/${userId}`);
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Failed to check tokens:', error);
      return {
        success: false,
        tokens: 0,
        canSendMessage: false,
        isAdmin: false,
        hasUnlimitedTokens: false,
        role: 'user',
        plan: 'Free',
        message: error.message || 'Failed to check credits'
      };
    }
  },

  // Check if user can listen (tokens + transcription time)
  async checkListen(userId: string): Promise<{
    success: boolean;
    canListen: boolean;
    reason: string;
    transcriptionSeconds: number;
    transcriptionLimit: number;
    transcriptionRemaining: number;
    tokens: number;
    isAdmin: boolean;
    hasUnlimitedTokens: boolean;
    role: string;
    plan: string;
    message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tokens/check-listen/${userId}`);
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Failed to check listen status:', error);
      return {
        success: false,
        canListen: false,
        reason: 'error',
        transcriptionSeconds: 0,
        transcriptionLimit: 1500, // Default, will be overridden by backend response
        transcriptionRemaining: 0,
        tokens: 0,
        isAdmin: false,
        hasUnlimitedTokens: false,
        role: 'user',
        plan: 'Free',
        message: error.message || 'Failed to check listen status'
      };
    }
  },

  // Add transcription time (called when user stops listening)
  async addTranscriptionTime(userId: string, seconds: number): Promise<{
    success: boolean;
    transcriptionSeconds: number;
    transcriptionRemaining: number;
    limitReached: boolean;
    unlimited?: boolean;
    message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tokens/add-transcription-time/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds })
      });
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Failed to add transcription time:', error);
      return {
        success: false,
        transcriptionSeconds: 0,
        transcriptionRemaining: 0,
        limitReached: false,
        message: error.message || 'Failed to add transcription time'
      };
    }
  },

  // Consume tokens (1 token per question)
  async consumeTokens(userId: string, amount: number = 1): Promise<{
    success: boolean;
    tokens: number;
    consumed: number;
    message?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tokens/consume/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Failed to consume tokens:', error);
      return {
        success: false,
        tokens: 0,
        consumed: 0,
        message: error.message || 'Failed to consume credits'
      };
    }
  }
};

