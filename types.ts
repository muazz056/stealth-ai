
export enum AnswerMode {
  SHORT = 'SHORT',
  DETAILED = 'DETAILED',
  BULLETS = 'BULLETS',
  STAR = 'STAR'
}

export enum QuestionCategory {
  TECHNICAL = 'TECHNICAL',
  BEHAVIORAL = 'BEHAVIORAL',
  RESUME = 'RESUME',
  HR = 'HR',
  SYSTEM_DESIGN = 'SYSTEM_DESIGN',
  UNKNOWN = 'UNKNOWN'
}

export interface TranscriptionItem {
  id: string;
  role: 'user' | 'interviewer';
  text: string;
  timestamp: number;
}

export interface AIResponse {
  answer: string;
  category: QuestionCategory;
  confidence: number;
}

export interface ResumeData {
  name: string;
  content: string;
  parsedAt: number;
}
