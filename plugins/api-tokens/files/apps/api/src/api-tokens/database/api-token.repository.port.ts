import type { RepositoryPort } from '@flama/backend-ddd';
import type { Option } from 'oxide.ts';
import type { ApiTokenEntity } from '../domain/api-token.entity';

/**
 * Port for persisting and querying the API token aggregate. Implemented by the
 * TypeORM adapter in `api-token.repository.ts`.
 */
export interface ApiTokenRepositoryPort extends RepositoryPort<ApiTokenEntity> {
  /** Look a token up by the SHA-256 digest of the presented secret. */
  findOneByHash(tokenHash: string): Promise<Option<ApiTokenEntity>>;

  /** Every token belonging to a user, newest first, including revoked ones. */
  findByUserId(userId: string): Promise<ApiTokenEntity[]>;

  /**
   * Insert the token unless its owner already holds `limit` usable ones (not
   * revoked, not expired at `now`). The count and the insert are one step: two
   * requests near the limit cannot both see room and both insert. Resolves
   * whether it inserted.
   */
  insertWithinLimit(token: ApiTokenEntity, limit: number, now: Date): Promise<boolean>;

  /**
   * Record a successful authentication without loading and saving the whole
   * aggregate — this runs on every request, so it stays a single UPDATE.
   */
  touchLastUsedAt(id: string, at: Date): Promise<void>;
}
