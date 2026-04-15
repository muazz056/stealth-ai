#!/usr/bin/env python3
"""
Python Speech Bridge for Electron App
Uses Google's FREE Speech Recognition API via SpeechRecognition library
Real-time continuous transcription with automatic silence detection
"""

import speech_recognition as sr
import json
import sys
import threading
import time

# Initialize recognizer and microphone
recognizer = sr.Recognizer()
microphone = None
is_listening = False
listen_thread = None

def listen_continuous():
    """
    Continuous listening function that runs in a background thread.
    Automatically detects speech, silence, and sends chunks to Electron.
    """
    global is_listening, microphone
    
    try:
        # Initialize microphone
        microphone = sr.Microphone()
        
        with microphone as source:
            # CRITICAL: Thorough ambient noise calibration
            # Measures background noise level to set proper threshold
            print(json.dumps({
                "type": "status", 
                "message": "calibrating"
            }), flush=True)
            
            # 1.0 second calibration for better ambient noise detection
            # This ensures we don't miss quiet words
            recognizer.adjust_for_ambient_noise(source, duration=1.0)
            
            print(json.dumps({
                "type": "debug", 
                "message": f"✅ Calibrated! Auto-detected threshold: {recognizer.energy_threshold}"
            }), flush=True)
            
            # ⚡ OPTIMIZED SETTINGS FOR MAXIMUM WORD DETECTION
            # Goal: Detect ALL words, even if non-streaming
            
            # After calibration, set a LOWER threshold for better sensitivity
            # Lower threshold = more sensitive = catches softer/quieter words
            calibrated_threshold = recognizer.energy_threshold
            
            # Use LOWER threshold (more sensitive) but not too low to avoid noise
            recognizer.energy_threshold = max(calibrated_threshold * 0.7, 150)  # 70% of calibrated, min 150
            recognizer.dynamic_energy_threshold = True  # Let it adapt to environment changes
            
            # LONGER pause threshold = capture more words in one chunk
            # This prevents cutting off in the middle of sentences
            recognizer.pause_threshold = 1.0  # 1.0 seconds silence before finalizing
            
            # SHORTER phrase threshold = capture even very short words like "a", "I", "is"
            recognizer.phrase_threshold = 0.05  # Minimum 0.05s phrase (catch all short words)
            
            # LONGER non-speaking duration = don't finalize too quickly
            recognizer.non_speaking_duration = 0.5  # 0.5s quiet period needed to finalize
            
            # Debug: Show what threshold was set
            print(json.dumps({
                "type": "debug", 
                "message": f"✅ Ready! Threshold: {recognizer.energy_threshold} (MAXIMUM DETECTION MODE - Adaptive)"
            }), flush=True)
            
            # Send ready status
            ready_msg = {
                "type": "status",
                "message": "listening",
                "timestamp": time.time()
            }
            print(json.dumps(ready_msg), flush=True)
            
            # CONTINUOUS LOOP - keeps going until is_listening = False
            while is_listening:
                try:
                    # 🎤 MAXIMUM WORD DETECTION MODE
                    # Longer chunks = more complete sentences = fewer missed words
                    audio = recognizer.listen(
                        source, 
                        timeout=10,  # 10 seconds timeout for speech start (more patient)
                        phrase_time_limit=10  # 10 seconds MAX per chunk = capture full sentences!
                    )
                    
                    # Send audio to Google's FREE Speech API
                    # Using enhanced model for better accuracy
                    try:
                        # Use show_all=False to get the best single result
                        # language='en-US' explicitly sets English (can be changed for other languages)
                        text = recognizer.recognize_google(
                            audio,
                            language='en-US',  # Set language explicitly for better accuracy
                            show_all=False  # Return best single result (not all alternatives)
                        )
                        
                        # Only send if we got actual meaningful text
                        if text and text.strip() and len(text.strip()) > 0:
                            # Send transcription result to Electron
                            # Google Speech returns complete phrases (after silence detection)
                            # so each result is effectively "final"
                            result = {
                                "type": "transcription",
                                "text": text,
                                "is_final": True,
                                "timestamp": time.time()
                            }
                            print(json.dumps(result), flush=True)
                        else:
                            # Empty or whitespace-only - probably background noise
                            print(json.dumps({
                                "type": "debug",
                                "message": "Empty transcription (filtered background noise)"
                            }), flush=True)
                        
                    except sr.UnknownValueError:
                        # Google couldn't understand audio - this is GOOD (means it filtered out YouTube)
                        print(json.dumps({
                            "type": "debug",
                            "message": "Audio not recognized (background noise filtered)"
                        }), flush=True)
                        
                    except sr.RequestError as e:
                        # API error (rate limit, network, etc.)
                        error = {
                            "type": "error",
                            "message": f"Speech API error: {str(e)}",
                            "timestamp": time.time()
                        }
                        print(json.dumps(error), flush=True)
                        
                except sr.WaitTimeoutError:
                    # No speech detected in timeout period - just continue
                    continue
                    
                except Exception as e:
                    # Unexpected error
                    error = {
                        "type": "error",
                        "message": f"Unexpected error: {str(e)}",
                        "timestamp": time.time()
                    }
                    print(json.dumps(error), flush=True)
                    
    except Exception as e:
        # Fatal error (microphone not available, etc.)
        fatal_error = {
            "type": "fatal",
            "message": f"Fatal error: {str(e)}",
            "timestamp": time.time()
        }
        print(json.dumps(fatal_error), flush=True)
    finally:
        microphone = None

def handle_command(command):
    """
    Handle commands from Electron (via stdin)
    Commands: 'start' or 'stop'
    """
    global is_listening, listen_thread
    
    if command == "start":
        if not is_listening:
            is_listening = True
            listen_thread = threading.Thread(target=listen_continuous, daemon=True)
            listen_thread.start()
            
            response = {
                "type": "status",
                "message": "started",
                "timestamp": time.time()
            }
            print(json.dumps(response), flush=True)
        else:
            response = {
                "type": "status",
                "message": "already_listening",
                "timestamp": time.time()
            }
            print(json.dumps(response), flush=True)
            
    elif command == "stop":
        if is_listening:
            is_listening = False
            if listen_thread:
                listen_thread.join(timeout=2)
                listen_thread = None
            
            response = {
                "type": "status",
                "message": "stopped",
                "timestamp": time.time()
            }
            print(json.dumps(response), flush=True)
        else:
            response = {
                "type": "status",
                "message": "not_listening",
                "timestamp": time.time()
            }
            print(json.dumps(response), flush=True)

if __name__ == "__main__":
    try:
        # Signal that Python bridge is ready
        ready = {
            "type": "ready",
            "message": "Python speech bridge initialized",
            "version": "1.0.0",
            "timestamp": time.time()
        }
        print(json.dumps(ready), flush=True)
        
        # Main loop - read commands from stdin (from Electron)
        for line in sys.stdin:
            command = line.strip()
            if command:
                handle_command(command)
                
    except KeyboardInterrupt:
        # Graceful shutdown
        is_listening = False
        sys.exit(0)
    except Exception as e:
        # Fatal error
        fatal = {
            "type": "fatal",
            "message": f"Bridge crashed: {str(e)}",
            "timestamp": time.time()
        }
        print(json.dumps(fatal), flush=True)
        sys.exit(1)

