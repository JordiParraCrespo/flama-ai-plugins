---
sidebar_position: 7
---

# Feature flags

Flags are **declared in code, targeted in the database, evaluated on the
server, and read on every client from one endpoint.** That is the shape Stripe
and Revolut describe for their own systems: every API process holds all flags
in memory and evaluates without I/O; clients get evaluated values, never the
rules; turning a feature off is a data change, not a deploy.

```
FEATURE_FLAGS (code)  ──►  API: targeting + segments (Postgres, in memory)
                              │  evaluate(key, user, org, platform, build)
                              ├──►  GET /v1/feature-flags   ──►  web, mobile
                              └──►  @RequireFlag('key') on routes
```

## Declaring a flag

Every flag lives in one place, `packages/shared/src/feature-flags/catalog.ts`:

```ts
export const FEATURE_FLAGS = {
  new_checkout: {
    description: 'The single-page checkout.',
    kind: 'release',          // release | ops | experiment
    owner: 'payments',
    expiresAt: '2026-12-01',  // required for release and experiment
    type: 'boolean',
    defaultValue: false,      // the safe answer
    client: true,             // may clients read it?
  },
} as const satisfies Record<string, FlagDefinition>;
```

- **`kind`** says how long it may live. `release` hides unfinished work,
  `experiment` splits traffic between variants, and both are temporary: once
  `expiresAt` passes, `pnpm check:flags` fails CI. `ops` is a permanent kill
  switch or knob.
- **`defaultValue`** is what everyone gets before targeting is saved and
  whenever the flag service cannot answer. `false` for a new feature; `true`
  for a kill switch over something already live.
- **Readers are typed against the catalog.** A typo is a compile error, and
  deleting a flag breaks every reader the compiler then names.
  `pnpm check:flags` also fails on a flag nothing reads.

## Reading a flag

```tsx
import { useFeatureFlag, useFeatureFlagValue } from '@flama/frontend-core/react';

function Checkout() {
  const newCheckout = useFeatureFlag('new_checkout');
  return newCheckout ? <NewCheckout /> : <LegacyCheckout />;
}

// Multivariate: typed as the flag's variants
const copy = useFeatureFlagValue('checkout_copy'); // 'control' | 'bold'
```

Until flags load — and if they never do — a read returns the catalog default.
The flags query is prefetched as soon as the session is known, persisted with
the rest of the query cache (so a cold start renders last-known values, offline
too), and refetched when the window regains focus or the app returns to the
foreground. A failed refetch keeps the last good answer rather than reverting
to defaults.

For a flow that must not change under the user's feet — a checkout, a transfer,
a multi-step form — read it sticky:

```ts
const newCheckout = useFeatureFlag('new_checkout', { sticky: true });
```

**Gate the capability on the server too.** Hiding a button is not a rollout:

```ts
@Post()
@RequireFlag('new_checkout')   // FLAG_003 while it is off for the caller
create() {}
```

Anywhere else in the API, inject the evaluator:

```ts
constructor(@Inject(FLAG_EVALUATOR) private readonly flags: FlagEvaluatorPort) {}
```

## Targeting

A flag's targeting on a deployment is a master switch, an ordered list of rules
(the first whose conditions all hold decides) and a fallthrough for everyone
else. Each rule serves one value or a percentage split.

| Condition | Operators |
| --- | --- |
| `userId`, `organizationId`, `role` | is one of / is not one of |
| `email` | … / ends with (`@acme.com` for staff) |
| `platform` | `web`, `ios`, `android` |
| `appVersion` | at least / below a semver — old app builds stay installed for years |
| `segment` | in / not in a named segment |

- **Off means off.** A disabled flag serves `false` (or its default variant),
  whatever `defaultValue` says — which is what lets a kill switch whose default
  is `true` go dark.
- **Splits are deterministic**: MurmurHash3 over the flag key, a per-flag salt
  and the unit, bucketed by **organization** so a whole workspace sees the same
  product (`bucketBy: 'user'` to change it). A caller the split cannot bucket —
  an anonymous visitor — gets the default.
- **Segments** are reusable audiences (`staff`, `beta-customers`) where long ID
  lists live. A segment a rule still targets cannot be deleted.

## Operating flags

The control plane (`admin-web` plugin) lists every flag with what it is serving,
flips kill switches with a required confirmation and reason, edits targeting,
manages segments, **explains** what a flag serves any described caller and why,
and shows the audit trail. The same operations are REST endpoints under
`/v1/feature-flags/admin`, `/segments` and `/changes` (scope `flags:read` /
`flags:write`, subject `FeatureFlag`), and MCP tools for agents.

Every change — targeting, a toggle, a segment — is written to the audit trail
through the transactional outbox with the actor, their comment and the
before/after. The replica that made a change applies it at once; every other
replica within 15 seconds, by polling a cheap fingerprint of the tables. A
database outage keeps each replica on its last good snapshot: a pulled kill
switch stays pulled.

## What is not a flag

- **Entitlement.** Who may use a feature is a role or a plan, not a flag.
- **Deployment capabilities.** Whether S3 is configured is `CapabilitiesService`.
- **Remote config.** Copy, limits and endpoints for the mobile app are the
  `ConfigManager` document — untargeted and unaudited.
- **Analytics.** PostHog is for events; its own flags are switched off.
