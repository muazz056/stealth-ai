// Configuration file for Interview Stealth Assist
// Copy this file to config.js and add your API key

export const config = {
  // Get your Gemini API key from: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: 'your_gemini_api_key_here',
  
  // Overlay settings
  OVERLAY_SETTINGS: {
    width: 400,
    height: 300,
    position: {
      x: 'right', // 'left', 'right', 'center'
      y: 'top'    // 'top', 'bottom', 'center'
    },
    opacity: 0.95,
    alwaysOnTop: true
  },
  
  // Speech recognition settings
  SPEECH_SETTINGS: {
    language: 'en-US',
    continuous: true,
    interimResults: true
  },
  
  // AI response settings
  AI_SETTINGS: {
    model: 'gemini-1.5-flash',
    maxResponseLength: 100, // words
    responseStyle: 'professional' // 'professional', 'casual', 'technical'
  }
};
