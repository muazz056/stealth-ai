require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Try process.env first, then fallback to .env file
let MONGO_URI = process.env.MONGODB_URI;

// Fallback: try to load .env from file
if (!MONGO_URI) {
  const possiblePaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('MONGODB_URI=')) {
            MONGO_URI = trimmed.substring('MONGODB_URI='.length).trim();
          }
        });
        if (MONGO_URI) break;
      }
    } catch (e) {
      // Continue to next path
    }
  }
}

if (!MONGO_URI) {
  console.error('❌ FATAL: MONGODB_URI is not set! Set in Railway environment variables or .env file');
}

const DB_NAME = 'interview_assistant';
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:5173', 'http://localhost:3001'];

console.log('🌐 CORS_ORIGINS:', CORS_ORIGINS);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Electron)
    if (!origin) return callback(null, true);
    
    // Remove trailing slash for comparison
    const originClean = origin.replace(/\/$/, '');
    const allowedOrigins = CORS_ORIGINS.map(o => o.replace(/\/$/, ''));
    
    if (allowedOrigins.includes(originClean) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', origin, 'not in:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Database connection
let db = null;

async function connectDB() {
  if (db) return db;
  try {
    // Try with TLS options for better compatibility
    const client = new MongoClient(MONGO_URI, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Backend DB connected to MongoDB');
    return db;
  } catch (error) {
    console.error('❌ Backend DB connection failed:', error);
    // Try again without TLS options as fallback
    try {
      const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
      });
      await client.connect();
      db = client.db(DB_NAME);
      console.log('✅ Backend DB connected (fallback mode)');
      return db;
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      throw error;
    }
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Interview Stealth Assist API is running' });
});

// Helper: Default shortcuts
function getDefaultShortcuts() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const primaryMod = isMac ? 'Cmd' : 'Ctrl';
  
  return {
    startStopListen: { modifier: 'Ctrl', key: '\\' },
    analyzeScreen: { modifier: 'Ctrl', key: ']' },
    minimizeToggle: { modifier: 'Ctrl', key: '\'' },
    focusQuestion: { modifier: 'Shift', key: '' },
    clearQuestion: { modifier: 'Ctrl', key: 'Backspace' },
    stopOrClear: { modifier: primaryMod, key: 'Backspace' }
  };
}

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { username, name, email, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Check if user exists
    const existingUser = await users.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

// Default base prompt for new users
    const DEFAULT_BASE_PROMPT = `You are a real-time AI assistant built for live conversations.

RESPONSE RULES:
1. Answer from the FIRST sentence - no intro
   BAD: "Based on my knowledge...", "I believe...", "You might be referring to..."
   GOOD: "[Direct answer content]"

2. If a keyword match is found:
   BAD: "I believe you meant 'Agentic'..."
   GOOD: Replace and answer directly as if user said the correct word

3. After correcting a word, NEVER question other words in the sentence
   BAD: "But I couldn't find information on 'X'. If you meant Y..."
   GOOD: Answer confidently without questioning other terms

4. NEVER hedge or add caveats mid-response
   BAD: "However...", "But I think...", "Alternatively..."
   GOOD: Continue the answer directly

5. Keep answering - do NOT ask for clarification
   BAD: "If you could provide more context..."
   BAD: "I'd be happy to help with more details..."
   GOOD: Give complete answer in one go

6. Do NOT list alternatives
   BAD: "You could mean A, or B, or C..."
   GOOD: Pick the best one and explain it

EXAMPLES:
Q: "what is jantic workflow"
A: "Agentic workflow refers to..."
[Continue with explanation - do NOT mention 'jantic' or 'workflow' correction]

Q: "tell me about flask"
A: "Flask is a lightweight Python web framework..."
[Direct answer - no intro phrases]

CONTEXT:
- Use ONLY mentioned skills, experience, projects from resume
- NEVER invent or assume information not provided
- If no context, use best practices for the domain

OUTPUT:
- No emojis
- Use markdown formatting when helpful`;

    // Create new user with default settings
    const newUser = {
      username,
      name,
      email,
      password, // In production, hash this with bcrypt!
      role: 'user', // Default role: regular user
      plan: 'trial', // Trial plan for new users
      tokens: 10, // ONE-TIME: 10 free tokens on signup
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: '', // No default provider - user must choose
      voiceProvider: 'default', // Default voice provider
      deepgramApiKey: '', // Empty by default
      deepgramLanguage: 'multi', // Default: multilingual
      deepgramKeyterms: '', // Comma-separated important keywords for better recognition
      settings: {
        basePrompt: DEFAULT_BASE_PROMPT,
        responseLanguage: 'English', // Default response language
        basePromptSummary: '', // Summary for fast AI responses
        jobDescription: '',
        jobDescriptionSummary: '', // Summary for fast AI responses
        companyInfo: '',
        companyInfoSummary: '', // Summary for fast AI responses
        contextMessages: 5, // Default: send last 5 Q&A pairs (10 messages)
        cvText: '', // Store parsed CV text instead of file
        cvSummary: '' // Summary for fast AI responses
      },
      shortcuts: getDefaultShortcuts()
    };

    const result = await users.insertOne(newUser);
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: result.insertedId.toString()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed: ' + error.message
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const user = await users.findOne({ username, password });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// Update API Key
app.put('/api/auth/api-key', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, provider, apiKey } = req.body;

    if (!userId || !provider || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'userId, provider, and apiKey are required'
      });
    }

    console.log('🔐 Updating API key for user:', userId);
    console.log('📡 Provider:', provider);
    console.log('🔑 API Key (first 10 chars):', apiKey.substring(0, 10) + '...');

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          [`apiKeys.${provider}`]: apiKey,
          selectedProvider: provider
        }
      }
    );

    console.log('✅ MongoDB update result:', result);
    console.log('📊 Matched:', result.matchedCount, 'Modified:', result.modifiedCount);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Fetch updated user to verify
    const updatedUser = await users.findOne({ _id: new ObjectId(userId) });
    console.log('🔍 Verification - Updated user apiKeys:', updatedUser?.apiKeys);

    res.json({
      success: true,
      message: 'API key updated successfully',
      apiKeys: updatedUser?.apiKeys || {}
    });
  } catch (error) {
    console.error('❌ Update API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API key: ' + error.message
    });
  }
});

// Get User by ID
app.get('/api/auth/user/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user: ' + error.message
    });
  }
});

// ==================== CV PARSING ROUTE ====================

// Parse CV and extract text
app.post('/api/cv/parse', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { buffer, mimetype, originalname } = req.file;
    let extractedText = '';

    // Parse based on file type
    if (mimetype === 'application/pdf') {
      // Parse PDF
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword'
    ) {
      // Parse DOCX/DOC
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Please upload PDF or DOC/DOCX files.'
      });
    }

    // Clean up the text
    extractedText = extractedText
      .replace(/\r\n/g, '\n')  // Normalize line breaks
      .replace(/\n{3,}/g, '\n\n')  // Remove excessive line breaks
      .trim();

    if (!extractedText || extractedText.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract meaningful text from the CV. Please check the file.'
      });
    }

    res.json({
      success: true,
      text: extractedText,
      filename: originalname,
      length: extractedText.length
    });

  } catch (error) {
    console.error('❌ CV parsing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to parse CV: ' + error.message
    });
  }
});

// Update Settings
app.put('/api/auth/settings', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, settings } = req.body;

    if (!userId || !settings) {
      return res.status(400).json({
        success: false,
        message: 'userId and settings are required'
      });
    }

    console.log('⚙️ Updating user settings for:', userId);
    console.log('📝 Settings:', settings);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { settings } }
    );

    console.log('✅ Settings update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify the update by fetching the user
    const updatedUser = await users.findOne({ _id: new ObjectId(userId) });
    console.log('🔍 Verification - Updated user settings:', updatedUser?.settings);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: updatedUser?.settings || settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings: ' + error.message
    });
  }
});

// Update Shortcuts
app.put('/api/auth/shortcuts', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, shortcuts } = req.body;

    if (!userId || !shortcuts) {
      return res.status(400).json({
        success: false,
        message: 'userId and shortcuts are required'
      });
    }

    console.log('⌨️ Updating user shortcuts for:', userId);
    console.log('🎹 Shortcuts:', shortcuts);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { shortcuts } }
    );

    console.log('✅ Shortcuts update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Shortcuts updated successfully',
      shortcuts: shortcuts
    });
  } catch (error) {
    console.error('Update shortcuts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shortcuts: ' + error.message
    });
  }
});

// Update Selected Provider (without requiring API key)
app.put('/api/auth/provider', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, provider } = req.body;

    if (!userId || !provider) {
      return res.status(400).json({
        success: false,
        message: 'userId and provider are required'
      });
    }

    console.log('🔄 Updating selected provider for user:', userId);
    console.log('📡 Provider:', provider);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { selectedProvider: provider } }
    );

    console.log('✅ Provider update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Provider updated successfully',
      selectedProvider: provider
    });
  } catch (error) {
    console.error('Update provider error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update provider: ' + error.message
    });
  }
});

// Update Voice Provider
app.put('/api/auth/voice-provider', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, voiceProvider } = req.body;

    if (!userId || !voiceProvider) {
      return res.status(400).json({
        success: false,
        message: 'userId and voiceProvider are required'
      });
    }

    console.log('🔄 Updating voice provider for user:', userId);
    console.log('🎤 Voice Provider:', voiceProvider);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { voiceProvider: voiceProvider } }
    );

    console.log('✅ Voice provider update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Voice provider updated successfully',
      voiceProvider: voiceProvider
    });
  } catch (error) {
    console.error('Update voice provider error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voice provider: ' + error.message
    });
  }
});

// Update Deepgram API Key
app.put('/api/auth/deepgram-key', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, deepgramApiKey } = req.body;

    if (!userId || !deepgramApiKey) {
      return res.status(400).json({
        success: false,
        message: 'userId and deepgramApiKey are required'
      });
    }

    console.log('🔄 Updating Deepgram API key for user:', userId);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { deepgramApiKey: deepgramApiKey } }
    );

    console.log('✅ Deepgram key update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Deepgram API key updated successfully'
    });
  } catch (error) {
    console.error('Update Deepgram key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Deepgram key: ' + error.message
    });
  }
});

// Update Deepgram Language
app.put('/api/auth/deepgram-language', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, deepgramLanguage } = req.body;

    if (!userId || !deepgramLanguage) {
      return res.status(400).json({
        success: false,
        message: 'userId and deepgramLanguage are required'
      });
    }

    console.log('🔄 Updating Deepgram language for user:', userId);
    console.log('🌍 Language:', deepgramLanguage);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { deepgramLanguage: deepgramLanguage } }
    );

    console.log('✅ Deepgram language update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Deepgram language updated successfully',
      deepgramLanguage: deepgramLanguage
    });
  } catch (error) {
    console.error('Update Deepgram language error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Deepgram language: ' + error.message
    });
  }
});

// Update Deepgram Keyterms
app.put('/api/auth/deepgram-keyterms', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, deepgramKeyterms } = req.body;

    if (!userId || deepgramKeyterms === undefined) {
      return res.status(400).json({
        success: false,
        message: 'userId and deepgramKeyterms are required'
      });
    }

    console.log('🔄 Updating Deepgram keyterms for user:', userId);
    console.log('🔑 Keyterms:', deepgramKeyterms);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { deepgramKeyterms: deepgramKeyterms } }
    );

    console.log('✅ Deepgram keyterms update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Deepgram keyterms updated successfully',
      deepgramKeyterms: deepgramKeyterms
    });
  } catch (error) {
    console.error('Update Deepgram keyterms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Deepgram keyterms: ' + error.message
    });
  }
});

// ==================== MESSAGE/CONVERSATION ROUTES ====================

// Save conversation message
app.post('/api/messages/save', async (req, res) => {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');
    
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        message: 'userId and message are required'
      });
    }

    // Message should contain: role, parts, timestamp
    const messageDoc = {
      userId: new ObjectId(userId),
      ...message,
      savedAt: new Date()
    };

    await messages.insertOne(messageDoc);

    res.json({
      success: true,
      message: 'Message saved successfully'
    });
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save message: ' + error.message
    });
  }
});

// Save conversation history (bulk)
app.post('/api/messages/save-history', async (req, res) => {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');
    
    const { userId, history } = req.body;

    if (!userId || !history || !Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        message: 'userId and history array are required'
      });
    }

    // Clear existing history for this user
    await messages.deleteMany({ userId: new ObjectId(userId) });

    // Insert new history
    if (history.length > 0) {
      const messageDocs = history.map(msg => ({
        userId: new ObjectId(userId),
        ...msg,
        savedAt: new Date()
      }));

      await messages.insertMany(messageDocs);
    }

    res.json({
      success: true,
      message: 'Conversation history saved successfully',
      count: history.length
    });
  } catch (error) {
    console.error('Save history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save history: ' + error.message
    });
  }
});

// Get conversation history
app.get('/api/messages/history/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const history = await messages
      .find({ userId: new ObjectId(userId) })
      .sort({ savedAt: 1 })
      .toArray();

    // Remove MongoDB-specific fields
    const cleanHistory = history.map(({ _id, userId, savedAt, ...msg }) => msg);

    res.json({
      success: true,
      history: cleanHistory,
      count: cleanHistory.length
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get history: ' + error.message
    });
  }
});

// Clear conversation history
app.delete('/api/messages/clear/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const result = await messages.deleteMany({ userId: new ObjectId(userId) });

    res.json({
      success: true,
      message: 'Conversation history cleared',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear history: ' + error.message
    });
  }
});

// ==================== TOKEN MANAGEMENT ====================

// Check user tokens
app.get('/api/tokens/check/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isAdmin = user.role === 'admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    const canSendMessage = hasUnlimitedTokens || user.tokens > 0;

    res.json({
      success: true,
      tokens: user.tokens,
      canSendMessage,
      isAdmin,
      hasUnlimitedTokens,
      role: user.role,
      plan: user.plan
    });
  } catch (error) {
    console.error('Check tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check tokens: ' + error.message
    });
  }
});

// Consume tokens (1 token per question)
app.post('/api/tokens/consume/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;
    const { amount = 1 } = req.body; // Default 1 token per question

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't consume tokens for admin or unlimited users
    const isAdmin = user.role === 'admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    
    if (hasUnlimitedTokens) {
      return res.json({
        success: true,
        message: 'Unlimited tokens',
        tokens: user.tokens,
        consumed: 0
      });
    }

    // Check if user has enough tokens
    if (user.tokens < amount) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient tokens',
        tokens: user.tokens
      });
    }

    // Consume tokens
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { tokens: -amount } }
    );

    res.json({
      success: true,
      message: 'Tokens consumed',
      tokens: user.tokens - amount,
      consumed: amount
    });
  } catch (error) {
    console.error('Consume tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to consume tokens: ' + error.message
    });
  }
});

// ==================== MESSAGE LIMIT & TRACKING (LEGACY - KEPT FOR COMPATIBILITY) ====================

// Check if user can send message (trial limit)
app.get('/api/messages/check-limit/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isAdmin = user.role === 'admin' || user.plan === 'lifetime';
    const hasUnlimitedAccess = user.messageLimit === -1 || isAdmin;
    const canSendMessage = hasUnlimitedAccess || user.messagesUsed < user.messageLimit;
    const remainingMessages = hasUnlimitedAccess ? -1 : Math.max(0, user.messageLimit - user.messagesUsed);

    res.json({
      success: true,
      canSendMessage,
      isAdmin,
      plan: user.plan,
      messageLimit: user.messageLimit,
      messagesUsed: user.messagesUsed,
      remainingMessages,
      hasUnlimitedAccess
    });
  } catch (error) {
    console.error('Check limit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check limit: ' + error.message
    });
  }
});

// Increment message usage
app.post('/api/messages/increment-usage/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't increment for admin or unlimited users
    const isAdmin = user.role === 'admin' || user.plan === 'lifetime';
    if (!isAdmin && user.messageLimit !== -1) {
      await users.updateOne(
        { _id: new ObjectId(userId) },
        { $inc: { messagesUsed: 1 } }
      );
    }

    res.json({
      success: true,
      message: 'Usage incremented',
      messagesUsed: isAdmin ? user.messagesUsed : user.messagesUsed + 1
    });
  } catch (error) {
    console.error('Increment usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to increment usage: ' + error.message
    });
  }
});

// Reset message usage (on new session)
app.post('/api/messages/reset-usage/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { messagesUsed: 0 } }
    );

    res.json({
      success: true,
      message: 'Usage reset successfully'
    });
  } catch (error) {
    console.error('Reset usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset usage: ' + error.message
    });
  }
});

// ==================== SUMMARIZATION ROUTE ====================

// Summarize CV, Job Description, Company Info, or Base Prompt
app.post('/api/summarize', async (req, res) => {
  try {
    console.log('📝 Summarize request received:', {
      type: req.body.type,
      textLength: req.body.text?.length,
      provider: req.body.apiProvider,
      hasApiKey: !!req.body.apiKey
    });
    
    const { type, text, apiProvider, apiKey } = req.body;
    
    if (!type || !text || !apiProvider) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: type, text, apiProvider'
      });
    }

    // Build summary prompt based on type
    let summaryPrompt = '';
    if (type === 'cv') {
      summaryPrompt = `Extract and organize the resume information in this EXACT format:

TECHNICAL SKILLS (as comma-separated keywords):
[List all programming languages, frameworks, libraries, tools, databases, cloud platforms, etc.]
Example: Python, JavaScript, React, Node.js, MongoDB, AWS, Docker, Git

PROJECTS:
1. [Project Name]: [Brief description] - Skills used: [comma-separated]
2. [Project Name]: [Brief description] - Skills used: [comma-separated]
...

EXPERIENCE:
[Company Name] - [Role]: [Duration] - [Key achievement or responsibility]

EDUCATION:
[Degree] in [Field] from [University] - [Year/Grade]

IMPORTANT:
- Put TECHNICAL SKILLS FIRST and ONLY as keywords (no sentences)
- For each project, include the specific skills/technologies used
- Keep it under 300 tokens total
- Be factual - do not add information not in the resume

Resume:
${text}`;
    } else if (type === 'jd') {
      summaryPrompt = `Shorten this job description while keeping all key points. Create a concise summary (under 150 words) that includes:
- Main role/position
- Key required skills (max 5-7)
- Primary responsibilities (3-5 bullets)
- What makes this role interesting

SHORTEN the text - remove filler words and redundant phrases. Keep only the essential information.

Job Description:
${text}`;
    } else if (type === 'company') {
      summaryPrompt = `Shorten this company information into a concise summary (under 100 words) that includes:
- What the company does
- Company size or notable facts
- Culture or work environment

SHORTEN the text - remove filler words. Keep only key points.

Company Information:
${text}`;
    } else if (type === 'basePrompt') {
      summaryPrompt = `Shorten these interview assistant instructions into key points (under 150 words):
- Main purpose/goal
- Response style guidelines
- Key behavior instructions
- Important constraints

Keep only essential information.

Instructions:
${text}`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be: cv, jd, company, or basePrompt'
      });
    }

    let summary = '';

    // Call AI based on provider
    if (apiProvider === 'gemini') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'API key required for Gemini'
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: summaryPrompt }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (apiProvider === 'openai') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'API key required for OpenAI'
        });
      }

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a professional resume and job description summarizer.' },
              { role: 'user', content: summaryPrompt }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      summary = data.choices?.[0]?.message?.content || '';

    } else if (apiProvider === 'claude') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'API key required for Claude'
        });
      }

      const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 300,
            messages: [
              { role: 'user', content: summaryPrompt }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Claude API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      summary = data.content?.[0]?.text || '';

    } else if (apiProvider === 'groq') {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'API key required for Groq'
        });
      }

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
              { role: 'system', content: 'You are a professional interview assistant.' },
              { role: 'user', content: summaryPrompt }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Groq API error response:', errorData);
        throw new Error(`Groq API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      summary = data.choices?.[0]?.message?.content || '';
      console.log('✅ Groq summary generated, length:', summary.length);

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid API provider. Must be: gemini, openai, claude, or groq'
      });
    }

    res.json({
      success: true,
      summary: summary.trim()
    });
    
    console.log('✅ Summarization complete, summary length:', summary.trim().length);

  } catch (error) {
    console.error('❌ Summarization error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Failed to summarize: ' + error.message
    });
  }
});

// ==================== STREAMING AI GENERATION ====================

// Stream AI response using Server-Sent Events
app.post('/api/generate-stream', async (req, res) => {
  console.log('📡 Streaming generation request received');
  console.log('📡 Origin:', req.headers.origin);
  console.log('📡 API Provider:', req.body.apiProvider);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  try {
    const { messages, apiProvider, apiKey, model } = req.body;

    if (!messages || !apiProvider || !apiKey) {
      console.log('❌ Missing required fields');
      res.write(`data: ${JSON.stringify({ error: 'Missing required fields: messages, apiProvider, apiKey' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    console.log(`🤖 Streaming with provider: ${apiProvider}`);

    // --- GEMINI STREAMING ---
    if (apiProvider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: messages })
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        res.write(`data: ${JSON.stringify({ error: `Gemini API error: ${response.status} - ${errorData}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream Gemini response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    // --- OPENAI STREAMING ---
    } else if (apiProvider === 'openai') {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: messages,
            stream: true,
            max_tokens: 4000
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        res.write(`data: ${JSON.stringify({ error: `OpenAI API error: ${response.status} - ${errorData}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream OpenAI response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.choices?.[0]?.delta?.content || '';
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    // --- CLAUDE STREAMING ---
    } else if (apiProvider === 'claude') {
      const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4000,
            messages: messages,
            stream: true
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        res.write(`data: ${JSON.stringify({ error: `Claude API error: ${response.status} - ${errorData}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream Claude response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              // Claude sends content_block_delta events with text
              if (data.type === 'content_block_delta' && data.delta?.text) {
                res.write(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    // --- GROQ STREAMING ---
    } else if (apiProvider === 'groq') {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: messages,
            stream: true,
            max_tokens: 4000
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        res.write(`data: ${JSON.stringify({ error: `Groq API error: ${response.status} - ${errorData}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream Groq response (OpenAI-compatible format)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.choices?.[0]?.delta?.content || '';
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    } else {
      res.write(`data: ${JSON.stringify({ error: 'Invalid API provider' })}\n\n`);
    }

    // Send done signal
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('❌ Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ==================== DEEPGRAM WEBSOCKET PROXY ====================
const { WebSocketServer, WebSocket } = require('ws');
const deepgramWss = new WebSocketServer({ noServer: true });

function setupDeepgramProxy(server) {
  deepgramWss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const apiKey = url.searchParams.get('apiKey');
      const language = url.searchParams.get('language') || 'en-US';
      
      if (!apiKey) {
        ws.close(4001, 'API key required');
        return;
      }
      
      const dgWs = new WebSocket(
        'wss://api.deepgram.com/v1/listen?model=nova-3&language=' + language + 
        '&interim_results=true&vad_events=true',
        { headers: { 'Authorization': 'Token ' + apiKey } }
      );
      let clientChunkCount = 0;
      let clientChunkBytes = 0;
      let deepgramMessageCount = 0;
      
      dgWs.on('open', () => {
        console.log('🎧 Deepgram proxy connected. language=', language);
        ws.send(JSON.stringify({ type: 'connected' }));
      });
      
      dgWs.on('message', (data) => {
        deepgramMessageCount += 1;
        if (deepgramMessageCount <= 3 || deepgramMessageCount % 10 === 0) {
          console.log(`📨 Deepgram message #${deepgramMessageCount}`);
        }
        ws.send(data.toString());
      });
      dgWs.on('error', (err) => {
        console.error('Deepgram error:', err.message);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      });
      dgWs.on('close', (code, reason) => {
        console.log(`🔌 Deepgram socket closed code=${code} reason=${reason?.toString?.() || ''}`);
        ws.close();
      });
      
      ws.on('message', (data) => {
        const len = Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : (typeof data === 'string' ? data.length : 0);
        clientChunkCount += 1;
        clientChunkBytes += len;
        if (clientChunkCount <= 3 || clientChunkCount % 5 === 0) {
          console.log(`🎙️ Client audio chunk #${clientChunkCount}, bytes=${len}, total=${clientChunkBytes}`);
        }
        // Handle binary audio data properly
        if (data instanceof Buffer || data instanceof ArrayBuffer) {
          if (dgWs.readyState === WebSocket.OPEN) dgWs.send(data);
        } else if (dgWs.readyState === WebSocket.OPEN) {
          dgWs.send(data);
        }
      });
      
      // Send keep-alive ping every 5 seconds
      const pingInterval = setInterval(() => {
        if (dgWs.readyState === WebSocket.OPEN) {
          dgWs.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 5000);
      ws.on('close', () => dgWs.close());
      
    } catch (err) {
      console.error('📡 Proxy error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      ws.close();
    }
  });
  
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/api/deepgram-ws')) {
      deepgramWss.handleUpgrade(req, socket, head, (ws) => {
        deepgramWss.emit('connection', ws, req);
      });
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('┌─────────────────────────────────────────────────┐');
      console.log('│  🚀 Interview Stealth Assist Backend Server   │');
      console.log('├─────────────────────────────────────────────────┤');
      console.log(`│  📡 API Server: http://localhost:${PORT}        │`);
      console.log('│  ✅ MongoDB: Connected                          │');
      console.log('│  🌐 CORS: Enabled                               │');
      console.log('└─────────────────────────────────────────────────┘');
      
      // Setup Deepgram WebSocket proxy
      setupDeepgramProxy(server);
    });
      console.log('');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;

