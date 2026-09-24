import { FlamaProvider, featureFlagKeys } from '@flama/frontend-core/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TOKENS } from '../../di/tokens';
import {
  flagAdminKeys,
  useDeleteFlagSegment,
  useExplainFeatureFlag,
  useToggleFeatureFlag,
  useUpdateFeatureFlag,
} from '../feature-flags.queries';
import { fakeKernel } from './fake-kernel';

/**
 * A flag write changes two things the operator is looking at: the control
 * plane's lists and audit trail, and — because they are a user too — their own
 * evaluated flags. Missing the second leaves the control plane itself running
 * on the flags from before the change until the next refocus.
 */
function setup() {
  const featureFlags = {
    findAll: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ key: 'api_token_creation' }),
    toggle: vi.fn().mockResolvedValue({ key: 'api_token_creation' }),
    evaluate: vi
      .fn()
      .mockResolvedValue({ key: 'api_token_creation', value: true, reason: 'DEFAULT' }),
    deleteSegment: vi.fn().mockResolvedValue(undefined),
  };
  const app = fakeKernel({ [TOKENS.FeatureFlagsAdminService]: featureFlags });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FlamaProvider app={app}>{children}</FlamaProvider>
      </QueryClientProvider>
    );
  }

  return { wrapper, featureFlags, invalidate };
}

describe('flag writes', () => {
  it('pulling a kill switch refreshes the lists, the history and the operator’s own flags', async () => {
    const { wrapper, featureFlags, invalidate } = setup();
    const { result } = renderHook(() => useToggleFeatureFlag(), { wrapper });

    result.current.mutate({
      key: 'api_token_creation',
      dto: { enabled: false, comment: 'incident' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(featureFlags.toggle).toHaveBeenCalledWith('api_token_creation', {
      enabled: false,
      comment: 'incident',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: flagAdminKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: featureFlagKeys.all });
  });

  it('saving targeting does the same', async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUpdateFeatureFlag(), { wrapper });

    result.current.mutate({
      key: 'api_token_creation',
      dto: { enabled: true, rules: [], fallthrough: { value: true } },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: featureFlagKeys.all });
  });

  it('deleting a segment does too', async () => {
    const { wrapper, featureFlags, invalidate } = setup();
    const { result } = renderHook(() => useDeleteFlagSegment(), { wrapper });

    result.current.mutate('beta');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(featureFlags.deleteSegment).toHaveBeenCalledWith('beta');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: flagAdminKeys.all });
  });
});

describe('useExplainFeatureFlag', () => {
  it('evaluates nothing until the operator has described someone', async () => {
    const { wrapper, featureFlags } = setup();
    const { result, rerender } = renderHook(
      ({ context }: { context: { userId?: string } | null }) =>
        useExplainFeatureFlag('api_token_creation', context),
      { wrapper, initialProps: { context: null as { userId?: string } | null } },
    );

    expect(featureFlags.evaluate).not.toHaveBeenCalled();

    rerender({ context: { userId: 'u1' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(featureFlags.evaluate).toHaveBeenCalledWith('api_token_creation', { userId: 'u1' });
  });
});
