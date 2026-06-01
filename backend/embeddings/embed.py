import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

from pinecone import Pinecone, ServerlessSpec

load_dotenv(Path(".env"))


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
PINECONE_CLOUD = env_value("PINECONE_CLOUD", "aws")
PINECONE_REGION = env_value("PINECONE_REGION", "us-east-1")
PINECONE_METRIC = env_value("PINECONE_METRIC", "cosine")
BATCH_SIZE = int(env_value("PINECONE_UPSERT_BATCH_SIZE", "100"))


def get_pinecone_index(dimension):
    api_key = env_value("PINECONE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "PINECONE_API_KEY is not set. Add it to your project-root .env file."
        )

    pc = Pinecone(api_key=api_key)
    if PINECONE_INDEX_NAME not in pc.list_indexes().names():
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=dimension,
            metric=PINECONE_METRIC,
            spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION),
        )

    return pc.Index(PINECONE_INDEX_NAME)


def chunks(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def embed_text(text, task_type):
    api_key = env_value("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your project-root .env file."
        )

    response = requests.post(
        f"{GEMINI_API_BASE_URL}/models/{EMBEDDING_MODEL}:embedContent",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        json={
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
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


def main():
    with open("data/processed/documents.json", "r", encoding="utf-8") as f:
        documents = json.load(f)

    texts = [doc["text"] for doc in documents]
    print(f"Loaded {len(texts)} documents")

    index = get_pinecone_index(EMBEDDING_DIMENSIONS)

    vectors = []
    for idx, document in enumerate(documents):
        embedding = embed_text(document["text"], task_type="RETRIEVAL_DOCUMENT")
        document_id = str(document.get("id", idx))
        metadata = {
            "document_id": document_id,
            "text": document["text"],
            "metadata_json": json.dumps(document.get("metadata", {})),
        }
        vectors.append({
            "id": document_id,
            "values": embedding,
            "metadata": metadata,
        })
        if (idx + 1) % 25 == 0:
            print(f"Embedded {idx + 1}/{len(documents)} documents")

    for batch in chunks(vectors, BATCH_SIZE):
        index.upsert(vectors=batch, namespace=PINECONE_NAMESPACE)

    print(f"Uploaded {len(vectors)} embeddings to Pinecone index '{PINECONE_INDEX_NAME}'")


if __name__ == "__main__":
    main()
