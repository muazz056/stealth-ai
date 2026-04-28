// Load .env from same directory
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Allowed email providers for registration
const ALLOWED_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me'
];

// Brevo API key from environment
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Validate email provider
function isAllowedEmailProvider(email) {
  const domain = email.toLowerCase().split('@')[1];
  return ALLOWED_EMAIL_PROVIDERS.includes(domain);
}

// Generate verification token
function generateVerificationToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

// Password validation
function isPasswordStrong(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  
  if (password.length < minLength) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!hasNumber) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

// Send verification email using Brevo API
async function sendVerificationEmail(email, token, username) {
  if (!BREVO_API_KEY) {
    console.error('❌ BREVO_API_KEY not set in environment');
    return { success: false, message: 'Email service not configured' };
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    console.error('❌ BREVO_SENDER_EMAIL not set in environment');
    return { success: false, message: 'Email sender not configured' };
  }

  const verificationLink = `${process.env.VITE_FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

  const emailData = JSON.stringify({
    sender: { email: senderEmail, name: 'Stealth AI' },
    to: [{ email: email }],
    subject: 'Verify your Stealth AI account',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Stealth AI, ${username}!</h2>
        <p>Please verify your email address to activate your account.</p>
        <p>
          <a href="${verificationLink}" 
             style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Verify Email
          </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${verificationLink}</p>
        <p style="color: #999; font-size: 12px;">This link will expire in 1 hour.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(emailData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const result = JSON.parse(data);
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Verification email sent to:', email);
          resolve({ success: true, message: 'Verification email sent' });
        } else {
          console.error('❌ Brevo API error:', result);
          resolve({ success: false, message: result.message || 'Failed to send email' });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Brevo request error:', error);
      resolve({ success: false, message: 'Failed to send email: ' + error.message });
    });

    req.write(emailData);
    req.end();
  });
}

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

// ==================== ROBUST MONGODB CONNECTION ====================

let client = null;
let db = null;
let isConnecting = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

// Connection state logging
function logConnectionState(prefix = '') {
  const stateNames = ['DISCONNECTED', 'CONNECTED', 'CONNECTING', 'DISCONNECTING'];
  const clientState = client?.topology?.serverState 
    ? stateNames[client.topology.serverState] || 'unknown'
    : db ? 'CONNECTED' : 'DISCONNECTED';
  console.log(`📡 [${prefix}] Connection state: ${clientState}, isConnecting: ${isConnecting}, attempts: ${connectionAttempts}`);
}

// Test if connection is alive
async function isConnectionAlive() {
  if (!client || !db) return false;
  try {
    await client.db(DB_NAME).command({ ping: 1 });
    return true;
  } catch (e) {
    return false;
  }
}

// Exponential backoff delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Robust connect with retry logic
async function connectWithRetry(attempt = 1) {
  if (isConnecting) {
    console.log('⏳ connectWithRetry: Already connecting, waiting...');
    // Wait for existing connection to complete
    while (isConnecting) {
      await delay(100);
    }
    return db;
  }
  
  // If we have a valid connection, reuse it
  if (db) {
    try {
      await client.db(DB_NAME).command({ ping: 1 });
      console.log('♻️ connectWithRetry: Existing connection is alive, reusing');
      return db;
    } catch (e) {
      console.log('🔌 connectWithRetry: Existing connection dead, reconnecting...');
      db = null;
      client = null;
    }
  }
  
  isConnecting = true;
  console.log(`🔌 connectWithRetry: Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);
  
  try {
    const uriToLog = MONGO_URI ? MONGO_URI.substring(0, 30) + '...' : 'undefined';
    console.log('📡 MONGO_URI:', uriToLog);
    
    if (!MONGO_URI) {
      throw new Error('MONGODB_URI is not defined in environment');
    }
    
    // Detect if using mongodb+srv:// (SRV record)
    const isSRV = MONGO_URI.includes('mongodb+srv://');
    console.log('🔍 Connection type:', isSRV ? 'mongodb+srv (DNS SRV)' : 'standard mongodb');
    
    // Build connection options for robustness
    const connectionOptions = {
      // Timeout settings
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      
      // TLS settings (standard practice for MongoDB Atlas)
      ...(MONGO_URI.includes('ssl=true') || MONGO_URI.includes('tls=true') || MONGO_URI.includes('.mongodb.net') ? {
        tls: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
      } : {}),
      
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 1,
      
      // Heartbeat settings
      heartbeatFrequencyMS: 10000,
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
    };
    
    client = new MongoClient(MONGO_URI, connectionOptions);
    
    // Add connection event listeners for diagnostics
    client.on('connectionPoolCreated', (event) => {
      console.log('📡 [AUTH] Connection pool created');
    });
    
    client.on('connectionPoolClosed', (event) => {
      console.log('📡 [AUTH] Connection pool closed');
    });
    
    client.on('connectionCreated', (event) => {
      console.log('📡 [AUTH] Connection created:', event.connectionId);
    });
    
    client.on('connectionClosed', (event) => {
      console.log('📡 [AUTH] Connection closed:', event.connectionId, event.reason);
    });
    
    client.on('connectionReady', (event) => {
      console.log('📡 [AUTH] Connection ready:', event.connectionId);
    });
    
    client.on('connectionError', (event) => {
      console.error('❌ [AUTH] Connection error:', event.connectionId, event.error?.message);
    });
    
    client.on('serverHeartbeatStarted', (event) => {
      console.log('📡 [AUTH] Heartbeat started:', event.connectionId);
    });
    
    client.on('serverHeartbeatSucceeded', (event) => {
      console.log('📡 [AUTH] Heartbeat succeeded:', event.connectionId, 'latency:', event.reply?.ok ? 'OK' : 'FAIL');
    });
    
    client.on('serverHeartbeatFailed', (event) => {
      console.error('❌ [AUTH] Heartbeat failed:', event.connectionId, event.error?.message);
    });
    
    client.on('serverOpening', (event) => {
      console.log('📡 [AUTH] Server opening:', event.address);
    });
    
    client.on('serverClosed', (event) => {
      console.log('📡 [AUTH] Server closed:', event.address);
    });
    
    client.on('topologyOpening', (event) => {
      console.log('📡 [AUTH] Topology opening');
    });
    
    client.on('topologyClosed', (event) => {
      console.log('📡 [AUTH] Topology closed');
    });
    
    client.on('topologyDescriptionChanged', (event) => {
      const prevType = event.previousDescription?.type;
      const newType = event.newDescription?.type;
      console.log('📡 [AUTH] Topology changed:', prevType, '->', newType);
    });
    
    console.log('🔌 Attempting MongoDB connection...');
    logConnectionState('BEFORE_CONNECT');
    
    await client.connect();
    
    // Verify connection
    await client.db(DB_NAME).command({ ping: 1 });
    
    db = client.db(DB_NAME);
    connectionAttempts = 0;
    isConnecting = false;
    
    console.log('✅ [AUTH] MongoDB connected successfully!');
    logConnectionState('AFTER_CONNECT');
    
    return db;
    
  } catch (error) {
    isConnecting = false;
    connectionAttempts++;
    
    console.error('❌ [AUTH] Connection failed:', error.message);
    console.error('❌ [AUTH] Error stack:', error.stack);
    
    // Close failed client
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {}
      client = null;
    }
    db = null;
    
    // Retry with exponential backoff if under max attempts
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const backoffDelay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})...`);
      await delay(backoffDelay);
      return connectWithRetry(attempt + 1);
    }
    
    throw new Error(`MongoDB connection failed after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
  }
}

// Main connectDB function
async function connectDB() {
  logConnectionState('connectDB_ENTRY');
  
  // If already connected and alive, return
  if (db) {
    try {
      await client.db(DB_NAME).command({ ping: 1 });
      console.log('♻️ Reusing existing DB connection (verified alive)');
      return db;
    } catch (e) {
      console.log('🔌 Existing connection dead, reconnecting...');
      db = null;
    }
  }
  
  return connectWithRetry();
}

// Graceful shutdown handler
async function gracefulShutdown() {
  console.log('🛑 [AUTH] Graceful shutdown initiated');
  logConnectionState('SHUTDOWN');
  
  if (client) {
    try {
      await client.close(true); // force = true
      console.log('✅ [AUTH] MongoDB connection closed gracefully');
    } catch (e) {
      console.error('❌ [AUTH] Error during shutdown:', e.message);
    }
  }
  db = null;
  client = null;
}

// Handle process signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('exit', () => {
  if (client) {
    console.log('👋 [AUTH] Process exiting, closing connection');
    client.close().catch(() => {});
  }
});

async function registerUser(userData) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    // Check if email provider is allowed
    console.log('📧 [auth.cjs] Checking email provider for:', userData.email);
    if (!isAllowedEmailProvider(userData.email)) {
      console.log('❌ [auth.cjs] Email provider not allowed for:', userData.email);
      return {
        success: false,
        message: 'This email provider is not allowed. Please use Gmail, Yahoo, Outlook, Hotmail, iCloud, or Proton.'
      };
    }
    console.log('✅ [auth.cjs] Email provider allowed for:', userData.email);

    // Validate password strength
    const passwordCheck = isPasswordStrong(userData.password);
    if (!passwordCheck.valid) {
      return {
        success: false,
        message: passwordCheck.message
      };
    }

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

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Default base prompt for new users
    const DEFAULT_BASE_PROMPT = `You are a real-time AI assistant built for live conversations.
  
CONTEXT RULES:
1. Document = single source of truth
- Use mentioned skills, experience, projects, education
- NEVER invent, exaggerate, or assume
2. Description provided = align answers directly to it
3. Info provided = tailor responses accordingly
4. No context = use best practices

ANSWER STRUCTURE:
- Professional, confident tone , important information first

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- Intelligently analyze intent using provided context

CLARIFICATION:
- If multiple interpretations possible:
- Choose most likely one based on context (Job description or resume)
- Answer directly without asking clarifying questions or mentioning in the response.


RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain correction process
- Never mention you are AI or language model
- Answer confidently as if question was clearly spoken

CODING/TECHNICAL QUESTIONS:
- Provide correct, clean code or technical explanation
- Explain each approach if necessary

EXAMPLES:
- Give examples to improve clarity

OUTPUT:
- No emojis
- Use markdown formatting when helpful

QUESTION CLASSIFICATION:
- If question is RELATED to previous topic (follow-up, clarification, deeper dive): Answer IN CONTEXT
- If question is COMPLETELY NEW (different topic): Answer independently
- Let AI determine relationship based on topic similarity`;

    // Create new user with default settings (unverified)
    const newUser = {
      ...userData,
      verified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: tokenExpiry,
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
    const userId = result.insertedId.toString();

    // Send verification email
    const emailResult = await sendVerificationEmail(userData.email, verificationToken, userData.username);

    if (!emailResult.success) {
      console.warn('⚠️ Failed to send verification email:', emailResult.message);
      // Still return success but warn user
      return {
        success: true,
        message: 'User registered successfully, but verification email could not be sent. Please contact support.',
        userId: userId,
        emailSent: false
      };
    }

    return {
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      userId: userId,
      emailSent: true
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      message: 'Registration failed: ' + error.message
    };
  }
}

async function verifyEmail(token) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    console.log('🔍 Verifying email with token:', token.substring(0, 10) + '...');

    const user = await users.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired verification token. Please request a new verification email.'
      };
    }

    // Mark user as verified
    await users.updateOne(
      { _id: user._id },
      {
        $set: { verified: true },
        $unset: { emailVerificationToken: '', emailVerificationExpiry: '' }
      }
    );

    console.log('✅ Email verified for:', user.email);

    return {
      success: true,
      message: 'Email verified successfully! You can now log in.',
      email: user.email
    };
  } catch (error) {
    console.error('❌ Email verification error:', error);
    return {
      success: false,
      message: 'Verification failed: ' + error.message
    };
  }
}

async function resendVerificationEmail(email) {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    const user = await users.findOne({ email });

    if (!user) {
      return {
        success: false,
        message: 'No account found with this email address.'
      };
    }

    if (user.verified) {
      return {
        success: false,
        message: 'This email is already verified. Please log in.'
      };
    }

    // Generate new token
    const verificationToken = generateVerificationToken();
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: tokenExpiry
        }
      }
    );

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationToken, user.username);

    if (!emailResult.success) {
      return {
        success: false,
        message: 'Failed to send verification email: ' + emailResult.message
      };
    }

    return {
      success: true,
      message: 'Verification email sent! Please check your inbox.'
    };
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    return {
      success: false,
      message: 'Failed to resend verification: ' + error.message
    };
  }
}

async function loginUser(username, password) {
  console.log('🔐 loginUser called with:', { username, password: password ? '***' : 'empty' });
  console.log('🔐 loginUser: DB state before connectDB:');
  logConnectionState('loginUser');
  
  try {
    console.log('🔐 Login attempt for:', username);
    
    const database = await connectDB();
    console.log('🔐 loginUser: DB connected successfully');
    console.log('🔐 loginUser: DB state after connectDB:');
    logConnectionState('loginUser');
    
    const users = database.collection('users');

    console.log('🔍 Querying for user:', username);
    // Allow login with username OR email
    const user = await users.findOne({
      $or: [{ username: username }, { email: username }],
      password: password
    });
    console.log('👤 User result:', user ? 'found' : 'not found');

    if (!user) {
      console.log('❌ No user found with that username/password');
      return {
        success: false,
        message: 'Invalid username or password'
      };
    }

    // Block login if email not verified (admins bypass)
    if (!user.verified && user.role !== 'admin') {
      console.log('❌ User not verified:', user.email);
      return {
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.'
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
    console.error('❌ [loginUser] EXCEPTION:', error);
    console.error('❌ [loginUser] Stack:', error.stack);
    console.error('❌ [loginUser] Error name:', error.name);
    console.error('❌ [loginUser] Error code:', error.code);
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
      const messageDocs = history.map((msg, index) => ({
        userId: new ObjectId(userIdString),
        ...msg,
        savedAt: new Date(),
        seq: index
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
      .sort({ seq: 1, savedAt: 1 })
      .toArray();

    // Remove MongoDB-specific fields
    const cleanHistory = history.map(({ _id, userId, savedAt, seq, ...msg }) => msg);

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
  verifyEmail,
  resendVerificationEmail,
  updateUserApiKey,
  updateUserSettings,
  updateUserShortcuts,
  getUserData,
  saveMessage,
  saveConversationHistory,
  getConversationHistory,
  clearConversationHistory
};

