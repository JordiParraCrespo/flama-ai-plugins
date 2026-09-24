import {
  type FeatureFlagResponseDto,
  FeatureFlagsApi,
  type FlagChangeResponseDto,
  type FlagSegmentResponseDto,
} from '@flama/api-client';
import { AppError, MapApiError } from '@flama/frontend-core';
import type {
  CreateFlagSegmentInput,
  EvaluateFeatureFlagInput,
  FlagCondition,
  FlagRule,
  FlagServe,
  ToggleFeatureFlagInput,
  UpdateFeatureFlagInput,
  UpdateFlagSegmentInput,
} from '@flama/shared';
import { injectable } from 'inversify';
import type {
  FeatureFlag,
  FindFlagChangesParams,
  FlagChange,
  FlagChangePage,
  FlagExplanation,
  FlagSegment,
} from './feature-flag.entity';
import { FeatureFlagsAdminErrors } from './feature-flags.errors';

// The generated DTOs describe rules and conditions with the API's enum unions
// widened to `string` in places (hey-api's rendering of a Swagger enum array);
// the API validated every one of them on the way in, so they are narrowed back
// here, once.
function toFlag(data: FeatureFlagResponseDto): FeatureFlag {
  return {
    key: data.key,
    description: data.description,
    kind: data.kind,
    owner: data.owner,
    type: data.type,
    variants: data.variants,
    defaultValue: data.defaultValue,
    client: data.client,
    bucketBy: data.bucketBy,
    expiresAt: data.expiresAt,
    expired: data.expired,
    targeting: data.config
      ? {
          enabled: data.config.enabled,
          rules: data.config.rules as FlagRule[],
          fallthrough: data.config.fallthrough as FlagServe,
          updatedBy: data.config.updatedBy,
          updatedAt: new Date(data.config.updatedAt),
        }
      : null,
  };
}

function toSegment(data: FlagSegmentResponseDto): FlagSegment {
  return {
    key: data.key,
    name: data.name,
    description: data.description,
    conditions: data.conditions as FlagCondition[],
    usedBy: data.usedBy,
    updatedBy: data.updatedBy,
    updatedAt: new Date(data.updatedAt),
  };
}

function toChange(data: FlagChangeResponseDto): FlagChange {
  return {
    id: data.id,
    subjectType: data.subjectType,
    subjectKey: data.subjectKey,
    action: data.action as FlagChange['action'],
    actorId: data.actorId,
    comment: data.comment,
    before: data.before as Record<string, unknown> | null,
    after: data.after as Record<string, unknown> | null,
    createdAt: new Date(data.createdAt),
  };
}

/** The control-plane side of feature flags: `/v1/feature-flags/{admin,segments,changes}`. */
@injectable()
export class FeatureFlagsAdminRepository {
  @MapApiError(FeatureFlagsAdminErrors.FETCH_LIST_FAILED)
  async findAll(): Promise<FeatureFlag[]> {
    const data = await FeatureFlagsApi.findFeatureFlags();
    if (!data) throw new AppError(FeatureFlagsAdminErrors.FETCH_LIST_FAILED);
    return data.map(toFlag);
  }

  @MapApiError(FeatureFlagsAdminErrors.UPDATE_FAILED)
  async update(key: string, dto: UpdateFeatureFlagInput): Promise<FeatureFlag> {
    return toFlag(await FeatureFlagsApi.updateFeatureFlag(key, dto));
  }

  @MapApiError(FeatureFlagsAdminErrors.TOGGLE_FAILED)
  async toggle(key: string, dto: ToggleFeatureFlagInput): Promise<FeatureFlag> {
    return toFlag(await FeatureFlagsApi.toggleFeatureFlag(key, dto));
  }

  @MapApiError(FeatureFlagsAdminErrors.EVALUATE_FAILED)
  async evaluate(key: string, context: EvaluateFeatureFlagInput): Promise<FlagExplanation> {
    const data = await FeatureFlagsApi.evaluateFeatureFlag(key, context);
    return { ...data, reason: data.reason as FlagExplanation['reason'] };
  }

  @MapApiError(FeatureFlagsAdminErrors.FETCH_SEGMENTS_FAILED)
  async findSegments(): Promise<FlagSegment[]> {
    const data = await FeatureFlagsApi.findFlagSegments();
    if (!data) throw new AppError(FeatureFlagsAdminErrors.FETCH_SEGMENTS_FAILED);
    return data.map(toSegment);
  }

  @MapApiError(FeatureFlagsAdminErrors.SAVE_SEGMENT_FAILED)
  async createSegment(dto: CreateFlagSegmentInput): Promise<FlagSegment> {
    return toSegment(await FeatureFlagsApi.createFlagSegment(dto));
  }

  @MapApiError(FeatureFlagsAdminErrors.SAVE_SEGMENT_FAILED)
  async updateSegment(key: string, dto: UpdateFlagSegmentInput): Promise<FlagSegment> {
    return toSegment(await FeatureFlagsApi.updateFlagSegment(key, dto));
  }

  @MapApiError(FeatureFlagsAdminErrors.DELETE_SEGMENT_FAILED)
  async deleteSegment(key: string): Promise<void> {
    await FeatureFlagsApi.deleteFlagSegment(key);
  }

  @MapApiError(FeatureFlagsAdminErrors.FETCH_CHANGES_FAILED)
  async findChanges(params: FindFlagChangesParams = {}): Promise<FlagChangePage> {
    const data = await FeatureFlagsApi.findFlagChanges(params);
    if (!data) throw new AppError(FeatureFlagsAdminErrors.FETCH_CHANGES_FAILED);
    return { data: data.data.map(toChange), meta: data.meta };
  }
}
