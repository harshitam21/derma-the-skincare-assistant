import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

from pinecone import Pinecone

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def env_value(name, default=None):
    value = os.getenv(name, default)
    if isinstance(value, str):
        return value.lstrip("\ufeff").strip()
    return value


GEMINI_API_BASE_URL = env_value(
    "GEMINI_API_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta",
).rstrip("/")
EMBEDDING_MODEL = env_value("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMENSIONS = int(env_value("GEMINI_EMBEDDING_DIMENSIONS", "384"))
PINECONE_INDEX_NAME = env_value("PINECONE_INDEX_NAME", "derma-skincare")
PINECONE_NAMESPACE = env_value("PINECONE_NAMESPACE", "")
if PINECONE_NAMESPACE == "__default__":
    PINECONE_NAMESPACE = ""


def embed_text(text):
    api_key = env_value("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your project-root .env file "
            "and to your Vercel project environment variables."
        )

    response = requests.post(
        f"{GEMINI_API_BASE_URL}/models/{EMBEDDING_MODEL}:embedContent",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        json={
            "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_QUERY",
            "outputDimensionality": EMBEDDING_DIMENSIONS,
        },
        timeout=60,
    )

    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        raise RuntimeError(f"Gemini embedding request failed: {response.text}") from exc

    values = response.json().get("embedding", {}).get("values")
    if not values:
        raise RuntimeError("Gemini returned an empty embedding.")
    return values


def get_pinecone_index():
    api_key = env_value("PINECONE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "PINECONE_API_KEY is not set. Add it to your project-root .env file."
        )

    return Pinecone(api_key=api_key).Index(PINECONE_INDEX_NAME)


def search(query, top_k=5):
    query_embedding = embed_text(query)
    response = get_pinecone_index().query(
        vector=query_embedding,
        top_k=top_k,
        namespace=PINECONE_NAMESPACE,
        include_metadata=True,
    )

    results = []
    for match in response.matches:
        metadata = match.metadata or {}
        try:
            document_metadata = json.loads(metadata.get("metadata_json", "{}"))
        except json.JSONDecodeError:
            document_metadata = {}
        document = {
            "id": metadata.get("document_id", match.id),
            "text": metadata.get("text", ""),
            "metadata": document_metadata,
        }
        results.append({
            "score": float(match.score or 0.0),
            "document": document,
        })

    return results


if __name__ == "__main__":

    query = input("Enter query: ")

    results = search(query)

    for i, result in enumerate(results):

        print(f"\nResult {i+1}")
        print(f"Score: {result['score']:.4f}")
        print(result["document"]["text"])
