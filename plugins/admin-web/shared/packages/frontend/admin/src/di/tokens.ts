import { TOKENS as KERNEL_TOKENS } from '@flama/frontend-core';

/** DI tokens of the admin product, on top of the kernel's. */
export const TOKENS = {
  ...KERNEL_TOKENS,
  AdminUsersRepository: Symbol.for('AdminUsersRepository'),
  AdminUsersService: Symbol.for('AdminUsersService'),
  RolesRepository: Symbol.for('RolesRepository'),
  RolesService: Symbol.for('RolesService'),
  FeatureFlagsAdminRepository: Symbol.for('FeatureFlagsAdminRepository'),
  FeatureFlagsAdminService: Symbol.for('FeatureFlagsAdminService'),
} as const;
