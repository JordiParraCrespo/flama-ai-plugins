import type { ErrorDefinition } from '@flama/frontend-core';

export const FeatureFlagsAdminErrors = {
  FETCH_LIST_FAILED: { code: 'FLAGS_CLIENT_001', message: 'Failed to fetch feature flags' },
  UPDATE_FAILED: { code: 'FLAGS_CLIENT_002', message: 'Failed to update the feature flag' },
  TOGGLE_FAILED: { code: 'FLAGS_CLIENT_003', message: 'Failed to switch the feature flag' },
  EVALUATE_FAILED: { code: 'FLAGS_CLIENT_004', message: 'Failed to explain the feature flag' },
  FETCH_SEGMENTS_FAILED: { code: 'FLAGS_CLIENT_005', message: 'Failed to fetch segments' },
  SAVE_SEGMENT_FAILED: { code: 'FLAGS_CLIENT_006', message: 'Failed to save the segment' },
  DELETE_SEGMENT_FAILED: { code: 'FLAGS_CLIENT_007', message: 'Failed to delete the segment' },
  FETCH_CHANGES_FAILED: { code: 'FLAGS_CLIENT_008', message: 'Failed to fetch flag history' },
} as const satisfies Record<string, ErrorDefinition>;
