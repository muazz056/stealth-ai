"""
Deepgram Real-Time Speech Recognition Bridge (Python)
Uses RAW WebSocket connection to Deepgram API - NO SDK NEEDED!
Uses PyAudio for native microphone capture - NO SOX NEEDED!
"""

import sys
import json
import asyncio
import pyaudio
import websockets
import threading

# Audio configuration
RATE = 16000
CHUNK = 8000
CHANNELS = 1
FORMAT = pyaudio.paInt16

# Global state
api_key = None
language = "multi"  # Default language
keyterms = ""  # Comma-separated important keywords
is_listening = False
ws_connection = None
audio_stream = None
audio = None
listen_task = None
loop = None

# English-like language codes that support full Deepgram features
ENGLISH_LANGS = {'en', 'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ', 'multi'}

def send_message(msg_type, data):
    """Send JSON message to stdout"""
    try:
        message = {"type": msg_type, **data}
        sys.stdout.write(json.dumps(message) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"type": "error", "message": f"Send error: {str(e)}"}) + "\n")
        sys.stdout.flush()

def send_status(message):
    send_message("status", {"message": message})

def send_error(message):
    send_message("error", {"message": message})

def send_transcription(text, is_final):
    send_message("transcription", {"text": text, "is_final": is_final})

def send_debug(message):
    send_message("debug", {"message": message})

async def send_audio(ws):
    """Stream audio from microphone to Deepgram WebSocket"""
    global audio, audio_stream, is_listening
    
    try:
        audio = pyaudio.PyAudio()
        audio_stream = audio.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=RATE,
            input=True,
            frames_per_buffer=CHUNK
        )
        
        send_status("Microphone opened (PyAudio)")
        send_status("Listening... speak now!")
        
        while is_listening:
            try:
                data = audio_stream.read(CHUNK, exception_on_overflow=False)
                await ws.send(data)
                await asyncio.sleep(0.01)
            except Exception as e:
                if is_listening:
                    send_error(f"Audio send error: {str(e)}")
                break
    except Exception as e:
        send_error(f"Microphone error: {str(e)}")
    finally:
        if audio_stream:
            try:
                audio_stream.stop_stream()
                audio_stream.close()
            except:
                pass
            audio_stream = None
        if audio:
            try:
                audio.terminate()
            except:
                pass
            audio = None

async def receive_transcription(ws):
    """Receive transcription results from Deepgram WebSocket"""
    global is_listening
    
    try:
        async for msg in ws:
            if not is_listening:
                break
            try:
                data = json.loads(msg)
                
                # Skip non-transcription messages (metadata, utterance_end, etc.)
                msg_type = data.get("type", "")
                if msg_type != "Results":
                    continue
                
                channel = data.get("channel", {})
                if not isinstance(channel, dict):
                    continue
                    
                alternatives = channel.get("alternatives", [])
                if not isinstance(alternatives, list) or not alternatives:
                    continue
                    
                alt = alternatives[0]
                if not isinstance(alt, dict):
                    continue
                    
                transcript = alt.get("transcript", "")
                if transcript:
                    is_final = data.get("is_final", False)
                    send_transcription(transcript, is_final)
                    if is_final:
                        send_debug(f'Final: "{transcript}"')
            except json.JSONDecodeError:
                pass
            except Exception as e:
                send_error(f"Parse error: {str(e)}")
    except websockets.exceptions.ConnectionClosed:
        send_status("Deepgram connection closed")
    except Exception as e:
        if is_listening:
            send_error(f"Receive error: {str(e)}")

async def start_deepgram():
    """Connect to Deepgram WebSocket API and start streaming"""
    global is_listening, ws_connection
    
    if not api_key:
        send_error("Deepgram API key not set")
        return
    
    send_status("Starting Deepgram live transcription...")
    
    # Build Deepgram WebSocket URL dynamically based on language
    # English/Multi get full features; non-English get minimal (to avoid fallback issues)
    is_english = language in ENGLISH_LANGS
    
    base_params = (
        f"model=nova-3&"
        f"language={language}&"
        f"interim_results=true&"
        f"vad_events=true&"
        f"encoding=linear16&"
        f"sample_rate={RATE}&"
        f"channels={CHANNELS}"
    )
    
    if is_english:
        # Full features for English / Multilingual
        extra = "&smart_format=true&punctuate=true&endpointing=100&diarize=true&dictation=true&utterance_end_ms=1000"
    else:
        # Minimal features for non-English
        extra = "&endpointing=300&utterance_end_ms=1000"
    
    url = f"wss://api.deepgram.com/v1/listen?{base_params}{extra}"
    
    # Add keyterms if provided (only for English)
    if is_english and keyterms and keyterms.strip():
        terms = [t.strip() for t in keyterms.split(',') if t.strip()]
        for term in terms:
            try:
                from urllib.parse import quote
                url += f"&keyterm={quote(term)}"
            except:
                pass  # Skip if encoding fails
    
    send_status(f"Language: {language} ({'full features' if is_english else 'basic features'})")
    if is_english and keyterms:
        send_status(f"Keyterms: {len([t for t in keyterms.split(',') if t.strip()])} terms loaded")
    
    headers = {
        "Authorization": f"Token {api_key}"
    }
    
    try:
        async with websockets.connect(url, additional_headers=headers) as ws:
            ws_connection = ws
            is_listening = True
            send_status("Deepgram connection established")
            
            # Run audio sending and transcription receiving concurrently
            send_task = asyncio.create_task(send_audio(ws))
            recv_task = asyncio.create_task(receive_transcription(ws))
            
            # Wait for either to finish (or stop signal)
            done, pending = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # Cancel remaining tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            is_listening = False
            ws_connection = None
            send_status("Stopped listening")
            
    except Exception as e:
        is_listening = False
        ws_connection = None
        send_error(f"Connection error: {str(e)}")

async def stop_deepgram():
    """Stop Deepgram transcription"""
    global is_listening, ws_connection
    
    is_listening = False
    
    if ws_connection:
        try:
            await ws_connection.close()
        except:
            pass
        ws_connection = None
    
    send_status("Stopped listening")

def run_listen_in_thread():
    """Run the async listen function in a new event loop thread"""
    global loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(start_deepgram())
    except Exception as e:
        send_error(f"Listen thread error: {str(e)}")
    finally:
        loop.close()
        loop = None

def handle_command(command):
    """Handle commands from stdin"""
    global api_key, language, keyterms, is_listening
    
    try:
        cmd_type = command.get("command")
        
        if cmd_type == "init":
            api_key = command.get("apiKey")
            lang = command.get("language")
            kw = command.get("keyterms", "")
            if lang:
                language = lang
                send_status(f"Language set to: {language}")
            if kw is not None:
                keyterms = kw
                if keyterms:
                    send_status(f"Keyterms loaded: {len([t for t in keyterms.split(',') if t.strip()])} terms")
            if api_key:
                send_status("Deepgram API key initialized")
            else:
                send_error("No API key provided")
        
        elif cmd_type == "set-language":
            lang = command.get("language", "multi")
            language = lang
            send_status(f"Language changed to: {language}")
        
        elif cmd_type == "set-keyterms":
            kw = command.get("keyterms", "")
            keyterms = kw
            if keyterms:
                send_status(f"Keyterms updated: {len([t for t in keyterms.split(',') if t.strip()])} terms")
            else:
                send_status("Keyterms cleared")
        
        elif cmd_type == "start":
            if is_listening:
                send_status("Already listening")
                return
            # Accept language and keyterms override in start command too
            lang = command.get("language")
            if lang:
                language = lang
            kw = command.get("keyterms")
            if kw is not None:
                keyterms = kw
            # Run in a separate thread so stdin loop continues
            t = threading.Thread(target=run_listen_in_thread, daemon=True)
            t.start()
        
        elif cmd_type == "stop":
            is_listening = False
            if loop and ws_connection:
                asyncio.run_coroutine_threadsafe(stop_deepgram(), loop)
            else:
                send_status("Not currently listening")
        
        elif cmd_type == "exit":
            is_listening = False
            send_status("Exiting Deepgram bridge")
            sys.exit(0)
        
        else:
            send_error(f"Unknown command: {cmd_type}")
    
    except Exception as e:
        send_error(f"Command handling error: {str(e)}")

def main():
    """Main loop - read commands from stdin"""
    send_status("Deepgram speech bridge ready (Python)")
    
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                command = json.loads(line)
                handle_command(command)
            except json.JSONDecodeError as e:
                send_error(f"Invalid JSON: {str(e)}")
            except Exception as e:
                send_error(f"Error processing command: {str(e)}")
    
    except KeyboardInterrupt:
        send_status("Keyboard interrupt received")
    except Exception as e:
        send_error(f"Main loop error: {str(e)}")
    finally:
        is_listening = False

if __name__ == "__main__":
    main()