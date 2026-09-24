import type {
  CreateFlagSegmentInput,
  EvaluateFeatureFlagInput,
  ToggleFeatureFlagInput,
  UpdateFeatureFlagInput,
  UpdateFlagSegmentInput,
} from '@flama/shared';
import { inject, injectable } from 'inversify';
import { TOKENS } from '../../di/tokens';
import type {
  FeatureFlag,
  FindFlagChangesParams,
  FlagChangePage,
  FlagExplanation,
  FlagSegment,
} from './feature-flag.entity';
import type { FeatureFlagsAdminRepository } from './feature-flags.repository';

/**
 * Operating feature flags: targeting, kill switches, segments and the audit
 * trail. Distinct from the kernel's `FeatureFlagsService`, which *reads* the
 * caller's own evaluated flags — this one changes what everybody gets.
 */
@injectable()
export class FeatureFlagsAdminService {
  constructor(
    @inject(TOKENS.FeatureFlagsAdminRepository)
    private readonly repository: FeatureFlagsAdminRepository,
  ) {}

  findAll(): Promise<FeatureFlag[]> {
    return this.repository.findAll();
  }

  update(key: string, dto: UpdateFeatureFlagInput): Promise<FeatureFlag> {
    return this.repository.update(key, dto);
  }

  toggle(key: string, dto: ToggleFeatureFlagInput): Promise<FeatureFlag> {
    return this.repository.toggle(key, dto);
  }

  evaluate(key: string, context: EvaluateFeatureFlagInput): Promise<FlagExplanation> {
    return this.repository.evaluate(key, context);
  }

  findSegments(): Promise<FlagSegment[]> {
    return this.repository.findSegments();
  }

  createSegment(dto: CreateFlagSegmentInput): Promise<FlagSegment> {
    return this.repository.createSegment(dto);
  }

  updateSegment(key: string, dto: UpdateFlagSegmentInput): Promise<FlagSegment> {
    return this.repository.updateSegment(key, dto);
  }

  deleteSegment(key: string): Promise<void> {
    return this.repository.deleteSegment(key);
  }

  findChanges(params?: FindFlagChangesParams): Promise<FlagChangePage> {
    return this.repository.findChanges(params);
  }
}
