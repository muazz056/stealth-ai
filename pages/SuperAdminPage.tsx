import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useDarkMode } from '../src/context/DarkModeContext';
import { getTierLimits } from '../src/config';

interface AIModel {
  provider: string;
  apiKey: string;
  model: string;
  order: number;
}

interface DeepgramKey {
  apiKey: string;
  provider: string;
  order: number;
}

interface UserData {
  _id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  tokens: number;
  transcriptionSeconds: number;
  suspended?: boolean;
  verified?: boolean;
  createdAt: string;
}

interface SuperAdminPageProps {
  user?: any;
}

const SuperAdminPage: React.FC<SuperAdminPageProps> = ({ user }) => {
  const { isDarkMode } = useDarkMode();
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  // Check if user is super admin
  if (!user || user.role !== 'super-admin') {
    return <Navigate to="/" replace />;
  }

  const [aiChain, setAiChain] = useState<AIModel[]>([]);
  const [deepgramChain, setDeepgramChain] = useState<DeepgramKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // AI Model form state
  const [aiFormData, setAiFormData] = useState({
    provider: '',
    apiKey: '',
    model: ''
  });

  // Deepgram form state
  const [deepgramFormData, setDeepgramFormData] = useState({
    apiKey: '',
    provider: ''
  });

  // User management state
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPagination, setUserPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<{ id: string; suspend: boolean } | null>(null);

  // Load chains and users on mount
  useEffect(() => {
    loadChains();
    loadUsers(1, '');
  }, []);

  const loadChains = async () => {
    try {
      setLoading(true);
      const userId = String(user._id || user.id || '');
      const [aiRes, deepgramRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/auth/super-admin/ai-chain?userId=${userId}`),
        fetch(`${API_BASE_URL}/api/auth/super-admin/deepgram-chain?userId=${userId}`)
      ]);

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        setAiChain(aiData.chain || []);
      }

      if (deepgramRes.ok) {
        const dgData = await deepgramRes.json();
        setDeepgramChain(dgData.chain || []);
      }
    } catch (error) {
      console.error('Failed to load chains:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const addAiModel = () => {
    if (!aiFormData.provider || !aiFormData.apiKey || !aiFormData.model) {
      setMessage({ type: 'error', text: 'All AI model fields are required' });
      return;
    }

    const newModel: AIModel = {
      provider: aiFormData.provider,
      apiKey: aiFormData.apiKey,
      model: aiFormData.model,
      order: aiChain.length + 1
    };

    setAiChain([...aiChain, newModel]);
    setAiFormData({ provider: '', apiKey: '', model: '' });
    setMessage({ type: 'success', text: 'AI model added to chain' });
  };

  const removeAiModel = (index: number) => {
    setAiChain(aiChain.filter((_, i) => i !== index).map((model, idx) => ({
      ...model,
      order: idx + 1
    })));
  };

  const addDeepgramKey = () => {
    if (!deepgramFormData.provider) {
      setMessage({ type: 'error', text: 'Provider is required' });
      return;
    }

    if (deepgramFormData.provider === 'deepgram' && !deepgramFormData.apiKey) {
      setMessage({ type: 'error', text: 'API key is required for Deepgram provider' });
      return;
    }

    const newKey: DeepgramKey = {
      apiKey: deepgramFormData.provider === 'deepgram' ? deepgramFormData.apiKey : '',
      provider: deepgramFormData.provider,
      order: deepgramChain.length + 1
    };

    setDeepgramChain([...deepgramChain, newKey]);
    setDeepgramFormData({ apiKey: '', provider: '' });
    setMessage({ type: 'success', text: `${deepgramFormData.provider === 'deepgram' ? 'Deepgram API key' : 'Default provider'} added to chain` });
  };

  const removeDeepgramKey = (index: number) => {
    setDeepgramChain(deepgramChain.filter((_, i) => i !== index).map((key, idx) => ({
      ...key,
      order: idx + 1
    })));
  };

  const saveAiChain = async () => {
    try {
      setSaving(true);
      const userId = String(user._id || user.id || '');
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/ai-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chain: aiChain })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: '✅ AI model chain saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save AI chain' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving AI chain: ' + error });
    } finally {
      setSaving(false);
    }
  };

  const saveDeepgramChain = async () => {
    try {
      setSaving(true);
      const userId = String(user._id || user.id || '');
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/deepgram-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chain: deepgramChain })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Deepgram key chain saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save Deepgram chain' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving Deepgram chain: ' + error });
    } finally {
      setSaving(false);
    }
  };

  const moveAiModel = (index: number, direction: 'up' | 'down') => {
    const newChain = [...aiChain];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newChain[index], newChain[newIndex]] = [newChain[newIndex], newChain[index]];
    setAiChain(newChain.map((model, idx) => ({ ...model, order: idx + 1 })));
  };

  const moveDeepgramKey = (index: number, direction: 'up' | 'down') => {
    const newChain = [...deepgramChain];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newChain[index], newChain[newIndex]] = [newChain[newIndex], newChain[index]];
    setDeepgramChain(newChain.map((key, idx) => ({ ...key, order: idx + 1 })));
  };

  // ==================== USER MANAGEMENT ====================

  const loadUsers = async (page: number = 1, search: string = '') => {
    try {
      setUsersLoading(true);
      const userId = String(user._id || user.id || '');
      const params = new URLSearchParams({
        userId,
        page: page.toString(),
        limit: '20',
        search
      });
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setUserPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to load users:', err.message || res.statusText);
        setMessage({ type: 'error', text: err.message || 'Failed to load users' });
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      setMessage({ type: 'error', text: 'Failed to load users' });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSearchUsers = () => {
    setUserPage(1);
    loadUsers(1, userSearch);
  };

  const handleChangePlan = async (targetUserId: string, newPlan: string) => {
    try {
      setUserActionLoading(targetUserId);
      const userId = String(user._id || user.id || '');
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/users/${targetUserId}/role?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        loadUsers(userPage, userSearch);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to change plan' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change plan' });
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleSuspendUser = async (targetUserId: string, suspended: boolean) => {
    try {
      setUserActionLoading(targetUserId);
      const userId = String(user._id || user.id || '');
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/users/${targetUserId}/suspend?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        loadUsers(userPage, userSearch);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to update user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update user' });
    } finally {
      setUserActionLoading(null);
      setConfirmSuspend(null);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    try {
      setUserActionLoading(targetUserId);
      const userId = String(user._id || user.id || '');
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/users/${targetUserId}?userId=${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        loadUsers(userPage, userSearch);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete user' });
    } finally {
      setUserActionLoading(null);
      setConfirmDelete(null);
    }
  };

  const formatPlanLabel = (plan: string) => {
    switch ((plan || '').toLowerCase()) {
      case 'pro': return { label: 'Pro', color: 'blue' };
      case 'premium': return { label: 'Premium', color: 'purple' };
      case 'lifetime': return { label: 'Lifetime', color: 'amber' };
      default: return { label: 'Free', color: 'slate' };
    }
  };

  const formatCredits = (tokens: number) => {
    return tokens === -1 ? '∞' : tokens.toString();
  };

  const formatTranscription = (seconds: number) => {
    if (seconds === -1) return '∞';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getRemainingTranscription = (plan: string, usedSeconds: number) => {
    const limits = getTierLimits(plan);
    if (limits.transcriptionSeconds === -1) return -1;
    return Math.max(0, limits.transcriptionSeconds - (usedSeconds || 0));
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-white'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'} transition-colors duration-300`}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-4xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            🔐 Super Admin Settings
          </h1>
          <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
            Configure AI models, Deepgram API keys, and manage users
          </p>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? isDarkMode ? 'bg-green-900/30 text-green-300 border border-green-700' : 'bg-green-50 text-green-700 border border-green-200'
              : isDarkMode ? 'bg-red-900/30 text-red-300 border border-red-700' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* AI Model Chain Section */}
          <div className={`rounded-lg p-6 ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              🤖 AI Model Chain
            </h2>

            {/* Add Form */}
            <div className="mb-6 space-y-3">
              <div>
                <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Provider API
                </label>
                <select
                  value={aiFormData.provider}
                  onChange={(e) => setAiFormData({ ...aiFormData, provider: e.target.value })}
                  className={`w-full px-4 py-2 rounded border transition-colors ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="">Select Provider</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">GEMINI</option>
                  <option value="groq">GROQ</option>
                  <option value="grok">GROK</option>
                  <option value="claude">CLAUDE</option>
                  <option value="cerebras">CEREBRAS</option>
                  <option value="mistral">MISTRAL</option>
                  <option value="openrouter">OPENROUTER</option>
                  <option value="openai-compatible">OPENAI COMPATIBLE</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Model Name
                </label>
                <input
                  type="text"
                  placeholder="Enter model name (e.g., gpt-4, gemini-1.5-pro)"
                  value={aiFormData.model}
                  onChange={(e) => setAiFormData({ ...aiFormData, model: e.target.value })}
                  className={`w-full px-4 py-2 rounded border transition-colors ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter API key"
                  value={aiFormData.apiKey}
                  onChange={(e) => setAiFormData({ ...aiFormData, apiKey: e.target.value })}
                  className={`w-full px-4 py-2 rounded border transition-colors ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
              <button
                onClick={addAiModel}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
              >
                ➕ Add Model
              </button>
            </div>

            {/* Chain List */}
            <div className="space-y-2">
              {aiChain.length === 0 ? (
                <p className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>No AI models configured yet</p>
              ) : (
                aiChain.map((model, index) => (
                  <div key={index} className={`p-3 rounded border flex items-center justify-between ${
                    isDarkMode
                      ? 'bg-slate-700/50 border-slate-600'
                      : 'bg-slate-100 border-slate-300'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                          isDarkMode
                            ? 'bg-blue-900 text-blue-200'
                            : 'bg-blue-100 text-blue-900'
                        }`}>
                          #{index + 1}
                        </span>
                        <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {model.provider}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Model: {model.model}
                      </p>
                      <p className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        Key: {model.apiKey.substring(0, 20)}...
                      </p>
                    </div>
                    <div className="flex gap-2 ml-2">
                      {index > 0 && (
                        <button
                          onClick={() => moveAiModel(index, 'up')}
                          className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
                          title="Move up in priority"
                        >
                          ↑
                        </button>
                      )}
                      {index < aiChain.length - 1 && (
                        <button
                          onClick={() => moveAiModel(index, 'down')}
                          className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
                          title="Move down in priority"
                        >
                          ↓
                        </button>
                      )}
                      <button
                        onClick={() => removeAiModel(index)}
                        className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Save Button */}
            {aiChain.length > 0 && (
              <button
                onClick={saveAiChain}
                disabled={saving}
                className="w-full mt-6 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-bold transition-colors"
              >
                {saving ? '💾 Saving...' : '💾 Save AI Model Chain'}
              </button>
            )}
          </div>

          {/* Deepgram Key Chain Section */}
          <div className={`rounded-lg p-6 ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              🎤 Deepgram API Keys
            </h2>

            {/* Add Form */}
            <div className="mb-6 space-y-3">
              <div>
                <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Voice Provider
                </label>
                <select
                  value={deepgramFormData.provider}
                  onChange={(e) => setDeepgramFormData({ ...deepgramFormData, provider: e.target.value })}
                  className={`w-full px-4 py-2 rounded border transition-colors ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="">Select Provider</option>
                  <option value="default">Default (Google speech recognition)</option>
                  <option value="deepgram">Deepgram</option>
                </select>
              </div>
              {deepgramFormData.provider === 'deepgram' && (
                <div>
                  <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter Deepgram API key"
                    value={deepgramFormData.apiKey}
                    onChange={(e) => setDeepgramFormData({ ...deepgramFormData, apiKey: e.target.value })}
                    className={`w-full px-4 py-2 rounded border transition-colors ${
                      isDarkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
                    }`}
                  />
                </div>
              )}
              <button
                onClick={addDeepgramKey}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
              >
                ➕ Add Provider
              </button>
            </div>

            {/* Chain List */}
            <div className="space-y-2">
              {deepgramChain.length === 0 ? (
                <p className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>No Deepgram API keys configured yet</p>
              ) : (
                deepgramChain.map((key, index) => (
                  <div key={index} className={`p-3 rounded border flex items-center justify-between ${
                    isDarkMode
                      ? 'bg-slate-700/50 border-slate-600'
                      : 'bg-slate-100 border-slate-300'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                          isDarkMode
                            ? 'bg-purple-900 text-purple-200'
                            : 'bg-purple-100 text-purple-900'
                        }`}>
                          #{index + 1}
                        </span>
                        <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {key.provider}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        {key.provider === 'deepgram' ? `Key: ${key.apiKey.substring(0, 20)}...` : 'No API key required'}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-2">
                      {index > 0 && (
                        <button
                          onClick={() => moveDeepgramKey(index, 'up')}
                          className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
                          title="Move up in priority"
                        >
                          ↑
                        </button>
                      )}
                      {index < deepgramChain.length - 1 && (
                        <button
                          onClick={() => moveDeepgramKey(index, 'down')}
                          className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors"
                          title="Move down in priority"
                        >
                          ↓
                        </button>
                      )}
                      <button
                        onClick={() => removeDeepgramKey(index)}
                        className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Save Button */}
            {deepgramChain.length > 0 && (
              <button
                onClick={saveDeepgramChain}
                disabled={saving}
                className="w-full mt-6 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-bold transition-colors"
              >
                {saving ? '💾 Saving...' : '💾 Save Deepgram Chain'}
              </button>
            )}
          </div>
        </div>

        {/* User Management Section */}
        <div className={`mt-8 rounded-lg p-6 ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
          <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            👥 User Management
          </h2>

          {/* Search Bar */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              placeholder="Search by username, email, or name..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchUsers()}
              className={`flex-1 px-4 py-2 rounded border transition-colors ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
              }`}
            />
            <button
              onClick={handleSearchUsers}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
            >
              🔍 Search
            </button>
            <button
              onClick={() => { setUserSearch(''); setUserPage(1); loadUsers(1, ''); }}
              className={`px-4 py-2 rounded font-semibold transition-colors ${
                isDarkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              Reset
            </button>
            <button
              onClick={() => loadUsers(userPage, userSearch)}
              disabled={usersLoading}
              className={`px-4 py-2 rounded font-semibold transition-colors ${
                isDarkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              } ${usersLoading ? 'opacity-50' : ''}`}
            >
              🔄
            </button>
          </div>

          {/* Users Table */}
          {usersLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <p className={`text-center py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No users found. Click "Load Users" to fetch all users.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>User</th>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Plan</th>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Remaining Credits</th>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Remaining Minutes</th>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Status</th>
                      <th className={`text-left py-3 px-2 font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const planInfo = formatPlanLabel(u.plan);
                      const isTargetSuperAdmin = u.role === 'super-admin';
                      return (
                        <tr key={u._id} className={`border-b ${isDarkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                          <td className="py-3 px-2">
                            <div>
                              <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{u.username}</p>
                              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.email}</p>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            {isTargetSuperAdmin ? (
                              <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                isDarkMode ? 'bg-amber-900 text-amber-200' : 'bg-amber-100 text-amber-800'
                              }`}>
                                Super Admin
                              </span>
                            ) : (
                              <select
                                value={u.plan || 'Free'}
                                onChange={(e) => handleChangePlan(u._id, e.target.value)}
                                disabled={userActionLoading === u._id || isTargetSuperAdmin}
                                className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                                  planInfo.color === 'blue'
                                    ? isDarkMode ? 'bg-blue-900 border-blue-700 text-blue-200' : 'bg-blue-100 border-blue-300 text-blue-800'
                                    : planInfo.color === 'purple'
                                    ? isDarkMode ? 'bg-purple-900 border-purple-700 text-purple-200' : 'bg-purple-100 border-purple-300 text-purple-800'
                                    : isDarkMode ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                                }`}
                              >
                                <option value="Free">Free</option>
                                <option value="Pro">Pro</option>
                                <option value="Premium">Premium</option>
                              </select>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              {formatCredits(u.tokens)}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`font-mono text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {formatTranscription(getRemainingTranscription(u.plan, u.transcriptionSeconds || 0))}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            {u.suspended ? (
                              <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800'
                              }`}>
                                Suspended
                              </span>
                            ) : (
                              <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                isDarkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'
                              }`}>
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            {!isTargetSuperAdmin && (
                              <div className="flex gap-2">
                                {confirmSuspend?.id === u._id ? (
                                  <>
                                    <button
                                      onClick={() => handleSuspendUser(u._id, confirmSuspend.suspend)}
                                      disabled={userActionLoading === u._id}
                                      className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors"
                                    >
                                      {userActionLoading === u._id ? '...' : 'Confirm'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmSuspend(null)}
                                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                        isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                      }`}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : confirmDelete === u._id ? (
                                  <>
                                    <button
                                      onClick={() => handleDeleteUser(u._id)}
                                      disabled={userActionLoading === u._id}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors"
                                    >
                                      {userActionLoading === u._id ? '...' : 'Confirm Delete'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(null)}
                                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                        isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                      }`}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setConfirmSuspend({ id: u._id, suspend: !u.suspended })}
                                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                        u.suspended
                                          ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400'
                                          : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400'
                                      }`}
                                      title={u.suspended ? 'Unsuspend user' : 'Suspend user'}
                                    >
                                      {u.suspended ? '✓ Unsuspend' : '⊘ Suspend'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(u._id)}
                                      className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs font-semibold transition-colors"
                                      title="Permanently delete user"
                                    >
                                      ✕ Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {userPagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Showing {((userPagination.page - 1) * userPagination.limit) + 1} to {Math.min(userPagination.page * userPagination.limit, userPagination.total)} of {userPagination.total} users
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setUserPage(userPage - 1); loadUsers(userPage - 1, userSearch); }}
                      disabled={userPage <= 1}
                      className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                        userPage <= 1
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      } ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                    >
                      ← Prev
                    </button>
                    <span className={`px-3 py-1 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Page {userPagination.page} of {userPagination.totalPages}
                    </span>
                    <button
                      onClick={() => { setUserPage(userPage + 1); loadUsers(userPage + 1, userSearch); }}
                      disabled={userPage >= userPagination.totalPages}
                      className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                        userPage >= userPagination.totalPages
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      } ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Refresh Button when empty */}
          {users.length === 0 && !usersLoading && (
            <button
              onClick={() => loadUsers(1, userSearch)}
              className="w-full mt-4 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors"
            >
              🔄 Load Users
            </button>
          )}
        </div>

        {/* Info Section */}
        <div className={`mt-8 rounded-lg p-6 ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
          <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            ℹ️ How Fallback Chain Works
          </h3>
          <ul className={`space-y-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            <li>
              <strong>AI Models:</strong> If the first model fails or times out, the system automatically tries the next model in the chain. The order matters - higher priority models are tried first.
            </li>
            <li>
              <strong>Deepgram Keys:</strong> If one API key reaches its limit or fails, the system switches to the next key in the chain without interrupting the user experience.
            </li>
            <li>
              <strong>Priority Order:</strong> Use the up/down arrows to reorder the priority. Move critical keys/models to the top.
            </li>
            <li>
              <strong>Production Ready:</strong> Users will not see API configuration options. The system will automatically use these configured chains.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminPage;
