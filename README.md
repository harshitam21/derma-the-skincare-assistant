# Derma: The Skincare Assistant

A conversational skincare assistant that recommends products from a curated dataset. It uses a React chat UI, a FastAPI backend, Pinecone vector search, and Google's Gemini API for both retrieval embeddings and natural-language answers.

Production app: https://derma-the-skincare-assistant.vercel.app

<img width="1106" height="842" alt="Skincare Assistant chat UI" src="https://github.com/user-attachments/assets/247c70f4-8747-4ace-ae90-cb3329fe3fc6" />

## Overview

The assistant uses a curated skincare product dataset to answer product discovery questions. It keeps conversation context across turns, so follow-up prompts such as "under 10 pounds" or "show cheaper options" stay connected to the previous skincare request.

## Features

- React + Vite chat interface with local chat history
- FastAPI API served through Vercel serverless functions
- Pinecone-backed semantic product retrieval
- Gemini embeddings for query and document vectors
- Gemini chat responses with retrieved product context
- Per-session conversation memory for follow-up questions
- Reset endpoint to clear server-side chat memory

## Architecture

```text
skincare-assistant/
|-- api/
|   `-- index.py                  # Vercel Python entrypoint
|-- backend/
|   |-- main.py                   # FastAPI routes
|   |-- chat/
|   |   `-- chatbot.py            # Gemini response + conversation memory
|   |-- retrieval/
|   |   `-- search.py             # Gemini query embeddings + Pinecone search
|   `-- embeddings/
|       `-- embed.py              # Upload document embeddings to Pinecone
|-- frontend/
|   `-- src/                      # React app
|-- data/
|   |-- raw/                      # Source CSV files
|   `-- processed/                # documents.json for embedding
|-- scripts/
|   `-- build_documents.py
|-- requirements.txt              # Production Python dependencies
|-- requirements-dev.txt          # Local data/test tooling
`-- vercel.json                   # Vercel build and routing config
```

## How It Works

1. The frontend posts a message to `/api/chat`.
2. The backend builds a retrieval query, including recent conversation context when needed.
3. `backend/retrieval/search.py` embeds the query with Gemini and searches Pinecone.
4. Retrieved documents plus chat history are sent to Gemini for the final answer.
5. The frontend stores conversations in `localStorage`; the backend keeps short in-memory session history.

## Requirements

- Python 3.12+
- Node.js and npm
- Google AI Studio API key
- Pinecone API key

## Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Required:

```env
GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key
```

Common optional values:

```env
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=384
CHAT_MEMORY_TURNS=6

PINECONE_INDEX_NAME=derma-skincare
PINECONE_NAMESPACE=
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
PINECONE_METRIC=cosine
PINECONE_UPSERT_BATCH_SIZE=100
```

The Pinecone index dimension must match `GEMINI_EMBEDDING_DIMENSIONS`.

## Local Setup

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

Install frontend dependencies and build:

```bash
cd frontend
npm install
npm run build
cd ..
```

Run the FastAPI app:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

## Development

For local frontend hot reload, run the backend and frontend separately.

Backend:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

The Vite app calls `http://localhost:8000` during local development and same-origin `/api` routes in production.

## Data And Embeddings

If raw data changes, rebuild the processed documents:

```bash
python -m pip install -r requirements-dev.txt
python scripts/build_documents.py
```

Upload fresh document embeddings to Pinecone:

```bash
python backend/embeddings/embed.py
```

Run `embed.py` again whenever you change:

- `data/processed/documents.json`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSIONS`
- Pinecone index settings

Large generated files such as local embedding arrays and model caches are ignored and should not be committed.

## API

### `GET /health`

Returns:

```json
{"status": "ok"}
```

### `POST /api/chat`

Request:

```json
{
  "message": "Suggest products for oily skin",
  "session_id": "browser-session-id"
}
```

Response:

```json
{
  "answer": "Here are some options...",
  "session_id": "browser-session-id"
}
```

### `POST /api/reset`

Request:

```json
{
  "session_id": "browser-session-id"
}
```

Response:

```json
{
  "status": "cleared",
  "session_id": "browser-session-id"
}
```

## Vercel Deployment

The project is configured for Vercel with:

- `api/index.py` as the Python serverless entrypoint
- `vercel.json` routing `/api/*` and `/health` to FastAPI
- `frontend/dist` as the static output directory
- `.vercelignore` excluding local caches, logs, and build artifacts

Set the same required environment variables in Vercel Project Settings before deploying.

Deploy:

```bash
npx vercel --prod
```

## Troubleshooting

### Frontend says "Failed to fetch"

- In production, make sure the deployed frontend is calling same-origin `/api/chat`.
- In local development, make sure FastAPI is running on `http://127.0.0.1:8000`.

### `GEMINI_API_KEY is not set`

- Add `GEMINI_API_KEY` locally in `.env`.
- Add it to Vercel environment variables and redeploy.

### Embedding request fails

- Verify `GEMINI_EMBEDDING_MODEL` is available for your API key.
- The current default is `gemini-embedding-001`.

### Pinecone returns poor matches

- Re-run `python backend/embeddings/embed.py` so stored document vectors match the current Gemini embedding model and dimensions.

### Vercel bundle exceeds Lambda storage

- Keep production dependencies in `requirements.txt` small.
- Put local-only tooling in `requirements-dev.txt`.
- Do not commit `data/cache/`, `data/embeddings/`, `frontend/node_modules/`, or `frontend/dist/`.
