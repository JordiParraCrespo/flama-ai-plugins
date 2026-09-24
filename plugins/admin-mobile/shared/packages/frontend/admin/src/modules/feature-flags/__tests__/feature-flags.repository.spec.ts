import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureFlagsApi = vi.hoisted(() => ({
  findFeatureFlags: vi.fn(),
  updateFeatureFlag: vi.fn(),
  toggleFeatureFlag: vi.fn(),
  evaluateFeatureFlag: vi.fn(),
  findFlagSegments: vi.fn(),
  createFlagSegment: vi.fn(),
  updateFlagSegment: vi.fn(),
  deleteFlagSegment: vi.fn(),
  findFlagChanges: vi.fn(),
}));

vi.mock('@flama/api-client', () => ({ FeatureFlagsApi: featureFlagsApi }));

const { FeatureFlagsAdminRepository } = await import('../feature-flags.repository');

function flagDto(overrides: Record<string, unknown> = {}) {
  return {
    key: 'api_token_creation',
    description: 'Allow users to create new personal API tokens.',
    kind: 'ops',
    owner: 'platform',
    type: 'boolean',
    variants: [],
    defaultValue: true,
    client: true,
    bucketBy: 'user',
    expiresAt: null,
    expired: false,
    config: null,
    ...overrides,
  };
}

describe('FeatureFlagsAdminRepository', () => {
  let repository: InstanceType<typeof FeatureFlagsAdminRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new FeatureFlagsAdminRepository();
  });

  it('reads an unconfigured flag as having no targeting', async () => {
    featureFlagsApi.findFeatureFlags.mockResolvedValue([flagDto()]);

    const [flag] = await repository.findAll();

    expect(flag).toMatchObject({ key: 'api_token_creation', targeting: null });
  });

  it('turns targeting timestamps into dates', async () => {
    featureFlagsApi.toggleFeatureFlag.mockResolvedValue(
      flagDto({
        config: {
          enabled: false,
          rules: [],
          fallthrough: { value: true },
          updatedBy: 'admin-1',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      }),
    );

    const flag = await repository.toggle('api_token_creation', {
      enabled: false,
      comment: 'incident 42',
    });

    expect(featureFlagsApi.toggleFeatureFlag).toHaveBeenCalledWith('api_token_creation', {
      enabled: false,
      comment: 'incident 42',
    });
    expect(flag.targeting?.enabled).toBe(false);
    expect(flag.targeting?.updatedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
  });

  it('reads the audit trail with dates and the paging meta', async () => {
    featureFlagsApi.findFlagChanges.mockResolvedValue({
      data: [
        {
          id: 'c1',
          subjectType: 'flag',
          subjectKey: 'api_token_creation',
          action: 'toggled',
          actorId: 'admin-1',
          comment: null,
          before: { enabled: true },
          after: { enabled: false },
          createdAt: '2026-09-01T10:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    const page = await repository.findChanges({ subjectKey: 'api_token_creation' });

    expect(page.data[0]?.createdAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(page.meta.total).toBe(1);
  });

  it('maps a failure onto the catalog error', async () => {
    featureFlagsApi.findFlagSegments.mockRejectedValue(new Error('boom'));
    await expect(repository.findSegments()).rejects.toMatchObject({ code: 'FLAGS_CLIENT_005' });
  });
});
