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
- Firebase project with Email/Password Authentication and Firestore enabled

## Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Required:

```env
GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=derma-3e199.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=derma-3e199
VITE_FIREBASE_STORAGE_BUCKET=derma-3e199.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=36719323160
VITE_FIREBASE_APP_ID=1:36719323160:web:ebc7aee1ab104b9e01fb6d
VITE_FIREBASE_MEASUREMENT_ID=G-PYTN35TF2H
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

## Firebase Login

The frontend uses Firebase Authentication for email/password login. On signup or login, the app writes a user document to Firestore:

```text
users/{uid}
```

Stored fields include:

- `uid`
- `email`
- `displayName`
- `createdAt` for new accounts
- `lastLoginAt` on every login

Firebase setup:

1. Create a Firebase project.
2. Add a Web app and copy its config values into the `VITE_FIREBASE_*` environment variables. The current Firebase project ID is `derma-3e199`.
3. Enable Authentication -> Sign-in method -> Email/Password.
4. Enable Firestore Database.
5. Add the same `VITE_FIREBASE_*` values to Vercel and redeploy.

In production, Firebase's `/__/auth/*` helper endpoints are reverse-proxied through the app domain by `vercel.json`. The frontend therefore uses the current production host as `authDomain`; local development continues to use `VITE_FIREBASE_AUTH_DOMAIN`. Add every production and preview hostname to Firebase Authentication -> Settings -> Authorized domains. For OAuth providers, also authorize:

```text
https://<app-domain>/__/auth/handler
```

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
powershell -ExecutionPolicy Bypass -File scripts/dev_backend.ps1
```

Open:

```text
http://127.0.0.1:8001
```

## Development

For local frontend hot reload, run the backend and frontend separately.

Backend:

```bash
powershell -ExecutionPolicy Bypass -File scripts/dev_backend.ps1
```

Frontend:

```bash
cd frontend
npm run dev
```

Open the local frontend at:

```text
http://localhost:5173
```

The Vite app calls same-origin `/api` routes. During local development, Vite proxies `/api` to `http://127.0.0.1:8001`; in production, Vercel routes `/api` to the FastAPI serverless entrypoint.

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
- In local development, make sure FastAPI is running on `http://127.0.0.1:8001`.

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
