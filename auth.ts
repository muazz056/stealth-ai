require('dotenv').config();
import { MongoClient, Db, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI ;
const DB_NAME = 'interview_assistant';

let client: MongoClient | null = null;
let db: Db | null = null;

// Allowed email providers for registration
const ALLOWED_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me'
];

// Validate email provider
function isAllowedEmailProvider(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  return ALLOWED_EMAIL_PROVIDERS.includes(domain);
}

export interface User {
  _id?: string;
  username: string;
  name: string;
  email: string;
  password: string; // Should be hashed in production
  createdAt: Date;
  verified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  role: string;
  plan: string;
  tokens: number;
  apiKeys: {
    gemini?: string;
    openai?: string;
    claude?: string;
  };
  selectedProvider: string;
  settings: {
    basePrompt?: string;
    resume?: string;
    jobDescription?: string;
    companyInfo?: string;
  };
}

async function connectDB(): Promise<Db> {
  if (db) return db;
  try {
    client = new MongoClient(process.env.MONGO_URI || '');
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Auth DB connected');
    return db;
  } catch (error) {
    console.error('❌ Auth DB connection failed:', error);
    throw error;
  }
}

export async function registerUser(userData: {
  username: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ success: boolean; message: string; userId?: string }> {
  try {
    const database = await connectDB();
    const users = database.collection<User>('users');

    // Check if email provider is allowed
    if (!isAllowedEmailProvider(userData.email)) {
      return {
        success: false,
        message: 'This email provider is not allowed. Please use Gmail, Yahoo, Outlook, Hotmail, iCloud, or Proton.'
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
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create new user (unverified)
    const newUser: any = {
      ...userData,
      verified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: tokenExpiry,
      role: 'user',
      plan: 'trial',
      tokens: 10,
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: '',
      settings: {}
    };

    const result = await users.insertOne(newUser);
    return {
      success: true,
      message: 'User registered successfully. Please verify your email.',
      userId: result.insertedId.toString()
    };
  } catch (error: any) {
    console.error('Registration error:', error);
    return {
      success: false,
      message: 'Registration failed: ' + error.message
    };
  }
}

export async function loginUser(username: string, password: string): Promise<{
  success: boolean;
  message: string;
  user?: User;
}> {
  try {
    const database = await connectDB();
    const users = database.collection<User>('users');

    const user = await users.findOne({ username, password });

    if (!user) {
      return {
        success: false,
        message: 'Invalid username or password'
      };
    }

    // Block login if email not verified (admins bypass)
    if (user && !user.verified && user.role !== 'admin') {
      return {
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.'
      };
    }

    return {
      success: true,
      message: 'Login successful',
      user: user as User
    };
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      message: 'Login failed: ' + error.message
    };
  }
}

export async function updateUserApiKey(
  userId: string,
  provider: 'gemini' | 'openai' | 'claude',
  apiKey: string
): Promise<{ success: boolean; message: string }> {
  try {
    const database = await connectDB();
    const users = database.collection('users');

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
      return {
        success: false,
        message: 'User not found in database'
      };
    }

    return {
      success: true,
      message: 'API key updated successfully'
    };
  } catch (error: any) {
    console.error('❌ Update API key error:', error);
    return {
      success: false,
      message: 'Failed to update API key: ' + error.message
    };
  }
}

export async function updateUserSettings(
  userId: string,
  settings: Partial<User['settings']>
): Promise<{ success: boolean; message: string }> {
  try {
    const database = await connectDB();
    const users = database.collection('users');

    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { settings } }
    );

    return {
      success: true,
      message: 'Settings updated successfully'
    };
  } catch (error: any) {
    console.error('Update settings error:', error);
    return {
      success: false,
      message: 'Failed to update settings: ' + error.message
    };
  }
}

export async function getUserData(userId: string): Promise<User | null> {
  try {
    const database = await connectDB();
    const users = database.collection<User>('users');
    return await users.findOne({ _id: new ObjectId(userId) } as any);
  } catch (error) {
    console.error('Get user data error:', error);
    return null;
  }
}
