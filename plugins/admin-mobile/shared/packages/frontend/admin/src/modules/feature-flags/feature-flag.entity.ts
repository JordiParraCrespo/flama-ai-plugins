import type {
  FlagBucketUnit,
  FlagCondition,
  FlagKind,
  FlagRule,
  FlagServe,
  FlagValue,
} from '@flama/shared';

/** A flag's targeting on this deployment, as the control plane edits it. */
export interface FeatureFlagTargeting {
  enabled: boolean;
  rules: FlagRule[];
  fallthrough: FlagServe;
  updatedBy: string | null;
  updatedAt: Date;
}

/**
 * A catalog flag joined to its targeting. The definition half is read-only
 * here — it lives in code — and `targeting` is `null` until someone saves
 * any, which means the flag serves its default.
 */
export interface FeatureFlag {
  key: string;
  description: string;
  kind: FlagKind;
  owner: string;
  type: 'boolean' | 'variant';
  /** Empty for a boolean flag. */
  variants: string[];
  defaultValue: FlagValue;
  client: boolean;
  bucketBy: FlagBucketUnit;
  expiresAt: string | null;
  /** A temporary flag past its date: it should be deleted from the code. */
  expired: boolean;
  targeting: FeatureFlagTargeting | null;
}

/** A named audience rules can target. */
export interface FlagSegment {
  key: string;
  name: string;
  description: string | null;
  conditions: FlagCondition[];
  /** Flags whose rules target it — it cannot be deleted while this is non-empty. */
  usedBy: string[];
  updatedBy: string | null;
  updatedAt: Date;
}

export type FlagChangeAction =
  | 'targeting_updated'
  | 'toggled'
  | 'segment_created'
  | 'segment_updated'
  | 'segment_deleted';

/** One entry on the audit trail. */
export interface FlagChange {
  id: string;
  subjectType: 'flag' | 'segment';
  subjectKey: string;
  action: FlagChangeAction;
  actorId: string | null;
  comment: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
}

export interface FlagChangePage {
  data: FlagChange[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface FindFlagChangesParams {
  subjectType?: 'flag' | 'segment';
  subjectKey?: string;
  page?: number;
  limit?: number;
}

/** What a flag served in an "explain", and why. */
export interface FlagExplanation {
  key: string;
  value: FlagValue;
  reason: 'DEFAULT' | 'DISABLED' | 'TARGETING_MATCH' | 'SPLIT' | 'FALLTHROUGH' | 'ERROR';
  ruleId?: string;
}
