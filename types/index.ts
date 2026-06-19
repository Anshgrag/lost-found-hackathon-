export interface Item {
  id: string;
  itemName: string;
  category: 'Electronics' | 'Accessories' | 'Documents' | 'Clothing' | 'Keys' | 'Stationery' | 'Other';
  description: string;
  location: string;
  color: string | null;
  brand: string | null;
  dents: string | null;
  hiddenDetails: string | null;
  date: string; // ISO string
  type: 'lost' | 'found';
  privateAttributes: Record<string, any>;
  appearanceTags: string[];
  status: 'ACTIVE' | 'RESOLVED' | 'PENDING';
  priority: 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  studentId?: string;
  imageUrl?: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  studentId?: string;
  hashedPassword?: string;
  role: 'student' | 'admin';
  picture?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Match {
  id: string;
  lostItemId: string;
  foundItemId: string;
  score: number;
  reasoning: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface Claim {
  id: string;
  lostItemId: string;
  foundItemId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  answers: { question: string; answer: string }[];
  confidenceScore: number;
  evaluatorDecision: 'approve' | 'review' | 'reject';
  createdAt: string;
}

export interface VerificationQuestions {
  id: string;
  foundItemId: string;
  questions: string[];
  createdAt: string;
}

export interface AnalyticsData {
  id: string;
  metricName: string;
  value: any;
  timestamp: string;
}

export interface AgentLog {
  id: string;
  agentName: string;
  action: string;
  input: string;
  output: string;
  timestamp: string;
}

export interface MatchResult {
  match_score: number;
  reasoning: string;
  confidence_level: 'high' | 'medium' | 'low';
  item: Item;
}

export interface VerificationQuestion {
  question: string;
}

export interface ClaimEvaluation {
  ownership_confidence: number;
  matched_fields: string[];
  mismatched_fields: string[];
  recommendation: 'approve' | 'review' | 'reject';
}

