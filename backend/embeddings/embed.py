import json
import os
import numpy as np
from pathlib import Path

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

# Load embedding model
model = SentenceTransformer(MODEL_NAME, cache_folder=CACHE_FOLDER)

# Load documents
with open("data/processed/documents.json", "r", encoding="utf-8") as f:
    documents = json.load(f)

texts = [doc["text"] for doc in documents]

print(f"Loaded {len(texts)} documents")

# Generate embeddings
embeddings = model.encode(texts, show_progress_bar=True)

# Convert to numpy array
embeddings = np.array(embeddings)

# Save embeddings
output_dir = Path("data/embeddings")
output_dir.mkdir(parents=True, exist_ok=True)

np.save(output_dir / "embeddings.npy", embeddings)

print("Embeddings saved successfully")
