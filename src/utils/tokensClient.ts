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
        plan: 'trial',
        message: error.message || 'Failed to check tokens'
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
        message: error.message || 'Failed to consume tokens'
      };
    }
  }
};

