require('dotenv').config();
const { app, BrowserWindow, BrowserView, globalShortcut, screen, ipcMain, desktopCapturer, clipboard, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Suppress Electron's default error dialogs for uncaught exceptions
process.on('uncaughtException', (error) => {
    // Only show console errors, not dialogs
    if (!error.message.includes('EPIPE')) {
        console.error('Uncaught exception:', error);
    }
});

// Prevent Electron from showing error dialogs
app.on('render-process-gone', (event, webContents, details) => {
    console.error('Render process gone:', details);
});

app.on('child-process-gone', (event, details) => {
    if (!details.name.includes('EPIPE')) {
        console.error('Child process gone:', details);
    }
});

let overlayWindow = null;
let mainWindow = null;
let floatingWidget = null;
let browserView = null;
let currentBrowserProvider = 'google'; // Track current provider for dynamic spacing

// Python Speech Bridge (Google Speech API - FREE & REAL-TIME!)
const { spawn } = require('child_process');
let pythonProcess = null;
let pythonReady = false;

// Deepgram Speech Bridge (Alternative voice provider)
let deepgramProcess = null;
let deepgramReady = false;

// Voice provider settings
let currentVoiceProvider = 'default'; // 'default' or 'deepgram'
let deepgramApiKey = '';
let deepgramLanguage = 'multi'; // Default language

// Backend Server Process
let backendProcess = null;
let backendReady = false;

// Check if a port is already in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false); // Port is free
        });
        server.listen(port);
    });
}

// Start backend server
async function startBackendServer() {
    if (backendProcess) {
        console.log('⚠️ Backend server already running');
        return;
    }
    
    console.log('🚀 Starting backend server...');
    
    // Check if port 3001 is already in use (e.g., from npm run backend)
    const portInUse = await isPortInUse(3001);
    if (portInUse) {
        console.log('✅ Backend already running on port 3001 (external). Skipping spawn.');
        backendReady = true;
        return;
    }
    
    try {
        const backendPath = app.isPackaged
            ? path.join(process.resourcesPath, 'backend', 'server.cjs')
            : path.join(__dirname, 'backend', 'server.cjs');
        
        console.log('📂 Backend path:', backendPath);
        
        // Check if backend file exists
        if (!fs.existsSync(backendPath)) {
            console.error('❌ Backend server file not found:', backendPath);
            return;
        }
        
        // Set up environment for packaged app
        const env = { ...process.env };
        
        if (app.isPackaged) {
            // In packaged app, node_modules are in app.asar or resources
            const appPath = path.dirname(app.getAppPath());
            const nodeModulesPath = path.join(appPath, 'node_modules');
            const resourcesPath = process.resourcesPath;
            
            console.log('📦 App path:', app.getAppPath());
            console.log('📦 Resources path:', resourcesPath);
            console.log('📦 Node modules path:', nodeModulesPath);
            
            // Set NODE_PATH so backend can find modules
            env.NODE_PATH = nodeModulesPath + path.delimiter + (env.NODE_PATH || '');
            
            // Set dotenv config path to find .env file
            env.dotenv_file = path.join(resourcesPath, 'app.asar.unpacked', '.env');
        }
        
        // Spawn Node.js process for backend
        backendProcess = spawn('node', [backendPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: app.isPackaged ? process.resourcesPath : __dirname,
            env: env
        });
        
        // Handle backend stdout
        backendProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('🔵 Backend:', output.trim());
            
            if (output.includes('listening') || output.includes('started') || output.includes('3001')) {
                backendReady = true;
                console.log('✅ Backend server ready!');
            }
        });
        
        // Handle backend stderr
        backendProcess.stderr.on('data', (data) => {
            console.error('🔴 Backend error:', data.toString().trim());
        });
        
        // Handle backend exit
        backendProcess.on('close', (code) => {
            console.log(`🔵 Backend server exited with code ${code}`);
            backendProcess = null;
            backendReady = false;
        });
        
        // Handle spawn errors
        backendProcess.on('error', (error) => {
            console.error('❌ Failed to start backend server:', error.message);
            backendProcess = null;
            backendReady = false;
        });
        
    } catch (error) {
        console.error('❌ Error starting backend server:', error.message);
        backendProcess = null;
        backendReady = false;
    }
}

// Stop backend server
function stopBackendServer() {
    if (backendProcess) {
        console.log('🛑 Stopping backend server...');
        backendProcess.kill();
        backendProcess = null;
        backendReady = false;
    }
}

// Get dynamic spacing based on provider
function getBrowserViewSpacing(provider) {
    // Gemini and Claude need less spacing (235px)
    // GPT, Google, and AI Studio need more spacing (280px)
    const needsMoreSpace = ['ChatGPT', 'Google', 'AI Studio'];
    return needsMoreSpace.includes(provider) ? { y: 280, height: 300 } : { y: 240, height: 255 };
}

// Start Python speech bridge
function startPythonBridge() {
    if (pythonProcess) {
        console.log('⚠️ Python bridge already running');
        return;
    }
    
    console.log('🐍 Starting Python speech bridge...');
    
    try {
        // Find Python script path
        let bridgePath;
        if (app.isPackaged) {
            const possiblePaths = [
                path.join(process.resourcesPath, 'app', 'speech_bridge.py'),
                path.join(process.resourcesPath, 'speech_bridge.py'),
                path.join(__dirname, 'speech_bridge.py'),
            ];
            bridgePath = possiblePaths.find(p => fs.existsSync(p)) || path.join(__dirname, 'speech_bridge.py');
        } else {
            bridgePath = path.join(__dirname, 'speech_bridge.py');
        }
        
        console.log('📂 Python bridge path:', bridgePath);
        
        // Spawn Python process
        pythonProcess = spawn('python', [bridgePath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(bridgePath)
        });
        
        // Handle Python stdout (transcription results)
        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            
            lines.forEach(line => {
                if (!line.trim()) return;
                
                try {
                    const message = JSON.parse(line);
                    console.log('📥 Python:', message.type, message.message || message.text);
                    
                    if (message.type === 'ready') {
                        pythonReady = true;
                        console.log('✅ Python speech bridge ready!');
                    }
                    
                    // Forward message to all renderer processes
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('python-speech', message);
                    }
                    if (overlayWindow && !overlayWindow.isDestroyed()) {
                        overlayWindow.webContents.send('python-speech', message);
                    }
                    
                } catch (e) {
                    console.error('❌ Failed to parse Python output:', line);
                }
            });
        });
        
        // Handle Python stderr (errors)
        pythonProcess.stderr.on('data', (data) => {
            console.error('🐍 Python error:', data.toString());
        });
        
        // Handle Python process exit
        pythonProcess.on('close', (code) => {
            console.log(`🐍 Python bridge exited with code ${code}`);
            pythonProcess = null;
            pythonReady = false;
        });
        
        // Handle spawn errors
        pythonProcess.on('error', (error) => {
            console.error('❌ Failed to start Python bridge:', error.message);
            pythonProcess = null;
            pythonReady = false;
        });
        
    } catch (error) {
        console.error('❌ Error starting Python bridge:', error.message);
        pythonProcess = null;
        pythonReady = false;
    }
}

// Stop Python bridge
function stopPythonBridge() {
    if (pythonProcess) {
        console.log('🛑 Stopping Python bridge...');
        pythonProcess.kill();
        pythonProcess = null;
        pythonReady = false;
    }
}

// Start Deepgram speech bridge
function startDeepgramBridge(apiKey, lang, keyterms = '') {
    if (deepgramProcess) {
        console.log('⚠️ Deepgram bridge already running');
        return;
    }
    
    if (!apiKey) {
        console.error('❌ Deepgram API key is required');
        return;
    }
    
    console.log('🎤 Starting Deepgram speech bridge (Python)...');
    deepgramApiKey = apiKey;
    
    try {
        // Find Python script path - multiple possible locations
        let bridgePath;
        if (app.isPackaged) {
            const possiblePaths = [
                path.join(process.resourcesPath, 'app', 'deepgram_speech_bridge.py'),
                path.join(process.resourcesPath, 'deepgram_speech_bridge.py'),
                path.join(__dirname, 'deepgram_speech_bridge.py'),
            ];
            bridgePath = possiblePaths.find(p => fs.existsSync(p));
            if (!bridgePath) {
                console.error('❌ Deepgram Python bridge not found at any path:');
                possiblePaths.forEach(p => console.error('   -', p, fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'));
                return;
            }
        } else {
            bridgePath = path.join(__dirname, 'deepgram_speech_bridge.py');
        }
        
        console.log('📂 Deepgram bridge path:', bridgePath);
        
        // Spawn Python process for Deepgram (native Windows audio - NO SOX!)
        deepgramProcess = spawn('python', [bridgePath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        console.log('🚀 Deepgram Python process spawned, PID:', deepgramProcess.pid);
        
        // Send init command with API key, language, and keyterms
        deepgramProcess.stdin.write(JSON.stringify({ 
            command: 'init', 
            apiKey: apiKey,
            language: lang || deepgramLanguage || 'multi',
            keyterms: keyterms || ''
        }) + '\n');
        
        // Handle Deepgram stdout (transcription results)
        deepgramProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            
            lines.forEach(line => {
                if (!line.trim()) return;
                
                try {
                    const message = JSON.parse(line);
                    console.log('📥 Deepgram (Python):', message.type, message.message || message.text);
                    
                    if (message.type === 'status' && message.message && message.message.toLowerCase().includes('ready')) {
                        deepgramReady = true;
                        console.log('✅ Deepgram speech bridge ready!');
                    }
                    
                    // Forward message to all renderer processes
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('python-speech', message);
                    }
                    if (overlayWindow && !overlayWindow.isDestroyed()) {
                        overlayWindow.webContents.send('python-speech', message);
                    }
                    
                } catch (e) {
                    console.error('❌ Failed to parse Deepgram output:', line);
                }
            });
        });
        
        // Handle Deepgram stderr (errors)
        deepgramProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString().trim();
            if (!errorMsg.includes('EPIPE')) {
                console.error('🎤 Deepgram error:', errorMsg);
            }
        });
        
        // Handle Deepgram process exit - track PID to avoid race condition
        const thisPid = deepgramProcess.pid;
        deepgramProcess.on('close', (code) => {
            console.log(`🎤 Deepgram bridge (PID ${thisPid}) exited with code ${code}`);
            // Only reset if THIS process is still the current one (avoid race condition)
            if (deepgramProcess && deepgramProcess.pid === thisPid) {
                if (code !== 0 && code !== null) {
                    console.error('❌ Deepgram bridge crashed');
                }
                deepgramProcess = null;
                deepgramReady = false;
            } else {
                console.log('ℹ️ Ignoring exit from old Deepgram bridge (new one already running)');
            }
        });
        
        // Handle spawn errors
        deepgramProcess.on('error', (error) => {
            if (error.code !== 'EPIPE') {
                console.error('❌ Failed to start Deepgram bridge:', error.message);
            }
            if (deepgramProcess && deepgramProcess.pid === thisPid) {
                deepgramProcess = null;
                deepgramReady = false;
            }
        });
        
    } catch (error) {
        console.error('❌ Error starting Deepgram bridge:', error.message);
        deepgramProcess = null;
        deepgramReady = false;
    }
}

// Stop Deepgram bridge
function stopDeepgramBridge() {
    if (deepgramProcess) {
        console.log('🛑 Stopping Deepgram bridge...');
        try {
            deepgramProcess.stdin.write(JSON.stringify({ command: 'exit' }) + '\n');
        } catch (e) {
            console.error('Error sending exit command:', e);
        }
        deepgramProcess.kill();
        deepgramProcess = null;
        deepgramReady = false;
    }
}

// Debounce voice provider initialization to prevent rapid re-init
let voiceInitTimer = null;
let voiceInitPending = null;

function initializeVoiceProvider(voiceProvider, apiKey = '', lang = '', keyterms = '') {
    // Update language if provided
    if (lang) {
        deepgramLanguage = lang;
    }
    
    // If same provider with same key and same language, skip
    if (voiceProvider === currentVoiceProvider && 
        (voiceProvider !== 'deepgram' || apiKey === deepgramApiKey) &&
        (voiceProvider === 'deepgram' ? (deepgramProcess && deepgramReady) : (pythonProcess && pythonReady))) {
        
        // Even if skipping re-init, send language update to existing bridge
        if (lang && voiceProvider === 'deepgram' && deepgramProcess && deepgramReady) {
            console.log('🌍 [MAIN] Sending language update to Deepgram bridge:', lang);
            deepgramProcess.stdin.write(JSON.stringify({ command: 'set-language', language: lang }) + '\n');
        }
        
        // Send keyterms update if provided
        if (keyterms !== undefined && voiceProvider === 'deepgram' && deepgramProcess && deepgramReady) {
            console.log('🔑 [MAIN] Sending keyterms update to Deepgram bridge');
            deepgramProcess.stdin.write(JSON.stringify({ command: 'set-keyterms', keyterms: keyterms }) + '\n');
        }
        
        console.log('⏭️ [MAIN] Voice provider already initialized, skipping');
        return;
    }
    
    // Debounce: cancel pending init and schedule new one
    if (voiceInitTimer) {
        clearTimeout(voiceInitTimer);
    }
    
    voiceInitPending = { voiceProvider, apiKey, lang: lang || deepgramLanguage, keyterms: keyterms || '' };
    voiceInitTimer = setTimeout(() => {
        const { voiceProvider: vp, apiKey: ak, lang: vLang, keyterms: vKeyterms } = voiceInitPending;
        voiceInitPending = null;
        voiceInitTimer = null;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎤 [MAIN] Initializing voice provider...');
        console.log('🎤 [MAIN] Provider:', vp);
        console.log('🎤 [MAIN] Has API key:', !!ak);
        console.log('🎤 [MAIN] Language:', vLang);
        console.log('🎤 [MAIN] Keyterms:', vKeyterms ? 'Yes' : 'No');
        console.log('🎤 [MAIN] Current provider:', currentVoiceProvider);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Stop any running bridges first
        console.log('🛑 [MAIN] Stopping existing bridges...');
        stopPythonBridge();
        stopDeepgramBridge();
        
        currentVoiceProvider = vp;
        console.log('✅ [MAIN] Current provider set to:', currentVoiceProvider);
        
        if (vp === 'deepgram' && ak) {
            console.log('🚀 [MAIN] Starting Deepgram bridge...');
            startDeepgramBridge(ak, vLang, vKeyterms);
        } else {
            console.log('🚀 [MAIN] Starting Python bridge (default)...');
            startPythonBridge();
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }, 500); // 500ms debounce
}

// Import auth functions (will be loaded dynamically)
let authModule = null;
function loadAuthModule() {
    try {
        let authPath;
        if (app.isPackaged) {
            // Various possible locations for auth.cjs in packaged app
            const possiblePaths = [
                path.join(process.resourcesPath, 'app', 'auth.cjs'),
                path.join(process.resourcesPath, 'auth.cjs'),
                path.join(process.resourcesPath, 'app.asar.unpacked', 'auth.cjs'),
                path.join(__dirname, 'resources', 'app', 'auth.cjs'),
                path.join(app.getAppPath(), 'auth.cjs')
            ];
            
            console.log('🔍 Looking for auth.cjs in packaged app...');
            console.log('   resourcesPath:', process.resourcesPath);
            console.log('   app.getAppPath():', app.getAppPath());
            
            authPath = possiblePaths.find(p => {
                const exists = fs.existsSync(p);
                console.log('   Checking:', p, exists ? '✅' : '❌');
                return exists;
            });
            
            if (!authPath) {
                console.error('❌ Auth module not found at any path');
                possiblePaths.forEach(p => console.log('   - Not found:', p));
                return;
            }
        } else {
            authPath = path.join(__dirname, 'auth.cjs');
        }
        
        console.log('📂 Loading auth from:', authPath);
        authModule = require(authPath);
        console.log('✅ Auth module loaded:', typeof authModule);
    } catch (e) {
        console.error('❌ Auth module failed to load:', e.message);
        console.warn('Authentication features will not be available');
    }
}

// Backend API URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// IPC Handlers for Authentication
ipcMain.handle('auth-register', async (event, userData) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.registerUser(userData);
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('auth-login', async (event, credentials) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.loginUser(credentials.username, credentials.password);
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('auth-update-api-key', async (event, data) => {
    console.log('🎯 IPC: auth-update-api-key received:', data);
    if (!authModule) {
        console.error('❌ Auth module not available');
        return { success: false, message: 'Auth module not available' };
    }
    try {
        const result = await authModule.updateUserApiKey(data.userId, data.provider, data.apiKey);
        console.log('📤 IPC: Returning result:', result);
        return result;
    } catch (error) {
        console.error('❌ IPC error:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('auth-update-settings', async (event, data) => {
    console.log('🎯 IPC: auth-update-settings received:', data);
    try {
        console.log('📡 Calling backend at:', `${BACKEND_URL}/api/auth/settings`);
        const response = await fetch(`${BACKEND_URL}/api/auth/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log('📥 Backend response status:', response.status);
        const result = await response.json();
        console.log('✅ Backend response:', result);
        return result;
    } catch (error) {
        console.error('❌ IPC auth-update-settings error:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('auth-update-shortcuts', async (event, data) => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/shortcuts`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// ==================== MESSAGE/CONVERSATION IPC HANDLERS ====================

ipcMain.handle('messages-save', async (event, data) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.saveMessage(data.userId, data.message);
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('messages-save-history', async (event, data) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.saveConversationHistory(data.userId, data.history);
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('messages-get-history', async (event, data) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.getConversationHistory(data.userId);
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('messages-clear', async (event, data) => {
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        return await authModule.clearConversationHistory(data.userId);
    } catch (error) {
        return { success: false, message: error.message };
    }
});


// ==================== WHISPER SPEECH RECOGNITION (Xenova Transformers) ====================

// Python Speech Bridge IPC Handlers

// Start voice listening (works with both Python and Deepgram)
ipcMain.on('python-start-listen', (event) => {
    console.log('🎤 [MAIN] Start listen command received');
    console.log('🎤 [MAIN] Current voice provider:', currentVoiceProvider);
    
    if (currentVoiceProvider === 'deepgram') {
        console.log('🎤 [MAIN] Using Deepgram...');
        if (deepgramProcess && deepgramReady) {
            console.log('🎤 [MAIN] Sending "start" command to Deepgram (lang:', deepgramLanguage, ')...');
            deepgramProcess.stdin.write(JSON.stringify({ command: 'start', language: deepgramLanguage }) + '\n');
        } else {
            console.error('❌ [MAIN] Deepgram bridge not ready. Process:', !!deepgramProcess, 'Ready:', deepgramReady);
            event.reply('python-speech', {
                type: 'error',
                message: 'Deepgram bridge not ready. Please check your API key.'
            });
        }
    } else {
        console.log('🎤 [MAIN] Using Python (default)...');
        if (pythonProcess && pythonReady) {
            console.log('🎤 [MAIN] Sending "start" command to Python...');
            pythonProcess.stdin.write('start\n');
        } else {
            console.error('❌ [MAIN] Python bridge not ready. Process:', !!pythonProcess, 'Ready:', pythonReady);
            event.reply('python-speech', {
                type: 'error',
                message: 'Python bridge not ready. Please restart the app.'
            });
        }
    }
});

// Stop voice listening (works with both Python and Deepgram)
ipcMain.on('python-stop-listen', (event) => {
    console.log('🛑 [MAIN] Stop listen command received');
    console.log('🛑 [MAIN] Current voice provider:', currentVoiceProvider);
    
    if (currentVoiceProvider === 'deepgram') {
        if (deepgramProcess && deepgramReady) {
            console.log('🛑 [MAIN] Sending "stop" command to Deepgram...');
            deepgramProcess.stdin.write(JSON.stringify({ command: 'stop' }) + '\n');
        } else {
            console.error('❌ [MAIN] Deepgram bridge not available');
        }
    } else {
        if (pythonProcess && pythonReady) {
            console.log('🛑 [MAIN] Sending "stop" command to Python...');
            pythonProcess.stdin.write('stop\n');
        } else {
            console.error('❌ [MAIN] Python bridge not available');
        }
    }
});

// Check if voice bridge is available
ipcMain.handle('python-available', async () => {
    console.log('🔍 [MAIN] Checking voice bridge availability...');
    console.log('🔍 [MAIN] Current provider:', currentVoiceProvider);
    
    if (currentVoiceProvider === 'deepgram') {
        const status = {
            available: deepgramReady,
            process: deepgramProcess !== null,
            provider: 'deepgram'
        };
        console.log('🔍 [MAIN] Deepgram status:', status);
        return status;
    } else {
        const status = {
            available: pythonReady,
            process: pythonProcess !== null,
            provider: 'default'
        };
        console.log('🔍 [MAIN] Python status:', status);
        return status;
    }
});

// Initialize/Switch voice provider
ipcMain.on('init-voice-provider', (event, { voiceProvider, apiKey, language, keyterms }) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📡 [MAIN] IPC: init-voice-provider received');
    console.log('📡 [MAIN] Requested provider:', voiceProvider);
    console.log('📡 [MAIN] Has API key:', !!apiKey);
    console.log('📡 [MAIN] Language:', language || deepgramLanguage);
    console.log('📡 [MAIN] Keyterms:', keyterms ? 'Yes' : 'No');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    initializeVoiceProvider(voiceProvider, apiKey, language || '', keyterms || '');
});

// ==================== END WHISPER ====================


ipcMain.handle('auth-get-user', async (event, data) => {
    console.log('🎯 IPC: auth-get-user received:', data);
    if (!authModule) {
        return { success: false, message: 'Auth module not available' };
    }
    try {
        // Handle both formats: direct userId string or { userId } object
        const userId = typeof data === 'string' ? data : data.userId;
        const result = await authModule.getUserData(userId);
        console.log('📤 IPC: Returning user data:', result.success ? 'Success' : 'Failed');
        return result;
    } catch (error) {
        console.error('❌ IPC error:', error);
        return { success: false, message: error.message };
    }
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        center: true,
        transparent: false,
        frame: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        movable: true,
        minimizable: true,
        maximizable: true,
        closable: true,
        focusable: true,
        show: true,
        title: 'Interview Assistant - Setup',
        backgroundColor: '#1f2937',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            enableRemoteModule: true,
            webSecurity: false,
        },
    });

    // Remove default menu bar
    mainWindow.setMenu(null);

    // Handle all permissions in main window
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        console.log('Main window permission requested:', permission);
        if (permission === 'microphone' || permission === 'media' || permission === 'camera') {
            console.log('Granting permission for:', permission);
            callback(true);
        } else {
            callback(false);
        }
    });
    
    // Load main setup page - go directly to app (not landing page)
    const FRONTEND_URL = process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
    mainWindow.loadURL(`${FRONTEND_URL}/#/service`);
    
    // Add error handling
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load main window:', errorCode, errorDescription);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

function createFloatingWidget() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    floatingWidget = new BrowserWindow({
        width: 20,  // 60/3 = 20 (3 times smaller)
        height: 20, // 60/3 = 20 (3 times smaller)
        x: width - 30,  // 30px from right edge (20px widget + 10px margin)
        y: Math.floor(height / 2) - 10, // Vertically centered
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // Create a simple HTML content for the widget
    floatingWidget.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    cursor: default !important;
                }
                body {
                    background: transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    width: 100vw;
                    overflow: hidden;
                }
                .widget-container {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    -webkit-app-region: drag;
                }
                .widget {
                    width: 16px;  /* Smaller circle */
                    height: 16px; /* Smaller circle */
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    -webkit-app-region: no-drag;
                    animation: blinkInfinite 1.5s ease-in-out infinite;
                }
                .widget:hover {
                    transform: scale(1.1);
                    box-shadow: 0 3px 12px rgba(102, 126, 234, 0.6);
                }
                
                /* Infinite blink animation - blinks until restored */
                @keyframes blinkInfinite {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.15; }
                }
            </style>
        </head>
        <body>
            <div class="widget-container">
                <div class="widget" onclick="restoreOverlay()"></div>
            </div>
            <script>
                const { ipcRenderer } = require('electron');
                function restoreOverlay() {
                    ipcRenderer.send('restore-overlay-from-widget');
                }
            </script>
        </body>
        </html>
    `));

    floatingWidget.setIgnoreMouseEvents(false);
    
    // Apply stealth features to the floating widget
    try {
        if (process.platform === 'win32') {
            // Method 1: Try ffi-napi for SetWindowDisplayAffinity
            try {
                const ffi = require('ffi-napi');
                const hwnd = floatingWidget.getNativeWindowHandle();
                const user32 = new ffi.Library('user32', {
                    'SetWindowDisplayAffinity': ['bool', ['pointer', 'uint32']],
                    'SetWindowLongPtrW': ['pointer', ['pointer', 'int', 'pointer']],
                    'GetWindowLongPtrW': ['pointer', ['pointer', 'int']],
                    'SetLayeredWindowAttributes': ['bool', ['pointer', 'uint32', 'uint8', 'uint32']]
                });
                
                // WDA_EXCLUDEFROMCAPTURE = 0x00000011
                const WDA_EXCLUDEFROMCAPTURE = 0x00000011;
                const result = user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
                
                // Additional stealth: Set as tool window to avoid capture
                const GWL_EXSTYLE = -20;
                const WS_EX_TOOLWINDOW = 0x00000080;
                const WS_EX_NOACTIVATE = 0x08000000;
                const WS_EX_LAYERED = 0x00080000;
                
                const currentStyle = user32.GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                const newStyle = currentStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED;
                user32.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, newStyle);
                
                // Set layered window attributes for additional stealth
                const LWA_ALPHA = 0x00000002;
                user32.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
                
                console.log('✅ Floating widget stealth mode activated');
            } catch (ffiError) {
                console.warn('⚠️ ffi-napi not available for widget - using fallback stealth');
                floatingWidget.setContentProtection(true);
            }
        } else if (process.platform === 'darwin') {
            // macOS: Apply stealth to floating widget
            try {
                if (app.dock) {
                    app.dock.hide();
                }
                floatingWidget.setSkipTaskbar(true);
                floatingWidget.setAlwaysOnTop(true, 'screen-saver');
                floatingWidget.setContentProtection(true);
                floatingWidget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                console.log('✅ macOS floating widget stealth enabled');
            } catch (macError) {
                console.warn('⚠️ macOS widget stealth partial failure:', macError.message);
                floatingWidget.setContentProtection(true);
            }
        } else if (process.platform === 'linux') {
            // Linux: Apply minimal stealth to floating widget
            try {
                floatingWidget.setSkipTaskbar(true);
                floatingWidget.setAlwaysOnTop(true);
                floatingWidget.setContentProtection(true);
                floatingWidget.setVisibleOnAllWorkspaces(true);
                console.log('✅ Linux floating widget minimal stealth enabled');
            } catch (linuxError) {
                console.warn('⚠️ Linux widget stealth partial failure:', linuxError.message);
                floatingWidget.setContentProtection(true);
            }
        } else {
            // Unknown platform
            floatingWidget.setContentProtection(true);
        }
    } catch (e) {
        console.warn('Could not set stealth features for widget:', e);
        try {
            floatingWidget.setContentProtection(true);
        } catch (fallbackError) {
            console.warn('Fallback stealth for widget also failed:', fallbackError);
        }
    }
    
    floatingWidget.on('closed', () => {
        floatingWidget = null;
    });

    return floatingWidget;
}

function createOverlayWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    const overlay = new BrowserWindow({
        width: 800,
        height: 350,
        minWidth: 400,
        minHeight: 120,
        maxWidth: 1200,
        maxHeight: 800,
        x: width / 2 - 400, // Center horizontally
        y: 20, // Near the top
        transparent: true, // ✅ Enable true transparency to prevent drag artifacts
        frame: false, // ✅ Frameless window - no drag trails!
        alwaysOnTop: true,
        skipTaskbar: false,
        resizable: true, // Enable resizing
        movable: true,
        minimizable: true,
        maximizable: false, // Disable maximize for frameless window
        closable: true,
        focusable: true,
        show: false, // ✅ Start hidden, show when ready to prevent glitches
        title: 'Interview Stealth Assist',
        backgroundColor: '#00000000', // ✅ Fully transparent background
        hasShadow: true, // Keep shadow for visibility
        roundedCorners: true, // ✅ Smooth rounded edges (Windows 11+)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            enableRemoteModule: true,
            webSecurity: false, // Allow microphone access
            offscreen: false, // ✅ Disable offscreen rendering for smooth dragging
        },
    });

    // Remove default menu bar (File, Edit, etc.)
    overlay.setMenu(null);

    // Show window when ready to prevent visual glitches
    overlay.once('ready-to-show', () => {
        // Hide widget if it exists (overlay and widget shouldn't both be visible)
        if (floatingWidget && !floatingWidget.isDestroyed()) {
            floatingWidget.hide();
        }
        
        overlay.show();
        console.log('✅ Overlay window shown (no drag artifacts!)');
    });

    // For Windows: Enable layered window for smoother transparency and dragging
    if (process.platform === 'win32') {
        try {
            const hwnd = overlay.getNativeWindowHandle();
            if (hwnd && ffi && user32) {
                // WS_EX_LAYERED = 0x00080000 - Makes window layered for better transparency
                const GWL_EXSTYLE = -20;
                const currentStyle = user32.GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                const WS_EX_LAYERED = 0x00080000;
                user32.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, currentStyle | WS_EX_LAYERED);
                console.log('✅ Windows layered style applied for smooth dragging');
            }
        } catch (e) {
            console.log('ℹ️ Could not set Windows layered style (non-critical):', e.message);
        }
    }

    // Use the same session as main window if available
    if (mainWindow && mainWindow.webContents && mainWindow.webContents.session) {
        console.log('Sharing session from main window to overlay');
        // Note: Can't directly assign session, but we can copy permissions
    }
    
    // Handle microphone permissions for overlay
    overlay.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        console.log('Overlay permission requested:', permission);
        if (permission === 'microphone' || permission === 'media' || permission === 'camera') {
            console.log('Granting overlay permission for:', permission);
            callback(true); // Grant microphone/media permission
        } else {
            console.log('Denying overlay permission for:', permission);
            callback(false);
        }
    });
    
    // Load overlay page directly
    const FRONTEND_URL = process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
    overlay.loadURL(`${FRONTEND_URL}/#/overlay`);
    
    // Add error handling
    overlay.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load overlay:', errorCode, errorDescription);
    });
    
    // Ensure microphone permissions are granted when overlay loads
    overlay.webContents.on('did-finish-load', () => {
        console.log('Overlay finished loading, ensuring microphone permissions...');
        overlay.webContents.executeJavaScript(`
            console.log('Overlay: Testing microphone access on load...');
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    console.log('Overlay: Microphone access confirmed on load');
                    stream.getTracks().forEach(track => track.stop());
                })
                .catch(error => {
                    console.error('Overlay: Microphone access failed on load:', error);
                });
        `);
    });
    
    overlay.webContents.on('crashed', () => {
        console.error('Overlay window crashed');
    });
    
    // DevTools removed per user request
    
    // Enhanced stealth features for screen sharing invisibility
    try {
        if (process.platform === 'win32') {
            // Method 1: Try ffi-napi for SetWindowDisplayAffinity
            try {
                const ffi = require('ffi-napi');
                const hwnd = overlay.getNativeWindowHandle();
                const user32 = new ffi.Library('user32', {
                    'SetWindowDisplayAffinity': ['bool', ['pointer', 'uint32']],
                    'SetWindowLongPtrW': ['pointer', ['pointer', 'int', 'pointer']],
                    'GetWindowLongPtrW': ['pointer', ['pointer', 'int']],
                    'SetLayeredWindowAttributes': ['bool', ['pointer', 'uint32', 'uint8', 'uint32']]
                });
                
                // WDA_EXCLUDEFROMCAPTURE = 0x00000011 (more aggressive than WDA_MONITOR)
                const WDA_EXCLUDEFROMCAPTURE = 0x00000011;
                const result = user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
                
                // Additional stealth: Set as tool window to avoid capture
                const GWL_EXSTYLE = -20;
                const WS_EX_TOOLWINDOW = 0x00000080;
                const WS_EX_NOACTIVATE = 0x08000000;
                const WS_EX_LAYERED = 0x00080000;
                
                const currentStyle = user32.GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                const newStyle = currentStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED;
                user32.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, newStyle);
                
                // Set layered window attributes for additional stealth
                const LWA_ALPHA = 0x00000002;
                user32.SetLayeredWindowAttributes(hwnd, 0, 240, LWA_ALPHA); // Slightly transparent
                
                console.log('✅ Enhanced stealth mode activated - window excluded from screen capture');
                console.log('Result:', result ? 'Success' : 'Failed');
            } catch (ffiError) {
                console.warn('⚠️  ffi-napi not available - installing stealth dependencies...');
                
                // Method 2: Use Electron's built-in content protection
                overlay.setContentProtection(true);
                
                // Method 3: Set window as utility/tool window
                overlay.setSkipTaskbar(true);
                overlay.setAlwaysOnTop(true);
                
                console.warn('Using fallback stealth methods. For full invisibility, install: npm run install-stealth');
            }
        } else if (process.platform === 'darwin') {
            // macOS Enhanced Stealth (not as effective as Windows, but improved)
            console.log('🍎 macOS: Applying enhanced stealth features...');
            
            try {
                // Hide from Mission Control (requires Electron 23+)
                if (overlay.setHiddenInMissionControl) {
                    overlay.setHiddenInMissionControl(true);
                    console.log('   ✓ Hidden from Mission Control');
                }
                
                // Hide dock icon
                if (app.dock) {
                    app.dock.hide();
                    console.log('   ✓ Dock icon hidden');
                }
                
                // Skip taskbar
                overlay.setSkipTaskbar(true);
                console.log('   ✓ Skipped taskbar');
                
                // Set highest window level (above screen saver)
                overlay.setAlwaysOnTop(true, 'screen-saver');
                console.log('   ✓ Set to highest window level');
                
                // Basic content protection (weak on macOS)
                overlay.setContentProtection(true);
                console.log('   ✓ Content protection enabled');
                
                // Make visible on all workspaces
                overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                console.log('   ✓ Visible on all workspaces');
                
                console.log('⚠️  macOS: Enhanced stealth enabled, but NOT fully invisible to screen recordings');
                console.log('   → Window is hidden from Mission Control and dock');
                console.log('   → May still be visible in Zoom/Teams screen shares');
                console.log('   → Test with your specific recording software');
            } catch (macError) {
                console.warn('⚠️  Some macOS stealth features failed:', macError.message);
                overlay.setContentProtection(true);
            }
        } else if (process.platform === 'linux') {
            // Linux Minimal Stealth (very limited support)
            console.log('🐧 Linux: Applying minimal stealth features...');
            
            try {
                // Skip taskbar and pager
                overlay.setSkipTaskbar(true);
                console.log('   ✓ Skipped taskbar');
                
                // Always on top
                overlay.setAlwaysOnTop(true, 'screen-saver');
                console.log('   ✓ Set to highest window level');
                
                // Basic content protection (very weak on Linux)
                overlay.setContentProtection(true);
                console.log('   ✓ Content protection enabled (limited)');
                
                // Make visible on all workspaces
                overlay.setVisibleOnAllWorkspaces(true);
                console.log('   ✓ Visible on all workspaces');
                
                // Hide menu bar
                overlay.setMenuBarVisibility(false);
                console.log('   ✓ Menu bar hidden');
                
                console.log('⚠️  Linux: Minimal stealth enabled');
                console.log('   → Window likely VISIBLE in screen recordings');
                console.log('   → Linux lacks native screen capture prevention APIs');
                console.log('   → Best used with manual positioning off-screen');
            } catch (linuxError) {
                console.warn('⚠️  Some Linux stealth features failed:', linuxError.message);
                overlay.setContentProtection(true);
            }
        } else {
            // Unknown platform fallback
            console.log('ℹ️  Unknown platform - using basic stealth');
            overlay.setContentProtection(true);
        }
    } catch (e) {
        console.warn('Could not set stealth features:', e);
        // Fallback: Basic content protection
        try {
            overlay.setContentProtection(true);
        } catch (fallbackError) {
            console.warn('Fallback stealth also failed:', fallbackError);
        }
    }
    
    // Add screen sharing detection
    overlay.webContents.on('media-started-playing', () => {
        console.log('Media started - potential screen sharing detected');
    });
    
    // Monitor for screen capture attempts
    overlay.webContents.on('desktop-capturer-get-sources', () => {
        console.log('Screen capture attempt detected - activating enhanced stealth');
        // Additional stealth measures when screen capture is detected
        overlay.setOpacity(0.01); // Make nearly invisible
        setTimeout(() => {
            overlay.setOpacity(0.95); // Restore after potential capture
        }, 2000);
    });
    
    overlayWindow = overlay;

    overlayWindow.on('closed', () => {
        overlayWindow = null;
        if (floatingWidget) {
            floatingWidget.close();
            floatingWidget = null;
        }
    });

    // Intercept minimize event from native title bar
    overlayWindow.on('minimize', (event) => {
        event.preventDefault(); // Prevent actual minimize
        console.log('Overlay minimize intercepted - showing floating widget');
        
        // Save current bounds before hiding
        if (overlayWindow) {
            const bounds = overlayWindow.getBounds();
            console.log('💾 Saving overlay bounds:', bounds);
            // Store in a global variable
            global.savedOverlayBounds = bounds;
        }
        
        overlayWindow.hide();
        
        // Create floating widget if doesn't exist
        if (!floatingWidget) {
            createFloatingWidget();
        }
        floatingWidget.show();
        floatingWidget.focus();
    });

    return overlay;
}

app.whenReady().then(() => {
    // Load auth module first
    loadAuthModule();
    
    // Start backend server first
    console.log('🚀 Starting backend server...');
    startBackendServer();
    
    // Create main setup window
    createMainWindow();
    
    // SPEED OPTIMIZATION: Start default voice provider (Python by default, can be changed by user)
    console.log('🚀 Starting default voice provider (Python)...');
    initializeVoiceProvider('default');
    
    // ==================== POWER MANAGEMENT ====================
    // Handle system sleep/wake events to prevent blank overlay after sleep
    
    powerMonitor.on('suspend', () => {
        console.log('💤 System going to sleep...');
        
        // Save overlay state before sleep
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            global.savedOverlayBounds = overlayWindow.getBounds();
            global.savedOverlayVisible = overlayWindow.isVisible();
            console.log('💾 Saved overlay state:', {
                bounds: global.savedOverlayBounds,
                visible: global.savedOverlayVisible
            });
        }
    });

    powerMonitor.on('resume', () => {
        console.log('⚡ System waking up from sleep...');
        
        // Restore overlay window after wake
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            try {
                // Force reload the overlay content to prevent blank screen
                console.log('🔄 Reloading overlay content...');
                overlayWindow.webContents.reload();
                
                // Restore bounds and visibility
                if (global.savedOverlayBounds) {
                    setTimeout(() => {
                        overlayWindow.setBounds(global.savedOverlayBounds);
                    }, 500); // Small delay to let reload finish
                }
                
                if (global.savedOverlayVisible) {
                    setTimeout(() => {
                        overlayWindow.show();
                        overlayWindow.focus();
                    }, 600);
                }
                
                console.log('✅ Overlay restored after sleep');
            } catch (error) {
                console.error('❌ Failed to restore overlay:', error);
                
                // If restoration fails, recreate the overlay
                console.log('🔧 Recreating overlay window...');
                if (overlayWindow) {
                    overlayWindow.close();
                    overlayWindow = null;
                }
                createOverlayWindow();
            }
        }
        
        // Restore main window if it exists
        if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('🔄 Reloading main window content...');
            mainWindow.webContents.reload();
        }
        
        // Restart voice bridge if it died
        const needsRestart = currentVoiceProvider === 'deepgram' 
            ? (!deepgramProcess || !deepgramReady)
            : (!pythonProcess || !pythonReady);
            
        if (needsRestart) {
            console.log(`🎤 Restarting ${currentVoiceProvider} bridge after sleep...`);
            initializeVoiceProvider(currentVoiceProvider, deepgramApiKey, deepgramLanguage);
        }
    });

    // Handle lock screen events (similar issues)
    powerMonitor.on('lock-screen', () => {
        console.log('🔒 Screen locked');
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            global.savedOverlayBounds = overlayWindow.getBounds();
            global.savedOverlayVisible = overlayWindow.isVisible();
        }
    });

    powerMonitor.on('unlock-screen', () => {
        console.log('🔓 Screen unlocked');
        
        // Reload overlay on unlock
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.reload();
            
            setTimeout(() => {
                if (global.savedOverlayBounds) {
                    overlayWindow.setBounds(global.savedOverlayBounds);
                }
                if (global.savedOverlayVisible) {
                    overlayWindow.show();
                }
            }, 500);
        }
    });
    
    console.log('✅ Power management event handlers registered');
    
    // ==================== END POWER MANAGEMENT ====================
    
    // Register global shortcuts
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        if (overlayWindow) {
            if (overlayWindow.isVisible()) {
                overlayWindow.hide();
            } else {
                overlayWindow.show();
                overlayWindow.focus();
            }
        }
    });
    
    globalShortcut.register('CommandOrControl+Shift+T', () => {
        // Toggle transcription
        if (overlayWindow) {
            overlayWindow.webContents.send('toggle-transcription');
        }
    });

    // Register Ctrl+' to toggle overlay minimize/restore
    globalShortcut.register("CommandOrControl+'", () => {
        console.log("🔥 Ctrl+' pressed - Toggling overlay");
        
        if (overlayWindow) {
            if (overlayWindow.isVisible()) {
                // Minimize: Save bounds and show widget
                const bounds = overlayWindow.getBounds();
                console.log('💾 Saving overlay bounds:', bounds);
                global.savedOverlayBounds = bounds;
                
                overlayWindow.hide();
                
                // Create floating widget if doesn't exist
                if (!floatingWidget) {
                    createFloatingWidget();
                }
                floatingWidget.show();
                floatingWidget.focus();
                console.log('✅ Overlay minimized, widget shown');
            } else {
                // Restore: Ensure completely hidden, then set bounds, then show
                console.log('🔄 Starting overlay restore...');
                
                // 1. Hide widget immediately
                if (floatingWidget) {
                    floatingWidget.hide();
                }
                
                // 2. CRITICAL: Ensure overlay is completely hidden first
                if (overlayWindow.isVisible()) {
                    overlayWindow.hide();
                }
                
                // 3. Set opacity to 0 before restoring (prevents flash)
                overlayWindow.setOpacity(0);
                
                // 4. Set bounds while invisible
                if (global.savedOverlayBounds) {
                    console.log('✅ Restoring overlay bounds:', global.savedOverlayBounds);
                    overlayWindow.setBounds(global.savedOverlayBounds, false);
                }
                
                // 5. Use setImmediate to ensure bounds are applied before showing
                setImmediate(() => {
                    // 6. Show window (still invisible due to opacity 0)
                    overlayWindow.showInactive();
                    
                    // 7. Restore opacity after a tiny delay (smooth fade-in)
                    setTimeout(() => {
                        overlayWindow.setOpacity(1);
                        overlayWindow.focus();
                        console.log('✅ Overlay restored smoothly with no jerk!');
                    }, 16); // 1 frame at 60fps
                });
            }
        }
    });

    // Register Ctrl+\ to toggle Start Listen / Stop & Get Answer
    globalShortcut.register('CommandOrControl+\\', () => {
        console.log('🎤 Ctrl+\\ pressed - Toggle Listen/Answer');
        
        if (overlayWindow && overlayWindow.isVisible()) {
            overlayWindow.webContents.send('toggle-listen-answer');
            console.log('✅ Toggle Listen/Answer sent to overlay');
        } else {
            console.log('⚠️ Overlay not visible');
        }
    });
    
    console.log('✅ Ctrl+\\ shortcut registered:', globalShortcut.isRegistered('CommandOrControl+\\'));

    // Register Ctrl+] for Analyze Screen
    globalShortcut.register('CommandOrControl+]', () => {
        console.log('📸 Ctrl+] pressed - Analyze Screen');
        
        if (overlayWindow && overlayWindow.isVisible()) {
            overlayWindow.webContents.send('trigger-analyze-screen');
            console.log('✅ Analyze Screen triggered');
        } else {
            console.log('⚠️ Overlay not visible');
        }
    });
    
    console.log('✅ Ctrl+] shortcut registered:', globalShortcut.isRegistered('CommandOrControl+]'));
    
    // Register Ctrl+Enter for Direct Answer in Overlay
    globalShortcut.register('CommandOrControl+Return', () => {
        console.log('⚡ Ctrl+Enter pressed - Direct Answer');
        
        if (overlayWindow && overlayWindow.isVisible()) {
            overlayWindow.webContents.send('trigger-direct-answer');
            console.log('✅ Direct Answer triggered');
        } else {
            console.log('⚠️ Overlay not visible');
        }
    });
    
    console.log('✅ Ctrl+Enter shortcut registered:', globalShortcut.isRegistered('CommandOrControl+Return'));
    
    // Register Ctrl+[ for BrowseAI Toggle
    globalShortcut.register('CommandOrControl+[', () => {
        console.log('🌐 Ctrl+[ pressed - Toggle BrowseAI');
        
        if (overlayWindow && overlayWindow.isVisible()) {
            overlayWindow.webContents.send('trigger-browse-ai-toggle');
            console.log('✅ BrowseAI toggle triggered');
        } else {
            console.log('⚠️ Overlay not visible');
        }
    });
    
    console.log('✅ Ctrl+[ shortcut registered:', globalShortcut.isRegistered('CommandOrControl+['));
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createOverlayWindow();
    }
});

app.on('will-quit', () => {
    // Stop backend server
    stopBackendServer();
    
    // Stop voice bridges
    stopPythonBridge();
    stopDeepgramBridge();
    
    // Unregister all shortcuts
    globalShortcut.unregisterAll();
    
    // Close floating widget
    if (floatingWidget) {
        floatingWidget.close();
        floatingWidget = null;
    }
});

// IPC handlers for window controls
ipcMain.on('window-minimize', () => {
    if (overlayWindow) {
        // Manually trigger the same behavior as native minimize
        overlayWindow.hide();
        
        // Create floating widget
        if (!floatingWidget) {
            createFloatingWidget();
        }
        floatingWidget.show();
        floatingWidget.focus();
    }
});

ipcMain.on('window-close', () => {
    if (overlayWindow) {
        overlayWindow.close();
    }
});

ipcMain.on('window-toggle-always-on-top', () => {
    if (overlayWindow) {
        const isOnTop = overlayWindow.isAlwaysOnTop();
        overlayWindow.setAlwaysOnTop(!isOnTop);
    }
});

ipcMain.on('toggle-transcription', () => {
    if (overlayWindow) {
        overlayWindow.webContents.send('toggle-transcription');
    }
});

ipcMain.on('emergency-stealth', () => {
    if (overlayWindow) {
        console.log('Emergency stealth activated - hiding window');
        overlayWindow.setOpacity(0.01); // Make nearly invisible
        overlayWindow.setSkipTaskbar(true);
        
        // Restore after 5 seconds
        setTimeout(() => {
            if (overlayWindow) {
                overlayWindow.setOpacity(0.95);
                overlayWindow.setSkipTaskbar(false);
                console.log('Emergency stealth deactivated - window restored');
            }
        }, 5000);
    }
});

ipcMain.on('launch-stealth-pip', () => {
    console.log('Launching stealth PiP overlay...');
    if (!overlayWindow || overlayWindow.isDestroyed()) {
        createOverlayWindow();
    } else {
        if (overlayWindow.isMinimized()) {
            overlayWindow.restore();
        }
        
        // Hide widget if it's visible (overlay and widget shouldn't both be visible)
        if (floatingWidget && !floatingWidget.isDestroyed()) {
            floatingWidget.hide();
        }
        
        overlayWindow.show();
        overlayWindow.focus();
        
        // Trigger overlay to reload fresh data (in case session was cleared)
        overlayWindow.webContents.send('reload-overlay-data');
    }
});

ipcMain.on('close-overlay', () => {
    console.log('Closing overlay window...');
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.close();
    }
});

ipcMain.on('notify-overlay-settings-changed', () => {
    console.log('📢 Settings changed - notifying overlay...');
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('settings-updated');
        console.log('✅ Overlay notified of settings update');
    }
});

// Chat history update notification
ipcMain.on('chat-history-updated', (event, { userId, count }) => {
    console.log('📢 Chat history updated - notifying windows...', count, 'messages');
    
    // Notify main window
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat-history-updated', { userId, count });
        console.log('✅ Main window notified of chat history update');
    }
    
    // Notify overlay window
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('chat-history-updated', { userId, count });
        console.log('✅ Overlay window notified of chat history update');
    }
});

// ========================
// BROWSER VIEW HANDLERS
// ========================

// Open AI Browser in overlay
ipcMain.on('open-ai-browser', (event, provider) => {
    console.log('🌐 Opening AI browser for:', provider);
    
    // Set the current provider for dynamic spacing
    const providerMap = {
        'chatgpt': 'ChatGPT',
        'google': 'Google',
        'aistudio': 'AI Studio',
        'gemini': 'Gemini',
        'claude': 'Claude'
    };
    currentBrowserProvider = providerMap[provider] || 'Google';
    console.log(`🎯 Set browser provider to: ${currentBrowserProvider}`);
    
    if (!overlayWindow || overlayWindow.isDestroyed()) {
        console.error('❌ Overlay window not available');
        return;
    }
    
    try {
        // Check if browserView exists and is destroyed
        if (browserView) {
            try {
                // Check if webContents is destroyed
                if (browserView.webContents && browserView.webContents.isDestroyed()) {
                    console.log('⚠️ BrowserView was destroyed, creating new one');
                    browserView = null; // Reset so we create a new one
                }
            } catch (e) {
                console.log('⚠️ BrowserView check failed, creating new one:', e.message);
                browserView = null;
            }
        }
        
        // Reuse existing BrowserView if it exists (preserves state)
        if (!browserView) {
            console.log('✅ Creating new BrowserView');
            browserView = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, 'browser-preload.js'),
                    enableRemoteModule: false,
                    webSecurity: true
                },
                backgroundColor: '#00000000' // Transparent
            });
            
            // Make browser transparent - inject CSS on every page load
            browserView.webContents.on('did-finish-load', () => {
                browserView.webContents.insertCSS(`
                    body, html, #root, [role="main"], .main, main {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                    * {
                        background-attachment: scroll !important;
                    }
                `).catch(err => console.log('CSS injection error:', err));
            });
            
            // Also inject on navigation
            browserView.webContents.on('did-navigate', () => {
                browserView.webContents.insertCSS(`
                    body, html, #root, [role="main"], .main, main {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                `).catch(err => console.log('CSS injection error:', err));
            });
            
            // Handle permissions for BrowserView (clipboard, etc.)
            browserView.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
                console.log('🔐 BrowserView permission requested:', permission);
                // Grant clipboard and other necessary permissions
                if (permission === 'clipboard-read' || 
                    permission === 'clipboard-write' || 
                    permission === 'clipboard-sanitized-write') {
                    console.log('✅ Granting clipboard permission');
                    callback(true);
                } else if (permission === 'media' || permission === 'microphone' || permission === 'camera') {
                    console.log('✅ Granting media permission');
                    callback(true);
                } else if (permission === 'notifications') {
                    console.log('❌ Denying notifications');
                    callback(false);
                } else {
                    console.log('❓ Permission:', permission, '- denying by default');
                    callback(false);
                }
            });
        } else {
            console.log('♻️ Reusing existing BrowserView (state preserved)');
        }
        
        // Verify BrowserView is valid before adding
        try {
            // Try to access a property to ensure it's not destroyed
            if (!browserView.webContents || browserView.webContents.isDestroyed()) {
                throw new Error('BrowserView is in invalid state');
            }
            
            // Add to overlay window
            overlayWindow.addBrowserView(browserView);
        } catch (e) {
            console.error('❌ BrowserView is destroyed, creating new one:', e.message);
            browserView = null;
            
            // Create a fresh BrowserView
            browserView = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, 'browser-preload.js'),
                    enableRemoteModule: false,
                    webSecurity: true
                },
                backgroundColor: '#00000000'
            });
            
            // Set up event handlers
            browserView.webContents.on('did-finish-load', () => {
                browserView.webContents.insertCSS(`
                    body, html, #root, [role="main"], .main, main {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                    * {
                        background-attachment: scroll !important;
                    }
                `).catch(err => console.log('CSS injection error:', err));
            });
            
            browserView.webContents.on('did-navigate', () => {
                browserView.webContents.insertCSS(`
                    body, html, #root, [role="main"], .main, main {
                        background: transparent !important;
                        background-color: transparent !important;
                    }
                `).catch(err => console.log('CSS injection error:', err));
            });
            
            browserView.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
                console.log('🔐 BrowserView permission requested:', permission);
                if (permission === 'clipboard-read' || permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') {
                    callback(true);
                } else if (permission === 'media' || permission === 'microphone' || permission === 'camera') {
                    callback(true);
                } else {
                    callback(false);
                }
            });
            
            console.log('✅ Created fresh BrowserView after detecting destroyed state');
            overlayWindow.addBrowserView(browserView);
        }
        
        // Position it ONLY in Q&A section area (below Listen/Get Answer buttons AND navigation toolbar)
        const bounds = overlayWindow.getBounds();
        const spacing = getBrowserViewSpacing(currentBrowserProvider);
        
        // Dynamic spacing based on provider:
        // - Gemini, Claude: y=228, height offset=248 (less space)
        // - GPT, Google, AI Studio: y=280, height offset=300 (more space to prevent header overlap)
        browserView.setBounds({
            x: 16,  // Left padding
            y: spacing.y,  // Dynamic spacing based on provider
            width: bounds.width - 32,  // Account for both sides padding
            height: bounds.height - spacing.height  // Dynamic height offset
        });
        
        browserView.setAutoResize({
            width: true,
            height: true
        });
        
        // Only load URL if BrowserView is new or empty (preserve state on reopen)
        const currentUrl = browserView.webContents.getURL();
        if (!currentUrl || currentUrl === '' || currentUrl === 'about:blank') {
            // Load AI provider URL only for new browser
            const urls = {
                'google': 'https://www.google.com',
                'chatgpt': 'https://chatgpt.com',
                'aistudio': 'https://aistudio.google.com/app/prompts/new_chat',
                'claude': 'https://claude.ai',
                'gemini': 'https://gemini.google.com'
            };
            
            const url = urls[provider] || urls.google;
            browserView.webContents.loadURL(url);
            
            console.log('✅ Browser view loaded:', url);
            
            // Store current provider
            global.currentAIProvider = provider;
        } else {
            console.log('✅ Browser view restored to:', currentUrl);
            console.log('♻️ Current provider:', global.currentAIProvider || 'unknown');
        }
        
    } catch (error) {
        console.error('❌ Failed to open browser:', error);
    }
});

// Hide AI Browser (for modals)
ipcMain.on('hide-ai-browser', () => {
    console.log('🌐 Hiding AI browser');
    
    if (browserView && overlayWindow && !overlayWindow.isDestroyed()) {
        try {
            overlayWindow.removeBrowserView(browserView);
            console.log('✅ Browser view hidden');
        } catch (error) {
            console.error('❌ Failed to hide browser:', error);
        }
    }
});

// Show AI Browser (after modal closes)
ipcMain.on('show-ai-browser', () => {
    console.log('🌐 Showing AI browser');
    
    if (browserView && overlayWindow && !overlayWindow.isDestroyed()) {
        try {
            overlayWindow.addBrowserView(browserView);
            
            // Restore bounds
            const overlayBounds = overlayWindow.getBounds();
            const sideMargin = 16;
            const spacing = getBrowserViewSpacing(currentBrowserProvider);
            const bottomMargin = 20;
            
            browserView.setBounds({
                x: sideMargin,
                y: spacing.y,
                width: overlayBounds.width - (2 * sideMargin),
                height: overlayBounds.height - spacing.y - bottomMargin
            });
            
            console.log('✅ Browser view shown');
        } catch (error) {
            console.error('❌ Failed to show browser:', error);
        }
    }
});

// Forward overlay renderer logs to terminal
ipcMain.on('overlay-log', (event, message) => {
    console.log(`[OVERLAY] ${message}`);
});

// Clear Claude's input field (to prevent draft restoration)
ipcMain.on('clear-claude-input', async (event) => {
    const timestamp = new Date().toISOString();
    console.log(`🧹 [${timestamp}] Clearing Claude input field...`);
    
    if (!browserView || global.currentAIProvider !== 'claude') {
        console.log(`⚠️ [${timestamp}] Not on Claude or browser not active`);
        return;
    }
    
    try {
        const script = `
            (async function() {
                try {
                    console.log('🧹 Attempting to clear Claude input field...');
                    
                    // Find Claude's input field (contenteditable or textarea)
                    const selectors = [
                        'div[contenteditable="true"]',
                        'textarea[placeholder*="Talk"]',
                        'div[role="textbox"]',
                        '[contenteditable="true"]',
                        'textarea'
                    ];
                    
                    let inputField = null;
                    for (const selector of selectors) {
                        inputField = document.querySelector(selector);
                        if (inputField) {
                            console.log('✅ Found Claude input with selector:', selector);
                            break;
                        }
                    }
                    
                    if (inputField) {
                        // Clear the field
                        if (inputField.isContentEditable) {
                            inputField.textContent = '';
                            inputField.innerHTML = '';
                        } else {
                            inputField.value = '';
                        }
                        
                        // Trigger events to ensure React/Vue detects the change
                        inputField.dispatchEvent(new Event('input', { bubbles: true }));
                        inputField.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        console.log('✅ Claude input field cleared');
                        return { success: true };
                    } else {
                        console.warn('⚠️ Claude input field not found');
                        return { success: false, error: 'Input field not found' };
                    }
                } catch (error) {
                    console.error('❌ Error clearing Claude input:', error);
                    return { success: false, error: error.message };
                }
            })();
        `;
        
        const result = await browserView.webContents.executeJavaScript(script);
        
        if (result && result.success) {
            console.log(`✅ [${timestamp}] Claude input cleared successfully`);
        } else {
            console.log(`⚠️ [${timestamp}] Failed to clear Claude input:`, result?.error);
        }
    } catch (error) {
        console.error(`❌ [${timestamp}] Error executing clear script:`, error);
    }
});

// Close AI Browser
// Close AI browser (HIDE, don't destroy - preserves state)
ipcMain.on('close-ai-browser', () => {
    console.log('🌐 Hiding AI browser (preserving state)');
    
    if (browserView && overlayWindow && !overlayWindow.isDestroyed()) {
        try {
            // Just remove the view, DON'T destroy it
            overlayWindow.removeBrowserView(browserView);
            console.log('✅ Browser view hidden (state preserved)');
            // NOTE: browserView is NOT set to null, so it's reused next time
            // NOTE: global.currentAIProvider is NOT cleared, so we remember the provider
        } catch (error) {
            console.error('❌ Failed to hide browser:', error);
        }
    }
});

// Set browser provider for dynamic spacing
ipcMain.on('set-browser-provider', (event, providerName) => {
    currentBrowserProvider = providerName;
    console.log(`🎯 Browser provider set to: ${providerName}`);
    
    // Update browser view bounds immediately if it exists
    if (browserView && overlayWindow && !overlayWindow.isDestroyed()) {
        const bounds = overlayWindow.getBounds();
        const spacing = getBrowserViewSpacing(providerName);
        
        try {
            browserView.setBounds({
                x: 16,
                y: spacing.y,
                width: bounds.width - 32,
                height: bounds.height - spacing.height
            });
            console.log(`✅ Updated browser view spacing: y=${spacing.y}, height offset=${spacing.height}`);
        } catch (error) {
            console.error('❌ Failed to update browser spacing:', error);
        }
    }
});

// Browser Navigation (back, forward, reload, URL)
ipcMain.on('browser-navigate', (event, action) => {
    const timestamp = new Date().toISOString();
    if (!browserView) {
        console.error(`❌ [${timestamp}] Browser view not active`);
        return;
    }
    
    try {
        if (action === 'back') {
            if (browserView.webContents.canGoBack()) {
                browserView.webContents.goBack();
                console.log(`⬅️ [${timestamp}] Browser: Go back`);
            }
        } else if (action === 'forward') {
            if (browserView.webContents.canGoForward()) {
                browserView.webContents.goForward();
                console.log(`➡️ [${timestamp}] Browser: Go forward`);
            }
        } else if (action === 'reload') {
            browserView.webContents.reload();
            console.log(`🔄 [${timestamp}] Browser: Reload`);
        } else if (action.startsWith('http')) {
            // Navigate to URL
            browserView.webContents.loadURL(action);
            console.log(`🌐 [${timestamp}] Browser: Navigate to`, action);
            
            // Update current provider based on URL
            if (action.includes('chatgpt.com')) {
                global.currentAIProvider = 'chatgpt';
            } else if (action.includes('aistudio.google.com')) {
                global.currentAIProvider = 'aistudio';
            } else if (action.includes('gemini.google.com')) {
                global.currentAIProvider = 'gemini';
            } else if (action.includes('claude.ai')) {
                global.currentAIProvider = 'claude';
                
                // CLAUDE SPECIFIC: Clear any cached form data to prevent auto-fill
                console.log(`🧹 [${timestamp}] Claude detected - clearing session cache`);
                browserView.webContents.session.clearCache().then(() => {
                    console.log(`✅ [${timestamp}] Claude session cache cleared`);
                }).catch(err => {
                    console.log(`⚠️ [${timestamp}] Cache clear warning:`, err.message);
                });
            } else {
                global.currentAIProvider = 'google';
            }
            console.log(`🔄 [${timestamp}] Provider updated to:`, global.currentAIProvider);
        }
    } catch (error) {
        console.error(`❌ [${timestamp}] Navigation error:`, error);
    }
});

// Get current browser URL
ipcMain.handle('get-browser-url', async (event) => {
    if (!browserView) {
        console.error('❌ Browser view not active');
        return null;
    }
    
    try {
        const currentUrl = browserView.webContents.getURL();
        console.log('🔍 Current browser URL:', currentUrl);
        return currentUrl;
    } catch (error) {
        console.error('❌ Failed to get browser URL:', error);
        return null;
    }
});

// Wait for page to load completely
ipcMain.handle('wait-for-page-load', async (event) => {
    const timestamp = new Date().toISOString();
    
    if (!browserView) {
        console.error(`❌ [${timestamp}] Browser view not active`);
        return false;
    }
    
    try {
        console.log(`⏳ [${timestamp}] Waiting for page to load...`);
        
        // Check if page is already loaded
        if (!browserView.webContents.isLoading()) {
            console.log(`✅ [${timestamp}] Page already loaded (instant)`);
            // Very small delay for JS to settle
            await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms
            return true;
        }
        
        // Wait for did-finish-load event with timeout
        return await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                const ts = new Date().toISOString();
                console.warn(`⚠️ [${ts}] Page load timeout (8s) - continuing anyway`);
                resolve(true); // Return true instead of false to continue
            }, 8000); // Reduced from 10s to 8s
            
            const loadHandler = () => {
                clearTimeout(timeout);
                const ts = new Date().toISOString();
                console.log(`✅ [${ts}] Page loaded successfully`);
                browserView.webContents.removeListener('did-finish-load', loadHandler);
                
                // Minimal delay for JS to initialize
                setTimeout(() => {
                    resolve(true);
                }, 300); // Reduced from 500ms to 300ms
            };
            
            browserView.webContents.once('did-finish-load', loadHandler);
        });
    } catch (error) {
        const ts = new Date().toISOString();
        console.error(`❌ [${ts}] Failed to wait for page load:`, error);
        return true; // Return true to continue anyway
    }
});

// Send text to AI provider and optionally submit
ipcMain.on('send-text-to-ai', async (event, text, shouldSubmit = false) => {
    const timestamp = new Date().toISOString();
    console.log(`📝 [${timestamp}] Sending text to AI provider:`, text?.substring(0, 50) + '...', shouldSubmit ? '(with submit)' : '(paste only)');
    
    if (!browserView || !global.currentAIProvider) {
        console.error(`❌ [${timestamp}] Browser not active or provider not set`);
        return;
    }
    
    try {
        const provider = global.currentAIProvider;
        console.log(`🎯 [${timestamp}] Target provider:`, provider);
        
        // Execute JavaScript to set textarea value and optionally submit
        const script = `
            (async function() {
                try {
                    const text = ${JSON.stringify(text)};
                    const shouldSubmit = ${shouldSubmit};
                    console.log('📝 Attempting to send text:', text.substring(0, 50), 'Submit:', shouldSubmit);
                    
                    // Helper to set React input
                    function setReactInput(element, value) {
                        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                element.tagName === 'TEXTAREA' 
                                    ? window.HTMLTextAreaElement.prototype 
                                    : window.HTMLInputElement.prototype,
                                'value'
                            ).set;
                            nativeInputValueSetter.call(element, value);
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            // For contenteditable (Gemini, etc)
                            console.log('📝 Setting contenteditable element...');
                            
                            // Method 1: Direct set (simple and reliable)
                            element.textContent = value;
                            element.focus();
                            
                            // Trigger all events
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                            element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                            element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
                            
                            console.log('✅ Contenteditable value set and events fired');
                        }
                    }
                    
                    let textarea = null;
                    let found = false;
                    
                    // Try multiple selectors based on provider
                    const selectors = {
                        'chatgpt': [
                            'textarea[id*="prompt"]',
                            'textarea[placeholder*="Message"]',
                            '#prompt-textarea',
                            'textarea'
                        ],
                        'aistudio': [
                            'textarea',
                            '[contenteditable="true"]',
                            'div[role="textbox"]'
                        ],
                        'gemini': [
                            'rich-textarea div[contenteditable="true"]',
                            'div[contenteditable="true"]',
                            '[contenteditable="true"]',
                            'textarea'
                        ],
                        'claude': [
                            'textarea[placeholder*="Talk"]',
                            '[contenteditable="true"]',
                            'div[role="textbox"]',
                            'textarea'
                        ],
                        'google': [
                            'textarea[name="q"]',
                            'input[name="q"]'
                        ]
                    };
                    
                    const providerSelectors = selectors['${provider}'] || selectors['chatgpt'];
                    
                    console.log('🔍 Trying selectors for provider:', '${provider}');
                    
                    // Retry logic for finding element (sometimes takes time to load)
                    let retries = 3;
                    while (retries > 0 && !textarea) {
                        for (const selector of providerSelectors) {
                            textarea = document.querySelector(selector);
                            if (textarea) {
                                console.log('✅ Found input with selector:', selector);
                                found = true;
                                break;
                            }
                        }
                        
                        if (!textarea && retries > 1) {
                            console.log('⏳ Element not found, retrying... (' + retries + ' left)');
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                        retries--;
                    }
                    
                    if (!textarea) {
                        console.error('❌ No textarea found with any selector after retries');
                        return { success: false, error: 'Textarea not found. Make sure you are on a chat page.' };
                    }
                    
                    // Set the text
                    setReactInput(textarea, text);
                    
                    // Focus the textarea
                    textarea.focus();
                    
                    console.log('✅ Text successfully set in textarea');
                    
                    // If shouldSubmit, find and click the send button
                    if (shouldSubmit) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for text to be set
                        
                        let sendButton = null;
                        
                        // Find send button based on provider
                        if ('${provider}' === 'chatgpt') {
                            sendButton = document.querySelector('button[data-testid="send-button"]') ||
                                       document.querySelector('button[aria-label*="Send"]') ||
                                       textarea.closest('form')?.querySelector('button[type="submit"]');
                        } else if ('${provider}' === 'aistudio') {
                            sendButton = document.querySelector('button[aria-label*="Send"]') ||
                                       document.querySelector('button[mattooltip*="Send"]') ||
                                       textarea.closest('form')?.querySelector('button');
                        } else if ('${provider}' === 'gemini') {
                            sendButton = document.querySelector('button[aria-label*="Send"]') ||
                                       document.querySelector('button.send-button') ||
                                       document.querySelector('[aria-label*="send"]') ||
                                       document.querySelector('button[mattooltip*="Send"]') ||
                                       textarea.parentElement?.parentElement?.querySelector('button') ||
                                       textarea.closest('form')?.querySelector('button');
                        } else if ('${provider}' === 'claude') {
                            sendButton = document.querySelector('button[aria-label*="Send"]') ||
                                       textarea.closest('form')?.querySelector('button[type="submit"]');
                        }
                        
                        if (sendButton) {
                            console.log('✅ Found send button, clicking...');
                            sendButton.click();
                            return { success: true, submitted: true };
                        } else {
                            console.warn('⚠️ Send button not found, text pasted but not submitted');
                            return { success: true, submitted: false, warning: 'Send button not found' };
                        }
                    }
                    
                    return { success: true, submitted: false };
                    
                } catch (error) {
                    console.error('❌ Error in text sending script:', error);
                    return { success: false, error: error.message };
                }
            })();
        `;
        
        const result = await browserView.webContents.executeJavaScript(script);
        
        if (result && result.success) {
            if (result.submitted) {
                console.log('✅ Text sent and submitted to AI provider');
            } else {
                console.log('✅ Text pasted to AI provider');
            }
        } else if (result && result.success === false) {
            console.error('❌ Failed to send text:', result.error);
        } else {
            console.log('✅ Text sent to AI provider');
        }
        
    } catch (error) {
        console.error('❌ Failed to send text:', error);
    }
});

// Capture screen and attach to AI provider via CLIPBOARD
ipcMain.handle('analyze-screen', async (event) => {
    console.log('📸 Capturing screen...');
    
    try {
        // Get all sources (screens + windows)
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: screen.getPrimaryDisplay().size
        });
        
        if (sources.length === 0) {
            throw new Error('No screen sources found');
        }
        
        // Get primary screen screenshot as NativeImage
        const screenshot = sources[0].thumbnail;
        
        console.log('✅ Screenshot captured');
        
        // If browser is active, copy to clipboard and paste
        if (browserView && global.currentAIProvider) {
            const provider = global.currentAIProvider;
            
            // Step 1: Copy image to clipboard
            clipboard.writeImage(screenshot);
            console.log('📋 Screenshot copied to clipboard');
            
            // Step 2: Find and focus input field
            const focusScript = `
                (async function() {
                    try {
                        console.log('📝 Looking for input field for provider: ${provider}');
                        
                        // For AI Studio, try to click the + button first
                        if ('${provider}' === 'aistudio') {
                            console.log('🔍 AI Studio detected - looking for add button...');
                            const addButton = document.querySelector('button[aria-label*="Add"]') ||
                                            document.querySelector('button[mattooltip*="Add"]') ||
                                            document.querySelector('mat-icon[fonticon="add"]')?.closest('button');
                            if (addButton) {
                                console.log('✅ Found add button, clicking...');
                                addButton.click();
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                        
                        // Find the main input field (textarea or contenteditable)
                        let inputField = null;
                        
                        // Provider-specific selectors (try most specific first)
                        const selectors = {
                            'claude': [
                                'div[contenteditable="true"][data-placeholder*="Talk"]',
                                'div[contenteditable="true"]',
                                'textarea[placeholder*="Talk"]',
                                'div[role="textbox"]',
                                'textarea'
                            ],
                            'chatgpt': [
                                'textarea[id*="prompt"]',
                                '#prompt-textarea',
                                'textarea[placeholder*="Message"]',
                                'textarea'
                            ],
                            'gemini': [
                                'rich-textarea div[contenteditable="true"]',
                                'div[contenteditable="true"]',
                                'textarea'
                            ],
                            'aistudio': [
                                'textarea',
                                '[contenteditable="true"]',
                                'div[role="textbox"]'
                            ]
                        };
                        
                        const providerSelectors = selectors['${provider}'] || [
                            'textarea',
                            '[contenteditable="true"]',
                            'div[role="textbox"]',
                            'input[type="text"]'
                        ];
                        
                        console.log('🔍 Trying selectors for ${provider}:', providerSelectors.length);
                        
                        for (const selector of providerSelectors) {
                            inputField = document.querySelector(selector);
                            if (inputField) {
                                console.log('✅ Found input field with selector:', selector);
                                break;
                            }
                        }
                        
                        if (!inputField) {
                            console.error('❌ No input field found with any selector');
                            return { success: false, error: 'Input field not found. Make sure you are on a chat page.' };
                        }
                        
                        // Focus the input field (multiple attempts for contenteditable)
                        inputField.focus();
                        inputField.click();
                        
                        // For contenteditable, ensure cursor is placed
                        if (inputField.isContentEditable) {
                            const range = document.createRange();
                            const sel = window.getSelection();
                            range.selectNodeContents(inputField);
                            range.collapse(false);
                            sel.removeAllRanges();
                            sel.addRange(range);
                            console.log('✅ Cursor placed in contenteditable');
                        }
                        
                        console.log('✅ Input field focused and ready for paste');
                        
                        return { success: true };
                        
                    } catch (error) {
                        console.error('❌ Focus error:', error);
                        return { success: false, error: error.message };
                    }
                })();
            `;
            
            // Execute focus script
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for clipboard
            const focusResult = await browserView.webContents.executeJavaScript(focusScript);
            
            if (!focusResult || !focusResult.success) {
                return { success: false, error: focusResult?.error || 'Failed to focus input field' };
            }
            
            // Step 3: Send Ctrl+V to paste
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for focus
            
            browserView.webContents.paste(); // This uses Electron's built-in paste
            console.log('✅ Paste command sent (Ctrl+V)');
            
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for paste to complete
            
            return { success: true, message: 'Screenshot pasted via clipboard' };
        }
        
        return { success: true, image: screenshot.toDataURL() };
        
    } catch (error) {
        console.error('❌ Screenshot failed:', error);
        return { success: false, error: error.message };
    }
});

// Handle window resize - update browser view bounds
ipcMain.on('overlay-resize', (event, { deltaX, deltaY, direction }) => {
    if (overlayWindow) {
        const bounds = overlayWindow.getBounds();
        
        // Update browser view if active (only in Q&A section, below navigation toolbar)
        if (browserView) {
            try {
                const spacing = getBrowserViewSpacing(currentBrowserProvider);
                browserView.setBounds({
                    x: 16,
                    y: spacing.y,  // Dynamic spacing based on provider
                    width: bounds.width - 32,
                    height: bounds.height - spacing.height
                });
            } catch (error) {
                console.error('Failed to resize browser view:', error);
            }
        }
    }
});

ipcMain.on('toggle-overlay-minimize', () => {
    console.log('🔘 Minimize button clicked - Toggling overlay');
    
    if (overlayWindow) {
        if (overlayWindow.isVisible()) {
            // Minimize: Save bounds and show widget (same as Ctrl+')
            const bounds = overlayWindow.getBounds();
            console.log('💾 Saving overlay bounds:', bounds);
            global.savedOverlayBounds = bounds;
            
            overlayWindow.hide();
            
            // Create floating widget if doesn't exist
            if (!floatingWidget) {
                createFloatingWidget();
            }
            floatingWidget.show();
            floatingWidget.focus();
            console.log('✅ Overlay minimized, widget shown');
        } else {
            // Restore: Same logic as Ctrl+'
            console.log('🔄 Starting overlay restore...');
            
            // 1. Hide widget immediately
            if (floatingWidget) {
                floatingWidget.hide();
            }
            
            // 2. Ensure overlay is completely hidden first
            if (overlayWindow.isVisible()) {
                overlayWindow.hide();
            }
            
            // 3. Set opacity to 0 before restoring
            overlayWindow.setOpacity(0);
            
            // 4. Set bounds while invisible
            if (global.savedOverlayBounds) {
                console.log('✅ Restoring overlay bounds:', global.savedOverlayBounds);
                overlayWindow.setBounds(global.savedOverlayBounds, false);
            }
            
            // 5. Use setImmediate to ensure bounds are applied
            setImmediate(() => {
                overlayWindow.showInactive();
                
                setTimeout(() => {
                    overlayWindow.setOpacity(1);
                    overlayWindow.focus();
                    console.log('✅ Overlay restored smoothly!');
                }, 16);
            });
        }
    }
});

ipcMain.on('show-main-window', () => {
    console.log('Showing main setup window...');
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    } else {
        // If window was closed/destroyed, recreate it
        createMainWindow();
    }
});

// Overlay resize handlers
let resizeStartSize = null;
let resizeStartPosition = null;

ipcMain.on('overlay-resize-start', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        resizeStartSize = overlayWindow.getSize();
        resizeStartPosition = overlayWindow.getPosition();
        console.log('🔧 Resize started, initial size:', resizeStartSize, 'position:', resizeStartPosition);
    }
});

ipcMain.on('overlay-resize', (event, { deltaX, deltaY, direction }) => {
    if (overlayWindow && !overlayWindow.isDestroyed() && resizeStartSize && resizeStartPosition) {
        const [startWidth, startHeight] = resizeStartSize;
        const [startX, startY] = resizeStartPosition;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startX;
        let newY = startY;
        
        // Handle different resize directions
        switch(direction) {
            case 'se': // South-East (bottom-right)
                newWidth = startWidth + deltaX;
                newHeight = startHeight + deltaY;
                break;
            case 'sw': // South-West (bottom-left)
                newWidth = startWidth - deltaX;
                newHeight = startHeight + deltaY;
                newX = startX + deltaX;
                break;
            case 'ne': // North-East (top-right)
                newWidth = startWidth + deltaX;
                newHeight = startHeight - deltaY;
                newY = startY + deltaY;
                break;
            case 'nw': // North-West (top-left)
                newWidth = startWidth - deltaX;
                newHeight = startHeight - deltaY;
                newX = startX + deltaX;
                newY = startY + deltaY;
                break;
            case 'e': // East (right edge)
                newWidth = startWidth + deltaX;
                break;
            case 'w': // West (left edge)
                newWidth = startWidth - deltaX;
                newX = startX + deltaX;
                break;
            case 's': // South (bottom edge)
                newHeight = startHeight + deltaY;
                break;
            case 'n': // North (top edge)
                newHeight = startHeight - deltaY;
                newY = startY + deltaY;
                break;
        }
        
        // Apply size constraints
        newWidth = Math.max(400, Math.min(1200, newWidth));
        newHeight = Math.max(120, Math.min(800, newHeight));
        
        // Adjust position if size hit minimum constraints (for west/north directions)
        if (direction.includes('w') && newWidth === 400) {
            newX = startX + startWidth - 400;
        }
        if (direction.includes('n') && newHeight === 120) {
            newY = startY + startHeight - 120;
        }
        
        // Apply new size and position
        overlayWindow.setBounds({
            x: Math.floor(newX),
            y: Math.floor(newY),
            width: Math.floor(newWidth),
            height: Math.floor(newHeight)
        });
    }
});

ipcMain.on('overlay-resize-end', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        const finalSize = overlayWindow.getSize();
        const finalPosition = overlayWindow.getPosition();
        console.log('✅ Resize ended, final size:', finalSize, 'position:', finalPosition);
        resizeStartSize = null;
        resizeStartPosition = null;
    }
});

// Clipboard handler for overlay window
ipcMain.handle('clipboard-write', async (event, text) => {
    try {
        clipboard.writeText(text);
        console.log('✅ Clipboard write successful');
        return { success: true };
    } catch (error) {
        console.error('❌ Clipboard write failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('capture-screen', async () => {
    try {
        console.log('Capturing screen...');
        const sources = await desktopCapturer.getSources({ 
            types: ['screen'], 
            thumbnailSize: { width: 1920, height: 1080 } 
        });
        
        // Find primary screen or use the first one
        const primarySource = sources[0]; 
        if (primarySource) {
            return primarySource.thumbnail.toDataURL();
        }
        throw new Error('No screen source found');
    } catch (error) {
        console.error('Failed to capture screen:', error);
        return null;
    }
});

ipcMain.on('restore-overlay-from-widget', () => {
    console.log('Restoring overlay from floating widget');
    if (overlayWindow) {
        // Restore saved bounds if they exist
        if (global.savedOverlayBounds) {
            console.log('✅ Restoring overlay bounds:', global.savedOverlayBounds);
            overlayWindow.setBounds(global.savedOverlayBounds);
        }
        
        overlayWindow.show();
        overlayWindow.focus();
    }
    if (floatingWidget) {
        floatingWidget.hide();
    }
});

ipcMain.on('resize-window', (event, data) => {
    if (overlayWindow) {
        const { direction, deltaX, deltaY } = data;
        const bounds = overlayWindow.getBounds();
        
        let newBounds = { ...bounds };
        
        switch (direction) {
            case 'se': // Southeast - resize both width and height
                newBounds.width = Math.max(300, bounds.width + deltaX);
                newBounds.height = Math.max(200, bounds.height + deltaY);
                break;
            case 's': // South - resize height only
                newBounds.height = Math.max(200, bounds.height + deltaY);
                break;
            case 'e': // East - resize width only
                newBounds.width = Math.max(300, bounds.width + deltaX);
                break;
        }
        
        // Apply size constraints
        newBounds.width = Math.min(800, newBounds.width);
        newBounds.height = Math.min(1000, newBounds.height);
        
        overlayWindow.setBounds(newBounds);
    }
});
