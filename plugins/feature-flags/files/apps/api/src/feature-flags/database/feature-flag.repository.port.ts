import type { RepositoryPort } from '@flama/backend-ddd';
import type { Option } from 'oxide.ts';
import type { FeatureFlagEntity } from '../domain/feature-flag.entity';

/** Port for the flag-targeting aggregate. Implemented by `feature-flag.repository.ts`. */
export interface FeatureFlagRepositoryPort extends RepositoryPort<FeatureFlagEntity> {
  findOneByKey(key: string): Promise<Option<FeatureFlagEntity>>;
  /**
   * A cheap value that changes whenever any row is written or removed. Each
   * replica polls it to decide whether its in-memory snapshot is stale, so it
   * digests every row's content — two writes in the same millisecond, or a
   * rules-only change, still move it — in one query that returns one value.
   */
  fingerprint(): Promise<string>;
  /**
   * Run `work` while no other flag or segment write runs, on this replica or
   * any other. A write that checks something first — a toggle reading the
   * targeting it keeps, a segment deleted once no flag targets it — does both
   * inside, so what it checked cannot change before it commits.
   */
  serialized<T>(work: () => Promise<T>): Promise<T>;
}
