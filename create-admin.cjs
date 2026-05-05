#!/usr/bin/env node

/**
 * Admin Account Creation Script
 * Run with: node backend/create-admin.cjs
 * 
 * Creates an admin account with unlimited access
 */

const { MongoClient } = require('mongodb');
const readline = require('readline');

// Load environment variables
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'interview_assistant';

// Helper: Default shortcuts
function getDefaultShortcuts() {
  return {
    startStopListen: { modifier: 'Ctrl', key: '\\' },
    analyzeScreen: { modifier: 'Ctrl', key: ']' },
    minimizeToggle: { modifier: 'Ctrl', key: '\'' },
    focusQuestion: { modifier: 'Shift', key: '' },
    clearQuestion: { modifier: 'Ctrl', key: 'Backspace' },
    stopOrClear: { modifier: 'Ctrl', key: 'Backspace' }
  };
}

// Default base prompt
const DEFAULT_BASE_PROMPT = `You are a real-time AI assistant built for live conversations.

TOP PRIORITIES:
Respond in {LANGUAGE} Language.
 
CONTEXT RULES:
1. Document = single source of truth
- Use ONLY mentioned skills, experience, projects, education
- NEVER invent, exaggerate, or assume
2. Description provided = align answers directly to it
3. Info provided = tailor responses accordingly
4. No context = use best practices

ANSWER STRUCTURE:
- Professional, confident tone
- Simple wording.

EXPANSION:
- If more info needed, use bullet points

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
- Treat it as possible phonetic error from speech-to-text
- Infer the most likely correct technical term
- Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- If multiple interpretations possible:
- Choose most likely one based on context
- Answer directly without asking clarifying questions
- If term cannot be reasonably inferred:
- Ignore unclear term and answer rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain correction process
- Answer confidently as if question was clearly spoken

CODING/TECHNICAL QUESTIONS:
- Provide correct, clean code or technical explanation
- Keep minimal but complete
- Explain approach if necessary

EXAMPLES:
- Give examples ONLY when improve clarity

BEHAVIOR:
- This is a LIVE conversation
- If unclear, infer intent and answer directly
- Never mention you are AI

OUTPUT:
- No emojis
- Bullet points ONLY when expanding
- Use markdown for formatting when helpful`;

// Readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify question
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  let client;
  
  try {
    console.log('\n🔐 ADMIN ACCOUNT CREATION SCRIPT');
    console.log('================================\n');
    
    // Collect admin details
    const username = await question('Enter admin username: ');
    const name = await question('Enter admin full name: ');
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password: ');
    
    if (!username || !password || !name || !email) {
      console.error('\n❌ All fields are required!');
      process.exit(1);
    }
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection('users');
    
    console.log('✅ Connected to MongoDB\n');
    
    // Check if user already exists
    const existingUser = await users.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      console.error('❌ Username or email already exists!');
      process.exit(1);
    }
    
    // Create admin user
    const adminUser = {
      username,
      name,
      email,
      password, // In production, hash this with bcrypt!
      role: 'admin', // ADMIN ROLE
      plan: 'lifetime', // LIFETIME ACCESS
      tokens: -1, // UNLIMITED TOKENS (-1 = unlimited)
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: '',
      voiceProvider: 'default',
      deepgramApiKey: '',
      settings: {
        basePrompt: DEFAULT_BASE_PROMPT,
        responseLanguage: 'English',
        basePromptSummary: '',
        jobDescription: '',
        jobDescriptionSummary: '',
        companyInfo: '',
        companyInfoSummary: '',
        contextMessages: 5,
        cvText: '',
        cvSummary: ''
      },
      shortcuts: getDefaultShortcuts()
    };
    
    const result = await users.insertOne(adminUser);
    
    console.log('✅ ADMIN ACCOUNT CREATED SUCCESSFULLY!\n');
    console.log('Account Details:');
    console.log('================');
    console.log(`ID:       ${result.insertedId}`);
    console.log(`Username: ${username}`);
    console.log(`Name:     ${name}`);
    console.log(`Email:    ${email}`);
    console.log(`Role:     ADMIN`);
    console.log(`Plan:     LIFETIME`);
    console.log(`Tokens:   UNLIMITED (-1)`);
    console.log('\n🎉 Admin account is ready to use!\n');
    
  } catch (error) {
    console.error('\n❌ Error creating admin:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
    rl.close();
  }
}

// Run the script
createAdmin();

