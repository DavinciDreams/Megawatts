/**
 * Vector Database Module Exports
 * 
 * This module provides a unified interface for semantic search capabilities
 * using vector databases. It supports multiple providers including Qdrant,
 * Pinecone, Weaviate, Chroma, and Milvus.
 * 
 * @module storage/vector
 */

// Main client class
export {
  VectorDatabaseClient,
  createVectorDatabaseClient,
} from './vectorDatabase.js';

// Type definitions
export type {
  VectorDatabaseProviderType as VectorDatabaseProvider,
  DistanceMetric,
  VectorData,
  SearchFilter,
  SearchResult,
  HybridSearchResult,
  MessageEmbeddingMetadata,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  VectorDatabaseConfig,
  CollectionConfig,
} from './vectorDatabase.js';

// Error types
export {
  VectorDatabaseError,
  VectorDatabaseErrorCode,
} from './vectorDatabase.js';
