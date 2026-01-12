/**
 * Vector Database Integration Module
 * 
 * This module provides a unified interface for interacting with various vector database providers
 * including Qdrant, Pinecone, Weaviate, Chroma, and Milvus. It supports semantic search operations,
 * embedding generation, and message embeddings for Discord messages.
 * 
 * @module storage/vector/vectorDatabase
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { Pinecone, PineconeRecord, ServerlessSpecCloudEnum } from '@pinecone-database/pinecone';
import weaviate from 'weaviate-client';
import { ChromaClient, Collection as ChromaCollection } from 'chromadb';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import OpenAI from 'openai';
import { Logger } from '../../utils/logger.js';
import { StorageError, StorageErrorCode } from '../errors/storageError.js';
import { AdvancedBotConfig, StorageConfig } from '../../config/advancedConfig.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported vector database providers
 */
export type VectorDatabaseProviderType = 'qdrant' | 'pinecone' | 'weaviate' | 'chroma' | 'milvus';

/**
 * Distance metrics for vector similarity
 */
export type DistanceMetric = 'cosine' | 'euclidean' | 'dotproduct';

/**
 * Vector data structure with metadata
 */
export interface VectorData {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
}

/**
 * Search filter options
 */
export interface SearchFilter {
  channel?: string | string[];
  author?: string | string[];
  startDate?: Date;
  endDate?: Date;
  [key: string]: any;
}

/**
 * Search result with score
 */
export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Hybrid search result combining keyword and vector scores
 */
export interface HybridSearchResult extends SearchResult {
  keywordScore?: number;
  vectorScore: number;
  combinedScore: number;
}

/**
 * Message embedding metadata
 */
export interface MessageEmbeddingMetadata {
  messageId: string;
  channelId: string;
  guildId?: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: Date;
  edited?: boolean;
  editedAt?: Date;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * Batch embedding response
 */
export interface BatchEmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Vector database configuration
 */
export interface VectorDatabaseConfig {
  provider: VectorDatabaseProviderType;
  apiKey?: string;
  environment?: string;
  indexName?: string;
  dimension?: number;
  metric?: DistanceMetric;
  cloud?: {
    region?: string;
    endpoint?: string;
  };
}

/**
 * Collection configuration
 */
export interface CollectionConfig {
  name: string;
  dimension: number;
  metric?: DistanceMetric;
}

// ============================================================================
// Custom Error Types
// ============================================================================

/**
 * Vector database specific error codes
 */
export enum VectorDatabaseErrorCode {
  CONNECTION_FAILED = 'VECTOR_DB_CONNECTION_FAILED',
  DISCONNECTION_FAILED = 'VECTOR_DB_DISCONNECTION_FAILED',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  SEARCH_FAILED = 'SEARCH_FAILED',
  COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND',
  COLLECTION_EXISTS = 'COLLECTION_EXISTS',
  INVALID_DIMENSION = 'INVALID_DIMENSION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TIMEOUT = 'VECTOR_DB_TIMEOUT',
  OPERATION_FAILED = 'VECTOR_DB_OPERATION_FAILED',
  CONFIGURATION_ERROR = 'VECTOR_DB_CONFIGURATION_ERROR',
}

/**
 * Vector database error class
 */
export class VectorDatabaseError extends StorageError {
  constructor(
    code: VectorDatabaseErrorCode,
    message: string,
    context?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(code as any, message, context, retryable);
    this.name = 'VectorDatabaseError';
  }
}

// ============================================================================
// Abstract Provider Interface
// ============================================================================

/**
 * Abstract interface for vector database providers
 */
abstract class VectorDatabaseProviderImpl {
  protected logger: Logger;
  protected config: VectorDatabaseConfig;
  protected isConnected: boolean = false;

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Establish connection to vector database
   */
  abstract connect(): Promise<void>;

  /**
   * Close connection to vector database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Create a new collection
   */
  abstract createCollection(config: CollectionConfig): Promise<void>;

  /**
   * Delete a collection
   */
  abstract deleteCollection(name: string): Promise<void>;

  /**
   * Check if a collection exists
   */
  abstract collectionExists(name: string): Promise<boolean>;

  /**
   * Insert or update vectors
   */
  abstract upsertVectors(collection: string, vectors: VectorData[]): Promise<void>;

  /**
   * Search vectors by similarity
   */
  abstract searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]>;

  /**
   * Delete vectors by ID
   */
  abstract deleteVectors(collection: string, ids: string[]): Promise<void>;

  /**
   * Get a specific vector
   */
  abstract getVector(collection: string, id: string): Promise<VectorData | null>;

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// ============================================================================
// Qdrant Provider Implementation
// ============================================================================

/**
 * Qdrant vector database provider implementation
 */
class QdrantProvider extends VectorDatabaseProviderImpl {
  private client: QdrantClient | null = null;

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    super(config, logger);
  }

  async connect(): Promise<void> {
    try {
      const endpoint = this.config.cloud?.endpoint || 'http://localhost:6333';
      const apiKey = this.config.apiKey;

      this.logger.info(`Connecting to Qdrant at ${endpoint}`);

      this.client = new QdrantClient({
        url: endpoint,
        apiKey: apiKey,
      });

      // Test connection
      await this.client.getCollections();
      this.isConnected = true;
      this.logger.info('Successfully connected to Qdrant');
    } catch (error) {
      this.isConnected = false;
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        `Failed to connect to Qdrant: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint: this.config.cloud?.endpoint },
        true
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client = null;
        this.isConnected = false;
        this.logger.info('Disconnected from Qdrant');
      }
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.DISCONNECTION_FAILED,
        `Failed to disconnect from Qdrant: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      const exists = await this.collectionExists(config.name);
      if (exists) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.COLLECTION_EXISTS,
          `Collection ${config.name} already exists`
        );
      }

      await this.client.createCollection(config.name, {
        vectors: {
          size: config.dimension,
          distance: this.mapMetric(config.metric || 'cosine'),
        },
      });

      this.logger.info(`Created collection: ${config.name}`);
    } catch (error) {
      if (error instanceof VectorDatabaseError) {
        throw error;
      }
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to create collection ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: config.name }
      );
    }
  }

  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      await this.client.deleteCollection(name);
      this.logger.info(`Deleted collection: ${name}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete collection ${name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: name }
      );
    }
  }

  async collectionExists(name: string): Promise<boolean> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      const collections = await this.client.getCollections();
      return collections.collections.some((c) => c.name === name);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to check collection existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async upsertVectors(collection: string, vectors: VectorData[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      const points = vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        payload: v.metadata,
      }));

      await this.client.upsert(collection, {
        points,
      });

      this.logger.debug(`Upserted ${vectors.length} vectors to collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: vectors.length },
        true
      );
    }
  }

  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      const searchFilter = this.buildQdrantFilter(filter);

      const results = await this.client.search(collection, {
        vector: queryVector,
        limit,
        filter: searchFilter,
      });

      return results.map((r) => ({
        id: String(r.id),
        score: r.score || 0,
        metadata: r.payload || undefined,
      }));
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.SEARCH_FAILED,
        `Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, limit },
        true
      );
    }
  }

  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      await this.client.delete(collection, {
        points: ids,
      });

      this.logger.debug(`Deleted ${ids.length} vectors from collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: ids.length }
      );
    }
  }

  async getVector(collection: string, id: string): Promise<VectorData | null> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Qdrant'
      );
    }

    try {
      const result = await this.client.retrieve(collection, {
        ids: [id],
      });

      if (result.length === 0) {
        return null;
      }

      const point = result[0];
      const vector = point.vector;
      // Handle both number[] and number[][] from Qdrant API
      let flatVector: number[] = [];
      if (Array.isArray(vector)) {
        if (vector.length > 0 && Array.isArray(vector[0])) {
          // number[][] - flatten the first array
          flatVector = vector[0] as number[];
        } else if (vector.length > 0 && typeof vector[0] === 'number') {
          // number[] - use as is
          flatVector = vector as number[];
        }
      }
      return {
        id: String(point.id),
        vector: flatVector,
        metadata: point.payload || undefined,
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to get vector: ${error instanceof Error ? error.message : String(error)}`,
        { collection, id }
      );
    }
  }

  private mapMetric(metric: DistanceMetric): 'Cosine' | 'Euclid' | 'Dot' {
    switch (metric) {
      case 'cosine':
        return 'Cosine';
      case 'euclidean':
        return 'Euclid';
      case 'dotproduct':
        return 'Dot';
      default:
        return 'Cosine';
    }
  }

  private buildQdrantFilter(filter?: SearchFilter): any {
    if (!filter) {
      return undefined;
    }

    const conditions: any[] = [];

    if (filter.channel) {
      const channels = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      conditions.push({
        key: 'channelId',
        match: { any: channels },
      });
    }

    if (filter.author) {
      const authors = Array.isArray(filter.author) ? filter.author : [filter.author];
      conditions.push({
        key: 'authorId',
        match: { any: authors },
      });
    }

    if (filter.startDate || filter.endDate) {
      const range: any = {};
      if (filter.startDate) {
        range.gte = filter.startDate.toISOString();
      }
      if (filter.endDate) {
        range.lte = filter.endDate.toISOString();
      }
      conditions.push({
        key: 'timestamp',
        range,
      });
    }

    // Add other filter conditions
    for (const [key, value] of Object.entries(filter)) {
      if (
        !['channel', 'author', 'startDate', 'endDate'].includes(key) &&
        value !== undefined
      ) {
        conditions.push({
          key,
          match: { value },
        });
      }
    }

    return conditions.length > 0 ? { must: conditions } : undefined;
  }
}

// ============================================================================
// Placeholder Provider Implementations
// ============================================================================

/**
 * Pinecone vector database provider implementation
 * Provides integration with Pinecone's vector database service
 */
class PineconeProvider extends VectorDatabaseProviderImpl {
  private client: Pinecone | null = null;
  private indexName: string;

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    super(config, logger);
    this.indexName = config.indexName || 'default';
  }

  /**
   * Establish connection to Pinecone
   * Initializes the Pinecone client with API key from configuration
   */
  async connect(): Promise<void> {
    try {
      const apiKey = this.config.apiKey;
      if (!apiKey) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.CONFIGURATION_ERROR,
          'Pinecone API key is required'
        );
      }

      this.logger.info('Connecting to Pinecone');

      this.client = new Pinecone({ apiKey });

      // Test connection by listing indexes
      await this.client.listIndexes();
      this.isConnected = true;
      this.logger.info('Successfully connected to Pinecone');
    } catch (error) {
      this.isConnected = false;
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        `Failed to connect to Pinecone: ${error instanceof Error ? error.message : String(error)}`,
        { indexName: this.indexName },
        true
      );
    }
  }

  /**
   * Close connection to Pinecone
   * Pinecone client doesn't have explicit disconnect, just cleanup
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client = null;
        this.isConnected = false;
        this.logger.info('Disconnected from Pinecone');
      }
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.DISCONNECTION_FAILED,
        `Failed to disconnect from Pinecone: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new index (collection) in Pinecone
   */
  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const exists = await this.collectionExists(config.name);
      if (exists) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.COLLECTION_EXISTS,
          `Index ${config.name} already exists`
        );
      }

      await this.client.createIndex({
        name: config.name,
        dimension: config.dimension,
        metric: this.mapMetric(config.metric || 'cosine'),
        spec: {
          serverless: {
            cloud: (this.config.environment || 'aws') as ServerlessSpecCloudEnum,
            region: this.config.cloud?.region || 'us-east-1'
          }
        }
      });

      this.logger.info(`Created Pinecone index: ${config.name}`);
    } catch (error) {
      if (error instanceof VectorDatabaseError) {
        throw error;
      }
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to create index ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: config.name }
      );
    }
  }

  /**
   * Delete an index from Pinecone
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      await this.client.deleteIndex(name);
      this.logger.info(`Deleted Pinecone index: ${name}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete index ${name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: name }
      );
    }
  }

  /**
   * Check if an index exists in Pinecone
   */
  async collectionExists(name: string): Promise<boolean> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const indexes = await this.client.listIndexes();
      return indexes.indexes?.some((i) => i.name === name) || false;
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to check index existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upsert vectors to Pinecone index
   */
  async upsertVectors(collection: string, vectors: VectorData[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const index = this.client.index(collection);
      const records: PineconeRecord[] = vectors.map((v) => ({
        id: v.id,
        values: v.vector,
        metadata: v.metadata,
      }));

      await index.upsert(records);

      this.logger.debug(`Upserted ${vectors.length} vectors to index: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: vectors.length },
        true
      );
    }
  }

  /**
   * Search vectors by similarity in Pinecone
   */
  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const index = this.client.index(collection);
      const pineconeFilter = this.buildPineconeFilter(filter);

      const results = await index.query({
        vector: queryVector,
        topK: limit,
        filter: pineconeFilter,
        includeMetadata: true,
      });

      return results.matches?.map((match) => ({
        id: match.id,
        score: match.score || 0,
        metadata: match.metadata,
      })) || [];
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.SEARCH_FAILED,
        `Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, limit },
        true
      );
    }
  }

  /**
   * Delete vectors by ID from Pinecone
   */
  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const index = this.client.index(collection);
      await index.deleteMany(ids);

      this.logger.debug(`Deleted ${ids.length} vectors from index: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: ids.length }
      );
    }
  }

  /**
   * Get a specific vector from Pinecone
   */
  async getVector(collection: string, id: string): Promise<VectorData | null> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Pinecone'
      );
    }

    try {
      const index = this.client.index(collection);
      const results = await index.fetch([id]);

      if (!results.records || Object.keys(results.records).length === 0) {
        return null;
      }

      const record = results.records[0];
      if (!record) {
        return null;
      }

      return {
        id,
        vector: record.values || [],
        metadata: record.metadata,
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to get vector: ${error instanceof Error ? error.message : String(error)}`,
        { collection, id }
      );
    }
  }

  /**
   * Map distance metric to Pinecone metric type
   */
  private mapMetric(metric: DistanceMetric): 'cosine' | 'euclidean' | 'dotproduct' {
    switch (metric) {
      case 'cosine':
        return 'cosine';
      case 'euclidean':
        return 'euclidean';
      case 'dotproduct':
        return 'dotproduct';
      default:
        return 'cosine';
    }
  }

  /**
   * Build Pinecone filter from SearchFilter
   */
  private buildPineconeFilter(filter?: SearchFilter): any {
    if (!filter) {
      return undefined;
    }

    const conditions: any = {};

    if (filter.channel) {
      const channels = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      conditions.channelId = { $in: channels };
    }

    if (filter.author) {
      const authors = Array.isArray(filter.author) ? filter.author : [filter.author];
      conditions.authorId = { $in: authors };
    }

    if (filter.startDate || filter.endDate) {
      const range: any = {};
      if (filter.startDate) {
        range.$gte = filter.startDate.toISOString();
      }
      if (filter.endDate) {
        range.$lte = filter.endDate.toISOString();
      }
      conditions.timestamp = range;
    }

    // Add other filter conditions
    for (const [key, value] of Object.entries(filter)) {
      if (
        !['channel', 'author', 'startDate', 'endDate'].includes(key) &&
        value !== undefined
      ) {
        conditions[key] = { $eq: value };
      }
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
  }
}

/**
 * Weaviate vector database provider implementation
 * Provides integration with Weaviate's vector database service
 */
class WeaviateProvider extends VectorDatabaseProviderImpl {
  private client: any | null = null;

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    super(config, logger);
  }

  /**
   * Establish connection to Weaviate
   * Initializes Weaviate client with endpoint and API key from configuration
   */
  async connect(): Promise<void> {
    try {
      const endpoint = this.config.cloud?.endpoint || 'http://localhost:8080';
      const apiKey = this.config.apiKey;

      this.logger.info(`Connecting to Weaviate at ${endpoint}`);

      const clientConfig: any = {
        host: endpoint.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      };

      if (apiKey) {
        clientConfig.apiKey = new weaviate.ApiKey(apiKey);
      }

      this.client = weaviate.client(clientConfig);

      // Test connection by checking if we can access schema
      await this.client.schema.getter().do();
      this.isConnected = true;
      this.logger.info('Successfully connected to Weaviate');
    } catch (error) {
      this.isConnected = false;
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        `Failed to connect to Weaviate: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint: this.config.cloud?.endpoint },
        true
      );
    }
  }

  /**
   * Close connection to Weaviate
   * Weaviate client doesn't have explicit disconnect, just cleanup
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client = null;
        this.isConnected = false;
        this.logger.info('Disconnected from Weaviate');
      }
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.DISCONNECTION_FAILED,
        `Failed to disconnect from Weaviate: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new collection (class) in Weaviate
   */
  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const exists = await this.collectionExists(config.name);
      if (exists) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.COLLECTION_EXISTS,
          `Collection ${config.name} already exists`
        );
      }

      const classObj = {
        class: config.name,
        vectorizer: weaviate.configure.vectorizer.none(),
        properties: [
          {
            name: 'metadata',
            dataType: ['object'],
          },
        ],
      };

      await this.client.schema.classCreator().withClass(classObj).do();

      this.logger.info(`Created Weaviate collection: ${config.name}`);
    } catch (error) {
      if (error instanceof VectorDatabaseError) {
        throw error;
      }
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to create collection ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: config.name }
      );
    }
  }

  /**
   * Delete a collection (class) from Weaviate
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      await this.client.schema.classDeleter().withClassName(name).do();
      this.logger.info(`Deleted Weaviate collection: ${name}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete collection ${name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: name }
      );
    }
  }

  /**
   * Check if a collection exists in Weaviate
   */
  async collectionExists(name: string): Promise<boolean> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const schema = await this.client.schema.getter().do();
      return schema.classes?.some((c: any) => c.class === name) || false;
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to check collection existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upsert vectors to Weaviate collection
   */
  async upsertVectors(collection: string, vectors: VectorData[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const dataObjects = vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        properties: {
          metadata: v.metadata || {},
        },
      }));

      const batcher = this.client.batch.objectsBatcher();
      for (const obj of dataObjects) {
        batcher.withObject(obj);
      }
      await batcher.do();

      this.logger.debug(`Upserted ${vectors.length} vectors to collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: vectors.length },
        true
      );
    }
  }

  /**
   * Search vectors by similarity in Weaviate
   */
  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const weaviateFilter = this.buildWeaviateFilter(filter);

      const results = await this.client.graphql
        .get()
        .withClassName(collection)
        .withNearVector({
          vector: queryVector,
          distance: 1.0,
        })
        .withLimit(limit)
        .withWhere(weaviateFilter)
        .withFields('_additional { id distance } metadata')
        .do();

      const data = results.data?.Get?.[collection] || [];
      return data.map((item: any) => ({
        id: item._additional?.id || item.id,
        score: 1 - (item._additional?.distance || 0),
        metadata: item.metadata,
      }));
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.SEARCH_FAILED,
        `Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, limit },
        true
      );
    }
  }

  /**
   * Delete vectors by ID from Weaviate
   */
  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const batcher = this.client.batch.objectsBatcher();
      for (const id of ids) {
        batcher.withId(id).withClassName(collection);
      }
      await batcher.withDelete().do();

      this.logger.debug(`Deleted ${ids.length} vectors from collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: ids.length }
      );
    }
  }

  /**
   * Get a specific vector from Weaviate
   */
  async getVector(collection: string, id: string): Promise<VectorData | null> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Weaviate'
      );
    }

    try {
      const results = await this.client.data
        .getterById()
        .withId(id)
        .withClassName(collection)
        .withVector()
        .do();

      if (!results || !results.vector) {
        return null;
      }

      return {
        id,
        vector: results.vector,
        metadata: results.properties?.metadata,
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to get vector: ${error instanceof Error ? error.message : String(error)}`,
        { collection, id }
      );
    }
  }

  /**
   * Build Weaviate filter from SearchFilter
   */
  private buildWeaviateFilter(filter?: SearchFilter): any {
    if (!filter) {
      return undefined;
    }

    const conditions: any[] = [];

    if (filter.channel) {
      const channels = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      conditions.push({
        path: ['metadata', 'channelId'],
        operator: 'ContainsAny',
        valueTextArray: channels,
      });
    }

    if (filter.author) {
      const authors = Array.isArray(filter.author) ? filter.author : [filter.author];
      conditions.push({
        path: ['metadata', 'authorId'],
        operator: 'ContainsAny',
        valueTextArray: authors,
      });
    }

    if (filter.startDate || filter.endDate) {
      const dateConditions: any[] = [];
      if (filter.startDate) {
        dateConditions.push({
          path: ['metadata', 'timestamp'],
          operator: 'GreaterThan',
          valueDate: filter.startDate.toISOString(),
        });
      }
      if (filter.endDate) {
        dateConditions.push({
          path: ['metadata', 'timestamp'],
          operator: 'LessThan',
          valueDate: filter.endDate.toISOString(),
        });
      }
      if (dateConditions.length === 2) {
        conditions.push({ operator: 'And', operands: dateConditions });
      } else if (dateConditions.length === 1) {
        conditions.push(dateConditions[0]);
      }
    }

    // Add other filter conditions
    for (const [key, value] of Object.entries(filter)) {
      if (
        !['channel', 'author', 'startDate', 'endDate'].includes(key) &&
        value !== undefined
      ) {
        conditions.push({
          path: ['metadata', key],
          operator: 'Equal',
          valueText: String(value),
        });
      }
    }

    return conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : { operator: 'And', operands: conditions }
      : undefined;
  }
}

/**
 * Chroma vector database provider implementation
 * Provides integration with ChromaDB's vector database service
 */
class ChromaProvider extends VectorDatabaseProviderImpl {
  private client: ChromaClient | null = null;
  private collections: Map<string, ChromaCollection> = new Map();

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    super(config, logger);
  }

  /**
   * Establish connection to ChromaDB
   * Initializes Chroma client with endpoint from configuration
   */
  async connect(): Promise<void> {
    try {
      const endpoint = this.config.cloud?.endpoint || 'http://localhost:8000';

      this.logger.info(`Connecting to ChromaDB at ${endpoint}`);

      this.client = new ChromaClient({
        path: endpoint,
      });

      // Test connection by listing collections
      await this.client.listCollections();
      this.isConnected = true;
      this.logger.info('Successfully connected to ChromaDB');
    } catch (error) {
      this.isConnected = false;
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        `Failed to connect to ChromaDB: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint: this.config.cloud?.endpoint },
        true
      );
    }
  }

  /**
   * Close connection to ChromaDB
   * Chroma client doesn't have explicit disconnect, just cleanup
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.collections.clear();
        this.client = null;
        this.isConnected = false;
        this.logger.info('Disconnected from ChromaDB');
      }
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.DISCONNECTION_FAILED,
        `Failed to disconnect from ChromaDB: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new collection in ChromaDB
   */
  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const exists = await this.collectionExists(config.name);
      if (exists) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.COLLECTION_EXISTS,
          `Collection ${config.name} already exists`
        );
      }

      await this.client.createCollection({
        name: config.name,
        metadata: {
          dimension: config.dimension,
          metric: config.metric || 'cosine',
        },
      });

      this.logger.info(`Created ChromaDB collection: ${config.name}`);
    } catch (error) {
      if (error instanceof VectorDatabaseError) {
        throw error;
      }
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to create collection ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: config.name }
      );
    }
  }

  /**
   * Delete a collection from ChromaDB
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      await this.client.deleteCollection({ name });
      this.collections.delete(name);
      this.logger.info(`Deleted ChromaDB collection: ${name}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete collection ${name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: name }
      );
    }
  }

  /**
   * Check if a collection exists in ChromaDB
   */
  async collectionExists(name: string): Promise<boolean> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const collections = await this.client.listCollections();
      return collections.some((c) => c.name === name);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to check collection existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get or create a collection reference
   */
  private async getCollection(name: string): Promise<ChromaCollection> {
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }

    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const collection = await this.client.getCollection({ name });
      this.collections.set(name, collection);
      return collection;
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.COLLECTION_NOT_FOUND,
        `Collection ${name} not found: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upsert vectors to ChromaDB collection
   */
  async upsertVectors(collection: string, vectors: VectorData[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const chromaCollection = await this.getCollection(collection);

      const ids = vectors.map((v) => v.id);
      const embeddings = vectors.map((v) => v.vector);
      const metadatas = vectors.map((v) => v.metadata || {});

      await chromaCollection.add({
        ids,
        embeddings,
        metadatas,
      });

      this.logger.debug(`Upserted ${vectors.length} vectors to collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: vectors.length },
        true
      );
    }
  }

  /**
   * Search vectors by similarity in ChromaDB
   */
  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const chromaCollection = await this.getCollection(collection);
      const chromaFilter = this.buildChromaFilter(filter);

      const results = await chromaCollection.query({
        queryEmbeddings: [queryVector],
        nResults: limit,
        where: chromaFilter,
      });

      const ids = results.ids[0] || [];
      const distances = results.distances[0] || [];
      const metadatas = results.metadatas[0] || [];

      return ids.map((id, index) => ({
        id,
        score: 1 - (distances[index] || 0),
        metadata: metadatas[index] || undefined,
      }));
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.SEARCH_FAILED,
        `Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, limit },
        true
      );
    }
  }

  /**
   * Delete vectors by ID from ChromaDB
   */
  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const chromaCollection = await this.getCollection(collection);
      await chromaCollection.delete({ ids });

      this.logger.debug(`Deleted ${ids.length} vectors from collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: ids.length }
      );
    }
  }

  /**
   * Get a specific vector from ChromaDB
   */
  async getVector(collection: string, id: string): Promise<VectorData | null> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to ChromaDB'
      );
    }

    try {
      const chromaCollection = await this.getCollection(collection);
      const results = await chromaCollection.get({
        ids: [id],
        include: ['embeddings', 'metadatas'],
      });

      if (!results || !results.ids || results.ids.length === 0) {
        return null;
      }

      return {
        id: results.ids[0],
        vector: results.embeddings?.[0] || [],
        metadata: results.metadatas?.[0] ?? undefined,
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to get vector: ${error instanceof Error ? error.message : String(error)}`,
        { collection, id }
      );
    }
  }

  /**
   * Build ChromaDB filter from SearchFilter
   */
  private buildChromaFilter(filter?: SearchFilter): any {
    if (!filter) {
      return undefined;
    }

    const conditions: any = {};

    if (filter.channel) {
      const channels = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      conditions.channelId = { $in: channels };
    }

    if (filter.author) {
      const authors = Array.isArray(filter.author) ? filter.author : [filter.author];
      conditions.authorId = { $in: authors };
    }

    if (filter.startDate || filter.endDate) {
      const range: any = {};
      if (filter.startDate) {
        range.$gte = filter.startDate.toISOString();
      }
      if (filter.endDate) {
        range.$lte = filter.endDate.toISOString();
      }
      conditions.timestamp = range;
    }

    // Add other filter conditions
    for (const [key, value] of Object.entries(filter)) {
      if (
        !['channel', 'author', 'startDate', 'endDate'].includes(key) &&
        value !== undefined
      ) {
        conditions[key] = { $eq: value };
      }
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
  }
}

/**
 * Milvus vector database provider implementation
 * Provides integration with Milvus's vector database service
 */
class MilvusProvider extends VectorDatabaseProviderImpl {
  private client: MilvusClient | null = null;

  constructor(config: VectorDatabaseConfig, logger: Logger) {
    super(config, logger);
  }

  /**
   * Establish connection to Milvus
   * Initializes Milvus client with endpoint and token from configuration
   */
  async connect(): Promise<void> {
    try {
      const endpoint = this.config.cloud?.endpoint || 'localhost:19530';
      const token = this.config.apiKey;

      this.logger.info(`Connecting to Milvus at ${endpoint}`);

      this.client = new MilvusClient({
        address: endpoint,
        token: token,
      });

      // Test connection by checking if we can access database
      await this.client.checkHealth();
      this.isConnected = true;
      this.logger.info('Successfully connected to Milvus');
    } catch (error) {
      this.isConnected = false;
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        `Failed to connect to Milvus: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint: this.config.cloud?.endpoint },
        true
      );
    }
  }

  /**
   * Close connection to Milvus
   * Milvus client doesn't have explicit disconnect, just cleanup
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client = null;
        this.isConnected = false;
        this.logger.info('Disconnected from Milvus');
      }
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.DISCONNECTION_FAILED,
        `Failed to disconnect from Milvus: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new collection in Milvus
   */
  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      const exists = await this.collectionExists(config.name);
      if (exists) {
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.COLLECTION_EXISTS,
          `Collection ${config.name} already exists`
        );
      }

      // Create collection schema
      const schema = [
        {
          name: 'id',
          description: 'Primary key',
          data_type: DataType.VarChar,
          is_primary_key: true,
          max_length: 256,
        },
        {
          name: 'vector',
          description: 'Vector field',
          data_type: DataType.FloatVector,
          dim: config.dimension,
        },
        {
          name: 'metadata',
          description: 'Metadata field',
          data_type: DataType.JSON,
        },
      ];

      await this.client.createCollection({
        collection_name: config.name,
        fields: schema,
      });

      // Create index on vector field
      await this.client.createIndex({
        collection_name: config.name,
        field_name: 'vector',
        index_type: 'IVF_FLAT',
        metric_type: this.mapMetric(config.metric || 'cosine'),
        params: { nlist: 128 },
      });

      this.logger.info(`Created Milvus collection: ${config.name}`);
    } catch (error) {
      if (error instanceof VectorDatabaseError) {
        throw error;
      }
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to create collection ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: config.name }
      );
    }
  }

  /**
   * Delete a collection from Milvus
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      await this.client.dropCollection({ collection_name: name });
      this.logger.info(`Deleted Milvus collection: ${name}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete collection ${name}: ${error instanceof Error ? error.message : String(error)}`,
        { collection: name }
      );
    }
  }

  /**
   * Check if a collection exists in Milvus
   */
  async collectionExists(name: string): Promise<boolean> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      const result = await this.client.hasCollection({ collection_name: name });
      return !!result.value || false;
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to check collection existence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upsert vectors to Milvus collection
   */
  async upsertVectors(collection: string, vectors: VectorData[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      const data = vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        metadata: v.metadata || {},
      }));

      await this.client.insert({
        collection_name: collection,
        data,
      });

      // Flush to ensure data is persisted
      await this.client.flush({ collection_names: [collection] });

      this.logger.debug(`Upserted ${vectors.length} vectors to collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to upsert vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: vectors.length },
        true
      );
    }
  }

  /**
   * Search vectors by similarity in Milvus
   */
  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      // Load collection into memory before search
      await this.client.loadCollection({ collection_name: collection });

      const milvusFilter = this.buildMilvusFilter(filter);

      const results = await this.client.search({
        collection_name: collection,
        data: [queryVector],
        limit,
        output_fields: ['metadata'],
        filter: milvusFilter,
      });

      return results.results.map((result: any) => ({
        id: result.id,
        score: result.score,
        metadata: result.metadata,
      }));
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.SEARCH_FAILED,
        `Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, limit },
        true
      );
    }
  }

  /**
   * Delete vectors by ID from Milvus
   */
  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      await this.client.delete({
        collection_name: collection,
        ids,
      });

      this.logger.debug(`Deleted ${ids.length} vectors from collection: ${collection}`);
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`,
        { collection, count: ids.length }
      );
    }
  }

  /**
   * Get a specific vector from Milvus
   */
  async getVector(collection: string, id: string): Promise<VectorData | null> {
    if (!this.client) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Milvus'
      );
    }

    try {
      const results = await this.client.query({
        collection_name: collection,
        filter: `id == "${id}"`,
        output_fields: ['vector', 'metadata'],
        limit: 1,
      });

      if (!results || results.data.length === 0) {
        return null;
      }

      const data = results.data[0];
      return {
        id,
        vector: data.vector,
        metadata: data.metadata,
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.OPERATION_FAILED,
        `Failed to get vector: ${error instanceof Error ? error.message : String(error)}`,
        { collection, id }
      );
    }
  }

  /**
   * Map distance metric to Milvus metric type
   */
  private mapMetric(metric: DistanceMetric): string {
    switch (metric) {
      case 'cosine':
        return 'COSINE';
      case 'euclidean':
        return 'L2';
      case 'dotproduct':
        return 'IP';
      default:
        return 'COSINE';
    }
  }

  /**
   * Build Milvus filter from SearchFilter
   */
  private buildMilvusFilter(filter?: SearchFilter): string | undefined {
    if (!filter) {
      return undefined;
    }

    const conditions: string[] = [];

    if (filter.channel) {
      const channels = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      const channelList = channels.map((c) => `"${c}"`).join(', ');
      conditions.push(`metadata["channelId"] in [${channelList}]`);
    }

    if (filter.author) {
      const authors = Array.isArray(filter.author) ? filter.author : [filter.author];
      const authorList = authors.map((a) => `"${a}"`).join(', ');
      conditions.push(`metadata["authorId"] in [${authorList}]`);
    }

    if (filter.startDate || filter.endDate) {
      const rangeConditions: string[] = [];
      if (filter.startDate) {
        rangeConditions.push(`metadata["timestamp"] >= "${filter.startDate.toISOString()}"`);
      }
      if (filter.endDate) {
        rangeConditions.push(`metadata["timestamp"] <= "${filter.endDate.toISOString()}"`);
      }
      conditions.push(`(${rangeConditions.join(' && ')})`);
    }

    // Add other filter conditions
    for (const [key, value] of Object.entries(filter)) {
      if (
        !['channel', 'author', 'startDate', 'endDate'].includes(key) &&
        value !== undefined
      ) {
        conditions.push(`metadata["${key}"] == "${value}"`);
      }
    }

    return conditions.length > 0 ? conditions.join(' && ') : undefined;
  }
}

// ============================================================================
// Embedding Manager
// ============================================================================

/**
 * Manages embedding generation with caching and batch processing
 */
class EmbeddingManager {
  private openai: OpenAI;
  private logger: Logger;
  private cache: Map<string, number[]> = new Map();
  private defaultModel: string = 'text-embedding-3-small';
  private defaultDimension: number = 1536;

  constructor(apiKey: string, logger: Logger) {
    this.openai = new OpenAI({ apiKey });
    this.logger = logger;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    model?: string
  ): Promise<number[]> {
    const cacheKey = `${model || this.defaultModel}:${text}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      this.logger.debug('Using cached embedding');
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: model || this.defaultModel,
        input: text,
      });

      const embedding = response.data[0].embedding;

      // Cache result
      this.cache.set(cacheKey, embedding);

      // Limit cache size
      if (this.cache.size > 10000) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }

      return embedding;
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.EMBEDDING_FAILED,
        `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`,
        { text: text.substring(0, 100), model },
        true
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(
    texts: string[],
    model?: string
  ): Promise<BatchEmbeddingResponse> {
    try {
      const response = await this.openai.embeddings.create({
        model: model || this.defaultModel,
        input: texts,
      });

      const embeddings = response.data.map((d) => d.embedding);

      // Cache results
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = `${model || this.defaultModel}:${texts[i]}`;
        this.cache.set(cacheKey, embeddings[i]);
      }

      return {
        embeddings,
        model: response.model,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      throw new VectorDatabaseError(
        VectorDatabaseErrorCode.EMBEDDING_FAILED,
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`,
        { count: texts.length, model },
        true
      );
    }
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Embedding cache cleared');
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get default dimension based on model
   */
  getDimension(model?: string): number {
    const embeddingModel = model || this.defaultModel;
    switch (embeddingModel) {
      case 'text-embedding-3-small':
        return 1536;
      case 'text-embedding-3-large':
        return 3072;
      case 'text-embedding-ada-002':
        return 1536;
      default:
        return this.defaultDimension;
    }
  }
}

// ============================================================================
// Main Vector Database Client
// ============================================================================

/**
 * Main vector database client providing unified interface
 */
export class VectorDatabaseClient {
  private logger: Logger;
  private provider: VectorDatabaseProviderImpl;
  private embeddingManager: EmbeddingManager;
  private config: VectorDatabaseConfig;
  private openaiApiKey: string;
  private retryConfig: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };

  constructor(config: VectorDatabaseConfig, openaiApiKey: string) {
    this.logger = new Logger('VectorDatabaseClient');
    this.config = config;
    this.openaiApiKey = openaiApiKey;
    this.embeddingManager = new EmbeddingManager(openaiApiKey, this.logger);
    this.retryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };

    // Initialize provider
    this.provider = this.createProvider(config);
  }

  /**
   * Create provider instance based on configuration
   */
  private createProvider(config: VectorDatabaseConfig): VectorDatabaseProviderImpl {
    switch (config.provider) {
      case 'qdrant':
        return new QdrantProvider(config, this.logger);
      case 'pinecone':
        return new PineconeProvider(config, this.logger);
      case 'weaviate':
        return new WeaviateProvider(config, this.logger);
      case 'chroma':
        return new ChromaProvider(config, this.logger);
      case 'milvus':
        return new MilvusProvider(config, this.logger);
      default:
        const provider = config.provider as string;
        throw new VectorDatabaseError(
          VectorDatabaseErrorCode.CONFIGURATION_ERROR,
          `Unsupported provider: ${provider}`
        );
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof VectorDatabaseError && !error.retryable) {
          throw error;
        }

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelay
          );
          this.logger.warn(
            `${context} failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms`,
            { error: lastError.message }
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Establish connection to vector database
   */
  async connect(): Promise<void> {
    return this.withRetry(() => this.provider.connect(), 'Connection');
  }

  /**
   * Close connection to vector database
   */
  async disconnect(): Promise<void> {
    return this.withRetry(() => this.provider.disconnect(), 'Disconnection');
  }

  /**
   * Create a new collection/namespace
   */
  async createCollection(name: string, dimension?: number): Promise<void> {
    const config: CollectionConfig = {
      name,
      dimension: dimension || this.config.dimension || this.embeddingManager.getDimension(),
      metric: this.config.metric,
    };

    return this.withRetry(
      () => this.provider.createCollection(config),
      'CreateCollection'
    );
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    return this.withRetry(
      () => this.provider.deleteCollection(name),
      'DeleteCollection'
    );
  }

  /**
   * Check if a collection exists
   */
  async collectionExists(name: string): Promise<boolean> {
    return this.withRetry(
      () => this.provider.collectionExists(name),
      'CollectionExists'
    );
  }

  /**
   * Insert or update vectors
   */
  async upsertVectors(
    collection: string,
    vectors: VectorData[]
  ): Promise<void> {
    return this.withRetry(
      () => this.provider.upsertVectors(collection, vectors),
      'UpsertVectors'
    );
  }

  /**
   * Semantic search for similar vectors
   */
  async searchVectors(
    collection: string,
    queryVector: number[],
    limit: number = 10,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    return this.withRetry(
      () => this.provider.searchVectors(collection, queryVector, limit, filter),
      'SearchVectors'
    );
  }

  /**
   * Delete vectors by ID
   */
  async deleteVectors(collection: string, ids: string[]): Promise<void> {
    return this.withRetry(
      () => this.provider.deleteVectors(collection, ids),
      'DeleteVectors'
    );
  }

  /**
   * Retrieve a specific vector
   */
  async getVector(collection: string, id: string): Promise<VectorData | null> {
    return this.withRetry(
      () => this.provider.getVector(collection, id),
      'GetVector'
    );
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    return this.withRetry(
      () => this.embeddingManager.generateEmbedding(text, model),
      'GenerateEmbedding'
    );
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(
    texts: string[],
    model?: string
  ): Promise<BatchEmbeddingResponse> {
    return this.withRetry(
      () => this.embeddingManager.generateBatchEmbeddings(texts, model),
      'GenerateBatchEmbeddings'
    );
  }

  /**
   * Clear embedding cache
   */
  clearEmbeddingCache(): void {
    this.embeddingManager.clearCache();
  }

  /**
   * Get embedding cache size
   */
  getEmbeddingCacheSize(): number {
    return this.embeddingManager.getCacheSize();
  }

  /**
   * Embed a Discord message and store it
   */
  async embedMessage(
    collection: string,
    metadata: MessageEmbeddingMetadata
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(metadata.content);

      const vectorData: VectorData = {
        id: metadata.messageId,
        vector: embedding,
        metadata: {
          ...metadata,
          timestamp: metadata.timestamp.toISOString(),
          editedAt: metadata.editedAt?.toISOString(),
        },
      };

      await this.upsertVectors(collection, [vectorData]);
      this.logger.debug(`Embedded message: ${metadata.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to embed message: ${metadata.messageId}`, error as Error);
      throw error;
    }
  }

  /**
   * Embed multiple Discord messages in batch
   */
  async embedMessagesBatch(
    collection: string,
    messages: MessageEmbeddingMetadata[]
  ): Promise<void> {
    try {
      const texts = messages.map((m) => m.content);
      const response = await this.generateBatchEmbeddings(texts);

      const vectors: VectorData[] = messages.map((metadata, index) => ({
        id: metadata.messageId,
        vector: response.embeddings[index],
        metadata: {
          ...metadata,
          timestamp: metadata.timestamp.toISOString(),
          editedAt: metadata.editedAt?.toISOString(),
        },
      }));

      await this.upsertVectors(collection, vectors);
      this.logger.info(`Embedded ${messages.length} messages in batch`);
    } catch (error) {
      this.logger.error('Failed to embed messages in batch', error as Error);
      throw error;
    }
  }

  /**
   * Update embedding for a message (e.g., after edit)
   */
  async updateMessageEmbedding(
    collection: string,
    metadata: MessageEmbeddingMetadata
  ): Promise<void> {
    return this.embedMessage(collection, metadata);
  }

  /**
   * Delete embedding for a message
   */
  async deleteMessageEmbedding(
    collection: string,
    messageId: string
  ): Promise<void> {
    try {
      await this.deleteVectors(collection, [messageId]);
      this.logger.debug(`Deleted embedding for message: ${messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete embedding for message: ${messageId}`,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Hybrid search combining keyword and vector similarity
   */
  async hybridSearch(
    collection: string,
    query: string,
    limit: number = 10,
    filter?: SearchFilter,
    vectorWeight: number = 0.7,
    keywordWeight: number = 0.3
  ): Promise<HybridSearchResult[]> {
    try {
      // Get vector search results
      const queryVector = await this.generateEmbedding(query);
      const vectorResults = await this.searchVectors(
        collection,
        queryVector,
        limit * 2, // Get more results for fusion
        filter
      );

      // For now, use only vector search (keyword search would require separate index)
      // In production, integrate with full-text search (e.g., PostgreSQL full-text search)
      const results: HybridSearchResult[] = vectorResults.map((result) => ({
        ...result,
        vectorScore: result.score,
        combinedScore: result.score,
      }));

      // Sort by combined score and limit
      results.sort((a, b) => b.combinedScore - a.combinedScore);
      return results.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to perform hybrid search', error as Error);
      throw error;
    }
  }

  /**
   * Search messages by semantic similarity
   */
  async searchMessages(
    collection: string,
    query: string,
    limit: number = 10,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    try {
      const queryVector = await this.generateEmbedding(query);
      return this.searchVectors(collection, queryVector, limit, filter);
    } catch (error) {
      this.logger.error('Failed to search messages', error as Error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.provider.getConnectionStatus();
  }

  /**
   * Get configuration
   */
  getConfig(): VectorDatabaseConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a vector database client from AdvancedBotConfig
 */
export function createVectorDatabaseClient(
  config: AdvancedBotConfig,
  openaiApiKey?: string
): VectorDatabaseClient {
  const vectorConfig = config.storage.vectorDatabase;

  if (!vectorConfig) {
    throw new VectorDatabaseError(
      VectorDatabaseErrorCode.CONFIGURATION_ERROR,
      'Vector database configuration not found'
    );
  }

  const apiKey = openaiApiKey || config.ai.openai?.apiKey;

  if (!apiKey) {
    throw new VectorDatabaseError(
      VectorDatabaseErrorCode.CONFIGURATION_ERROR,
      'OpenAI API key not found'
    );
  }

  return new VectorDatabaseClient(vectorConfig, apiKey);
}
