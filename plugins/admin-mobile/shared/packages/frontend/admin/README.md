# @flama/frontend-admin

The control plane's domain, on top of the kernel. It holds what
`apps/admin-web` and `apps/admin-mobile` need and the consumer apps do not:
platform user lifecycle (create, update, ban, delete, sessions, passwords,
platform role), the database-backed roles and permissions, and operating
feature flags (targeting, kill switches, segments, the audit trail). Each module is
an entity, an error catalog, a repository over `@flama/api-client`, a service
and an InversifyJS `ContainerModule`; `src/react/` turns those services into
TanStack Query hooks. It is platform-free, and it never imports
`@flama/frontend-consumer`.

An app becomes the control plane by loading `adminModules` into
`FlamaApp.create({ modules })`.

## What it exports

`@flama/frontend-admin` (`src/index.ts`):

- **di** — `AdminApp`, `adminModules`, `TOKENS` (the kernel's spread, plus
  `AdminUsersRepository`, `AdminUsersService`, `RolesRepository`,
  `RolesService`, `FeatureFlagsAdminRepository`, `FeatureFlagsAdminService`).
- **modules/admin-users** — `AdminUserEntity`, `AdminSessionEntity`,
  `AdminUsersService`, `AdminUsersRepository`, `AdminUsersModule`,
  `AdminUsersErrors`, `AdminUsersListParams`.
- **modules/roles** — `RoleEntity` and the rest of `role.entity.ts`,
  `RolesService`, `RolesRepository`, `RolesModule`, `RolesErrors`.
- **modules/feature-flags** — `FeatureFlag`, `FlagSegment`, `FlagChange` and
  the rest of `feature-flag.entity.ts`, `FeatureFlagsAdminService`,
  `FeatureFlagsAdminRepository`, `FeatureFlagsAdminModule`,
  `FeatureFlagsAdminErrors`. Operating flags, as opposed to reading the
  caller's own, which is the kernel's `useFeatureFlag`.

`@flama/frontend-admin/react` (`src/react/index.ts`):

- `useAdminApp` — the product's services off the kernel container.
- Users: `useAdminUsers`, `useAdminUser`, `useCreateAdminUser`,
  `useUpdateAdminUser`, `useDeleteAdminUser`, `useBanAdminUser`,
  `useUnbanAdminUser`, `useSetAdminUserPassword`, `useSetPlatformRole`,
  `useAdminUserSessions`, `useRevokeAdminUserSessions`,
  `useAssignAdminUserRoles`, `adminUsersKeys`.
- Roles: `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`,
  `useUserRoles`, `useUsersRoles`, `useAssignUserRoles`,
  `useAuthorizationCatalog`, `rolesKeys`.
- Feature flags: `useManagedFeatureFlags`, `useUpdateFeatureFlag`,
  `useToggleFeatureFlag`, `useExplainFeatureFlag`, `useFlagSegments`,
  `useCreateFlagSegment`, `useUpdateFlagSegment`, `useDeleteFlagSegment`,
  `useFlagChanges`, `flagAdminKeys`. Every write also invalidates the kernel's
  `featureFlagKeys`, since the operator's own flags may have moved.

## How to use it

`apps/admin-web/src/features/admin-users/screens/users.tsx` lists users with
their roles:

```tsx
import type { AdminUserEntity } from '@flama/frontend-admin';
import { useAdminUsers, useRoles, useUsersRoles } from '@flama/frontend-admin/react';

const users = useAdminUsers({ search, limit: PAGE_SIZE, offset, sortBy, sortDirection });
const rows = users.data?.data ?? [];
const userRolesQueries = useUsersRoles(rows.map((user) => user.id));
```

`useAssignUserRoles` (`src/react/roles.queries.ts`) also invalidates
`MEMBER_LISTS_KEY` from `@flama/frontend-core/react`: a consumer member list
filtered by role is stale the moment a role changes hands, and that kernel
key is how the two products say so without importing each other.

## How to run it

```bash
pnpm --filter @flama/frontend-admin lint
pnpm --filter @flama/frontend-admin test
pnpm --filter @flama/frontend-admin arch
pnpm --filter @flama/frontend-admin build   # tsc -> dist, what the apps consume
```

## Depends on / used by

Depends on `@flama/frontend-core`, `@flama/api-client`, `@flama/shared` and
`inversify`. Used by `apps/admin-web` and `apps/admin-mobile`. The consumer
apps never load it — `one-product-per-app` fails if they do.
