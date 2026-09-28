import {
  type AggregateID,
  OutboxService,
  Paginated,
  type PaginatedQueryParams,
} from '@flama/backend-ddd';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { None, type Option, Some } from 'oxide.ts';
import { DataSource, IsNull, MoreThan, type Repository } from 'typeorm';
import { ApiTokenMapper } from '../api-tokens.mapper';
import type { ApiTokenEntity } from '../domain/api-token.entity';
import { ApiTokenOrmEntity } from './api-token.orm-entity';
import type { ApiTokenRepositoryPort } from './api-token.repository.port';

/**
 * TypeORM-backed adapter for the API token aggregate. Translates between the
 * domain entity and the persistence model via `ApiTokenMapper` and stages
 * collected domain events on the transactional outbox, atomically with the
 * write that raised them.
 */
@Injectable()
export class ApiTokenRepository implements ApiTokenRepositoryPort {
  constructor(
    @InjectRepository(ApiTokenOrmEntity)
    private readonly repository: Repository<ApiTokenOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly mapper: ApiTokenMapper,
    private readonly outbox: OutboxService,
  ) {}

  async insert(entity: ApiTokenEntity | ApiTokenEntity[]): Promise<void> {
    const entities = Array.isArray(entity) ? entity : [entity];
    const records = entities.map((e) => this.mapper.toPersistence(e));
    await this.outbox.writeWithEvents(entities, (manager) => {
      const repository = manager.getRepository(ApiTokenOrmEntity);
      // Cast around TypeORM's `QueryDeepPartialEntity` recursion, which cannot
      // represent the jsonb array columns.
      return repository.insert(records as Parameters<typeof repository.insert>[0]);
    });
  }

  async save(entity: ApiTokenEntity): Promise<ApiTokenEntity> {
    const record = await this.outbox.writeWithEvents([entity], (manager) =>
      manager.getRepository(ApiTokenOrmEntity).save(this.mapper.toPersistence(entity)),
    );
    return this.mapper.toDomain(record);
  }

  async findOneById(id: string): Promise<Option<ApiTokenEntity>> {
    const record = await this.repository.findOneBy({ id });
    return record ? Some(this.mapper.toDomain(record)) : None;
  }

  async findOneByHash(tokenHash: string): Promise<Option<ApiTokenEntity>> {
    const record = await this.repository.findOneBy({ tokenHash });
    return record ? Some(this.mapper.toDomain(record)) : None;
  }

  async findByUserId(userId: string): Promise<ApiTokenEntity[]> {
    const records = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return records.map((record) => this.mapper.toDomain(record));
  }

  async insertWithinLimit(entity: ApiTokenEntity, limit: number, now: Date): Promise<boolean> {
    const record = this.mapper.toPersistence(entity);
    const inserted = await this.dataSource.transaction(async (manager) => {
      // One mint per owner at a time: a concurrent request waits on this lock
      // until the transaction commits, then counts the token it added.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `api_token:${entity.userId}`,
      ]);
      const repository = manager.getRepository(ApiTokenOrmEntity);
      const active = await repository.count({
        where: [
          { userId: entity.userId, revokedAt: IsNull(), expiresAt: IsNull() },
          { userId: entity.userId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        ],
      });
      if (active >= limit) return false;
      // Cast around TypeORM's `QueryDeepPartialEntity` recursion, which cannot
      // represent the jsonb array columns.
      await repository.insert(record as Parameters<typeof repository.insert>[0]);
      await this.outbox.stageEvents(manager, entity.domainEvents);
      return true;
    });
    if (inserted && entity.domainEvents.length > 0) {
      entity.clearEvents();
      await this.outbox.wake();
    }
    return inserted;
  }

  async touchLastUsedAt(id: string, at: Date): Promise<void> {
    await this.repository.update({ id: id as AggregateID }, { lastUsedAt: at });
  }

  async findAll(): Promise<ApiTokenEntity[]> {
    const records = await this.repository.find();
    return records.map((record) => this.mapper.toDomain(record));
  }

  async findAllPaginated(params: PaginatedQueryParams): Promise<Paginated<ApiTokenEntity>> {
    const [records, count] = await this.repository.findAndCount({
      skip: params.offset,
      take: params.limit,
      order: { createdAt: params.orderBy.param === 'asc' ? 'ASC' : 'DESC' },
    });
    return new Paginated({
      count,
      limit: params.limit,
      page: params.page,
      data: records.map((record) => this.mapper.toDomain(record)),
    });
  }

  async delete(entity: ApiTokenEntity): Promise<boolean> {
    const result = await this.outbox.writeWithEvents([entity], (manager) =>
      manager.getRepository(ApiTokenOrmEntity).delete({
        id: entity.id as AggregateID,
      }),
    );
    return result.affected ? result.affected > 0 : false;
  }

  transaction<T>(handler: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction(() => handler());
  }
}
