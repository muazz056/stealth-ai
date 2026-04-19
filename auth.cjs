require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

// Try multiple sources for MONGODB_URI
let MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'interview_assistant';

// Fallback: try to load .env from various possible locations
if (!MONGO_URI) {
  const possiblePaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(process.resourcesPath || '', '.env'),
    path.join(process.resourcesPath || '', 'app', '.env'),
  ];
  
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        console.log('📂 Found .env at:', envPath);
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

console.log('🔧 Auth module initializing...');
console.log('📡 MONGODB_URI from env:', MONGO_URI ? 'loaded (' + (MONGO_URI?.length || 0) + ' chars)' : 'NOT FOUND');

if (!MONGO_URI) {
  console.error('❌ FATAL: MONGODB_URI is not set! Check .env file');
}

let client = null;
let db = null;

async function connectDB() {
  if (db) {
    console.log('♻️ Reusing existing DB connection');
    return db;
  }
  
  console.log('🔌 Connecting to MongoDB...');
  console.log('📡 MONGO_URI:', MONGO_URI ? MONGO_URI.substring(0, 30) + '...' : 'undefined');
  
  if (!MONGO_URI) {
    throw new Error('MONGODB_URI is not defined in environment');
  }
  
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Auth DB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ Auth DB connection failed:', error.message);
    throw error;
  }
}

async function registerUser(userData) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    // Check if username or email already exists
    const existingUser = await users.findOne({
      $or: [{ username: userData.username }, { email: userData.email }]
    });

    if (existingUser) {
      return {
        success: false,
        message: 'Username or email already exists'
      };
    }

    // Default base prompt for new users
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

    // Create new user with default settings
    const newUser = {
      ...userData,
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: '', // No default provider - user must choose
      settings: {
        basePrompt: DEFAULT_BASE_PROMPT,
        responseLanguage: 'English',
        jobDescription: '',
        companyInfo: '',
        contextMessages: 5 // Default: send last 5 Q&A pairs (10 messages)
      }
    };

    const result = await users.insertOne(newUser);
    return {
      success: true,
      message: 'User registered successfully',
      userId: result.insertedId.toString()
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      message: 'Registration failed: ' + error.message
    };
  }
}

async function loginUser(username, password) {
  console.log('🔐 loginUser called with:', { username, password: password ? '***' : 'empty' });
  
  try {
    console.log('🔐 Login attempt for:', username);
    
    const database = await connectDB();
    const users = database.collection('users');

    console.log('🔍 Querying for user:', username);
    const user = await users.findOne({ username, password });
    console.log('👤 User result:', user ? 'found' : 'not found');

    if (!user) {
      console.log('❌ No user found with that username/password');
      return {
        success: false,
        message: 'Invalid username or password'
      };
    }

    // Safely get user ID
    let userIdStr = '';
    const userId = user._id;
    console.log('🆔 Raw _id:', userId, 'type:', typeof userId);
    
    if (userId) {
      try {
        userIdStr = userId.toString();
      } catch (e) {
        console.log('⚠️ _id toString failed:', e.message);
        userIdStr = String(userId);
      }
    }
    console.log('🆔 User ID string:', userIdStr);
    
    // Build clean user object for frontend
    const userForFrontend = {
      _id: userIdStr,
      username: user.username || '',
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'user',
      plan: user.plan || 'trial',
      tokens: user.tokens || 0,
      selectedProvider: user.selectedProvider || '',
      voiceProvider: user.voiceProvider || 'default',
      deepgramApiKey: user.deepgramApiKey || '',
      deepgramLanguage: user.deepgramLanguage || 'multi',
      deepgramKeyterms: user.deepgramKeyterms || '',
      apiKeys: user.apiKeys || {},
      settings: user.settings || {},
      shortcuts: user.shortcuts || {}
    };

    console.log('✅ Returning user with _id:', userForFrontend._id);
    return {
      success: true,
      message: 'Login successful',
      user: userForFrontend
    };
  } catch (error) {
    console.error('❌ EXCEPTION in loginUser:', error);
    return {
      success: false,
      message: 'Login failed: ' + error.message
    };
  }
}

async function updateUserApiKey(userId, provider, apiKey) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    console.log('🔐 Updating API key for user:', userId);
    console.log('🔍 Type of userId:', typeof userId);
    console.log('📡 Provider:', provider);
    console.log('🔑 API Key (first 10 chars):', apiKey.substring(0, 10) + '...');

    // Ensure userId is a string and convert to ObjectId
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const result = await users.updateOne(
      { _id: new ObjectId(userIdString) },
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
      return {
        success: false,
        message: 'User not found in database'
      };
    }

    // Verify the update by fetching the user
    const updatedUser = await users.findOne({ _id: new ObjectId(userIdString) });
    console.log('🔍 Verification - Updated user apiKeys:', updatedUser?.apiKeys);

    return {
      success: true,
      message: 'API key updated successfully',
      apiKeys: updatedUser?.apiKeys || {}
    };
  } catch (error) {
    console.error('❌ Update API key error:', error);
    return {
      success: false,
      message: 'Failed to update API key: ' + error.message
    };
  }
}

async function updateUserSettings(userId, settings) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    console.log('⚙️ Updating user settings for:', userId);
    console.log('📝 Settings:', settings);

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const result = await users.updateOne(
      { _id: new ObjectId(userIdString) },
      { $set: { settings } }
    );

    console.log('✅ Settings update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return {
        success: false,
        message: 'User not found'
      };
    }

    // Verify the update by fetching the user
    const updatedUser = await users.findOne({ _id: new ObjectId(userIdString) });
    console.log('🔍 Verification - Updated user settings:', updatedUser?.settings);

    return {
      success: true,
      message: 'Settings updated successfully',
      settings: updatedUser?.settings || settings
    };
  } catch (error) {
    console.error('❌ Update settings error:', error);
    return {
      success: false,
      message: 'Failed to update settings: ' + error.message
    };
  }
}

async function updateUserShortcuts(userId, shortcuts) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    console.log('⌨️ Updating user shortcuts for:', userId);
    console.log('🎹 Shortcuts:', shortcuts);

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const result = await users.updateOne(
      { _id: new ObjectId(userIdString) },
      { $set: { shortcuts } }
    );

    console.log('✅ Shortcuts update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return {
        success: false,
        message: 'User not found'
      };
    }

    // Verify the update by fetching the user
    const updatedUser = await users.findOne({ _id: new ObjectId(userIdString) });
    console.log('🔍 Verification - Updated user shortcuts:', updatedUser?.shortcuts);

    return {
      success: true,
      message: 'Shortcuts updated successfully',
      shortcuts: updatedUser?.shortcuts || shortcuts
    };
  } catch (error) {
    console.error('❌ Update shortcuts error:', error);
    return {
      success: false,
      message: 'Failed to update shortcuts: ' + error.message
    };
  }
}

async function getUserData(userId) {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    console.log('🔍 Getting user data for:', userId);
    console.log('🔍 Type of userId:', typeof userId);
    
    // Ensure userId is a string and convert to ObjectId
    const userIdString = typeof userId === 'string' ? userId : userId.toString();
    const user = await users.findOne({ _id: new ObjectId(userIdString) });
    
    if (user) {
      console.log('✅ User found, has apiKeys:', Object.keys(user.apiKeys || {}));
      
      // Convert ObjectId to string for frontend compatibility
      const userForFrontend = {
        ...user,
        _id: user._id.toString()
      };
      
      return {
        success: true,
        user: userForFrontend
      };
    } else {
      console.warn('⚠️ User not found');
      return {
        success: false,
        message: 'User not found'
      };
    }
  } catch (error) {
    console.error('❌ Get user data error:', error);
    return {
      success: false,
      message: 'Failed to get user data: ' + error.message
    };
  }
}

// ==================== MESSAGE/CONVERSATION FUNCTIONS ====================

async function saveMessage(userId, message) {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const messageDoc = {
      userId: new ObjectId(userIdString),
      ...message,
      savedAt: new Date()
    };

    await messages.insertOne(messageDoc);

    return {
      success: true,
      message: 'Message saved successfully'
    };
  } catch (error) {
    console.error('Save message error:', error);
    return {
      success: false,
      message: 'Failed to save message: ' + error.message
    };
  }
}

async function saveConversationHistory(userId, history) {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');

    console.log('💬 Saving conversation history for user:', userId);
    console.log('📊 History length:', history.length);

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    // Clear existing history
    await messages.deleteMany({ userId: new ObjectId(userIdString) });

    // Insert new history
    if (history.length > 0) {
      const messageDocs = history.map(msg => ({
        userId: new ObjectId(userIdString),
        ...msg,
        savedAt: new Date()
      }));

      await messages.insertMany(messageDocs);
    }

    console.log('✅ Conversation history saved');

    return {
      success: true,
      message: 'Conversation history saved successfully',
      count: history.length
    };
  } catch (error) {
    console.error('Save history error:', error);
    return {
      success: false,
      message: 'Failed to save history: ' + error.message
    };
  }
}

async function getConversationHistory(userId) {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');

    console.log('📥 Loading conversation history for user:', userId);

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const history = await messages
      .find({ userId: new ObjectId(userIdString) })
      .sort({ savedAt: 1 })
      .toArray();

    // Remove MongoDB-specific fields
    const cleanHistory = history.map(({ _id, userId, savedAt, ...msg }) => msg);

    console.log('✅ Loaded', cleanHistory.length, 'messages');

    return {
      success: true,
      history: cleanHistory,
      count: cleanHistory.length
    };
  } catch (error) {
    console.error('Get history error:', error);
    return {
      success: false,
      message: 'Failed to get history: ' + error.message,
      history: []
    };
  }
}

async function clearConversationHistory(userId) {
  try {
    const database = await connectDB();
    const messages = database.collection('messages');

    // Ensure userId is a string
    const userIdString = typeof userId === 'string' ? userId : userId.toString();

    const result = await messages.deleteMany({ userId: new ObjectId(userIdString) });

    console.log('🗑️ Cleared', result.deletedCount, 'messages for user:', userId);

    return {
      success: true,
      message: 'Conversation history cleared',
      deletedCount: result.deletedCount
    };
  } catch (error) {
    console.error('Clear history error:', error);
    return {
      success: false,
      message: 'Failed to clear history: ' + error.message
    };
  }
}

module.exports = {
  registerUser,
  loginUser,
  updateUserApiKey,
  updateUserSettings,
  updateUserShortcuts,
  getUserData,
  saveMessage,
  saveConversationHistory,
  getConversationHistory,
  clearConversationHistory
};

