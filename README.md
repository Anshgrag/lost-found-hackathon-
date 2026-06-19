<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini"/>
  <img src="https://img.shields.io/badge/NVIDIA_NIM-76B900?style=for-the-badge&logo=nvidia&logoColor=white" alt="NVIDIA"/>
  <img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest"/>
  <img src="https://img.shields.io/badge/Recharts-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Recharts"/>
</p>

# 🔍 Campus Recovery Agent — AI-Powered Lost & Found

> **Not your college notice board.** An autonomous, multi-agent AI system that replaces manual lost & found desks with a conversational recovery assistant, intelligent visual matching, and verifiable ownership claims.

---

## 🏆 Why This Is Different From Traditional Lost & Found

| Traditional System | Campus Recovery Agent |
|---|---|
| Physical register / Google Form | Conversational AI chatbot that extracts details empathetically |
| Manual keyword search | 7-dimension weighted scoring with synonym awareness |
| No image support | **Visual Verification Agent** — Gemini vision compares photos of items |
| "Contact admin if match found" | **Instant match surfacing** with contact details in-chat |
| Anyone can claim | **AI Ownership Verification** — generates private knowledge questions |
| No analytics | **Live heatmap dashboard** with hotspot tracking |
| Single point of failure | **Triple-brain fallback**: Gemini → NVIDIA → Deterministic offline engine |
| Exact keyword match only | **Levenshtein + Jaccard + Synonym groups** for fuzzy matching |
| Flat list browsing | **Trie-indexed prefix search** in O(k) time |

---

## 🧠 Architecture — The 5-Agent System

This system doesn't use a single AI call. It orchestrates **5 specialized agents**, each responsible for a distinct phase of the recovery lifecycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER (Chat Interface)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  INTAKE     │  Extracts item details from
                    │  AGENT      │  natural language + images
                    └──────┬──────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
     ┌────────▼───┐  ┌────▼─────┐  ┌───────▼──────┐
     │  VISUAL    │  │  MATCH   │  │  RECOVERY    │
     │  EXTRACT   │  │  ENGINE  │  │  ASSISTANT   │
     │  AGENT     │  │  (DSA)   │  │  (Empathy)   │
     └────────┬───┘  └────┬─────┘  └──────────────┘
              │           │
         ┌────▼───────────▼────┐
         │  VISUAL VERIFICATION │  Compares two item photos
         │  AGENT (Gemini Vision)│  using multimodal LLM
         └─────────────────────┘
                    │
         ┌──────────▼──────────┐
         │  OWNERSHIP VERIFIER │  Generates private-knowledge
         │  + CLAIM EVALUATOR  │  questions & scores answers
         └─────────────────────┘
```

### Agent Details

| # | Agent | File | Purpose | LLM Required? |
|---|-------|------|---------|---------------|
| 1 | **Intake Agent** | `lib/localIntake.ts` + `lib/orchestration.ts` | Extracts item name, category, color, brand, dents, location, date, user contact from natural language | No (deterministic) + Yes (enhanced) |
| 2 | **Visual Extraction Agent** | `lib/visualAgent.ts` → `runVisualExtraction()` | Analyzes uploaded photos to auto-detect item name, category, color, brand, distinctive marks | Yes (Gemini Vision) |
| 3 | **Match Engine** | `lib/matching.ts` | 7-dimension weighted scoring (name, desc, location, category, date, color, visual) with synonym groups + Levenshtein distance | No (pure algorithm) |
| 4 | **Visual Verification Agent** | `lib/visualAgent.ts` → `runVisualVerification()` | Compares two item images side-by-side to verify if they show the same physical object | Yes (Gemini Vision multimodal) |
| 5 | **Ownership Verifier + Evaluator** | `app/api/verify/` + `app/api/evaluate/` | Generates 3-5 private-knowledge questions; scores claimant answers and recommends approve/review/reject | Yes (LLM-backed) |

---

## 🔥 Feature Deep-Dive

### 1. Conversational AI Intake (Not a Form)

Instead of filling out a rigid form, users talk to the **Campus Recovery Assistant** — an empathetic, multi-turn chatbot that gradually collects details:

```
User: "I lost my black Samsung wallet near the library yesterday"

Agent: "I'm sorry to hear that! I've noted:
| Attribute | Detail |
| --- | --- |
| Item | Wallet |
| Color | Black |
| Brand | Samsung |
| Location | Library |
| Date | Yesterday |

To register your report, could you share your name and phone number?"
```

**Technical detail:** The system uses a **dual-extraction pipeline** — a deterministic `localExtract()` regex engine runs first (zero-latency, works offline), then an LLM-enhanced extraction refines the results. The report is only logged when `isReportComplete()` confirms: item name + type (lost/found) + one detail + full contact info.

### 2. Visual AI — Photo-to-Metadata & Photo-to-Photo Matching

#### 📸 Visual Extraction Agent
When a user uploads a photo, the **Visual Extraction Agent** (`runVisualExtraction`) sends the image to Gemini 2.5 Flash's multimodal API and auto-populates:
- `item_name` (e.g., "phone", "water bottle")
- `item_category` (Electronics, Accessories, etc.)
- `color` (primary color)
- `brand` (if visible — e.g., "Apple", "Nike")
- `distinctive_features` (e.g., "scratched screen", "sticker on back")

#### 🔍 Visual Verification Agent
When a match candidate has images on both sides, the **Visual Verification Agent** (`runVisualVerification`) sends BOTH images to Gemini Vision with context:

```
"Item A: Name: 'black wallet', Description: 'leather bifold'
 Item B: Name: 'dark wallet', Description: 'leather card holder'
 
 Do they show the same physical item?"
 → Returns: { match: true, score: 87, explanation: "Same leather bifold..." }
```

This score is injected back into the matching engine as a **20-point visual similarity layer** on top of text-based scoring.

### 3. Intelligent Matching Engine (Not Keyword Search)

The matching algorithm (`lib/matching.ts`) uses a **100-point weighted scoring system** across 7 dimensions:

| Dimension | Max Points | Algorithm |
|-----------|-----------|-----------|
| **Item Name** | 35 | Jaccard token similarity + Levenshtein + synonym normalization |
| **Description** | 25 | Same as above |
| **Location** | 15 | Fuzzy string matching |
| **Category** | 10 | Exact case-insensitive match |
| **Date Proximity** | 10 | Time delta (24h=10, 3d=7, 7d=4, 14d=2) |
| **Color** | 5 | Substring containment match |
| **Visual Similarity** | 20 | Gemini Vision score (when images available) |

**When images are present**, text weights are scaled by `0.8×` and visual gets `20pts` — making the total still 100.

#### Synonym Awareness
The engine normalizes synonyms before comparison:

```typescript
// "card holder" → "wallet", "airpods" → "earphones", "macbook" → "laptop"
const synonymGroups = [
  ['wallet', 'card holder', 'purse', 'clutch', 'billfold', 'pouch'],
  ['phone', 'mobile', 'iphone', 'android', 'smartphone', 'cellphone'],
  ['laptop', 'computer', 'macbook', 'notebook', 'chromebook'],
  // ... 12 synonym groups covering 60+ terms
];
```

A user searching for a "card holder" will match against a "wallet" report. A "macbook" will match a "laptop". Traditional systems can't do this.

#### Brand Mismatch Penalty
If both items specify different brands (e.g., "Redmi" vs "iPhone"), a **-30 point penalty** is applied — something traditional systems completely miss.

#### Confidence Tiers
- **≥ 70**: `HIGH` confidence — likely the same item
- **40–69**: `MEDIUM` confidence — possible match, needs review
- **< 40**: Filtered out (never shown to users)

### 4. Trie-Indexed Prefix Search

The `Trie` data structure (`lib/Trie.ts`) indexes every item name at insert time, enabling:

```
User types: "wa"  →  Instantly returns: ["wallet", "watch", "water bottle"]
User types: "ear" →  Instantly returns: ["earbuds", "earphones"]
```

**Complexity:** O(k) where k = prefix length, regardless of dataset size. Traditional systems use O(n) linear scan.

### 5. AI-Powered Ownership Verification

When someone wants to claim a found item, the system doesn't just hand it over. It runs a **two-phase verification pipeline**:

**Phase 1 — Question Generation** (`/api/verify`):
The **Verification Agent** analyzes the item's private attributes (hidden details, engravings, contents inside) and generates 3-5 questions that only the true owner could answer:
- *"Can you describe any specific markings or scratches on this laptop?"*
- *"What was the screensaver or wallpaper on this phone?"*
- *"Were there any specific contents inside this wallet?"*

**Phase 2 — Claim Evaluation** (`/api/evaluate`):
The **Evaluation Agent** compares the claimant's answers against the item's stored private attributes and returns:

```json
{
  "ownership_confidence": 92,
  "matched_fields": ["color", "brand", "hidden scratches"],
  "mismatched_fields": [],
  "recommendation": "approve"
}
```

| Score | Action |
|-------|--------|
| **90–100** | Auto-approve claim, mark both items RESOLVED |
| **70–89** | Flag for manual admin review |
| **< 70** | Auto-reject claim |

### 6. Triple-Brain Fallback Architecture

The system **never goes down**, even when AI APIs fail:

```
Attempt 1: Gemini 2.5 Flash API (primary, 8s timeout)
    ↓ fails
Attempt 2: NVIDIA NIM API (secondary, 8s timeout)
    ↓ fails
Attempt 3: Deterministic offline engine (instant, always works)
```

The offline engine (`localExtract`) uses **regex patterns, keyword lists, and structured field extraction** to parse user messages without any LLM. The matching engine is 100% deterministic — it never depends on an API call.

### 7. Live Spatial Heatmap

The `MapView` component renders an **interactive campus heatmap** showing:
- Institutional hotspots (Library, Canteen, Block-A/B/C, Gym, Sports Complex)
- Real-time incident density (pulsing nodes scale with report count)
- Live data feed polling every 3 seconds

This helps campus security identify **loss-prone zones** — something no traditional system provides.

### 8. Admin Control Center

A full admin dashboard with:
- **Overview tab**: Total lost/found/resolved counts, system health metrics
- **Items tab**: All items with status badges, contact info, resolution state
- **Claims tab**: Pending/approved/rejected claims with confidence scores
- **Users tab**: Registered user directory
- **Analytics tab**: Recovery rate trends, category breakdowns, location analysis (powered by Recharts)
- **System Logs tab**: Real-time agent activity logs showing every intake, match, and evaluation event

### 9. JWT Authentication

Custom HMAC-SHA256 JWT implementation (`lib/jwt.ts`) — no external auth libraries:
- Token signing with 7-day expiration
- Signature verification on every API call
- User context auto-populated into reports (no re-entering name/email)

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router) | Server-side API routes + React 19 client |
| **Language** | TypeScript (strict) | Type safety across all agents |
| **Primary AI** | Gemini 2.5 Flash | Multimodal (text + vision), fast, accurate |
| **Secondary AI** | NVIDIA NIM (MiniMax M3) | Fallback redundancy |
| **Styling** | Tailwind CSS 4 | Dark-mode premium UI |
| **Charts** | Recharts 3 | Analytics visualizations |
| **Markdown** | react-markdown + remark-gfm | Rich chat responses with tables |
| **Icons** | Lucide React | Consistent iconography |
| **IDs** | uuid v4 | Collision-free identifiers |
| **Testing** | Vitest + fast-check | Unit + property-based testing |
| **Persistence** | JSON file store (`lib/db.json`) | Zero-config, portable, hackathon-ready |

---

## 📂 Project Structure

```
campus-lost-found/
├── app/
│   ├── api/
│   │   ├── chat/           # Main conversational AI endpoint
│   │   │   ├── route.ts    # Multi-agent orchestration (intake → match → respond)
│   │   │   ├── sessions/   # Chat session CRUD
│   │   │   └── messages/   # Message history retrieval
│   │   ├── auth/           # JWT authentication (sign-in, register)
│   │   ├── items/          # Lost/found item listing API
│   │   ├── match/          # Direct matching endpoint
│   │   ├── upload/         # Image upload handler
│   │   ├── verify/         # Ownership verification question generator
│   │   ├── evaluate/       # Claim evaluation & auto-resolution
│   │   └── analytics/      # Campus analytics data
│   ├── page.tsx            # Full SPA (landing, assistant, admin dashboard)
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── lib/
│   ├── Trie.ts             # Trie data structure for prefix search
│   ├── matching.ts         # 7-dimension weighted scoring algorithm
│   ├── orchestration.ts    # Report parsing, completeness validation, match message builder
│   ├── localIntake.ts      # Offline deterministic NLP extraction engine
│   ├── visualAgent.ts      # Visual Extraction + Visual Verification agents
│   ├── llm.ts              # Gemini + NVIDIA API abstraction with fallback
│   ├── prompts.ts          # All agent system prompts
│   ├── store.ts            # Singleton data store with JSON persistence
│   ├── items.ts            # Item normalization utility
│   ├── jwt.ts              # Custom JWT sign/verify (HMAC-SHA256)
│   └── db.json             # Persistent data file
├── components/
│   └── MapView.tsx         # Interactive campus heatmap component
├── types/
│   └── index.ts            # All TypeScript interfaces (Item, User, Match, Claim, etc.)
├── tests/
│   ├── matching.test.ts    # Matching algorithm test suite
│   ├── orchestration.test.ts # Report parsing & completeness tests
│   ├── chatRoute.test.ts   # Chat API integration tests
│   ├── store.test.ts       # Data store tests
│   ├── auth.test.ts        # JWT authentication tests
│   └── ...                 # 11 test files total
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9

### Installation

```bash
# Clone the repository
git clone https://github.com/Anshgrag/lost-found-hackathon-.git
cd lost-found-hackathon-

# Install dependencies
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Primary AI (Gemini) — optional, has built-in fallback key
GEMINI_API_KEY=your_gemini_api_key

# Secondary AI (NVIDIA NIM) — optional fallback
NVIDIA_API_KEY=your_nvidia_api_key

# JWT Secret — optional, has default
JWT_SECRET=your_secret_key
```

> **Note:** The system works out of the box without any API keys. It falls back to the deterministic offline engine for parsing and matching.

### Run

```bash
# Development server
npm run dev

# Run tests
npm test

# Run tests once (CI mode)
npm run test:run

# Production build
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## 🧪 Testing

The project includes **11 test files** covering:

| Test File | What It Tests |
|-----------|--------------|
| `matching.test.ts` | Synonym matching, Levenshtein scoring, brand penalty, confidence tiers |
| `orchestration.test.ts` | Report parsing, JSON extraction from markdown fences, completeness validation |
| `chatRoute.test.ts` | Full chat API integration with report logging and matching |
| `store.test.ts` | Data store CRUD, Trie indexing, item resolution |
| `auth.test.ts` | JWT sign/verify, token expiry |
| `authRoute.test.ts` | Authentication API endpoint tests |
| `verifyEvaluate.test.ts` | Ownership verification and claim evaluation flow |
| `upload.test.ts` | Image upload handling |
| `items.test.ts` | Item normalization and defaults |

Run all tests:
```bash
npm test
```

---

## 📊 DSA & Algorithmic Highlights

| Data Structure / Algorithm | Location | Usage |
|---------------------------|----------|-------|
| **Trie** | `lib/Trie.ts` | O(k) prefix-based item search, auto-suggestions |
| **Levenshtein Distance** | `lib/matching.ts` | Edit-distance fuzzy matching for typo tolerance |
| **Jaccard Similarity** | `lib/matching.ts` | Token-set overlap scoring for description matching |
| **Synonym Normalization** | `lib/matching.ts` | 12 synonym groups (60+ terms) mapped to canonical forms |
| **Weighted Multi-Dimension Scoring** | `lib/matching.ts` | 100-point composite score across 7 dimensions |
| **Deterministic Hash-Based Image Similarity** | `lib/matching.ts` | Fallback visual scoring when Gemini Vision is unavailable |
| **Arrays + Linear Scan** | `lib/store.ts` | In-memory lost/found item storage with O(n) matching |
| **JSON Persistence** | `lib/store.ts` | Async file-based data persistence (survives restarts) |

---

## 🔐 Security Features

- **JWT tokens** with HMAC-SHA256 signature verification and 7-day expiry
- **Private attributes** stored server-side, never exposed in public item listings
- **Ownership verification** requires answering AI-generated private-knowledge questions
- **Brand mismatch penalties** prevent false positive matches
- **Input sanitization** on all Markdown table outputs (pipe/newline escaping)
- **Expected answer isolation** — `getExpectedAnswer()` is server-only, never exposed via API

---

## 👥 Team

Built for a hackathon to demonstrate that lost & found systems can be **intelligent, empathetic, and autonomous** — not just a spreadsheet with "contact admin."

---

<p align="center">
  <sub>Built with 🧠 multi-agent AI, not just CRUD.</sub>
</p>
