import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useDarkMode } from '../src/context/DarkModeContext';

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

  // Load chains on mount
  useEffect(() => {
    loadChains();
  }, []);

  const loadChains = async () => {
    try {
      setLoading(true);
      const [aiRes, deepgramRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/auth/super-admin/ai-chain?userId=${user._id}`),
        fetch(`${API_BASE_URL}/api/auth/super-admin/deepgram-chain?userId=${user._id}`)
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
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/ai-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id, chain: aiChain })
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
      const res = await fetch(`${API_BASE_URL}/api/auth/super-admin/deepgram-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id, chain: deepgramChain })
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
            Configure AI models and Deepgram API keys with fallback chains
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
