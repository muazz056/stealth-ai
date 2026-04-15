// src/ai/assistant.ts
// Provides functions for speech‑to‑text transcription and answer generation using OpenAI.
// This module is framework‑agnostic and can be used from React components or services.

export interface TranscriptionResult {
    text: string;
    isFinal: boolean;
}

/**
 * Starts continuous speech recognition using the Web Speech API.
 * Returns a function to stop the recognition and a callback registration.
 */
export function startTranscription(
    onResult: (result: TranscriptionResult) => void,
    language: string = 'en-US'
): () => void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('SpeechRecognition API not supported in this browser');
        return () => { };
    }
    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = language;

    recognizer.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript.trim();
            onResult({ text: transcript, isFinal: result.isFinal });
        }
    };

    recognizer.onerror = (e: any) => {
        console.error('Speech recognition error', e);
    };

    recognizer.start();

    // Return stop function
    return () => {
        recognizer.stop();
    };
}

/**
 * Calls OpenAI's chat completion endpoint to generate a suggested answer.
 * You must set the environment variable `VITE_OPENAI_API_KEY` in your Vite config.
 */
export async function getSuggestedAnswer(prompt: string): Promise<string> {
    const apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI request failed: ${err}`);
    }
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    return answer ?? '';
}
