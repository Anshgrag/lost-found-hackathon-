import { Item, User, ChatSession, Message, Match, Claim, VerificationQuestions, AnalyticsData, AgentLog } from '../types';
import { Trie } from './Trie';
import fs from 'fs';
import path from 'path';

class Store {
  private lostItems: Item[] = [];
  private foundItems: Item[] = [];
  private users: User[] = [];
  private chatSessions: ChatSession[] = [];
  private messages: Message[] = [];
  private matches: Match[] = [];
  private claims: Claim[] = [];
  private verificationQuestions: VerificationQuestions[] = [];
  private analytics: AnalyticsData[] = [];
  private agentLogs: AgentLog[] = [];

  private trie: Trie = new Trie();
  private dbPath: string = '';

  constructor() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      this.dbPath = path.join(process.cwd(), 'lib', 'db.json');
      this.loadData();
    }
  }

  public loadData() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const data = JSON.parse(raw);
        this.lostItems = data.lostItems || [];
        this.foundItems = data.foundItems || [];
        this.users = data.users || [];
        this.chatSessions = data.chatSessions || [];
        this.messages = data.messages || [];
        this.matches = data.matches || [];
        this.claims = data.claims || [];
        this.verificationQuestions = data.verificationQuestions || [];
        this.analytics = data.analytics || [];
        this.agentLogs = data.agentLogs || [];

        // Populate trie
        this.trie = new Trie();
        for (const item of this.lostItems) {
          if (item.itemName && item.id) {
            this.trie.insert(item.itemName, item.id);
          }
        }
        for (const item of this.foundItems) {
          if (item.itemName && item.id) {
            this.trie.insert(item.itemName, item.id);
          }
        }
      } else {
        this.saveData();
      }
    } catch (err) {
      console.error('Failed to load database from file:', err);
    }
  }

  private saveData() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST || !this.dbPath) {
      return;
    }
    try {
      const data = {
        users: this.users,
        chatSessions: this.chatSessions,
        messages: this.messages,
        lostItems: this.lostItems,
        foundItems: this.foundItems,
        matches: this.matches,
        claims: this.claims,
        verificationQuestions: this.verificationQuestions,
        analytics: this.analytics,
        agentLogs: this.agentLogs,
      };
      fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) {
          console.error('Failed to save database asynchronously:', err);
        }
      });
    } catch (err) {
      console.error('Failed to save database:', err);
    }
  }

  // --- Users ---
  addUser(user: User) {
    this.users.push(user);
    this.saveData();
  }
  getUsers() {
    return this.users;
  }
  getUserById(id: string) {
    return this.users.find(u => u.id === id);
  }
  getUserByEmail(email: string) {
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  // --- Chat Sessions ---
  addChatSession(session: ChatSession) {
    this.chatSessions.push(session);
    this.saveData();
  }
  getChatSessions() {
    return this.chatSessions;
  }
  getChatSessionsByUserId(userId: string) {
    return this.chatSessions.filter(s => s.userId === userId);
  }
  getChatSessionById(id: string) {
    return this.chatSessions.find(s => s.id === id);
  }
  updateChatSessionImageUrl(id: string, imageUrl: string) {
    const session = this.chatSessions.find(s => s.id === id);
    if (session) {
      session.imageUrl = imageUrl;
      this.saveData();
    }
  }

  // --- Messages ---
  addMessage(msg: Message) {
    this.messages.push(msg);
    this.saveData();
  }
  getMessages() {
    return this.messages;
  }
  getMessagesBySessionId(sessionId: string) {
    return this.messages.filter(m => m.sessionId === sessionId);
  }

  // --- Lost Items ---
  addLostItem(item: Item) {
    this.lostItems.push(item);
    this.trie.insert(item.itemName, item.id);
    this.saveData();
  }
  getLostItems() {
    return this.lostItems;
  }

  // --- Found Items ---
  addFoundItem(item: Item) {
    this.foundItems.push(item);
    this.trie.insert(item.itemName, item.id);
    this.saveData();
  }
  getFoundItems() {
    return this.foundItems;
  }

  // --- Matches ---
  addMatch(match: Match) {
    this.matches.push(match);
    this.saveData();
  }
  getMatches() {
    return this.matches;
  }

  // --- Claims ---
  addClaim(claim: Claim) {
    this.claims.push(claim);
    this.saveData();
  }
  getClaims() {
    return this.claims;
  }
  getClaimById(id: string) {
    return this.claims.find(c => c.id === id);
  }
  updateClaimStatus(id: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', evaluatorDecision?: string) {
    const claim = this.claims.find(c => c.id === id);
    if (!claim) return false;
    claim.status = status;
    if (evaluatorDecision) {
      claim.evaluatorDecision = evaluatorDecision as any;
    }
    this.saveData();
    return true;
  }

  // --- Verification Questions ---
  addVerificationQuestions(vq: VerificationQuestions) {
    this.verificationQuestions.push(vq);
    this.saveData();
  }
  getVerificationQuestionsByFoundItemId(itemId: string) {
    return this.verificationQuestions.find(vq => vq.foundItemId === itemId);
  }

  // --- Analytics ---
  addAnalyticsData(data: AnalyticsData) {
    this.analytics.push(data);
    this.saveData();
  }
  getAnalytics() {
    return this.analytics;
  }

  // --- Agent Logs ---
  addAgentLog(log: AgentLog) {
    this.agentLogs.push(log);
    this.saveData();
  }
  getAgentLogs() {
    return this.agentLogs;
  }

  searchItems(prefix: string): Item[] {
    const ids = this.trie.search(prefix);
    const allItems = [...this.lostItems, ...this.foundItems];
    return allItems.filter(item => ids.includes(item.id));
  }

  /**
   * Find an item by id across both the lost and found collections.
   * Returns `undefined` when no item matches.
   */
  findItemById(id: string): Item | undefined {
    return (
      this.lostItems.find(item => item.id === id) ||
      this.foundItems.find(item => item.id === id)
    );
  }

  /**
   * Mark the matching item's status as 'RESOLVED'.
   * Returns true if an item was found and updated, false otherwise.
   */
  markResolved(id: string): boolean {
    const item = this.findItemById(id);
    if (!item) return false;
    item.status = 'RESOLVED';
    this.saveData();
    return true;
  }

  /**
   * Server-only: read the private expected answer for an item.
   * Returns the `privateAttributes.expectedAnswer` value, or null when the item
   * is missing or has no expected answer. This MUST NEVER be exposed through any
   * public listing or aggregate route.
   */
  getExpectedAnswer(id: string): string | null {
    const item = this.findItemById(id);
    const expected = item?.privateAttributes?.expectedAnswer;
    return typeof expected === 'string' ? expected : null;
  }
}

// With local db.json persistence, we no longer need to cache the store instance in global.store.
// Creating a fresh instance on hot-reload guarantees class definition updates are picked up.
const globalStore = new Store();

export default globalStore;

