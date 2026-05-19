import json
import os
import numpy as np
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity

# Keep transformers on the PyTorch path. TensorFlow is not needed here and can
# fail to import when its protobuf dependency is mismatched.
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("HF_HOME", str(Path("data/cache/huggingface").resolve()))
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "60")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")

from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
CACHE_FOLDER = str(Path("data/cache/huggingface").resolve())


def load_embedding_model():
    try:
        return SentenceTransformer(MODEL_NAME, cache_folder=CACHE_FOLDER)
    except Exception as exc:
        raise RuntimeError(
            f"Could not load embedding model '{MODEL_NAME}' from the local cache. "
            "Connect to the internet once and run `python backend/embeddings/embed.py`, "
            "or set EMBEDDING_MODEL to a local sentence-transformers model folder."
        ) from exc


# Load model
model = load_embedding_model()

# Load documents
with open("data/processed/documents.json", "r", encoding="utf-8") as f:
    documents = json.load(f)

# Load embeddings
embeddings = np.load("data/embeddings/embeddings.npy")

def search(query, top_k=5):

    # Encode query
    query_embedding = model.encode([query])

    # Compute similarity
    similarities = cosine_similarity(query_embedding, embeddings)[0]

    # Get top matches
    top_indices = similarities.argsort()[-top_k:][::-1]

    results = []

    for idx in top_indices:
        results.append({
            "score": float(similarities[idx]),
            "document": documents[idx]
        })

    return results


if __name__ == "__main__":

    query = input("Enter query: ")

    results = search(query)

    for i, result in enumerate(results):

        print(f"\nResult {i+1}")
        print(f"Score: {result['score']:.4f}")
        print(result["document"]["text"])
