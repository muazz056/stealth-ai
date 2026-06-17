// Load .env from parent directory (root folder)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_change_me_in_production_2024';
const JWT_ACCESS_EXPIRY = '15m';   // Access token: 15 minutes
const JWT_REFRESH_EXPIRY = '7d';   // Refresh token: 7 days

// Generate access token
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
}

// Generate refresh token
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
}

// Auth middleware: verifies Bearer token and attaches req.user
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid access token' });
  }
}

// Verifies req.user.userId matches req.params.userId or req.body.userId
function requireOwnUser(req, res, next) {
  const requestUserId = req.params.userId || req.body.userId;
  if (!requestUserId) {
    return res.status(400).json({ success: false, message: 'User ID required' });
  }
  if (req.user.userId !== requestUserId) {
    return res.status(403).json({ success: false, message: 'Access denied: user ID mismatch' });
  }
  next();
}

// Tier limits: returns { tokens, transcriptionSeconds } for a given plan
function getTierLimits(plan) {
  switch ((plan || '').toLowerCase()) {
    case 'pro':
      return { tokens: 200, transcriptionSeconds: 5400 }; // 90 min
    case 'premium':
      return { tokens: 500, transcriptionSeconds: 10800 }; // 180 min
    case 'lifetime':
      return { tokens: -1, transcriptionSeconds: -1 }; // unlimited
    case 'free':
    default:
      return { tokens: 10, transcriptionSeconds: 1500 }; // 25 min
  }
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,                 // 120 requests per minute
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
  return crypto.randomBytes(32).toString('hex');
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

  // Use VERCEL_URL in production, fallback to VITE_FRONTEND_URL, then localhost
  const frontendUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.VITE_FRONTEND_URL || 'http://localhost:5173');
  
  // Backend URL for verify email API calls
  const backendUrl = process.env.VITE_BACKEND_URL 
    ? process.env.VITE_BACKEND_URL
    : (process.env.API_BASE_URL || 'http://localhost:3001');
  
  const verificationLink = `${frontendUrl}/verify-email?token=${token}&backend=${encodeURIComponent(backendUrl)}`;

  const emailData = JSON.stringify({
    sender: { email: senderEmail, name: 'Stealth AI' },
    to: [{ email: email }],
    subject: 'Verify your Stealth AI account',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin:0 auto;">
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

  console.log('📧 Sending verification email to:', email);
  console.log('📧 Using sender:', senderEmail);
  console.log('📧 API Key (first 10 chars):', BREVO_API_KEY.substring(0, 10) + '...');

  return new Promise((resolve) => {
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

    console.log('📧 Making request to Brevo API...');

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('📧 Brevo API response status:', res.statusCode);
        console.log('📧 Brevo API response data:', data);
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ Verification email sent to:', email);
            resolve({ success: true, message: 'Verification email sent' });
          } else {
            console.error('❌ Brevo API error:', result);
            resolve({ success: false, message: result.message || 'Failed to send email' });
          }
        } catch (e) {
          console.error('❌ Failed to parse Brevo response:', e.message);
          resolve({ success: false, message: 'Failed to parse email response' });
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

const app = express();
app.set('trust proxy', 1); // trust first proxy hop (Railway LB), reject spoofed IPs
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for API; enable if serving HTML
  crossOriginEmbedderPolicy: false,
}));

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/', apiLimiter); // General API rate limit

const PORT = process.env.PORT || 3001;
const APP_NAME = process.env.APP_NAME || 'Stealth Assist';

const googleAuthResults = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of googleAuthResults) {
    if (now - entry.ts > 300000) googleAuthResults.delete(state);
  }
}, 60000);

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

// ==================== ROBUST MONGODB CONNECTION ====================

let db = null;
let client = null;
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
  console.log(`📡 [BACKEND] ${prefix} Connection state: ${clientState}, isConnecting: ${isConnecting}, attempts: ${connectionAttempts}`);
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
    while (isConnecting) {
      await delay(100);
    }
    return db;
  }
  
  // If we have a valid connection, verify it's alive
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
    client.on('connectionClosed', (event) => {
      console.log('📡 [BACKEND] Connection closed:', event.connectionId, event.reason);
    });
    
    client.on('connectionError', (event) => {
      console.error('❌ [BACKEND] Connection error:', event.connectionId, event.error?.message);
    });
    
    client.on('serverHeartbeatSucceeded', (event) => {
      console.log('📡 [BACKEND] Heartbeat succeeded:', event.connectionId);
    });
    
    client.on('serverHeartbeatFailed', (event) => {
      console.error('❌ [BACKEND] Heartbeat failed:', event.connectionId, event.error?.message);
    });
    
    client.on('topologyDescriptionChanged', (event) => {
      const prevType = event.previousDescription?.type;
      const newType = event.newDescription?.type;
      console.log('📡 [BACKEND] Topology changed:', prevType, '->', newType);
    });
    
    console.log('🔌 Attempting MongoDB connection...');
    logConnectionState('BEFORE_CONNECT');
    
    await client.connect();
    
    // Verify connection
    await client.db(DB_NAME).command({ ping: 1 });
    
    db = client.db(DB_NAME);
    connectionAttempts = 0;
    isConnecting = false;
    
    console.log('✅ [BACKEND] MongoDB connected successfully!');
    logConnectionState('AFTER_CONNECT');
    
    return db;
    
  } catch (error) {
    isConnecting = false;
    connectionAttempts++;
    
    console.error('❌ [BACKEND] Connection failed:', error.message);
    console.error('❌ [BACKEND] Error stack:', error.stack);
    
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
    
    throw new Error(`MongoDB connection failed after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`, { cause: error });
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 [BACKEND] Shutting down gracefully...');
  if (client) {
    try {
      await client.close();
      console.log('✅ [BACKEND] MongoDB connection closed');
    } catch (e) {}
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 [BACKEND] Shutting down gracefully...');
  if (client) {
    try {
      await client.close();
      console.log('✅ [BACKEND] MongoDB connection closed');
    } catch (e) {}
  }
  process.exit(0);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: `${APP_NAME} API is running` });
});

// DB health check endpoint
app.get('/api/db-health', async (req, res) => {
  try {
    if (!db || !client) {
      return res.json({ status: 'disconnected', readyState: 0 });
    }
    const isAlive = await isConnectionAlive();
    res.json({ 
      status: isAlive ? 'connected' : 'error', 
      readyState: client.topology?.serverState || 'unknown'
    });
  } catch (e) {
    res.json({ status: 'error', error: e.message });
  }
});

// Helper: Default shortcuts
function getDefaultShortcuts() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const primaryMod = isMac ? 'Cmd' : 'Ctrl';
  
  return {
    toggleListen: { modifier: 'Control', key: '\\' },
    analyzeScreen: { modifier: 'Control', key: ']' },
    toggleOverlay: { modifier: 'Control', key: '\'' },
    getAnswer: { modifier: 'Control', key: 'Enter' },
    focusInput: { modifier: 'Alt', key: '' },
    clearQuestion: { modifier: 'Control', key: 'Backspace' },
    stopOrClear: { modifier: primaryMod === 'Cmd' ? 'Meta' : 'Control', key: 'Backspace' },
    toggleBrowseAI: { modifier: 'Control', key: '[' }
  };
}

// Ensure user document has all required default fields (settings, shortcuts, transcriptionSeconds)
async function ensureUserDefaults(userId, usersCollection) {
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!user) return;

  const updates = {};
  if (!user.settings) {
    updates.settings = {
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
    };
  }
  if (!user.shortcuts) {
    updates.shortcuts = getDefaultShortcuts();
  }
  if (user.transcriptionSeconds === undefined || user.transcriptionSeconds === null) {
    updates.transcriptionSeconds = 0;
  }
  if (!user.responseLanguage) {
    updates.responseLanguage = 'English';
  }
  if (user.selectedModel === undefined) {
    updates.selectedModel = '';
  }

  if (Object.keys(updates).length > 0) {
    console.log('🔧 Migrating missing defaults for user:', userId);
    console.log('📦 Fields to add:', Object.keys(updates));
    await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: updates });
  }
}

// Default base prompt for new users
const DEFAULT_BASE_PROMPT = `You are a real-time AI interview assistant built for live mock interview conversations.

TOP PRIORITIES:
- Every answer must sound natural, confident, and human — never robotic or templated.

---

CONTEXT RULES:
1. Document = single source of truth
   - Use ONLY mentioned skills, experience, projects, education
   - NEVER invent, exaggerate, or assume details
2. Job description provided = align answers directly to its requirements and keywords
3. Candidate info provided = personalize all responses to their background
4. No context provided = apply general best practices for the role type

---

INTERVIEW ANSWER TECHNIQUES:
Apply the most suitable framework based on question type. Never name the framework out loud — just structure the answer accordingly.

**Behavioral Questions** ("Tell me about a time...", "Describe a situation..."):
Use STAR method:
- Situation: Brief context (1-2 sentences)
- Task: What the candidate was responsible for
- Action: Specific steps THEY took (focus here — use "I", not "we")
- Result: Quantified or concrete outcome where possible

**Achievement / Impact Questions** ("What's your biggest accomplishment..."):
Use CAR method:
- Challenge: The problem or obstacle
- Action: How they tackled it
- Result: The measurable outcome

**Motivation / Fit Questions** ("Why this role?", "Where do you see yourself?"):
Use the Past-Present-Future structure:
- Past: Relevant experience that led here
- Present: Current skills and what they bring
- Future: How this role fits their growth

**Strength / Competency Questions** ("What are your strengths?"):
Lead with the strength → give a specific example → tie it to the role

**Weakness Questions** ("What's your weakness?"):
Name a real but non-critical weakness → show self-awareness → describe active steps taken to improve

**Technical / Situational Questions** ("How would you handle X?", "Walk me through..."):
Use a structured approach:
- Clarify the problem
- Break down the approach step by step
- Mention trade-offs or alternatives where relevant
- Conclude with outcome or recommendation

**Coding / Technical Deep-Dives**:
- Provide correct, clean code or explanation
- Explain the approach briefly before or after
- Mention complexity or edge cases only if relevant

---

ANSWER QUALITY RULES:
- Lead with the strongest point — no long wind-ups
- Keep answers focused: 60–120 seconds of speech equivalent (~100–200 words) unless question demands more
- Use "I" not "we" for personal ownership
- Quantify results wherever the context supports it (%, time saved, users, scale)
- Avoid filler phrases: "That's a great question", "As I mentioned", "Basically"
- End answers with a clear closing line — don't trail off

---

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
  - Treat it as a possible phonetic error from speech-to-text
  - Infer the most likely correct technical term
  - Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- If multiple interpretations are possible:
  - Choose the most likely one based on context
  - Answer directly without asking clarifying questions
- If a term cannot be reasonably inferred:
  - Ignore the unclear term and answer the rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain the correction process
- Answer confidently as if the question was clearly spoken
- Never mention you are an AI

---

OUTPUT FORMAT:
- No emojis
- No framework labels (don't write "Situation:", "Task:" etc. — just flow naturally)
- Bullet points ONLY when listing multiple items or expanding a technical answer
- Use markdown for formatting when helpful
- Give examples ONLY when they improve clarity`;

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

    // Check if email provider is allowed
    console.log('📧 Checking email provider for:', email);
    if (!isAllowedEmailProvider(email)) {
      console.log('❌ Email provider not allowed for:', email);
      return res.status(400).json({
        success: false,
        message: 'This email provider is not allowed. Please use Gmail, Yahoo, Outlook, Hotmail, iCloud, or Proton.'
      });
    }
    console.log('✅ Email provider allowed for:', email);

    // Validate password strength
    const passwordCheck = isPasswordStrong(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        message: passwordCheck.message
      });
    }

    // Check if user exists
    const existingUser = await users.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      const field = existingUser.username === username ? 'Username' : 'Email';
      return res.status(409).json({
        success: false,
        message: field + ' already exists'
      });
    }

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Default base prompt for new users
    const DEFAULT_BASE_PROMPT = `You are a real-time AI interview assistant built for live mock interview conversations.

TOP PRIORITIES:
- Every answer must sound natural, confident, and human — never robotic or templated.

---

CONTEXT RULES:
1. Document = single source of truth
   - Use ONLY mentioned skills, experience, projects, education
   - NEVER invent, exaggerate, or assume details
2. Job description provided = align answers directly to its requirements and keywords
3. Candidate info provided = personalize all responses to their background
4. No context provided = apply general best practices for the role type

---

INTERVIEW ANSWER TECHNIQUES:
Apply the most suitable framework based on question type. Never name the framework out loud — just structure the answer accordingly.

**Behavioral Questions** ("Tell me about a time...", "Describe a situation..."):
Use STAR method:
- Situation: Brief context (1-2 sentences)
- Task: What the candidate was responsible for
- Action: Specific steps THEY took (focus here — use "I", not "we")
- Result: Quantified or concrete outcome where possible

**Achievement / Impact Questions** ("What's your biggest accomplishment..."):
Use CAR method:
- Challenge: The problem or obstacle
- Action: How they tackled it
- Result: The measurable outcome

**Motivation / Fit Questions** ("Why this role?", "Where do you see yourself?"):
Use the Past-Present-Future structure:
- Past: Relevant experience that led here
- Present: Current skills and what they bring
- Future: How this role fits their growth

**Strength / Competency Questions** ("What are your strengths?"):
Lead with the strength → give a specific example → tie it to the role

**Weakness Questions** ("What's your weakness?"):
Name a real but non-critical weakness → show self-awareness → describe active steps taken to improve

**Technical / Situational Questions** ("How would you handle X?", "Walk me through..."):
Use a structured approach:
- Clarify the problem
- Break down the approach step by step
- Mention trade-offs or alternatives where relevant
- Conclude with outcome or recommendation

**Coding / Technical Deep-Dives**:
- Provide correct, clean code or explanation
- Explain the approach briefly before or after
- Mention complexity or edge cases only if relevant

---

ANSWER QUALITY RULES:
- Lead with the strongest point — no long wind-ups
- Keep answers focused: 60–120 seconds of speech equivalent (~100–200 words) unless question demands more
- Use "I" not "we" for personal ownership
- Quantify results wherever the context supports it (%, time saved, users, scale)
- Avoid filler phrases: "That's a great question", "As I mentioned", "Basically"
- End answers with a clear closing line — don't trail off

---

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
  - Treat it as a possible phonetic error from speech-to-text
  - Infer the most likely correct technical term
  - Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- If multiple interpretations are possible:
  - Choose the most likely one based on context
  - Answer directly without asking clarifying questions
- If a term cannot be reasonably inferred:
  - Ignore the unclear term and answer the rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain the correction process
- Answer confidently as if the question was clearly spoken
- Never mention you are an AI

---

OUTPUT FORMAT:
- No emojis
- No framework labels (don't write "Situation:", "Task:" etc. — just flow naturally)
- Bullet points ONLY when listing multiple items or expanding a technical answer
- Use markdown for formatting when helpful
- Give examples ONLY when they improve clarity`;

    // Hash password for non-admin users
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user with default settings (unverified)
    const newUser = {
      username,
      name,
      email,
      password: hashedPassword,
      verified: false,
      suspended: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: tokenExpiry,
      role: 'user', // Default role: regular user
      plan: 'Free', // Free plan for new users
      tokens: 10, // ONE-TIME: 10 free credits on signup
      transcriptionSeconds: 0, // ONE-TIME: 25 min (1500s) free transcription limit
      selectedModel: '',
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: '', // No default provider - user must choose
      voiceProvider: 'default', // Default voice provider
      deepgramApiKey: '', // Empty by default
      deepgramLanguage: 'multi', // Default: multilingual
      deepgramKeyterms: '', // Comma-separated important keywords for better recognition
      responseLanguage: 'English', // Default response language (standalone field)
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
    const userId = result.insertedId.toString();

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationToken, username);

    if (!emailResult.success) {
      console.warn('⚠️ Failed to send verification email:', emailResult.message);
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      userId: userId,
      emailSent: emailResult.success
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
    console.log('🔐 [LOGIN] Request received');
    console.log('🔐 [LOGIN] DB state before connectDB:');
    logConnectionState('LOGIN');
    
    const database = await connectDB();
    const users = database.collection('users');
    
    console.log('🔐 [LOGIN] DB connected successfully');
    console.log('🔐 [LOGIN] DB state after connectDB:');
    logConnectionState('LOGIN');
    
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Allow login with username OR email
    const user = await users.findOne({
      $or: [{ username: username }, { email: username }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Compare password (supports both hashed and legacy plaintext)
    const passwordMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Block login if account is suspended
    if (user.suspended) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    // Block login if email not verified (admins bypass)
    if (!user.verified && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.'
      });
    }

    // Auto-migrate missing default fields (settings, shortcuts, etc.)
    await ensureUserDefaults(user._id.toString(), users);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Migrate old shortcut names to new names
    if (userWithoutPassword.shortcuts && typeof userWithoutPassword.shortcuts === 'object') {
      const renameMap = {
        startStopListen: 'toggleListen',
        minimizeToggle: 'toggleOverlay',
        focusQuestion: 'focusInput'
      };
      for (const [oldName, newName] of Object.entries(renameMap)) {
        if (userWithoutPassword.shortcuts[oldName]) {
          userWithoutPassword.shortcuts[newName] = userWithoutPassword.shortcuts[oldName];
          delete userWithoutPassword.shortcuts[oldName];
        }
      }
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('❌ [LOGIN] Full error:', error);
    console.error('❌ [LOGIN] Error stack:', error.stack);
    console.error('❌ [LOGIN] Error name:', error.name);
    console.error('❌ [LOGIN] Error code:', error.code);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  }
});

// Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' });
    }
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }
    const database = await connectDB();
    const users = database.collection('users');
    const user = await users.findOne({ _id: new ObjectId(decoded.userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    // Auto-migrate missing default fields
    await ensureUserDefaults(decoded.userId, users);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
});

// Verify Email
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    console.log('🔍 Verifying email with token:', token.substring(0, 10) + '...');

    const user = await users.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (!user) {
      // Check if user is already verified (token was already used)
      const verifiedUser = await users.findOne({ 
        emailVerificationToken: { $exists: false },
        // Try to find by recent verification time
      });
      
      // If token not found and not expired, user might already be verified
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token. Please request a new verification email.'
      });
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

    res.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
      email: user.email
    });
  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed: ' + error.message
    });
  }
});

// Resend Verification Email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await users.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.'
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: 'This email is already verified. Please log in.'
      });
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
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email: ' + emailResult.message
      });
    }

    res.json({
      success: true,
      message: 'Verification email sent! Please check your inbox.'
    });
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification: ' + error.message
    });
  }
});

// Update API Key (with optional model for admin custom config)
app.put('/api/auth/api-key', authMiddleware, requireOwnUser, async (req, res) => {
  try {
    const { userId, provider, apiKey, model } = req.body;

    if (!userId || !provider || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'userId, provider, and apiKey are required'
      });
    }

    console.log('🔐 Updating API key for user:', userId);
    console.log('📡 Provider:', provider);
    console.log('🔑 API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
    if (model) console.log('📡 Model:', model);

    const database = await connectDB();
    const users = database.collection('users');

    const updateFields = {
      [`apiKeys.${provider}`]: apiKey,
      selectedProvider: provider
    };
    if (model) updateFields['selectedModel'] = model;

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateFields }
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
      apiKeys: updatedUser?.apiKeys || {},
      selectedModel: updatedUser?.selectedModel || ''
    });
  } catch (error) {
    console.error('❌ Update API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API key: ' + error.message
    });
  }
});

// Google OAuth Login (sign-in with Google, auto-verified)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        message: 'Google OAuth is not configured on the server'
      });
    }

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'] || email.split('@')[0];
    const picture = payload['picture'] || '';

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'No email returned from Google'
      });
    }

    console.log('✅ Google login verified for:', email);

    const database = await connectDB();
    const users = database.collection('users');

    // Check if user already exists
    let user = await users.findOne({ email });

    if (user) {
      // Block login if account is suspended
      if (user.suspended) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended. Please contact support.'
        });
      }
      // Update googleId + picture if not set, and ensure verified
      const updates = { picture, name };
      if (!user.googleId) updates.googleId = googleId;
      if (!user.verified) updates.verified = true;

      await users.updateOne(
        { _id: user._id },
        { $set: updates }
      );

      // Auto-migrate missing default fields
      await ensureUserDefaults(user._id.toString(), users);
    } else {
      // Create new user with auto-verified = true
      const newUser = {
        username: email.split('@')[0],
        name,
        email,
        password: '',
        googleId,
        picture,
        verified: true,
        suspended: false,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        role: 'user',
        plan: 'Free',
        tokens: 10,
        transcriptionSeconds: 0,
        selectedModel: '',
        createdAt: new Date(),
        apiKeys: {},
        selectedProvider: '',
        voiceProvider: 'default',
        deepgramApiKey: '',
        deepgramLanguage: 'multi',
        deepgramKeyterms: '',
        responseLanguage: 'English',
        settings: {
          basePrompt: `You are a real-time AI interview assistant built for live mock interview conversations.

TOP PRIORITIES:
- Every answer must sound natural, confident, and human — never robotic or templated.

---

CONTEXT RULES:
1. Document = single source of truth
   - Use ONLY mentioned skills, experience, projects, education
   - NEVER invent, exaggerate, or assume details
2. Job description provided = align answers directly to its requirements and keywords
3. Candidate info provided = personalize all responses to their background
4. No context provided = apply general best practices for the role type

---

INTERVIEW ANSWER TECHNIQUES:
Apply the most suitable framework based on question type. Never name the framework out loud — just structure the answer accordingly.

**Behavioral Questions** ("Tell me about a time...", "Describe a situation..."):
Use STAR method:
- Situation: Brief context (1-2 sentences)
- Task: What the candidate was responsible for
- Action: Specific steps THEY took (focus here — use "I", not "we")
- Result: Quantified or concrete outcome where possible

**Achievement / Impact Questions** ("What's your biggest accomplishment..."):
Use CAR method:
- Challenge: The problem or obstacle
- Action: How they tackled it
- Result: The measurable outcome

**Motivation / Fit Questions** ("Why this role?", "Where do you see yourself?"):
Use the Past-Present-Future structure:
- Past: Relevant experience that led here
- Present: Current skills and what they bring
- Future: How this role fits their growth

**Strength / Competency Questions** ("What are your strengths?"):
Lead with the strength → give a specific example → tie it to the role

**Weakness Questions** ("What's your weakness?"):
Name a real but non-critical weakness → show self-awareness → describe active steps taken to improve

**Technical / Situational Questions** ("How would you handle X?", "Walk me through..."):
Use a structured approach:
- Clarify the problem
- Break down the approach step by step
- Mention trade-offs or alternatives where relevant
- Conclude with outcome or recommendation

**Coding / Technical Deep-Dives**:
- Provide correct, clean code or explanation
- Explain the approach briefly before or after
- Mention complexity or edge cases only if relevant

---

ANSWER QUALITY RULES:
- Lead with the strongest point — no long wind-ups
- Keep answers focused: 60–120 seconds of speech equivalent (~100–200 words) unless question demands more
- Use "I" not "we" for personal ownership
- Quantify results wherever the context supports it (%, time saved, users, scale)
- Avoid filler phrases: "That's a great question", "As I mentioned", "Basically"
- End answers with a clear closing line — don't trail off

---

TRANSCRIPTION ROBUSTNESS:
- Assume live audio transcription may be imperfect, incomplete, or phonetically inaccurate
- If words appear inside asterisks * *, completely ignore those words (just sounds)
- Intelligently analyze intent using provided context

TERM CORRECTION:
- If a word/phrase doesn't make technical or contextual sense:
  - Treat it as a possible phonetic error from speech-to-text
  - Infer the most likely correct technical term
  - Do NOT invent new skills or tools not supported by context

CLARIFICATION:
- If multiple interpretations are possible:
  - Choose the most likely one based on context
  - Answer directly without asking clarifying questions
- If a term cannot be reasonably inferred:
  - Ignore the unclear term and answer the rest intelligently

RESPONSE BEHAVIOR:
- Do NOT mention transcription errors or corrections
- Do NOT explain the correction process
- Answer confidently as if the question was clearly spoken
- Never mention you are an AI

---

OUTPUT FORMAT:
- No emojis
- No framework labels (don't write "Situation:", "Task:" etc. — just flow naturally)
- Bullet points ONLY when listing multiple items or expanding a technical answer
- Use markdown for formatting when helpful
- Give examples ONLY when they improve clarity`,
          responseLanguage: 'English',
          basePromptSummary: '',
          jobDescription: '',
          jobDescriptionSummary: '',
          companyInfo: '',
          companyInfoSummary: '',
          contextMessages: 5
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

      const result = await users.insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
      console.log('✅ New user created via Google:', email);
    }

    // Build clean user object for frontend
    const { password: _, ...userWithoutPassword } = user;

    // Migrate old shortcut names to new names
    if (userWithoutPassword.shortcuts && typeof userWithoutPassword.shortcuts === 'object') {
      const renameMap = {
        startStopListen: 'toggleListen',
        minimizeToggle: 'toggleOverlay',
        focusQuestion: 'focusInput'
      };
      for (const [oldName, newName] of Object.entries(renameMap)) {
        if (userWithoutPassword.shortcuts[oldName]) {
          userWithoutPassword.shortcuts[newName] = userWithoutPassword.shortcuts[oldName];
          delete userWithoutPassword.shortcuts[oldName];
        }
      }
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: 'Google login successful',
      user: { ...userWithoutPassword, picture },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('❌ Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Google login failed: ' + error.message
    });
  }
});

// Server-side Google OAuth authorize endpoint (for Electron with polling)
app.get('/api/auth/google/authorize', async (req, res) => {
  try {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ success: false, message: 'Google OAuth not configured' });
    }

    const state = crypto.randomBytes(16).toString('hex');

    const { OAuth2Client } = require('google-auth-library');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state,
    });

    googleAuthResults.set(state, { status: 'pending', ts: Date.now() });

    console.log('🔍 Generated OAuth URL redirect_uri:', redirectUri);
    console.log('🔍 Full auth URL (first 300 chars):', authUrl.substring(0, 300));

    res.json({ success: true, url: authUrl, state });
  } catch (error) {
    console.error('❌ Google authorize error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Server-side Google OAuth callback (for Electron with polling)
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      if (state) googleAuthResults.set(state, { status: 'error', message: oauthError, ts: Date.now() });
      return res.send(successPage(false, 'Google sign-in was denied or failed.'));
    }

    if (!code) {
      return res.status(400).send('Missing auth code. You may close this window.');
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).send('Google OAuth not configured');
    }

    const { OAuth2Client } = require('google-auth-library');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'] || email.split('@')[0];
    const picture = payload['picture'] || '';

    if (!email) {
      if (state) googleAuthResults.set(state, { status: 'error', message: 'No email returned from Google', ts: Date.now() });
      return res.status(400).send('No email returned from Google');
    }

    console.log('✅ Server-side Google login verified for:', email);

    const database = await connectDB();
    const users = database.collection('users');

    let user = await users.findOne({ email });

    if (user) {
      // Block login if account is suspended
      if (user.suspended) {
        if (state) googleAuthResults.set(state, { status: 'error', message: 'Your account has been suspended. Please contact support.', ts: Date.now() });
        return res.send(successPage(false, 'Your account has been suspended. Please contact support.'));
      }
      const updates = { picture, name };
      if (!user.googleId) updates.googleId = googleId;
      if (!user.verified) updates.verified = true;
      await users.updateOne({ _id: user._id }, { $set: updates });
      // Auto-migrate missing default fields
      await ensureUserDefaults(user._id.toString(), users);
    } else {
      const newUser = {
        username: email.split('@')[0],
        name, email,
        password: '',
        googleId, picture,
        verified: true,
        suspended: false,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        role: 'user', plan: 'Free',
        tokens: 10,
        transcriptionSeconds: 0,
        selectedModel: '',
        createdAt: new Date(),
        apiKeys: {}, selectedProvider: '',
        voiceProvider: 'default', deepgramApiKey: '',
        deepgramLanguage: 'multi', deepgramKeyterms: '',
        responseLanguage: 'English',
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
      const result = await users.insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
      console.log('✅ New user created via server-side Google OAuth:', email);
    }

    const { password: _, ...userData } = user;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    const resultData = { success: true, user: { ...userData, picture }, accessToken, refreshToken };

    if (state) {
      googleAuthResults.set(state, { status: 'complete', result: resultData, ts: Date.now() });
    }

    res.send(successPage(true));
  } catch (error) {
    console.error('❌ Google callback error:', error);
    if (req.query.state) googleAuthResults.set(req.query.state, { status: 'error', message: error.message, ts: Date.now() });
    res.status(500).send('Google login failed: ' + error.message);
  }
});

function successPage(success, message) {
  return `<!DOCTYPE html>
<html><head><title>${success ? 'Login Successful' : 'Login Failed'} - ${APP_NAME}</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f1f5f9}h2{text-align:center}.icon{font-size:48px;text-align:center}</style></head>
<body><div><div class="icon">${success ? '✅' : '❌'}</div>
<h2>${success ? 'Signed in with Google!' : message || 'Sign-in failed'}</h2>
<p style="text-align:center;color:#94a3b8">You may close this tab and return to ${APP_NAME}.</p></div></body></html>`;
}

// Poll for Google OAuth result
app.get('/api/auth/google/result/:state', (req, res) => {
  const entry = googleAuthResults.get(req.params.state);
  if (!entry) return res.json({ status: 'pending' });
  if (entry.status === 'complete') {
    googleAuthResults.delete(req.params.state);
    return res.json({ status: 'complete', result: entry.result });
  }
  if (entry.status === 'error') {
    googleAuthResults.delete(req.params.state);
    return res.json({ status: 'error', message: entry.message });
  }
  res.json({ status: 'pending' });
});

// Get User by ID
app.get('/api/auth/user/:userId', authMiddleware, requireOwnUser, async (req, res) => {
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

    // Auto-migrate missing default fields (settings, shortcuts, etc.)
    await ensureUserDefaults(userId, users);

    // Refetch after migration
    const migratedUser = await users.findOne({ _id: new ObjectId(userId) });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = migratedUser;

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
app.put('/api/auth/settings', authMiddleware, requireOwnUser, async (req, res) => {
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

    // Build dot-notation updates to merge, not replace
    const settingsUpdate = {};
    for (const [key, value] of Object.entries(settings)) {
      settingsUpdate[`settings.${key}`] = value;
    }

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: settingsUpdate }
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
app.put('/api/auth/shortcuts', authMiddleware, requireOwnUser, async (req, res) => {
  try {
    const { userId, shortcuts } = req.body;

    if (!userId || !shortcuts) {
      return res.status(400).json({
        success: false,
        message: 'userId and shortcuts are required'
      });
    }

    console.log('⌨️ Updating user shortcuts for:', userId);
    console.log('🎹 Shortcuts:', shortcuts);

    // Migrate old shortcuts data: move key to defaultKey and remove key
    const migratedShortcuts = {};
    for (const [action, config] of Object.entries(shortcuts)) {
      migratedShortcuts[action] = { ...config };
      if (config.key !== undefined) {
        migratedShortcuts[action].defaultKey = config.key;
        delete migratedShortcuts[action].key;
      }
    }

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { shortcuts: migratedShortcuts } }
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
      shortcuts: migratedShortcuts
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
app.put('/api/auth/deepgram-key', authMiddleware, requireOwnUser, async (req, res) => {
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
app.put('/api/auth/deepgram-language', authMiddleware, requireOwnUser, async (req, res) => {
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
app.put('/api/auth/deepgram-keyterms', authMiddleware, requireOwnUser, async (req, res) => {
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

// Update Response Language
app.put('/api/auth/response-language', authMiddleware, requireOwnUser, async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');
    
    const { userId, responseLanguage } = req.body;

    if (!userId || !responseLanguage) {
      return res.status(400).json({
        success: false,
        message: 'userId and responseLanguage are required'
      });
    }

    console.log('🔄 Updating response language for user:', userId);
    console.log('🌐 Response Language:', responseLanguage);

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { 
        responseLanguage: responseLanguage,
        'settings.responseLanguage': responseLanguage
      } }
    );

    console.log('✅ Response language update result:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Response language updated successfully',
      responseLanguage: responseLanguage
    });
  } catch (error) {
    console.error('Update response language error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update response language: ' + error.message
    });
  }
});

// ==================== SUPER ADMIN ROUTES ====================

// Helper: verify super admin
async function verifySuperAdmin(database, userId) {
  const users = database.collection('users');
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user || user.role !== 'super-admin') {
    throw new Error('Unauthorized: super admin access required');
  }
  return user;
}

// Save AI model chain
app.post('/api/auth/super-admin/ai-chain', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId, chain } = req.body;
    if (!userId || !chain) {
      return res.status(400).json({ success: false, message: 'userId and chain are required' });
    }
    await verifySuperAdmin(database, userId);
    const config = database.collection('app_config');
    await config.updateOne(
      { _id: 'ai_model_chain' },
      { $set: { chain, updatedBy: userId, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log(`🔐 Super admin ${userId} updated AI model chain (${chain.length} models)`);
    res.json({ success: true, message: 'AI model chain saved', chain });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Save AI chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get AI model chain
app.get('/api/auth/super-admin/ai-chain', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const config = database.collection('app_config');
    const doc = await config.findOne({ _id: 'ai_model_chain' });
    res.json({ success: true, chain: doc?.chain || [] });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Get AI chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save Deepgram key chain
app.post('/api/auth/super-admin/deepgram-chain', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId, chain } = req.body;
    if (!userId || !chain) {
      return res.status(400).json({ success: false, message: 'userId and chain are required' });
    }
    await verifySuperAdmin(database, userId);
    const config = database.collection('app_config');
    await config.updateOne(
      { _id: 'deepgram_key_chain' },
      { $set: { chain, updatedBy: userId, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log(`🔐 Super admin ${userId} updated Deepgram key chain (${chain.length} keys)`);
    res.json({ success: true, message: 'Deepgram key chain saved', chain });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Save Deepgram chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Deepgram key chain
app.get('/api/auth/super-admin/deepgram-chain', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const config = database.collection('app_config');
    const doc = await config.findOne({ _id: 'deepgram_key_chain' });
    res.json({ success: true, chain: doc?.chain || [] });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Get Deepgram chain error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List all users (super admin only) - with search and pagination
app.get('/api/auth/super-admin/users', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId, search = '', page = 1, limit = 20 } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const users = database.collection('users');

    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [allUsers, totalCount] = await Promise.all([
      users.find(query, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      users.countDocuments(query)
    ]);

    res.json({
      success: true,
      users: allUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('List users error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete user permanently (super admin only)
app.delete('/api/auth/super-admin/users/:targetUserId', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId } = req.query;
    const { targetUserId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const users = database.collection('users');

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const targetUser = await users.findOne({ _id: new ObjectId(targetUserId) });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deleting other super admins
    if (targetUser.role === 'super-admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete super admin accounts' });
    }

    await users.deleteOne({ _id: new ObjectId(targetUserId) });

    // Also delete user's messages
    const messages = database.collection('messages');
    await messages.deleteMany({ userId: new ObjectId(targetUserId) });

    res.json({ success: true, message: 'User deleted permanently' });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Suspend or unsuspend user (super admin only)
app.put('/api/auth/super-admin/users/:targetUserId/suspend', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId } = req.query;
    const { targetUserId } = req.params;
    const { suspended } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const users = database.collection('users');

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const targetUser = await users.findOne({ _id: new ObjectId(targetUserId) });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent suspending other super admins
    if (targetUser.role === 'super-admin') {
      return res.status(403).json({ success: false, message: 'Cannot suspend super admin accounts' });
    }

    await users.updateOne(
      { _id: new ObjectId(targetUserId) },
      { $set: { suspended: !!suspended } }
    );

    res.json({
      success: true,
      message: suspended ? 'User suspended' : 'User unsuspended',
      suspended: !!suspended
    });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Suspend user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Change user role and set corresponding limits (super admin only)
app.put('/api/auth/super-admin/users/:targetUserId/role', async (req, res) => {
  try {
    const database = await connectDB();
    const { userId } = req.query;
    const { targetUserId } = req.params;
    const { plan } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    await verifySuperAdmin(database, userId);
    const users = database.collection('users');

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const validPlans = ['Free', 'Pro', 'Premium'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan. Must be: Free, Pro, or Premium' });
    }

    const targetUser = await users.findOne({ _id: new ObjectId(targetUserId) });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent changing other super admins
    if (targetUser.role === 'super-admin') {
      return res.status(403).json({ success: false, message: 'Cannot change super admin plan' });
    }

    const tierLimits = getTierLimits(plan);

    await users.updateOne(
      { _id: new ObjectId(targetUserId) },
      {
        $set: {
          plan: plan,
          tokens: tierLimits.tokens,
          transcriptionSeconds: 0 // Reset transcription usage on plan change
        }
      }
    );

    res.json({
      success: true,
      message: `User plan changed to ${plan}`,
      plan,
      tokens: tierLimits.tokens,
      transcriptionLimit: tierLimits.transcriptionSeconds
    });
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      return res.status(403).json({ success: false, message: err.message });
    }
    console.error('Change role error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get active Deepgram config from system chain (ANY authenticated user)
app.get('/api/auth/deepgram-chain-public', async (req, res) => {
  try {
    const database = await connectDB();
    const config = database.collection('app_config');
    const doc = await config.findOne({ _id: 'deepgram_key_chain' });
    const chain = doc?.chain || [];
    // Return the first active entry so users get the system-configured Deepgram key
    const activeEntry = chain.find(e => e && e.active !== false && e.apiKey);
    const deepgramKey = activeEntry?.apiKey || '';
    const providerName = activeEntry?.provider || 'deepgram';
    const dgConfig = {
      apiKey: deepgramKey,
      provider: providerName,
      language: activeEntry?.language || 'multi',
      keyterms: activeEntry?.keyterms || ''
    };
    console.log(`🌐 [DG-PUBLIC] Serving system Deepgram config: provider=${providerName}, hasKey=${!!deepgramKey}`);
    res.json({ success: true, config: dgConfig, chain });
  } catch (err) {
    console.error('Get public Deepgram chain error:', err);
    res.status(500).json({ success: false, message: err.message, config: null });
  }
});

// ==================== MESSAGE/CONVERSATION ROUTES ====================

// Save conversation message
app.post('/api/messages/save', authMiddleware, requireOwnUser, async (req, res) => {
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
app.post('/api/messages/save-history', authMiddleware, requireOwnUser, async (req, res) => {
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
      const messageDocs = history.map((msg, index) => ({
        userId: new ObjectId(userId),
        ...msg,
        savedAt: new Date(),
        seq: index
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
app.get('/api/messages/history/:userId', authMiddleware, requireOwnUser, async (req, res) => {
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
      .sort({ seq: 1, savedAt: 1 })
      .toArray();

    // Remove MongoDB-specific fields
    const cleanHistory = history.map(({ _id, userId, savedAt, seq, ...msg }) => msg);

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
app.delete('/api/messages/clear/:userId', authMiddleware, requireOwnUser, async (req, res) => {
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

    const isAdmin = user.role === 'admin' || user.role === 'super-admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    const canSendMessage = hasUnlimitedTokens || user.tokens > 0;
    const tierLimits = getTierLimits(user.plan);

    res.json({
      success: true,
      tokens: user.tokens,
      canSendMessage,
      isAdmin,
      hasUnlimitedTokens,
      role: user.role,
      plan: user.plan,
      transcriptionLimit: tierLimits.transcriptionSeconds,
      transcriptionSeconds: user.transcriptionSeconds || 0
    });
  } catch (error) {
    console.error('Check tokens error:', error);
    res.status(500).json({
      success: false,
        message: 'Failed to check credits: ' + error.message
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
    const isAdmin = user.role === 'admin' || user.role === 'super-admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    
    if (hasUnlimitedTokens) {
      return res.json({
        success: true,
        message: 'Unlimited credits',
        tokens: user.tokens,
        consumed: 0
      });
    }

    // Check if user has enough tokens
    if (user.tokens < amount) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient credits',
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
              message: 'Credits consumed',
      tokens: user.tokens - amount,
      consumed: amount
    });
  } catch (error) {
    console.error('Consume tokens error:', error);
    res.status(500).json({
      success: false,
        message: 'Failed to consume credits: ' + error.message
    });
  }
});

// Check if user can listen (tokens > 0 AND transcription time remaining)
app.get('/api/tokens/check-listen/:userId', async (req, res) => {
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

    const isAdmin = user.role === 'admin' || user.role === 'super-admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    const tierLimits = getTierLimits(user.plan);
    const transcriptionLimit = tierLimits.transcriptionSeconds;
    const transcriptionSeconds = user.transcriptionSeconds || 0;
    const transcriptionRemaining = Math.max(0, transcriptionLimit - transcriptionSeconds);
    const hasTranscriptionTime = isAdmin || hasUnlimitedTokens || transcriptionRemaining > 0;

    let canListen = false;
    let reason = 'ok';

    if (isAdmin || hasUnlimitedTokens) {
      canListen = true;
    } else if (user.tokens <= 0) {
      canListen = false;
      reason = 'out_of_tokens';
    } else if (!hasTranscriptionTime) {
      canListen = false;
      reason = 'transcription_limit';
    } else {
      canListen = true;
    }

    res.json({
      success: true,
      canListen,
      reason,
      transcriptionSeconds,
      transcriptionLimit,
      transcriptionRemaining,
      tokens: user.tokens,
      isAdmin,
      hasUnlimitedTokens,
      role: user.role,
      plan: user.plan
    });
  } catch (error) {
    console.error('Check listen error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check listen status: ' + error.message
    });
  }
});

// Add transcription time (called when user stops listening)
app.post('/api/tokens/add-transcription-time/:userId', async (req, res) => {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    const { userId } = req.params;
    const { seconds } = req.body;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (typeof seconds !== 'number' || seconds <= 0 || seconds > 3600) {
      return res.status(400).json({
        success: false,
        message: 'Invalid seconds value (must be 1-3600)'
      });
    }

    const user = await users.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't track for admin/unlimited
    const isAdmin = user.role === 'admin' || user.role === 'super-admin';
    const hasUnlimitedTokens = isAdmin || user.tokens === -1;
    if (hasUnlimitedTokens) {
      const tierLimits = getTierLimits(user.plan);
      return res.json({
        success: true,
        transcriptionSeconds: user.transcriptionSeconds || 0,
        transcriptionRemaining: tierLimits.transcriptionSeconds,
        limitReached: false,
        unlimited: true
      });
    }

    // Add transcription seconds
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { transcriptionSeconds: seconds } }
    );

    const tierLimits = getTierLimits(user.plan);
    const transcriptionLimit = tierLimits.transcriptionSeconds;
    const newTotal = (user.transcriptionSeconds || 0) + seconds;
    const transcriptionRemaining = Math.max(0, transcriptionLimit - newTotal);
    const limitReached = transcriptionRemaining <= 0;

    res.json({
      success: true,
      transcriptionSeconds: newTotal,
      transcriptionRemaining,
      limitReached,
      unlimited: false
    });
  } catch (error) {
    console.error('Add transcription time error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add transcription time: ' + error.message
    });
  }
});

// ==================== MESSAGE LIMIT & TRACKING (LEGACY - KEPT FOR COMPATIBILITY) ====================

// Check if user can send message (free tier limit)
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
    
    let { type, text, apiProvider, apiKey, model: reqModel } = req.body;
    let model = reqModel;
    
    if (!type || !text || !apiProvider) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: type, text, apiProvider'
      });
    }

    // Fall back to system AI chain if no user key provided
    if (!apiKey) {
      try {
        const database = await connectDB();
        const config = database.collection('app_config');
        const chainDoc = await config.findOne({ _id: 'ai_model_chain' });
        if (chainDoc?.chain) {
          let entry = chainDoc.chain.find(e => e.provider === apiProvider && e.active !== false);
          if (!entry) {
            entry = chainDoc.chain.find(e => e.active !== false);
          }
          if (entry) {
            apiKey = entry.apiKey;
            if (!model) model = entry.model;
            if (entry.provider !== apiProvider) {
              console.log(`🔐 Switching provider ${apiProvider} → ${entry.provider} (summarize, from system chain)`);
            }
            apiProvider = entry.provider;
            console.log(`🔐 Using system AI chain key for ${apiProvider} (summarize)`);
            if (model) console.log(`🔐 Using model: ${model}`);
          }
        }
      } catch (chainErr) {
        console.error('Failed to read system AI chain:', chainErr.message);
      }
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
      summaryPrompt = `Shorten these meeting assistant instructions into key points (under 150 words):
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
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
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
            model: model || 'gpt-4o-mini',
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
            model: model || 'claude-3-5-sonnet-20241022',
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
            model: model || 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
              { role: 'system', content: 'You are a professional meeting assistant.' },
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
    let { messages, apiKey: reqApiKey, model: reqModel, userId } = req.body;

    if (!messages) {
      console.log('❌ Missing required fields');
      res.write(`data: ${JSON.stringify({ error: 'Missing required fields: messages' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    let apiProvider = req.body.apiProvider;
    let apiKey = reqApiKey;
    let model = reqModel;

    // Check if user is an admin — admins must use their own API config
    if (userId && ObjectId.isValid(userId)) {
      try {
        const database = await connectDB();
        const user = await database.collection('users').findOne({ _id: new ObjectId(userId) });
        if (user && user.role === 'admin') {
          if (user.selectedProvider && user.selectedModel && user.apiKeys?.[user.selectedProvider]) {
            apiProvider = user.selectedProvider;
            apiKey = user.apiKeys[user.selectedProvider];
            model = user.selectedModel;
            console.log(`🔐 Using admin's own API config: ${apiProvider} / ${model}`);
          } else {
            console.log('❌ Admin missing own API config');
            res.write(`data: ${JSON.stringify({ error: 'Admin must configure own API provider, model, and API key in settings.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
          }
        } else {
          // Non-admin: fall back to system AI chain
          try {
            const database = await connectDB();
            const config = database.collection('app_config');
            const chainDoc = await config.findOne({ _id: 'ai_model_chain' });
            if (chainDoc?.chain) {
              let entry = chainDoc.chain.find(e => e.provider === apiProvider && e.active !== false);
              if (!entry) {
                entry = chainDoc.chain.find(e => e.active !== false);
              }
              if (entry) {
                if (!apiKey) apiKey = entry.apiKey;
                if (!model) model = entry.model;
                if (entry.provider !== apiProvider) {
                  console.log(`🔐 Switching provider from "${apiProvider || 'none'}" → "${entry.provider}" (from system chain)`);
                }
                apiProvider = entry.provider;
                console.log(`🔐 Using system AI chain: ${apiProvider} / ${model || 'default model'}`);
              }
            }
          } catch (chainErr) {
            console.error('Failed to read system AI chain:', chainErr.message);
          }
        }
      } catch (userErr) {
        console.error('Failed to look up user:', userErr.message);
      }
    } else {
      // No userId provided: fall back to system AI chain
      try {
        const database = await connectDB();
        const config = database.collection('app_config');
        const chainDoc = await config.findOne({ _id: 'ai_model_chain' });
        if (chainDoc?.chain) {
          let entry = chainDoc.chain.find(e => e.provider === apiProvider && e.active !== false);
          if (!entry) {
            entry = chainDoc.chain.find(e => e.active !== false);
          }
          if (entry) {
            if (!apiKey) apiKey = entry.apiKey;
            if (!model) model = entry.model;
            if (entry.provider !== apiProvider) {
              console.log(`🔐 Switching provider from "${apiProvider || 'none'}" → "${entry.provider}" (from system chain)`);
            }
            apiProvider = entry.provider;
            console.log(`🔐 Using system AI chain: ${apiProvider} / ${model || 'default model'}`);
          }
        }
      } catch (chainErr) {
        console.error('Failed to read system AI chain:', chainErr.message);
      }
    }

    if (!apiKey) {
      console.log('❌ No API key available for provider:', apiProvider || 'unknown');
      res.write(`data: ${JSON.stringify({ error: `No API key configured for ${apiProvider || 'unknown'}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    console.log(`🤖 Streaming with provider: ${apiProvider} / ${model || 'default model'}`);

    // Send provider metadata to frontend
    res.write(`data: ${JSON.stringify({ provider: apiProvider, model: model || 'default' })}\n\n`);

    // Convert messages to target provider format
    let convertedMessages = messages;
    if (apiProvider === 'gemini') {
      // Convert from OpenAI format {role, content} to Gemini format {role, parts}
      convertedMessages = messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content || '' }]
      }));
    } else {
      // Ensure OpenAI-compatible format (content as string)
      convertedMessages = messages.map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.parts?.[0]?.text || msg.content || ''
      }));
    }
    messages = convertedMessages;

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

// ==================== SCREEN ANALYZE (vision) ====================
app.post('/api/analyze-screen', async (req, res) => {
  console.log('📸 Screen analyze request received');

  try {
    const { image, messages, prompt } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    let apiProvider, apiKey, model;

    // Read chain to determine provider
    try {
      const database = await connectDB();
      const config = database.collection('app_config');
      const chainDoc = await config.findOne({ _id: 'ai_model_chain' });
      if (chainDoc?.chain) {
        const entry = chainDoc.chain.find(e => e.active !== false);
        if (entry) {
          apiKey = entry.apiKey;
          model = entry.model;
          apiProvider = entry.provider;
          console.log(`🔐 Screen analyze using system chain: ${apiProvider} / ${model || 'default model'}`);
        }
      }
    } catch (chainErr) {
      console.error('Failed to read system AI chain:', chainErr.message);
    }

    if (!apiKey) {
      return res.status(400).json({ error: `No API key configured for ${apiProvider || 'unknown'}` });
    }

    // Build messages with image and call the appropriate provider
    let text = '';

    if (apiProvider === 'gemini') {
      const contents = (messages || []).map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content || msg.parts?.[0]?.text || '' }]
      }));
      contents.push({
        role: 'user',
        parts: [
          { text: prompt || 'Analyze this screenshot' },
          { inline_data: { mime_type: 'image/png', data: image } }
        ]
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        }
      );

      if (!response.ok) throw new Error(`Gemini API error: ${response.status} - ${await response.text()}`);
      const data = await response.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (apiProvider === 'openai') {
      const msgs = (messages || []).map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content || msg.parts?.[0]?.text || ''
      }));
      msgs.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Analyze this screenshot' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
        ]
      });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: msgs, max_tokens: 4000 })
      });

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status} - ${await response.text()}`);
      const data = await response.json();
      text = data.choices?.[0]?.message?.content || '';

    } else if (apiProvider === 'claude') {
      const msgs = (messages || []).map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content || msg.parts?.[0]?.text || ''
      }));
      msgs.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
          { type: 'text', text: prompt || 'Analyze this screenshot' }
        ]
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model || 'claude-3-5-sonnet-20241022', messages: msgs, max_tokens: 4000 })
      });

      if (!response.ok) throw new Error(`Claude API error: ${response.status} - ${await response.text()}`);
      const data = await response.json();
      text = data.content?.[0]?.text || '';

    } else if (apiProvider === 'groq') {
      const msgs = (messages || []).map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content || msg.parts?.[0]?.text || ''
      }));
      msgs.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Analyze this screenshot' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
        ]
      });

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'meta-llama/llama-4-scout-17b-16e-instruct', messages: msgs, max_tokens: 4000 })
      });

      if (!response.ok) throw new Error(`Groq API error: ${response.status} - ${await response.text()}`);
      const data = await response.json();
      text = data.choices?.[0]?.message?.content || '';

    } else {
      return res.status(400).json({ error: `Unsupported provider: ${apiProvider}` });
    }

    res.json({ text });

  } catch (error) {
    console.error('❌ Screen analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DEEPGRAM WEBSOCKET PROXY ====================
const { WebSocketServer, WebSocket } = require('ws');
const deepgramWss = new WebSocketServer({ noServer: true });

function setupDeepgramProxy(server) {
  deepgramWss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let apiKey = url.searchParams.get('apiKey');
      const language = url.searchParams.get('language') || 'en-US';
      
      if (!apiKey) {
        try {
          const database = await connectDB();
          const config = database.collection('app_config');
          const chainDoc = await config.findOne({ _id: 'deepgram_key_chain' });
          if (chainDoc?.chain) {
            const entry = chainDoc.chain.find(e => e.active !== false);
            if (entry) {
              apiKey = entry.apiKey;
              console.log('🎧 Using system Deepgram key chain');
            }
          }
        } catch (chainErr) {
          console.error('Failed to read Deepgram chain:', chainErr.message);
        }
      }
      
      if (!apiKey) {
        ws.close(4001, 'API key required');
        return;
      }
      
      const deepgramUrl =
        'wss://api.deepgram.com/v1/listen?model=nova-3&language=' + language +
        '&interim_results=true&vad_events=true' +
        '&smart_format=true&punctuate=true&endpointing=100&utterance_end_ms=1000' +
        '&encoding=opus&container=webm';

      console.log('🎧 Deepgram proxy opening connection to:', deepgramUrl);
      console.log('🎧 Deepgram proxy sending Authorization header for API key length', apiKey.length);
      
      let dgWs;
      let connectAttempts = 0;
      const maxConnectAttempts = 3;
      let clientChunkCount = 0;
      let clientChunkBytes = 0;
      let userInitiatedClose = false;
      
      function createDeepgramConnection() {
        connectAttempts++;
        console.log(`🎧 Deepgram connection attempt ${connectAttempts}/${maxConnectAttempts}`);
        
        dgWs = new WebSocket(deepgramUrl, { headers: { 'Authorization': 'Token ' + apiKey } });
        
        let deepgramMessageCount = 0;
        let firstDeepgramMessageLogged = false;
        let firstTranscriptionLogged = false;
        
        dgWs.on('error', (err) => {
          if (userInitiatedClose) {
            console.log('🛑 Deepgram error ignored (user initiated close)');
            return;
          }
          console.error('Deepgram error:', err.message, 'stack:', err.stack);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
          if (connectAttempts < maxConnectAttempts) {
            const delay = Math.min(500 * connectAttempts, 2000);
            console.log(`🎧 Retrying Deepgram connection in ${delay}ms... (attempt ${connectAttempts + 1})`);
            setTimeout(createDeepgramConnection, delay);
          }
        });
        
        dgWs.on('unexpected-response', (req, res) => {
          const responseHeaders = {};
          for (const [key, value] of Object.entries(res.headers || {})) {
            responseHeaders[key] = value;
          }
          console.error('Deepgram unexpected-response:', {
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: responseHeaders,
            url: deepgramUrl
          });
        });
        
        dgWs.on('open', () => {
          console.log('🎧 Deepgram proxy connected. language=', language);
          userInitiatedClose = false;
          ws.send(JSON.stringify({ type: 'connected' }));
        });
        
        dgWs.on('message', (data) => {
          deepgramMessageCount += 1;
          const text = data instanceof Buffer ? data.toString() : data;
          try {
            const parsed = JSON.parse(text);
            if (!firstDeepgramMessageLogged) {
              firstDeepgramMessageLogged = true;
              console.log('📨 First Deepgram message:', text.slice(0, 200));
            }
            if (parsed.type === 'Results') {
              const transcript = parsed.channel?.alternatives?.[0]?.transcript;
              const isFinal = parsed.is_final;
              if (!firstTranscriptionLogged && transcript) {
                firstTranscriptionLogged = true;
                console.log(`🎤 FIRST TRANSCRIPTION CHUNK: "${transcript}" is_final=${isFinal}`);
              }
              console.log(`📝 Deepgram #${deepgramMessageCount}: "${transcript || '(empty)'}" is_final=${isFinal}`);
            } else {
              if (deepgramMessageCount <= 3 || deepgramMessageCount % 10 === 0) {
                console.log(`📨 Deepgram message #${deepgramMessageCount}: type=${parsed.type}`);
              }
            }
          } catch (e) {
            if (deepgramMessageCount <= 3) {
              console.log(`📨 Deepgram non-JSON message #${deepgramMessageCount}:`, text.slice(0, 100));
            }
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(text);
          }
        });
        
        dgWs.on('close', (code, reason) => {
          const reasonStr = reason?.toString?.() || '';
          const closureType = userInitiatedClose ? 'USER_INITIATED' : (code === 1000 ? 'NORMAL_CLOSURE' : code === 1005 ? 'NO_STATUS_RECEIVED' : code === 1006 ? 'ABNORMAL_CLOSURE' : 'OTHER');
          console.log(`🔌 Deepgram socket closed code=${code} reason='${reasonStr}' readyState=${dgWs.readyState} (${closureType})`);
          ws.close();
        });
      }
      
      createDeepgramConnection();
      
      ws.on('message', (data) => {
        // Check if client sent CloseStream to track user-initiated close
        try {
          const parsed = typeof data === 'string' ? JSON.parse(data) : null;
          if (parsed && parsed.type === 'CloseStream') {
            userInitiatedClose = true;
            console.log('🛑 User initiated Deepgram close (CloseStream)');
            if (dgWs && dgWs.readyState === WebSocket.OPEN) {
              dgWs.close();
            }
            return;
          }
        } catch (e) {}
        
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
          if (dgWs && dgWs.readyState === WebSocket.OPEN) dgWs.send(data);
        } else if (dgWs && dgWs.readyState === WebSocket.OPEN) {
          dgWs.send(data);
        }
      });
      
      // Send keep-alive ping every 5 seconds
      const pingInterval = setInterval(() => {
        if (dgWs && dgWs.readyState === WebSocket.OPEN) {
          dgWs.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 5000);
      ws.on('close', () => {
        userInitiatedClose = true;
        dgWs.close();
      });
      
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

// Contact form endpoint - sends email via Brevo
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!BREVO_API_KEY) {
      return res.status(500).json({ success: false, message: 'Email service not configured' });
    }
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!senderEmail) {
      return res.status(500).json({ success: false, message: 'Email sender not configured' });
    }

    const contactEmailData = JSON.stringify({
      sender: { email: senderEmail, name: name },
      to: [{ email: senderEmail }],
      replyTo: { email, name },
      subject: `[Contact Form] ${subject}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin:0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding:8px; font-weight:bold; color:#555;">Name:</td><td style="padding:8px;">${name}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; color:#555;">Email:</td><td style="padding:8px;">${email}</td></tr>
            <tr><td style="padding:8px; font-weight:bold; color:#555;">Subject:</td><td style="padding:8px;">${subject}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <h3 style="color:#333;">Message:</h3>
          <p style="color:#555; line-height:1.6;">${message.replace(/\n/g, '<br>')}</p>
        </div>
      `
    });

    const result = await new Promise((resolve) => {
      const options = {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(contactEmailData)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', (error) => resolve({ status: 500, data: { message: error.message } }));
      req.write(contactEmailData);
      req.end();
    });

    if (result.status === 200 || result.status === 201) {
      res.json({ success: true, message: 'Message sent successfully' });
    } else {
      console.error('❌ Brevo API error for contact form:', result.data);
      res.status(500).json({ success: false, message: 'Failed to send message' });
    }
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Download proxy endpoint - sets correct filename for cross-origin downloads
const DOWNLOAD_FILENAME = process.env.DOWNLOAD_FILENAME || 'Stealth Assist Setup.exe';
const DOWNLOAD_GITHUB_BASE = 'https://github.com';

app.get('/api/download/windows', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !url.startsWith(DOWNLOAD_GITHUB_BASE)) {
      return res.status(400).json({ error: 'Invalid or missing download URL' });
    }
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: `GitHub responded with ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    res.setHeader('Content-Disposition', `attachment; filename="${DOWNLOAD_FILENAME}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const { Readable } = require('stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error('Download proxy error:', err);
    res.status(502).json({ error: 'Download proxy failed' });
  }
});

// Start server
async function startServer() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('┌─────────────────────────────────────────────────┐');
      console.log('│  🚀 ${APP_NAME} Backend Server   │');
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

