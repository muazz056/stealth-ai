#!/usr/bin/env node

const { MongoClient } = require('mongodb');
const readline = require('readline');

require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'interview_assistant';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createSuperAdmin() {
  let client;

  try {
    console.log('\n🔐 SUPER ADMIN ACCOUNT CREATION');
    console.log('================================\n');

    const username = await question('Enter super admin username: ');
    const name = await question('Enter super admin full name: ');
    const email = await question('Enter super admin email: ');
    const password = await question('Enter super admin password: ');

    if (!username || !password || !name || !email) {
      console.error('\n❌ All fields are required!');
      process.exit(1);
    }

    console.log('\n📡 Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection('users');

    console.log('✅ Connected to MongoDB\n');

    const existingUser = await users.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      console.error('❌ Username or email already exists!');
      process.exit(1);
    }

    const now = new Date();
    const superAdminUser = {
      username,
      name,
      email,
      password,
      role: 'super-admin',
      verified: true,
      plan: 'lifetime',
      tokens: -1,
      createdAt: now,
      apiKeys: {},
      selectedProvider: '',
      voiceProvider: 'default',
      deepgramApiKey: '',
      deepgramLanguage: 'multi',
      deepgramKeyterms: '',
      settings: {
        basePrompt: '',
        responseLanguage: 'English',
        basePromptSummary: '',
        jobDescription: '',
        jobDescriptionSummary: '',
        companyInfo: '',
        companyInfoSummary: '',
        contextMessages: 10,
        cvText: '',
        cvSummary: ''
      },
      shortcuts: {
        toggleListen: { modifier: 'Control', key: '\\' },
        analyzeScreen: { modifier: 'Control', key: ']' },
        toggleOverlay: { modifier: 'Control', key: '\'' },
        getAnswer: { modifier: 'Control', key: 'Enter' },
        focusInput: { modifier: 'Alt', key: '' },
        clearQuestion: { modifier: 'Control', key: 'Backspace' },
        stopOrClear: { modifier: 'Control', key: 'Backspace' },
        toggleBrowseAI: { modifier: 'Control', key: '[' }
      }
    };

    const result = await users.insertOne(superAdminUser);

    console.log('✅ SUPER ADMIN ACCOUNT CREATED SUCCESSFULLY!\n');
    console.log('Account Details:');
    console.log('================');
    console.log(`ID:       ${result.insertedId}`);
    console.log(`Username: ${username}`);
    console.log(`Name:     ${name}`);
    console.log(`Email:    ${email}`);
    console.log(`Role:     SUPER ADMIN`);
    console.log(`Plan:     LIFETIME`);
    console.log(`Tokens:   UNLIMITED (-1)`);
    console.log('\n🎉 Super Admin account is ready!\n');

  } catch (error) {
    console.error('\n❌ Error creating super admin:', error.message);
    process.exit(1);
  } finally {
    if (client) await client.close();
    rl.close();
  }
}

createSuperAdmin();
