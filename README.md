
# derma-the-skincare-assistant

# Skincare Assistant

A conversational AI chatbot that helps users find skincare products and get skincare advice. It combines vector-based document retrieval, multi-turn conversation memory, and Google's Gemini API to provide context-aware responses.

## Overview

The assistant leverages a curated dataset of skincare products and information, enabling intelligent product recommendations based on user queries. It maintains conversation context across multiple turns, allowing users to ask follow-up questions with implicit references to previous messages (e.g., "under 10 pounds" after asking for moisturisers).

**Example conversation flow:**
1. User: "Suggest products for hyperpigmentation"
2. User: "What about moisturisers?" → Stays in skincare/hyperpigmentation context
3. User: "Now show cheaper options" → Remembers previous queries and applies budget filter

## Features

- **React Chat UI** - Clean, responsive chat interface with message history
- **FastAPI Backend** - High-performance Python backend serving both API and frontend
- **Vector Search** - Semantic search using sentence-transformers embeddings
- **Multi-turn Memory** - Persistent per-session conversation history with automatic context inclusion
- **Gemini Integration** - Powered by Google's Gemini API for conversational responses
- **Intelligent Routing** - Detects follow-up questions and maintains context automatically
- **Session Management** - Browser-based session IDs stored in localStorage
- **Reset Functionality** - Clear conversation memory with a single click

## Architecture

### Core Components

**Backend (Python + FastAPI)**
- `main.py` - REST API server and static file serving
- `chat/chatbot.py` - Chat logic, memory management, and Gemini integration
- `retrieval/search.py` - Vector similarity search using embeddings
- `embeddings/embed.py` - Script to generate embeddings from documents

**Frontend (React + Vite)**
- `src/main.jsx` - React chat component with state management
- `src/styles.css` - UI styling
- Built to `dist/` and served by FastAPI

**Data Pipeline**
- `data/raw/` - Source CSV files with skincare product data
- `data/processed/documents.json` - Processed documents ready for embedding
- `data/embeddings/embeddings.npy` - Precomputed embeddings for fast search
- `data/cache/huggingface/` - Cached transformer models

### How It Works

1. **User sends a message** → Frontend sends to `/api/chat` with session ID
2. **Backend retrieves context** → Loads conversation history from session memory
3. **Search for relevant docs** → Encodes query and finds top-5 similar documents using cosine similarity
4. **Generate response** → Sends documents + conversation history + user query to Gemini API
5. **Store conversation** → Saves user message and assistant response to session memory
6. **Return response** → Streams response back to frontend for display

### Session Memory

Each browser session gets a unique UUID stored in localStorage. The backend maintains per-session conversation history in memory, which includes:
- All user messages in the current session
- All assistant responses in the current session
- Automatic inclusion of conversation history in every prompt (not just follow-ups)
- Configurable history limit via `CHAT_MEMORY_TURNS` environment variable

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 16+ and npm
- A free [Google AI Studio](https://aistudio.google.com) account and Gemini API key

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then edit `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_api_key_here
```

### 2. Install Dependencies

```bash
# Python dependencies
python -m pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
npm run build
cd ..
```

### 3. Run the Application

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open your browser and navigate to:
```
http://127.0.0.1:8000
```

The React UI will load in your browser. You can now chat with the skincare assistant!

## API Reference

### Chat Endpoint

Send a message and get a response based on conversation history and retrieved documents.

```http
POST /api/chat
Content-Type: application/json

{
  "message": "Suggest products for hyperpigmentation",
  "session_id": "uuid-or-custom-id"
}
```

**Response:**
```json
{
  "answer": "I'd recommend products with vitamin C or niacinamide...",
  "session_id": "uuid-or-custom-id"
}
```

**Parameters:**
- `message` (required, string) - User's question or statement
- `session_id` (optional, string) - Unique session identifier (defaults to "default")

---

### Reset Endpoint

Clear conversation history for a session.

```http
POST /api/reset
Content-Type: application/json

{
  "session_id": "uuid-or-custom-id"
}
```

**Response:**
```json
{
  "status": "cleared",
  "session_id": "uuid-or-custom-id"
}
```

---

### Health Check

Verify the API is running.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok"
}
```

## Recent Updates

### Conversation Memory Fix
The chatbot now includes conversation history in **every message**, not just follow-up questions. This ensures:
- Full context is maintained across all messages in a session
- Follow-up questions automatically reference previous messages
- Users don't need to repeat context

**Change made:** Updated `generate_response()` in `backend/chat/chatbot.py` to always include `_format_history(memory)` in the prompt instead of conditionally based on `_is_follow_up()`.

## Development & Contributions

### Project Structure

```
skincare-assistant/
├── backend/
│   ├── main.py                    # FastAPI app + routing
│   ├── chat/
│   │   └── chatbot.py             # Core chat logic + memory
│   ├── retrieval/
│   │   └── search.py              # Vector search
│   └── embeddings/
│       └── embed.py               # Embedding generation
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # React app
│   │   └── styles.css             # Styling
│   └── dist/                      # Built output
├── data/
│   ├── raw/                       # Source CSV files
│   ├── processed/
│   │   └── documents.json
│   ├── embeddings/
│   │   └── embeddings.npy
│   └── cache/                     # Model cache
├── scripts/
│   └── build_documents.py         # Data processing
├── requirements.txt               # Python dependencies
└── .env.example                   # Configuration template
```

### Running in Development

For local development with hot-reload:

**Backend** (in one terminal):
```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (in another terminal):
```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` with hot-module reloading enabled.

## License

This project is open source. See LICENSE file for details.

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review [Google AI Studio](https://aistudio.google.com) for API-related issues
3. Check backend logs for detailed error messages

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional - Gemini settings
GEMINI_MODEL=gemini-2.5-flash                              # Primary model to use
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite                # Fallback if primary is overloaded
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Optional - Embedding model
EMBEDDING_MODEL=all-MiniLM-L6-v2                           # Sentence transformer model

# Optional - Chat behavior
CHAT_MEMORY_TURNS=6                                        # Number of conversation turns to keep in memory
```

### Key Configuration Details

- **CHAT_MEMORY_TURNS**: Controls how many message pairs to retain. Higher values = longer memory but more API tokens used.
- **EMBEDDING_MODEL**: Change this to use different sentence-transformer models for search. Must match the embeddings in `data/embeddings/embeddings.npy`.
- **GEMINI_FALLBACK_MODEL**: Automatically used if primary model is unavailable or quota-limited.

## Data & Embeddings

### Processing the Dataset

If you modify the source data in `data/raw/`, rebuild the processed documents and embeddings:

```bash
# Rebuild documents from raw CSV files
python scripts/build_documents.py

# Generate new embeddings
python backend/embeddings/embed.py
```

**What these scripts do:**
- `build_documents.py` - Converts raw CSV files into structured documents (`data/processed/documents.json`)
- `embed.py` - Generates vector embeddings for each document using the configured embedding model

### Document Format

Each document in `documents.json` has:
```json
{
  "id": "unique-id",
  "text": "Product information and details...",
  "metadata": {
    "product_name": "...",
    "category": "...",
    "price": "..."
  }
}
```

### Embeddings Cache

The first run of `embed.py` downloads the embedding model from Hugging Face and caches it in `data/cache/huggingface/`. Subsequent runs use the cached model for faster processing.

## Troubleshooting

### "API returned empty response"
- The Gemini model returned no content. Check your API quota in [Google AI Studio](https://aistudio.google.com)
- Try again in a few moments; there may be temporary service issues

### Chat responses fail but API is running
- Verify `GEMINI_API_KEY` is set correctly in `.env`
- Check that your API key has access to the `GEMINI_MODEL` you specified
- Ensure you're not exceeding your Gemini API quota

### "Could not load embedding model"
- Run `python backend/embeddings/embed.py` to download and cache the model
- Ensure you have internet connectivity on first run
- Check that `EMBEDDING_MODEL` matches an available sentence-transformers model

### Frontend loads but chat doesn't work
- Check browser console for errors (F12 → Console tab)
- Verify the FastAPI backend is running on `http://127.0.0.1:8000`
- Ensure CORS is configured correctly (already set in `main.py` for localhost)

### First chat response is very slow
- Expected behavior! The Gemini model warms up on first request. Subsequent responses are faster.
- If it takes longer than 30 seconds, check your internet connection and API quota

### Memory not working
- Verify the browser has localStorage enabled
- Check that `session_id` is being sent in API requests
- Ensure conversation history is being logged to the API (check backend logs)
- Try clearing browser storage and reloading the page
>>>>>>> 5044c03 (initial commit)
