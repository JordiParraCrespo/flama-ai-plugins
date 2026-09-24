'use client';

import { featureFlagKeys } from '@flama/frontend-core/react';
import type {
  CreateFlagSegmentInput,
  EvaluateFeatureFlagInput,
  ToggleFeatureFlagInput,
  UpdateFeatureFlagInput,
  UpdateFlagSegmentInput,
} from '@flama/shared';
import {
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  FeatureFlag,
  FindFlagChangesParams,
  FlagChangePage,
  FlagExplanation,
  FlagSegment,
} from '../modules/feature-flags';
import { useAdminApp } from './context';

/**
 * Query keys for operating flags. A prefix of its own, apart from the kernel's
 * `featureFlags` — that one is the operator's *own* evaluated flags, which a
 * change here can also move, so a write invalidates both.
 */
export const flagAdminKeys = {
  all: ['flagAdmin'] as const,
  flags: () => [...flagAdminKeys.all, 'flags'] as const,
  segments: () => [...flagAdminKeys.all, 'segments'] as const,
  changes: (params?: FindFlagChangesParams) =>
    [...flagAdminKeys.all, 'changes', params ?? {}] as const,
  explain: (key: string, context: EvaluateFeatureFlagInput) =>
    [...flagAdminKeys.all, 'explain', key, context] as const,
};

/** After any write: the lists, the audit trail, and the operator's own flags. */
function invalidateAfterWrite(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: flagAdminKeys.all }),
    queryClient.invalidateQueries({ queryKey: featureFlagKeys.all }),
  ]);
}

/** Every flag in the catalog, with its targeting on this deployment. */
export function useManagedFeatureFlags(
  options?: Omit<UseQueryOptions<FeatureFlag[], Error>, 'queryKey' | 'queryFn'>,
) {
  const app = useAdminApp();
  return useQuery({
    queryKey: flagAdminKeys.flags(),
    queryFn: () => app.featureFlags.findAll(),
    ...options,
  });
}

export function useFlagSegments(
  options?: Omit<UseQueryOptions<FlagSegment[], Error>, 'queryKey' | 'queryFn'>,
) {
  const app = useAdminApp();
  return useQuery({
    queryKey: flagAdminKeys.segments(),
    queryFn: () => app.featureFlags.findSegments(),
    ...options,
  });
}

/** The audit trail, newest first. */
export function useFlagChanges(
  params?: FindFlagChangesParams,
  options?: Omit<UseQueryOptions<FlagChangePage, Error>, 'queryKey' | 'queryFn'>,
) {
  const app = useAdminApp();
  return useQuery({
    queryKey: flagAdminKeys.changes(params),
    queryFn: () => app.featureFlags.findChanges(params),
    ...options,
  });
}

/**
 * What a flag serves for a described caller, and why. Pass `null` for the
 * context until the operator has asked, so nothing is evaluated on mount.
 */
export function useExplainFeatureFlag(key: string, context: EvaluateFeatureFlagInput | null) {
  const app = useAdminApp();
  return useQuery({
    queryKey: flagAdminKeys.explain(key, context ?? {}),
    queryFn: (): Promise<FlagExplanation> => app.featureFlags.evaluate(key, context ?? {}),
    enabled: context !== null,
    // An explanation is about the configuration as it is now.
    staleTime: 0,
  });
}

export function useUpdateFeatureFlag(
  options?: UseMutationOptions<FeatureFlag, Error, { key: string; dto: UpdateFeatureFlagInput }>,
) {
  const app = useAdminApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, dto }) => app.featureFlags.update(key, dto),
    ...options,
    onSuccess: (...args) => {
      void invalidateAfterWrite(queryClient);
      options?.onSuccess?.(...args);
    },
  });
}

/** The kill switch. */
export function useToggleFeatureFlag(
  options?: UseMutationOptions<FeatureFlag, Error, { key: string; dto: ToggleFeatureFlagInput }>,
) {
  const app = useAdminApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, dto }) => app.featureFlags.toggle(key, dto),
    ...options,
    onSuccess: (...args) => {
      void invalidateAfterWrite(queryClient);
      options?.onSuccess?.(...args);
    },
  });
}

export function useCreateFlagSegment(
  options?: UseMutationOptions<FlagSegment, Error, CreateFlagSegmentInput>,
) {
  const app = useAdminApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto) => app.featureFlags.createSegment(dto),
    ...options,
    onSuccess: (...args) => {
      void invalidateAfterWrite(queryClient);
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateFlagSegment(
  options?: UseMutationOptions<FlagSegment, Error, { key: string; dto: UpdateFlagSegmentInput }>,
) {
  const app = useAdminApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, dto }) => app.featureFlags.updateSegment(key, dto),
    ...options,
    onSuccess: (...args) => {
      void invalidateAfterWrite(queryClient);
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteFlagSegment(options?: UseMutationOptions<void, Error, string>) {
  const app = useAdminApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key) => app.featureFlags.deleteSegment(key),
    ...options,
    onSuccess: (...args) => {
      void invalidateAfterWrite(queryClient);
      options?.onSuccess?.(...args);
    },
  });
}
