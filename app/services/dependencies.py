from functools import lru_cache

from app.agents.workflow import DermatologyAssistantWorkflow
from app.rag.embeddings import EmbeddingService
from app.rag.ingestion import DatasetIngestionService
from app.rag.retriever import RetrievalService
from app.rag.vector_store import PineconeVectorStore, VectorStoreBase
from app.services.conflicts import ConflictCheckerService
from app.services.llm import LLMService
from app.services.persistence import PersistenceService
from app.services.recommendations import RecommendationService
from app.services.safety import SafetyService


@lru_cache
def get_embeddings() -> EmbeddingService:
    return EmbeddingService()


@lru_cache
def get_vector_store() -> VectorStoreBase:
    settings = get_settings()
    if not settings.pinecone_api_key:
        raise RuntimeError("Pinecone is required. Set PINECONE_API_KEY in your environment.")
    return PineconeVectorStore()


@lru_cache
def get_retriever() -> RetrievalService:
    return RetrievalService(get_embeddings(), get_vector_store())


@lru_cache
def get_ingestion_service() -> DatasetIngestionService:
    return DatasetIngestionService(get_embeddings(), get_vector_store())


@lru_cache
def get_workflow() -> DermatologyAssistantWorkflow:
    return DermatologyAssistantWorkflow(
        safety=SafetyService(),
        retriever=get_retriever(),
        llm=LLMService(),
        recommender=RecommendationService(),
        conflict_checker=ConflictCheckerService(),
    )


def get_persistence() -> PersistenceService:
    return PersistenceService()
