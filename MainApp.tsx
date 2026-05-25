import React, { useState, useEffect } from 'react';
import StealthModal from './components/StealthModal';
import { APP_CONFIG } from './src/config';

const MainApp: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [microphoneTest, setMicrophoneTest] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [microphoneError, setMicrophoneError] = useState('');
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [modalInfo, setModalInfo] = useState<{title: string; message: string; variant: 'info' | 'success' | 'error' | 'warning'; icon?: string} | null>(null);

  useEffect(() => {
    // Check for stored API key
    const storedApiKey = localStorage.getItem('gemini_api_key');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }

    // Check speech recognition support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setSpeechRecognitionSupported(true);
      console.log('Speech Recognition API is supported');
    } else {
      console.warn('Speech Recognition API is not supported');
    }
  }, []);

  const testMicrophone = async () => {
    setMicrophoneTest('testing');
    setMicrophoneError('');

    try {
      console.log('Testing microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      // Test for a few seconds
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
        setMicrophoneTest('success');
        console.log('Microphone test completed successfully');
      }, 2000);
      
    } catch (error) {
      console.error('Microphone test failed:', error);
      setMicrophoneError(error.message);
      setMicrophoneTest('error');
    }
  };

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setModalInfo({ title: 'Success', message: 'API key saved successfully!', variant: 'success', icon: '✅' });
    }
  };

  const launchStealthPip = () => {
    if (!apiKey.trim()) {
      setModalInfo({ title: 'Missing API Key', message: 'Please set your Gemini API key first', variant: 'warning', icon: '🔑' });
      return;
    }

    if (microphoneTest !== 'success') {
      setModalInfo({ title: 'Microphone Required', message: 'Please test microphone access first', variant: 'warning', icon: '🎤' });
      return;
    }

    console.log('Launching stealth PiP...');
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('launch-stealth-pip');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 text-blue-400">{APP_CONFIG.NAME}</h1>
          <p className="text-gray-300">Setup your AI-powered {APP_CONFIG.NAME}</p>
        </div>

        {/* API Key Setup */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-green-400">1. API Key Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Gemini API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API key..."
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
              />
            </div>
            <button
              onClick={saveApiKey}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Save API Key
            </button>
            {apiKey && (
              <p className="text-green-400 text-sm">✅ API key is set</p>
            )}
          </div>
        </div>

        {/* Speech Recognition Check */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-green-400">2. Speech Recognition</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {speechRecognitionSupported ? (
                <span className="text-green-400">✅ Speech Recognition API is supported</span>
              ) : (
                <span className="text-red-400">❌ Speech Recognition API is not supported</span>
              )}
            </div>
          </div>
        </div>

        {/* Microphone Test */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-green-400">3. Microphone Access</h2>
          <div className="space-y-4">
            <button
              onClick={testMicrophone}
              disabled={microphoneTest === 'testing'}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              {microphoneTest === 'testing' ? 'Testing Microphone...' : 'Test Microphone Access'}
            </button>
            
            {microphoneTest === 'testing' && (
              <p className="text-yellow-400">🎤 Testing microphone access...</p>
            )}
            
            {microphoneTest === 'success' && (
              <p className="text-green-400">✅ Microphone access granted and working</p>
            )}
            
            {microphoneTest === 'error' && (
              <div className="text-red-400">
                <p>❌ Microphone access failed</p>
                <p className="text-sm mt-1">Error: {microphoneError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Launch Button */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-green-400">4. Launch {APP_CONFIG.NAME}</h2>
          <button
            onClick={launchStealthPip}
            disabled={!apiKey.trim() || microphoneTest !== 'success'}
            className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-lg font-semibold transition-colors"
          >
            🚀 Launch Stealth PiP
          </button>
          
          {(!apiKey.trim() || microphoneTest !== 'success') && (
            <p className="text-gray-400 text-sm mt-2 text-center">
              Complete all setup steps above to launch
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">How to Use</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-300">
            <li>Enter your Gemini API key and save it</li>
            <li>Test microphone access to ensure speech recognition works</li>
            <li>Click "Launch Stealth PiP" to open the overlay assistant</li>
            <li>The overlay will appear as a transparent, always-on-top window</li>
            <li>Use "Listen" to transcribe speech and "Get Answer" for AI responses</li>
          </ol>
        </div>
      </div>

      <StealthModal
        isOpen={!!modalInfo}
        onClose={() => setModalInfo(null)}
        title={modalInfo?.title || ''}
        icon={modalInfo?.icon}
        variant={modalInfo?.variant || 'info'}
        primaryAction={{
          label: 'OK',
          onClick: () => setModalInfo(null)
        }}
      >
        {modalInfo?.message}
      </StealthModal>
    </div>
  );
};

export default MainApp;
