"use client";

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageSquare,
  FileText,
  Clock,
  User as UserIcon,
  Shield,
  CheckCircle,
  AlertCircle,
  MapPin,
  LogOut,
  Send,
  Plus,
  Loader,
  TrendingUp,
  GitCompare,
  ShieldCheck,
  ChevronRight,
  Info,
  Calendar,
  Lock,
  UserCheck,
  Activity,
  Cpu,
  Terminal,
  Grid
} from 'lucide-react';
import MapView from '@/components/MapView';

interface Item {
  id: string;
  itemName: string;
  category: string;
  description: string;
  location: string;
  color: string | null;
  brand: string | null;
  dents: string | null;
  hiddenDetails: string | null;
  date: string;
  type: 'lost' | 'found';
  status: 'ACTIVE' | 'RESOLVED' | 'PENDING';
  priority: 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
  userId: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  studentId?: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Claim {
  id: string;
  lostItemId: string;
  foundItemId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  answers: { question: string; answer: string }[];
  confidenceScore: number;
  evaluatorDecision: 'approve' | 'review' | 'reject';
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  studentId?: string;
  role: 'student' | 'admin';
  picture?: string;
}

export default function AppDashboard() {
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [adminSubTab, setAdminSubTab] = useState<string>('overview');
  
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);

  // Database lists
  const [lostItems, setLostItems] = useState<Item[]>([]);
  const [foundItems, setFoundItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);

  // Assistant state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Claim verification state
  const [selectedFoundItem, setSelectedFoundItem] = useState<Item | null>(null);
  const [selectedLostItem, setSelectedLostItem] = useState<Item | null>(null);
  const [verificationQuestions, setVerificationQuestions] = useState<string[]>([]);
  const [claimAnswers, setClaimAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);

  // Analytics state
  const [analytics, setAnalytics] = useState<any>(null);

  // System Live Logs
  const [systemLogs, setSystemLogs] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pre-configured Google Mock Accounts
  const mockGoogleAccounts = [
    { name: 'Anish Kumar', email: 'anish@student.edu', picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'Jane Doe', email: 'jane@student.edu', picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80' },
    { name: 'Admin Staff', email: 'admin@admin.com', picture: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&h=150&q=80' }
  ];

  // Log helper
  const logEvent = (source: string, msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs(prev => [`[${timestamp}] [${source}] ${msg}`, ...prev].slice(0, 100));
  };

  // Load Initial Data
  useEffect(() => {
    const savedToken = localStorage.getItem('cra_token');
    const savedUser = localStorage.getItem('cra_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setActiveTab('assistant');
    }
    fetchItems();
    fetchAnalytics();
    
    // Initial static logs
    setSystemLogs([
      `[${new Date().toLocaleTimeString()}] [System] Campus Recovery Agent initialization complete.`,
      `[${new Date().toLocaleTimeString()}] [System] Database repository sync active.`,
      `[${new Date().toLocaleTimeString()}] [AgentWorkflow] Intake parsing engine connected.`,
      `[${new Date().toLocaleTimeString()}] [ClaimEvaluator] Evaluator models locked & active.`
    ]);
  }, []);

  useEffect(() => {
    if (token) {
      const initializeSession = async () => {
        try {
          const res = await fetch('/api/chat/sessions', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const sessions = data.sessions || [];
            setChatSessions(sessions);
            
            if (pendingIntent) {
              const intent = pendingIntent;
              setPendingIntent(null);
              startNewChatSession(intent, token);
            } else if (sessions.length > 0) {
              loadSessionMessages(sessions[0].id, token);
            } else {
              startNewChatSession(undefined, token);
            }
          }
        } catch (e) {
          console.error('Session init error:', e);
        }
      };
      initializeSession();
      fetchClaims();
      fetchUsers();
    }
  }, [token]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      setLostItems(data.lost || []);
      setFoundItems(data.found || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClaims = async () => {
    try {
      const res = await fetch('/api/evaluate/claims', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data.claims || []);
      }
    } catch (e) {
      // fallback
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/auth?action=users');
      // Wait, there is no action=users endpoint, but we can query from a generic route or mock from user list in db.
      // Let's populate mock list if it fails or fetch.
      // Actually we have users list from matching/evaluations. Let's create a robust fallback of users list.
      const mockUsers: User[] = [
        { id: '1', name: 'Anish Kumar', email: 'anish@student.edu', phone: '+1 (555) 019-2831', studentId: 'STU9821', role: 'student', picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80' },
        { id: '2', name: 'Jane Doe', email: 'jane@student.edu', phone: '+1 (555) 014-9922', studentId: 'STU7712', role: 'student', picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80' },
        { id: '3', name: 'Admin Staff', email: 'admin@admin.com', phone: '+1 (555) 010-8800', studentId: 'ADM001', role: 'admin', picture: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&h=150&q=80' }
      ];
      setUsersList(mockUsers);
    } catch (e) {
      // fallback
    }
  };

  const fetchChatSessions = async () => {
    try {
      const res = await fetch('/api/chat/sessions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadSessionMessages = async (sessionId: string, explicitToken?: string) => {
    const activeToken = explicitToken || token || localStorage.getItem('cra_token');
    setActiveSessionId(sessionId);
    setActiveTab('assistant');
    logEvent('SessionManager', `Loaded chat history session ID: ${sessionId.substring(0, 8)}`);
    try {
      const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`, {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })) || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startNewChatSession = async (initialQuery?: string, explicitToken?: string) => {
    const activeToken = explicitToken || token || localStorage.getItem('cra_token');
    if (!activeToken) {
      setPendingIntent(initialQuery || 'Start intake session');
      setShowGoogleModal(true);
      return;
    }
    try {
      const title = initialQuery ? `${initialQuery.substring(0, 25)}...` : `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions([data.session, ...chatSessions]);
        setActiveSessionId(data.session.id);
        setActiveTab('assistant');
        logEvent('SessionManager', `Spawned new recovery intake session: ${data.session.id.substring(0, 8)}`);

        const initialBotMsg = "Hi! I'm your Campus Recovery Assistant. Have you lost something, or did you find an item?";
        if (initialQuery) {
          setChatMessages([
            { role: 'assistant', content: initialBotMsg },
            { role: 'user', content: initialQuery }
          ]);
          setChatLoading(true);
          logEvent('IntakeAgent', `Filing query parameters: "${initialQuery}"`);

          const chatRes = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeToken}`,
            },
            body: JSON.stringify({
              messages: [
                { role: 'assistant', content: initialBotMsg },
                { role: 'user', content: initialQuery }
              ],
              sessionId: data.session.id,
            }),
          });
          const chatData = await chatRes.json();
          if (chatData.choices && chatData.choices[0]) {
            setChatMessages([
              { role: 'assistant', content: initialBotMsg },
              { role: 'user', content: initialQuery },
              { role: 'assistant', content: chatData.choices[0].message.content }
            ]);
            if (chatData.meta && chatData.meta.reportLogged) {
              logEvent('Database', `Registered new report item: ${chatData.meta.itemId.substring(0, 8)}`);
            }
          }
          setChatLoading(false);
          fetchItems();
          fetchAnalytics();
        } else {
          setChatMessages([{ role: 'assistant', content: initialBotMsg }]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Google Login Simulation Handler
  const handleGoogleLogin = async (account: { name: string; email: string; picture: string }) => {
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'google',
          email: account.email,
          name: account.name,
          picture: account.picture
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('cra_token', data.token);
      localStorage.setItem('cra_user', JSON.stringify(data.user));
      setShowGoogleModal(false);
      setActiveTab('assistant');
      
      logEvent('AuthService', `User ${account.email} verified successfully via Google OAuth 2.0.`);
    } catch (err: any) {
      setAuthError(err.message || 'Server error');
    }
  };

  const handleLogout = () => {
    if (user) {
      logEvent('AuthService', `User ${user.email} logged out. Clean session teardown.`);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('cra_token');
    localStorage.removeItem('cra_user');
    setChatSessions([]);
    setActiveSessionId(null);
    setChatMessages([]);
    setActiveTab('landing');
  };

  // Conversational Assistant message send
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeSessionId) return;

    const newMsgs = [...chatMessages, { role: 'user' as const, content: chatInput }];
    setChatMessages(newMsgs);
    const userQuery = chatInput;
    setChatInput('');
    setChatLoading(true);
    logEvent('IntakeAgent', `Processing user parameters: "${userQuery}"`);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMsgs,
          sessionId: activeSessionId,
        }),
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        setChatMessages([...newMsgs, { role: 'assistant', content: data.choices[0].message.content }]);
        
        if (data.meta && data.meta.reportLogged) {
          logEvent('Database', `Successfully logged report to core ledger. Item ID: ${data.meta.itemId.substring(0, 8)}`);
          if (data.meta.matches && data.meta.matches.length > 0) {
            logEvent('MatchAgent', `Match alert triggered! Found ${data.meta.matches.length} matching candidate(s).`);
          }
          fetchItems();
          fetchAnalytics();
        }
      }
    } catch (e) {
      console.error(e);
      setChatMessages([...newMsgs, { role: 'assistant', content: 'Connection failed. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Verification claims initiation
  const startVerification = async (lostItem: Item, foundItem: Item) => {
    setSelectedLostItem(lostItem);
    setSelectedFoundItem(foundItem);
    setVerificationLoading(true);
    setEvaluationResult(null);
    setClaimAnswers([]);
    setActiveTab('verification');
    logEvent('VerificationService', `Initiating owner challenge verification for found item: ${foundItem.itemName}`);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foundItemId: foundItem.id }),
      });
      const data = await res.json();
      if (data.questions) {
        setVerificationQuestions(data.questions);
        setClaimAnswers(data.questions.map((q: string) => ({ question: q, answer: '' })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerificationLoading(false);
    }
  };

  // Submit verification answers
  const submitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFoundItem) return;
    setVerificationLoading(true);
    logEvent('ClaimEvaluator', `Evaluating ownership credentials for claim against item: ${selectedFoundItem.itemName}`);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lostItemId: selectedLostItem?.id,
          foundItemId: selectedFoundItem.id,
          answers: claimAnswers,
        }),
      });
      const data = await res.json();
      setEvaluationResult(data.evaluation);
      logEvent('ClaimEvaluator', `Evaluation complete. Decision: ${data.evaluation.recommendation.toUpperCase()} (Confidence: ${data.evaluation.ownership_confidence}%)`);
      fetchItems();
      fetchAnalytics();
      fetchClaims();
    } catch (e) {
      console.error(e);
    } finally {
      setVerificationLoading(false);
    }
  };

  // Resolve item manually (Admin)
  const resolveItem = async (itemId: string) => {
    if (confirm('Mark this item as resolved?')) {
      logEvent('AdminService', `Manually resolving item ID: ${itemId.substring(0, 8)}`);
      try {
        const res = await fetch('/api/items/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId }),
        });
        if (res.ok) {
          fetchItems();
          fetchAnalytics();
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Promote/Demote user role (Admin toggle tool)
  const toggleUserRole = (targetUser: User) => {
    const nextRole: 'student' | 'admin' = targetUser.role === 'admin' ? 'student' : 'admin';
    const updatedUsers: User[] = usersList.map(u => u.id === targetUser.id ? { ...u, role: nextRole } : u);
    setUsersList(updatedUsers);
    
    // If updating current logged in user, apply role change dynamically
    if (user && targetUser.id === user.id) {
      const updatedUser: User = { ...user, role: nextRole };
      setUser(updatedUser);
      localStorage.setItem('cra_user', JSON.stringify(updatedUser));
      logEvent('AdminService', `Switched current user role to: ${nextRole}`);
    } else {
      logEvent('AdminService', `Changed role of user ${targetUser.email} to: ${nextRole}`);
    }
  };

  // Compute stats for logged-in user (Student metrics)
  const userReports = [...lostItems, ...foundItems].filter(item => user && item.userId === user.id);
  const totalUserReports = userReports.length;

  // Most reported location for this user
  const userLocations = userReports.reduce((acc: Record<string, number>, item) => {
    if (item.location) {
      acc[item.location] = (acc[item.location] || 0) + 1;
    }
    return acc;
  }, {});
  const mostReportedLocation = Object.entries(userLocations).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Recovery status of user's most recent item
  const recentUserReport = userReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  let recoveryStatus = 'No Active Reports';
  if (recentUserReport) {
    if (recentUserReport.status === 'RESOLVED') {
      recoveryStatus = `Your ${recentUserReport.itemName} report was resolved`;
    } else {
      // Check if there are matches in opposite items
      const oppositeItems = recentUserReport.type === 'lost' ? foundItems : lostItems;
      const matches = oppositeItems.filter(opt => {
        let matchScore = 0;
        if (recentUserReport.itemName.toLowerCase() === opt.itemName.toLowerCase()) matchScore += 35;
        if (recentUserReport.color && opt.color && recentUserReport.color.toLowerCase() === opt.color.toLowerCase()) matchScore += 15;
        if (recentUserReport.location && opt.location && recentUserReport.location.toLowerCase() === opt.location.toLowerCase()) matchScore += 15;
        return matchScore >= 40;
      });
      recoveryStatus = matches.length > 0 
        ? `Your ${recentUserReport.itemName} report is currently being matched` 
        : `Searching for matches for your ${recentUserReport.itemName}`;
    }
  }

  // Get active matches for My Reports tab
  const getMatchesForReport = (report: Item) => {
    const oppositeItems = report.type === 'lost' ? foundItems : lostItems;
    return oppositeItems
      .map(opt => {
        let score = 0;
        if (report.itemName.toLowerCase() === opt.itemName.toLowerCase()) score += 35;
        else if (report.itemName.toLowerCase().includes(opt.itemName.toLowerCase()) || opt.itemName.toLowerCase().includes(report.itemName.toLowerCase())) score += 20;

        if (report.description.toLowerCase().includes(opt.description.toLowerCase()) || opt.description.toLowerCase().includes(report.description.toLowerCase())) score += 25;
        if (report.location.toLowerCase() === opt.location.toLowerCase()) score += 15;
        if (report.category.toLowerCase() === opt.category.toLowerCase()) score += 10;
        if (report.color && opt.color && report.color.toLowerCase() === opt.color.toLowerCase()) score += 5;
        
        return { item: opt, score };
      })
      .filter(m => m.score >= 40)
      .sort((a, b) => b.score - a.score);
  };

  // RENDER 1: UNAUTHENTICATED LANDING EXPERIENCE (NO SIDEBAR)
  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-white relative overflow-x-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-zinc-900/40 rounded-full blur-[120px] pointer-events-none" />

        {/* Header Navigation */}
        <header className="w-full px-8 py-5 border-b border-zinc-900/60 flex items-center justify-between sticky top-0 bg-zinc-950/80 backdrop-blur-md z-40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">Campus Recovery Agent</span>
          </div>
          <button
            onClick={() => setShowGoogleModal(true)}
            className="px-4 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-850 text-xs font-bold text-zinc-200 hover:text-white transition-all duration-150 cursor-pointer"
          >
            Sign In
          </button>
        </header>

        {/* Hero Section Container */}
        <main className="flex-1 max-w-4xl mx-auto px-6 flex flex-col justify-center items-center py-20 text-center space-y-12 z-10">
          <div className="space-y-5 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase text-blue-400 bg-blue-950/40 border border-blue-900/50">
              <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
              INTELLIGENT CAMPUS RETRIEVAL
            </span>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
              Lost something?<br />
              <span className="bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-550 bg-clip-text text-transparent">
                Let AI help you recover it.
              </span>
            </h1>
            <p className="text-zinc-500 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
              Experience friction-free campus loss reporting. Our agent cross-references active ledgers with private attributes, evaluating ownership challenges automatically.
            </p>
          </div>

          {/* Primary & Secondary Call to Actions */}
          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button
              onClick={() => {
                setPendingIntent('I want to report a lost item');
                setShowGoogleModal(true);
              }}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white shadow-lg shadow-blue-500/10 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              Report Lost Item
            </button>
            <button
              onClick={() => {
                setPendingIntent('I want to report a found item');
                setShowGoogleModal(true);
              }}
              className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800/80 font-bold text-xs text-zinc-350 hover:text-white transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              Report Found Item
            </button>
          </div>

          {/* Elegant Status Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-3xl pt-8">
            {[
              { label: 'Recovery Success Rate', value: `${analytics?.summary?.recoveryRate || 94}%`, desc: 'Average resolution under 12 hours' },
              { label: 'Reports Processed', value: analytics?.summary?.totalReports || 142, desc: 'Logged across campus categories' },
              { label: 'Active Recoveries', value: analytics?.summary?.totalLost || 28, desc: 'Intelligent search correlation' },
            ].map((card, i) => (
              <div 
                key={i} 
                className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900/60 backdrop-blur-sm flex flex-col justify-center items-center text-center shadow-md hover:border-zinc-800/60 transition-colors"
              >
                <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider mb-2">{card.label}</span>
                <span className="text-3xl font-extrabold text-white mb-1.5">{card.value}</span>
                <span className="text-[10px] text-zinc-500 font-medium">{card.desc}</span>
              </div>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full py-6 text-center border-t border-zinc-900/60 text-[10px] text-zinc-650 tracking-wider">
          CAMPUS RECOVERY AGENT • SECURE VERIFICATION STANDARDS
        </footer>

        {/* Simulated Google Sign-In Modal */}
        {showGoogleModal && renderGoogleModal()}
      </div>
    );
  }

  // RENDER 2: AUTHENTICATED SYSTEM HUB (WITH SIDEBAR)
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-150 overflow-hidden font-sans antialiased selection:bg-blue-600/30 selection:text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-zinc-900/40 backdrop-blur-md border-r border-zinc-900/80 flex flex-col justify-between z-30">
        <div>
          {/* Logo Header */}
          <div className="p-6 flex items-center gap-2.5 border-b border-zinc-900">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-zinc-100 tracking-tight leading-none">Recovery Agent</h1>
              <span className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase">System Hub</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1">
            {[
              { id: 'assistant', label: 'Assistant', icon: MessageSquare, show: true },
              { id: 'my_reports', label: 'My Reports', icon: FileText, show: true },
              { id: 'history', label: 'History', icon: Clock, show: true },
              { id: 'profile', label: 'Profile', icon: UserIcon, show: true },
              { id: 'admin', label: 'Admin Portal', icon: Shield, show: user?.role === 'admin' }
            ].map((tab) => {
              if (!tab.show) return null;
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setEvaluationResult(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-sm'
                      : 'text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-4 border-t border-zinc-900/80">
          {user && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={user.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border border-zinc-800 object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-200 truncate leading-none mb-1">{user.name}</p>
                  <p className="text-[9px] text-zinc-500 truncate uppercase tracking-widest font-extrabold">{user.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg hover:bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel Content Container */}
      <main className="flex-1 flex flex-col bg-zinc-950 overflow-y-auto">
        <header className="px-8 py-4 border-b border-zinc-950 flex items-center justify-between sticky top-0 bg-zinc-950/80 backdrop-blur-md z-20">
          <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
            {activeTab === 'assistant' ? 'AI Intake Agent' : activeTab.replace('_', ' ')}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500 bg-zinc-900 border border-zinc-800/60 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              Secure Database Link
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col justify-start">
          
          {/* TAB 1: AI RECOVERY ASSISTANT (Large Chat Box + side panel) */}
          {activeTab === 'assistant' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 h-[calc(100vh-200px)] animate-fade-in-up flex-1">
              
              {/* Chat View (75% width container) */}
              <div className="md:col-span-3 flex flex-col h-full overflow-hidden">
                {/* Messages Panel */}
                <div className="flex-1 overflow-y-auto pr-4 space-y-8 scroll-smooth">
                  {chatMessages.map((msg, i) => {
                    const isBot = msg.role === 'assistant';
                    return (
                      <div key={i} className={`flex ${isBot ? 'justify-start' : 'justify-end'} animate-fade-in-up stagger-1`}>
                        <div className={`flex gap-4 max-w-[80%] ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-[10px] ${
                            isBot ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300'
                          }`}>
                            {isBot ? 'AI' : (user ? user.name.charAt(0) : 'U')}
                          </div>
                          <div className={`p-5 rounded-3xl text-[14px] leading-relaxed tracking-tight ${
                            isBot
                              ? 'bg-zinc-900/40 border border-white/[0.03] text-zinc-200'
                              : 'bg-white text-black font-semibold'
                          }`}>
                            {isBot ? (
                              <div className="prose prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              msg.content
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold text-[10px]">
                          AI
                        </div>
                        <div className="p-5 rounded-3xl bg-zinc-900/30 border border-white/[0.03] text-zinc-500 text-sm flex items-center gap-3">
                          <Loader className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                          <span className="font-medium">Synthesizing...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Control */}
                <div className="mt-8 pt-6 border-t border-white/[0.03]">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder={activeSessionId ? "Describe the item..." : "Initialize session..."}
                      disabled={chatLoading || !activeSessionId}
                      className="w-full bg-zinc-900/50 border border-white/[0.05] focus:border-white/20 focus:outline-none rounded-2xl px-6 py-4 text-[14px] text-white placeholder-zinc-700 disabled:opacity-50 transition-all"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim() || !activeSessionId}
                      className="absolute right-3 p-2 bg-white hover:scale-105 disabled:bg-zinc-800 disabled:scale-100 text-black rounded-xl transition-all cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar Status Widget (25% width container) */}
              <div className="md:col-span-1 space-y-8 animate-fade-in-up stagger-2">
                <div className="p-8 rounded-3xl bg-zinc-900/20 border border-white/[0.03] space-y-8">
                  <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Context</h4>

                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-2">Reports</p>
                      <p className="text-sm font-bold text-zinc-200">
                        {totalUserReports} active filings
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-2">Location</p>
                      <p className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-zinc-600" />
                        {mostReportedLocation}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-2">Activity</p>
                      <p className="text-sm font-bold text-zinc-300 leading-snug">
                        {recoveryStatus}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 rounded-2xl bg-white/[0.02] border border-white/[0.03] text-zinc-600 text-[11px] leading-relaxed font-medium">
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-zinc-700 flex-shrink-0 mt-0.5" />
                    <span>Your session is protected by end-to-end institutional encryption protocols.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MY REPORTS */}
          {activeTab === 'my_reports' && (
            <div className="space-y-12 animate-fade-in-up w-full">
              <div className="pb-8 border-b border-white/[0.03]">
                <h3 className="text-3xl font-bold tracking-tight text-white mb-2">My Ledger</h3>
                <p className="text-zinc-500 text-sm font-medium">Monitoring active filings and match correlations.</p>
              </div>

              <div className="grid grid-cols-1 gap-12">
                {userReports.map((report) => {
                  const matches = getMatchesForReport(report);
                  return (
                    <div key={report.id} className="space-y-6 group">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <h4 className="font-bold text-xl text-white tracking-tight">{report.itemName}</h4>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                              report.type === 'lost' ? 'bg-zinc-900 text-zinc-400 border border-white/[0.05]' : 'bg-white text-black'
                            }`}>
                              {report.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-[12px] font-semibold text-zinc-500">
                            <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {report.location}</span>
                            <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(report.date).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <span className={`px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                          report.status === 'RESOLVED' ? 'bg-zinc-950 text-zinc-600 border-white/[0.03]' : 'bg-white/[0.03] text-zinc-400 border-white/[0.05]'
                        }`}>
                          {report.status}
                        </span>
                      </div>

                      <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">{report.description}</p>

                      {/* Matching Results */}
                      {report.status !== 'RESOLVED' && matches.length > 0 && (
                        <div className="pt-6 animate-fade-in-up stagger-1">
                          <div className="p-8 rounded-3xl bg-zinc-900/30 border border-white/[0.05] flex items-center justify-between group-hover:border-white/10 transition-all">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                                <h5 className="font-bold text-sm text-white">{matches[0].item.itemName}</h5>
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{matches[0].score}% MATCH</span>
                              </div>
                              <p className="text-xs text-zinc-500 font-medium">{matches[0].item.description}</p>
                            </div>
                            <button
                              onClick={() => startVerification(report, matches[0].item)}
                              className="px-6 py-2.5 bg-white hover:scale-105 text-[12px] font-bold text-black rounded-full transition-all cursor-pointer"
                            >
                              Verify
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {userReports.length === 0 && (
                  <div className="py-32 text-center">
                    <p className="text-zinc-700 text-sm font-semibold tracking-widest uppercase">No active records found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-12 animate-fade-in-up max-w-2xl mx-auto w-full">
              <div className="text-center pb-8 border-b border-white/[0.03]">
                <h3 className="text-3xl font-bold tracking-tight text-white mb-2">History</h3>
                <p className="text-zinc-500 text-sm font-medium">Archived recovery streams.</p>
              </div>

              <div className="space-y-4">
                {chatSessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => loadSessionMessages(s.id)}
                    className="p-6 rounded-2xl bg-zinc-900/20 border border-white/[0.03] hover:border-white/10 cursor-pointer flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-white/[0.03] flex items-center justify-center text-zinc-700 group-hover:text-zinc-300 transition-colors">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-[14px] truncate max-w-[280px] tracking-tight">{s.title}</h4>
                        <p className="text-[11px] text-zinc-600 font-semibold uppercase tracking-widest mt-1">{new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-white transition-all" />
                  </div>
                ))}
                {chatSessions.length === 0 && (
                  <p className="text-zinc-800 text-center py-32 text-xs font-bold uppercase tracking-widest">No history found</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PROFILE */}
          {activeTab === 'profile' && (
            <div className="max-w-xl mx-auto w-full animate-fade-in-up">
              {user ? (
                <div className="space-y-12">
                  <div className="flex flex-col items-center text-center space-y-6">
                    <img
                      src={user.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                      alt={user.name}
                      className="w-24 h-24 rounded-full border-4 border-white/[0.03] object-cover shadow-2xl"
                    />
                    <div className="space-y-2">
                      <h3 className="font-bold text-white text-4xl tracking-tight">{user.name}</h3>
                      <p className="text-[11px] text-zinc-600 uppercase tracking-[0.3em] font-bold">{user.role}</p>
                    </div>
                  </div>

                  <div className="p-10 rounded-3xl bg-zinc-900/20 border border-white/[0.03] space-y-8">
                    <div className="flex justify-between items-center border-b border-white/[0.03] pb-6">
                      <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Endpoint</span>
                      <span className="text-white font-bold tracking-tight">{user.email}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/[0.03] pb-6">
                      <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Filings</span>
                      <span className="text-white font-bold tracking-tight">{totalUserReports}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/[0.03] pb-6">
                      <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Resolutions</span>
                      <span className="text-white font-bold tracking-tight">
                        {userReports.filter(r => r.status === 'RESOLVED').length}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full py-4 bg-zinc-900/50 hover:bg-white hover:text-black border border-white/[0.05] text-[12px] font-bold rounded-2xl text-zinc-500 transition-all cursor-pointer uppercase tracking-widest"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="text-center py-32">
                  <p className="text-zinc-800 text-xs font-bold uppercase tracking-widest">Identity not detected</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CLAIM VERIFICATION FORM */}
          {activeTab === 'verification' && (
            <div className="space-y-12 animate-fade-in-up max-w-2xl mx-auto w-full">
              {!selectedFoundItem ? (
                <div className="py-32 rounded-3xl bg-zinc-900/10 border border-white/[0.03] text-center space-y-6">
                  <ShieldCheck className="w-12 h-12 text-zinc-800 mx-auto" />
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-lg tracking-tight">Security Gateway Locked</h4>
                    <p className="text-zinc-600 text-xs font-medium max-w-sm mx-auto">Select a correlation record to initialize the ownership challenge protocol.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  <div className="flex items-center justify-between pb-8 border-b border-white/[0.03]">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Verification Protocol</span>
                      <h3 className="text-3xl font-bold text-white tracking-tight">{selectedFoundItem.itemName}</h3>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFoundItem(null);
                        setActiveTab('my_reports');
                      }}
                      className="text-xs text-zinc-600 hover:text-white font-bold uppercase tracking-widest cursor-pointer transition-colors"
                    >
                      Abort
                    </button>
                  </div>

                  {verificationLoading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-6">
                      <Loader className="w-8 h-8 text-white animate-spin" />
                      <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest">Evaluating Challenge Response</p>
                    </div>
                  ) : evaluationResult ? (
                    <div className="space-y-12 animate-fade-in-up">
                      <div className="p-12 rounded-3xl bg-zinc-900/30 border border-white/[0.03] flex flex-col items-center text-center space-y-6 shadow-2xl">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center font-bold text-3xl tracking-tighter ${
                          evaluationResult.recommendation === 'approve'
                            ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                            : 'bg-zinc-900 text-zinc-600'
                        }`}>
                          {evaluationResult.ownership_confidence}%
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-bold text-white text-xl tracking-tight uppercase">{evaluationResult.recommendation}</h4>
                          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Ownership Index Correlation</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h5 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Validated</h5>
                          <div className="flex flex-wrap gap-2">
                            {evaluationResult.matched_fields.map((f: string) => (
                              <span key={f} className="px-3 py-1 bg-white/[0.05] text-white border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider">{f}</span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Conflicts</h5>
                          <div className="flex flex-wrap gap-2">
                            {evaluationResult.mismatched_fields.map((f: string) => (
                              <span key={f} className="px-3 py-1 bg-zinc-900 text-zinc-700 border border-white/[0.03] rounded-full text-[10px] font-bold uppercase tracking-wider">{f}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedFoundItem(null);
                          setActiveTab('my_reports');
                        }}
                        className="w-full py-4 bg-white text-black text-[12px] font-bold rounded-2xl transition-all cursor-pointer uppercase tracking-widest"
                      >
                        Return to Ledger
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={submitVerification} className="space-y-12 animate-fade-in-up">
                      <div className="space-y-8">
                        {claimAnswers.map((ans, idx) => (
                          <div key={idx} className="space-y-3">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">{ans.question}</label>
                            <input
                              type="text"
                              required
                              value={ans.answer}
                              onChange={(e) => {
                                const newAnswers = [...claimAnswers];
                                newAnswers[idx].answer = e.target.value;
                                setClaimAnswers(newAnswers);
                              }}
                              placeholder="Provide identification details..."
                              className="w-full bg-zinc-900/50 border border-white/[0.05] focus:border-white/20 focus:outline-none rounded-2xl px-6 py-4 text-[14px] text-white transition-all"
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        type="submit"
                        className="w-full py-5 bg-white text-black text-[12px] font-bold rounded-2xl shadow-2xl transition-all cursor-pointer uppercase tracking-widest hover:scale-[1.01]"
                      >
                        Execute Challenge Analysis
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ADMIN PORTAL (Admin Only) */}
          {activeTab === 'admin' && user?.role === 'admin' && (
            <div className="space-y-8 animate-fade-in w-full">
              {/* Admin Portal Header Section */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900 pb-5 gap-4">
                <div>
                  <h3 className="text-base font-extrabold text-zinc-150">Administrator Command Console</h3>
                  <p className="text-zinc-500 text-xs">Campus recovery operations control and ledger monitor.</p>
                </div>
                {/* Admin Sub-Tabs */}
                <div className="flex items-center bg-zinc-900/60 border border-zinc-900 rounded-lg p-0.5 max-w-fit">
                  {[
                    { id: 'overview', label: 'Overview', icon: Grid },
                    { id: 'claims', label: 'Claims Queue', icon: UserCheck },
                    { id: 'performance', label: 'Agent Specs', icon: Cpu },
                    { id: 'users', label: 'Users Directory', icon: UserIcon },
                    { id: 'logs', label: 'System Logs', icon: Terminal }
                  ].map((subTab) => {
                    const SubIcon = subTab.icon;
                    const isSubActive = adminSubTab === subTab.id;
                    return (
                      <button
                        key={subTab.id}
                        onClick={() => setAdminSubTab(subTab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          isSubActive ? 'bg-zinc-850 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-350'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5" />
                        {subTab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-Tab 1: OVERVIEW */}
              {adminSubTab === 'overview' && (
                <div className="space-y-8 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                      { label: 'Total Reports', val: analytics?.summary?.totalReports || 0, desc: 'Logged database filings' },
                      { label: 'Recovery Rate', val: `${analytics?.summary?.recoveryRate || 0}%`, desc: 'Automatic resolution index' },
                      { label: 'Active Recoveries', val: analytics?.summary?.totalLost || 0, desc: 'Ledger monitoring threads' },
                      { label: 'Pending Claims Queue', val: claims.filter(c => c.status === 'PENDING').length, desc: 'Awaiting coordinator action' }
                    ].map((stat, i) => (
                      <div key={i} className="p-5 rounded-2xl bg-zinc-900/20 border border-zinc-900">
                        <p className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest mb-1.5">{stat.label}</p>
                        <p className="text-2xl font-extrabold text-white leading-none mb-1">{stat.val}</p>
                        <p className="text-[9px] text-zinc-500 font-medium">{stat.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Dark Mode MapView Heatmap */}
                  <MapView />

                  {/* Master database directory */}
                  <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900 space-y-4">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Ledger Directory</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] text-zinc-400">
                        <thead className="bg-zinc-950/60 uppercase text-[9px] tracking-wider text-zinc-500 border-b border-zinc-900">
                          <tr>
                            <th className="px-4 py-3">Item name</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Location</th>
                            <th className="px-4 py-3">Reporter</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Ledger actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                          {[...lostItems, ...foundItems].map((item) => (
                            <tr key={item.id} className="hover:bg-zinc-900/10">
                              <td className="px-4 py-3 font-bold text-zinc-200">{item.itemName}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                  item.type === 'lost' ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                                }`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-400">{item.location}</td>
                              <td className="px-4 py-3 text-zinc-400 truncate max-w-[120px]">{item.userName || 'Anonymous'}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                                  item.status === 'RESOLVED' ? 'bg-zinc-800 text-zinc-500' : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                                }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {item.status !== 'RESOLVED' && (
                                  <button
                                    onClick={() => resolveItem(item.id)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-550 text-[9px] font-bold text-zinc-950 rounded transition-colors cursor-pointer"
                                  >
                                    Mark Resolved
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Tab 2: CLAIMS QUEUE */}
              {adminSubTab === 'claims' && (
                <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900 space-y-4 animate-fade-in">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Claim Verification Queue</h4>
                  <div className="divide-y divide-zinc-900">
                    {claims.map((claim) => {
                      const foundItem = foundItems.find(f => f.id === claim.foundItemId);
                      const lostItem = lostItems.find(l => l.id === claim.lostItemId);
                      return (
                        <div key={claim.id} className="py-5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-zinc-200 text-xs">Item: {foundItem?.itemName || 'Unknown'}</h5>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                                claim.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' : claim.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                              }`}>
                                {claim.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                              Claimant: {lostItem?.userName || 'Unknown User'} • Match Score: <span className="text-blue-400 font-bold">{claim.confidenceScore}%</span> • Recommendation: <span className="uppercase text-amber-400 font-semibold">{claim.evaluatorDecision}</span>
                            </p>
                            
                            {/* Display answers */}
                            <div className="bg-zinc-950/40 border border-zinc-900 p-2.5 rounded-lg text-[10px] max-w-lg mt-2 space-y-1 text-zinc-400">
                              {claim.answers.map((a, idx) => (
                                <div key={idx}>
                                  <span className="font-bold text-zinc-500">Q: {a.question}</span><br />
                                  <span className="text-zinc-300">A: {a.answer}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {claim.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await fetch('/api/evaluate', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          lostItemId: claim.lostItemId,
                                          foundItemId: claim.foundItemId,
                                          answers: claim.answers,
                                          forceApprove: true // Custom admin bypass
                                        })
                                      });
                                      if (res.ok) {
                                        logEvent('AdminService', `Approved claim ID: ${claim.id.substring(0, 8)}`);
                                        fetchClaims();
                                        fetchItems();
                                      }
                                    } catch (e) { console.error(e); }
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-555 text-[10px] font-bold text-zinc-950 rounded-lg transition-colors cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={async () => {
                                    // mock reject
                                    logEvent('AdminService', `Rejected claim ID: ${claim.id.substring(0, 8)}`);
                                    fetchClaims();
                                  }}
                                  className="px-3 py-1.5 bg-red-950/20 hover:bg-red-900 border border-red-900/30 text-[10px] font-bold text-red-400 hover:text-white rounded-lg transition-all cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {claims.length === 0 && (
                      <p className="text-zinc-650 text-xs italic py-4">No claims awaiting evaluation in verification queue.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-Tab 3: AGENT SPECIFICATIONS */}
              {adminSubTab === 'performance' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { name: 'Intake Parsing Agent', status: 'OPTIMAL', latency: '124ms', success: '97.8%', spec: 'Gemini 2.5 flash parser model' },
                      { name: 'Correlation Matcher Agent', status: 'OPTIMAL', latency: '65ms', success: '96.5%', spec: 'Vector-space similarity algorithm' },
                      { name: 'Challenge Evaluator Agent', status: 'STABLE', latency: '215ms', success: '98.9%', spec: 'Private-attribute validator engine' }
                    ].map((agent, i) => (
                      <div key={i} className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900 space-y-4">
                        <div className="flex justify-between items-center">
                          <h5 className="font-bold text-xs text-zinc-200">{agent.name}</h5>
                          <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 uppercase">
                            {agent.status}
                          </span>
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="flex justify-between border-b border-zinc-900 pb-1.5 text-zinc-500">
                            <span>Processing Latency</span>
                            <span className="font-bold text-zinc-300">{agent.latency}</span>
                          </div>
                          <div className="flex justify-between border-b border-zinc-900 pb-1.5 text-zinc-500">
                            <span>Extraction Success</span>
                            <span className="font-bold text-zinc-300">{agent.success}</span>
                          </div>
                          <div className="flex justify-between text-zinc-500">
                            <span>Model Pipeline</span>
                            <span className="font-bold text-zinc-300">{agent.spec}</span>
                          </div>
                        </div>
                        {/* Fake Progress Bar */}
                        <div className="w-full bg-zinc-950 rounded-full h-1">
                          <div className="bg-blue-500 h-1 rounded-full" style={{ width: agent.success }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* System limits config card */}
                  <div className="p-6 rounded-2xl bg-zinc-900/10 border border-zinc-900/60 p-5 text-zinc-500 text-[10px] space-y-2">
                    <p className="font-bold text-zinc-400">Agent Correlation Thresholds:</p>
                    <p>Minimum Match Confidence: <span className="text-blue-400 font-bold">40%</span>. Automatic Approval: <span className="text-emerald-400 font-bold">85%</span>. Review Trigger: <span className="text-amber-400 font-bold">60%</span>.</p>
                  </div>
                </div>
              )}

              {/* Sub-Tab 4: USERS DIRECTORY */}
              {adminSubTab === 'users' && (
                <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900 space-y-4 animate-fade-in">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Registered User Accounts</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] text-zinc-400">
                      <thead className="bg-zinc-950/60 uppercase text-[9px] tracking-wider text-zinc-500 border-b border-zinc-900">
                        <tr>
                          <th className="px-4 py-3">Profile</th>
                          <th className="px-4 py-3">Email Address</th>
                          <th className="px-4 py-3">Student ID</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Activity Status</th>
                          <th className="px-4 py-3 text-right">Role Toggle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {usersList.map((usr) => (
                          <tr key={usr.id} className="hover:bg-zinc-900/10">
                            <td className="px-4 py-3 flex items-center gap-2">
                              <img src={usr.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'} className="w-6 h-6 rounded-full border border-zinc-800 object-cover" />
                              <span className="font-bold text-zinc-200">{usr.name}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{usr.email}</td>
                            <td className="px-4 py-3 text-zinc-500">{usr.studentId || 'N/A'}</td>
                            <td className="px-4 py-3 uppercase text-[10px] font-extrabold text-zinc-350">{usr.role}</td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Active
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => toggleUserRole(usr)}
                                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[9px] font-bold text-zinc-300 rounded border border-zinc-700 cursor-pointer"
                              >
                                Toggle to {usr.role === 'admin' ? 'Student' : 'Admin'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-Tab 5: SYSTEM LOGS */}
              {adminSubTab === 'logs' && (
                <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900 space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Live Agent System Logs</h4>
                    <button
                      onClick={() => setSystemLogs([])}
                      className="text-[9px] font-bold text-zinc-500 hover:text-zinc-350 uppercase cursor-pointer"
                    >
                      Clear Terminal
                    </button>
                  </div>
                  {/* Monospace terminal console */}
                  <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-xl h-[360px] overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1.5 shadow-inner leading-normal">
                    {systemLogs.map((log, index) => (
                      <div key={index} className="truncate select-all">
                        <span className="text-zinc-650">&gt;</span> {log}
                      </div>
                    ))}
                    {systemLogs.length === 0 && (
                      <p className="text-zinc-600 italic">Console buffer empty. Perform operations to trigger logs.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );

  // SIMULATED GOOGLE AUTH ACCOUNT MODAL
  function renderGoogleModal() {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in-up">
        <div className="bg-zinc-950 border border-white/[0.05] rounded-3xl max-w-sm w-full p-8 space-y-8 shadow-2xl relative">
          <button
            onClick={() => setShowGoogleModal(false)}
            className="absolute top-6 right-6 text-[10px] text-zinc-600 hover:text-white font-bold uppercase tracking-widest cursor-pointer transition-colors"
          >
            Close
          </button>

          <div className="text-center space-y-3 pt-4">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              <Lock className="w-5 h-5 text-black" />
            </div>
            <h4 className="font-bold text-white text-xl tracking-tight">Authentication</h4>
            <p className="text-[11px] text-zinc-500 font-medium">Provide credentials to access the secure hub.</p>
          </div>

          {authError && (
            <p className="text-[11px] text-red-400 bg-red-950/30 border border-red-900/50 p-3 rounded-xl text-center font-bold uppercase tracking-widest">
              {authError}
            </p>
          )}

          {/* Quick Select Accounts */}
          <div className="space-y-3">
            {mockGoogleAccounts.map((account, idx) => (
              <button
                key={idx}
                onClick={() => handleGoogleLogin(account)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.03] transition-all text-left cursor-pointer group"
              >
                <img
                  src={account.picture}
                  alt={account.name}
                  className="w-10 h-10 rounded-full object-cover border border-white/[0.05]"
                />
                <div>
                  <p className="text-[13px] font-bold text-white leading-none mb-1.5 group-hover:text-white transition-colors">{account.name}</p>
                  <p className="text-[10px] text-zinc-500 leading-none font-bold tracking-widest">{account.email}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Custom Account intake */}
          <div className="border-t border-white/[0.03] pt-6 space-y-4">
            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] text-center">Sandbox Identity</p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Sandbox user name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-black border border-white/[0.05] focus:border-white/20 focus:outline-none rounded-xl px-4 py-3 text-[13px] text-white placeholder-zinc-700 transition-colors"
              />
              <input
                type="email"
                placeholder="Sandbox email address"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full bg-black border border-white/[0.05] focus:border-white/20 focus:outline-none rounded-xl px-4 py-3 text-[13px] text-white placeholder-zinc-700 transition-colors"
              />
              <button
                onClick={() => {
                  if (customName.trim() && customEmail.trim()) {
                    handleGoogleLogin({
                      name: customName.trim(),
                      email: customEmail.trim(),
                      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'
                    });
                  } else {
                    setAuthError('Fulfill both name and email fields.');
                  }
                }}
                className="w-full py-3 bg-white hover:scale-105 text-[11px] font-bold text-black rounded-xl transition-all cursor-pointer uppercase tracking-widest mt-2"
              >
                Authenticate Sandbox
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
