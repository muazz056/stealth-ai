import { MongoClient, Db, Collection } from 'mongodb';

// MongoDB connection URI - can be set via environment variable or config
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'interview_assistant';
const COLLECTION_NAME = 'chat_history';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface ChatMessage {
  sessionId: string;
  timestamp: Date;
  role: 'user' | 'model';
  content: string;
  type?: 'text' | 'image_analysis';
}

export async function connectDB(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

export async function getChatCollection(): Promise<Collection<ChatMessage>> {
  const database = await connectDB();
  return database.collection<ChatMessage>(COLLECTION_NAME);
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  try {
    const collection = await getChatCollection();
    await collection.insertOne(message as any);
  } catch (error) {
    console.error('Error saving chat message:', error);
  }
}

export async function getChatHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const collection = await getChatCollection();
    const messages = await collection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray();
    return messages as ChatMessage[];
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
}

export async function clearChatHistory(sessionId: string): Promise<void> {
  try {
    const collection = await getChatCollection();
    await collection.deleteMany({ sessionId });
    console.log('Chat history cleared for session:', sessionId);
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

// Generate a unique session ID (can be used per interview session)
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
