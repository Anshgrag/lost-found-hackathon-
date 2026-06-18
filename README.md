# Campus Lost and Found System

A production-grade hackathon prototype for intelligent campus recovery.

## 🚀 Features
- **Campus Recovery Assistant**: Conversational AI (Nvidia API) to guide users.
- **AI-Powered Intake**: Automatic extraction of item details (color, brand, location).
- **Intelligent Matching**: Weighted scoring algorithm (Name, Desc, Color, Brand, Location, Date).
- **Ownership Verification**: Private attribute-based security questions.
- **Fast Search (Trie)**: Advanced DSA (Trie) for prefix-based item lookup.
- **Analytics Dashboard**: Insights on hotspots and recovery trends.

## 🛠 Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Apple-style premium aesthetic)
- **AI**: Nvidia API (Llama 3.1 405B)
- **DSA**: Custom Trie Implementation, Optimized Arrays

## 📂 Project Structure
- `/lib/Trie.ts`: Custom Trie implementation for fast prefix search.
- `/lib/matching.ts`: Algorithmic matching agent logic.
- `/lib/store.ts`: Singleton in-memory storage for items.
- `/app/api/`: RESTful routes for AI agents and item management.
- `/components/Chat.tsx`: Premium chat interface.

## 🏗 Setup
1. Clone the repository.
2. Run `npm install`.
3. Set `NVIDIA_API_KEY` in `.env.local`.
4. Run `npm run dev`.

## 🧪 DSA Verification (Hackathon Requirement)
- **Arrays**: Used for linear storage of `LostItems` and `FoundItems`.
- **Trie**: Used to index all items by name. When a user starts typing "wa", the system can instantly suggest "wallet" or "watch" using the Trie's `search(prefix)` method, providing logarithmic search complexity relative to the number of items.
