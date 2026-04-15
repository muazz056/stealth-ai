import { MongoClient, Db, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI ;
const DB_NAME = 'interview_assistant';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface User {
  _id?: string;
  username: string;
  name: string;
  email: string;
  password: string; // Should be hashed in production
  createdAt: Date;
  apiKeys: {
    gemini?: string;
    openai?: string;
    claude?: string;
  };
  selectedProvider: 'gemini' | 'openai' | 'claude';
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

    // Create new user
    const newUser: User = {
      ...userData,
      createdAt: new Date(),
      apiKeys: {},
      selectedProvider: 'gemini',
      settings: {}
    };

    const result = await users.insertOne(newUser as any);
    return {
      success: true,
      message: 'User registered successfully',
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
