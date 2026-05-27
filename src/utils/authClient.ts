import { apiClient, setAccessToken, setRefreshToken, clearTokens } from './apiClient';

export const isElectron = () => {
  return typeof window !== 'undefined' && 
         (window as any).require !== undefined;
};

export const authClient = {
  register: async (userData: {
    username: string;
    name: string;
    email: string;
    password: string;
  }) => {
    const response = await apiClient('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  },

  login: async (username: string, password: string) => {
    const response = await apiClient('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    const result = await response.json();
    if (result.accessToken) setAccessToken(result.accessToken);
    if (result.refreshToken) setRefreshToken(result.refreshToken);
    return result;
  },

  storeTokens: (accessToken: string, refreshToken: string) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
  },

  logout: () => {
    clearTokens();
  },

  updateApiKey: async (userId: string, provider: string, apiKey: string) => {
    const response = await apiClient('/auth/api-key', {
      method: 'PUT',
      body: JSON.stringify({ userId, provider, apiKey }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  },

  getUser: async (userId: string) => {
    const response = await apiClient(`/auth/user/${userId}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get user' }));
      throw new Error(error.message || 'Failed to get user');
    }
    return await response.json();
  },

  updateSettings: async (userId: string, settings: any) => {
    const response = await apiClient('/auth/settings', {
      method: 'PUT',
      body: JSON.stringify({ userId, settings }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  },

  updateShortcuts: async (userId: string, shortcuts: any) => {
    const response = await apiClient('/auth/shortcuts', {
      method: 'PUT',
      body: JSON.stringify({ userId, shortcuts }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  },

  resendVerification: async (email: string) => {
    const response = await apiClient('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  },

  googleLogin: async (credential: string) => {
    const response = await apiClient('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Google login failed' }));
      throw new Error(error.message || 'Google login failed');
    }
    const result = await response.json();
    if (result.accessToken) setAccessToken(result.accessToken);
    if (result.refreshToken) setRefreshToken(result.refreshToken);
    return result;
  }
};
