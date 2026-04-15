/**
 * Deepgram Real-Time Speech Recognition Bridge
 * Uses Deepgram WebSocket API for live transcription
 * Windows-compatible version using Deepgram SDK's built-in microphone
 */

const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");

let deepgramClient = null;
let deepgramLive = null;
let microphoneStream = null;
let isListening = false;
let apiKey = '';

// Initialize Deepgram client
function initDeepgram(key) {
    try {
        apiKey = key;
        deepgramClient = createClient(apiKey);
        sendStatus('Deepgram client initialized');
        return true;
    } catch (error) {
        sendError(`Failed to initialize Deepgram: ${error.message}`);
        return false;
    }
}

// Send JSON message to stdout
function sendMessage(type, data) {
    try {
        const message = JSON.stringify({ type, ...data });
        process.stdout.write(message + '\n');
    } catch (error) {
        // Ignore EPIPE errors silently
    }
}

function sendStatus(message) {
    sendMessage('status', { message });
}

function sendError(message) {
    sendMessage('error', { message });
}

function sendTranscription(text, isFinal) {
    sendMessage('transcription', { text, is_final: isFinal });
}

function sendDebug(message) {
    sendMessage('debug', { message });
}

// Start listening with getUserMedia
async function startListening() {
    if (isListening) {
        sendStatus('Already listening');
        return;
    }

    if (!apiKey) {
        sendError('Deepgram API key not set');
        return;
    }

    try {
        sendStatus('Starting Deepgram live transcription...');

        // For Node.js environment, we need to use a different approach
        // Import mic package dynamically to handle microphone
        const mic = require('mic');
        
        // Create Deepgram live transcription connection
        deepgramLive = deepgramClient.listen.live({
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            punctuate: true,
            interim_results: true,
            endpointing: 300,
            utterance_end_ms: 1000,
            vad_events: true,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1
        });

        // Set up event handlers
        deepgramLive.on(LiveTranscriptionEvents.Open, () => {
            sendStatus('Deepgram connection opened');
            
            try {
                // Start microphone (will work on Windows without SOX if using default device)
                const micInstance = mic({
                    rate: '16000',
                    channels: '1',
                    debug: false,
                    exitOnSilence: 0,
                    device: 'default' // Use system default device
                });

                microphoneStream = micInstance.getAudioStream();

                microphoneStream.on('data', (data) => {
                    try {
                        if (deepgramLive && deepgramLive.getReadyState() === 1) {
                            deepgramLive.send(data);
                        }
                    } catch (error) {
                        // Ignore write errors
                    }
                });

                microphoneStream.on('error', (error) => {
                    // Check if it's SOX missing error
                    if (error.message.includes('sox') || error.message.includes('ENOENT')) {
                        sendError('Microphone error: SOX/recording tool not found. Please install SOX or use Python (default) provider instead.');
                    } else {
                        sendError(`Microphone error: ${error.message}`);
                    }
                });

                micInstance.start();
                isListening = true;
                sendStatus('Listening started (Deepgram)');
            } catch (micError) {
                sendError(`Failed to start microphone: ${micError.message}`);
                if (deepgramLive) {
                    deepgramLive.finish();
                    deepgramLive = null;
                }
                isListening = false;
            }
        });

        deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
            try {
                const transcript = data.channel?.alternatives?.[0];
                if (transcript && transcript.transcript) {
                    const text = transcript.transcript.trim();
                    if (text) {
                        sendTranscription(text, data.is_final || false);
                        if (data.is_final) {
                            sendDebug(`Final: "${text}"`);
                        }
                    }
                }
            } catch (error) {
                // Ignore transcript processing errors
            }
        });

        deepgramLive.on(LiveTranscriptionEvents.UtteranceEnd, () => {
            sendDebug('Utterance ended');
        });

        deepgramLive.on(LiveTranscriptionEvents.Error, (error) => {
            sendError(`Deepgram API error: ${error.message || error}`);
        });

        deepgramLive.on(LiveTranscriptionEvents.Close, () => {
            sendStatus('Deepgram connection closed');
            stopListening();
        });

    } catch (error) {
        sendError(`Failed to start listening: ${error.message}`);
        isListening = false;
    }
}

// Stop listening
function stopListening() {
    try {
        sendStatus('Stopping transcription...');

        if (microphoneStream) {
            microphoneStream.destroy();
            microphoneStream = null;
        }

        if (deepgramLive) {
            deepgramLive.finish();
            deepgramLive = null;
        }

        isListening = false;
        sendStatus('Listening stopped');
    } catch (error) {
        // Ignore stop errors
    }
}

// Handle commands from parent process
process.stdin.on('data', (data) => {
    try {
        const command = JSON.parse(data.toString().trim());
        
        switch (command.command) {
            case 'init':
                initDeepgram(command.api_key);
                sendStatus('Ready');
                break;
            case 'start':
                startListening();
                break;
            case 'stop':
                stopListening();
                break;
            case 'exit':
                stopListening();
                setTimeout(() => process.exit(0), 100);
                break;
            default:
                sendError(`Unknown command: ${command.command}`);
        }
    } catch (error) {
        sendError(`Command parsing error: ${error.message}`);
    }
});

// Prevent process from exiting
process.stdin.on('end', () => {
    sendStatus('stdin closed, keeping process alive...');
});

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
    // Suppress EPIPE and SOX errors from showing dialogs
    if (error.code === 'EPIPE') {
        return; // Silently ignore EPIPE
    }
    
    if (error.message && (error.message.includes('spawn sox') || error.message.includes('ENOENT'))) {
        // Send SOX error but don't crash
        sendError(`Uncaught exception: ${error.message}`);
        return;
    }
    
    // Other errors
    sendError(`Uncaught exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    sendError(`Unhandled rejection: ${reason}`);
});

// Handle process termination
process.on('SIGTERM', () => {
    sendStatus('Received SIGTERM, shutting down...');
    stopListening();
    setTimeout(() => process.exit(0), 100);
});

process.on('SIGINT', () => {
    sendStatus('Received SIGINT, shutting down...');
    stopListening();
    setTimeout(() => process.exit(0), 100);
});

// Keep process alive
process.stdin.resume();
process.stdin.setEncoding('utf8');

// Prevent stdout from buffering
if (process.stdout.setEncoding) {
    process.stdout.setEncoding('utf8');
}

// Send ready signal
sendStatus('Deepgram bridge ready');
