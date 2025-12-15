import { PostgresConnectionManager } from '../database';
import { RepositoryError, RepositoryErrorCode } from '../errors';
import { Logger } from '../../utils/logger';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  where?: string;
  params?: any[];
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export abstract class BaseRepository<T> {
  protected db: PostgresConnectionManager;
  protected logger: Logger;
  protected tableName: string;
  protected primaryKey: string;

  constructor(
    db: PostgresConnectionManager,
    tableName: string,
    primaryKey: string = 'id'
  ) {
    this.db = db;
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.logger = new Logger(`${this.constructor.name}`);
  }

  async findById(id: string): Promise<T | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await this.db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find entity by ID:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        `Failed to find ${this.getEntityName()} by ID`,
        { id, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        id,
        'findById'
      );
    }
  }

  async findOne(options: QueryOptions = {}): Promise<T | null> {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];
      
      if (options.where) {
        query += ` WHERE ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find one entity:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        `Failed to find one ${this.getEntityName()}`,
        { options, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'findOne'
      );
    }
  }

  async findMany(options: QueryOptions = {}): Promise<T[]> {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];
      
      if (options.where) {
        query += ` WHERE ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const result = await this.db.query(query, params);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to find many entities:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        `Failed to find many ${this.getEntityName()}s`,
        { options, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'findMany'
      );
    }
  }

  async findWithPagination(
    options: QueryOptions & { page: number; pageSize: number }
  ): Promise<PaginationResult<T>> {
    try {
      const offset = (options.page - 1) * options.pageSize;
      
      // Get total count
      let countQuery = `SELECT COUNT(*) FROM ${this.tableName}`;
      const countParams: any[] = [];
      
      if (options.where) {
        countQuery += ` WHERE ${options.where}`;
        if (options.params) {
          countParams.push(...options.params);
        }
      }

      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      // Get data
      const dataOptions: QueryOptions = {
        ...options,
        limit: options.pageSize,
        offset,
      };

      const data = await this.findMany(dataOptions);

      return {
        data,
        total,
        page: options.page,
        pageSize: options.pageSize,
        hasNext: offset + options.pageSize < total,
        hasPrevious: options.page > 1,
      };
    } catch (error) {
      this.logger.error('Failed to find entities with pagination:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        `Failed to find ${this.getEntityName()}s with pagination`,
        { options, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'findWithPagination'
      );
    }
  }

  async create(entity: Partial<T>): Promise<T> {
    try {
      const fields = Object.keys(entity).filter(key => entity[key as keyof T] !== undefined);
      const values = fields.map(key => entity[key as keyof T]);
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');

      const query = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create entity:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.CREATE_FAILED,
        `Failed to create ${this.getEntityName()}`,
        { entity, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'create'
      );
    }
  }

  async createMany(entities: Partial<T>[]): Promise<T[]> {
    if (entities.length === 0) {
      return [];
    }

    try {
      const fields = Object.keys(entities[0] || {}).filter(key => entities[0] && entities[0][key as keyof T] !== undefined);
      const valueSets = entities.map(entity => 
        fields.map(key => entity[key as keyof T])
      );

      const placeholders = valueSets.map((set, setIndex) =>
        `(${set.map((_, valueIndex) => `$${setIndex * fields.length + valueIndex + 1}`).join(', ')})`
      ).join(', ');

      const values = valueSets.flat();
      const query = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES ${placeholders}
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      return result.rows.map((row: any) => this.mapRowToEntity(row));
    } catch (error) {
      this.logger.error('Failed to create many entities:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.BATCH_OPERATION_FAILED,
        `Failed to create many ${this.getEntityName()}s`,
        { entities, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'createMany'
      );
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    try {
      const fields = Object.keys(updates).filter(key => updates[key as keyof T] !== undefined);
      if (fields.length === 0) {
        return this.findById(id);
      }

      const setClause = fields.map((key, index) => `${key} = $${index + 1}`).join(', ');
      const values = [...Object.values(updates), id];

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, updated_at = NOW()
        WHERE ${this.primaryKey} = $${values.length}
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update entity:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.UPDATE_FAILED,
        `Failed to update ${this.getEntityName()}`,
        { id, updates, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        id,
        'update'
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await this.db.query(query, [id]);
      return result.rowCount > 0;
    } catch (error) {
      this.logger.error('Failed to delete entity:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.DELETE_FAILED,
        `Failed to delete ${this.getEntityName()}`,
        { id, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        id,
        'delete'
      );
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    try {
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} IN (${placeholders})`;
      const result = await this.db.query(query, ids);
      return result.rowCount || 0;
    } catch (error) {
      this.logger.error('Failed to delete many entities:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.BATCH_OPERATION_FAILED,
        `Failed to delete many ${this.getEntityName()}s`,
        { ids, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'deleteMany'
      );
    }
  }

  async count(options: QueryOptions = {}): Promise<number> {
    try {
      let query = `SELECT COUNT(*) FROM ${this.tableName}`;
      const params: any[] = [];
      
      if (options.where) {
        query += ` WHERE ${options.where}`;
        if (options.params) {
          params.push(...options.params);
        }
      }

      const result = await this.db.query(query, params);
      return parseInt(result.rows[0].count);
    } catch (error) {
      this.logger.error('Failed to count entities:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.QUERY_FAILED,
        `Failed to count ${this.getEntityName()}s`,
        { options, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'count'
      );
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const query = `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`;
      const result = await this.db.query(query, [id]);
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error('Failed to check if entity exists:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.FIND_FAILED,
        `Failed to check if ${this.getEntityName()} exists`,
        { id, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        id,
        'exists'
      );
    }
  }

  protected abstract mapRowToEntity(row: any): T;
  protected abstract getEntityName(): string;

  protected async executeCustomQuery<R = any>(
    query: string,
    params: any[] = []
  ): Promise<R[]> {
    try {
      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to execute custom query:', error instanceof Error ? error : new Error(String(error)));
      throw new RepositoryError(
        RepositoryErrorCode.QUERY_FAILED,
        `Failed to execute custom query on ${this.getEntityName()}`,
        { query, params, error: error instanceof Error ? error.message : String(error) },
        this.getEntityName(),
        undefined,
        'executeCustomQuery'
      );
    }
  }

  protected async executeCustomQuerySingle<R = any>(
    query: string,
    params: any[] = []
  ): Promise<R | null> {
    const rows = await this.executeCustomQuery<R>(query, params);
    return rows.length > 0 ? rows[0]! : null;
  }
}