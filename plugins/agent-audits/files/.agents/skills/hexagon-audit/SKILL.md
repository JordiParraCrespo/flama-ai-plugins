---
name: hexagon-audit
description: Review the NestJS API (apps/api) against its Domain-Driven Hexagon contract, for what the structure check and dependency-cruiser cannot see — a command returning a read model, a query that writes, a controller with logic, a bare Nest exception, an event that skips the outbox. Use when asked to audit, review or health-check the API's architecture, a module, or a branch's API changes. Runs the mechanical checks, reviews the changed files (or one module) against a checklist taken from the rules, and reports. It changes no code.
---

# Hexagon audit

A review, not a fixer: steps 1–5 read, and step 6 writes a report. It edits no
file, commits nothing, opens no issue and no pull request. Fixing a finding is
a separate task a person asks for.

The contract is the repository's, not yours. The sources, in order of
authority:

1. `apps/api/ARCHITECTURE.md`
2. `.agents/rules/nestjs-architecture.md`, `.agents/rules/nestjs-di.md`,
   `.agents/rules/typeorm.md`
3. `apps/api/AGENTS.md`

Read them before reviewing any code. A finding quotes the sentence it breaks
from one of them. General DDD opinions and "I would have done it differently"
are not findings.

## Arguments

- `--base <ref>`: review the API files changed since `<ref>`. Default:
  `origin/main` when the branch has changes.
- `--module <name>`: review one whole module under `apps/api/src/`, changed or
  not.

Both may be given. With neither and no changes on the branch, ask which
module to review.

## 1. Mechanical checks

```bash
pnpm check:api-structure
pnpm turbo run arch --filter=@flama/api
pnpm --filter @flama/api exec vitest run src/__tests__/route-policy-coverage.spec.ts
```

**Run `arch` through `turbo`.** Plain `pnpm --filter @flama/api arch` on a
fresh checkout reports `domain-stays-pure … → @flama/backend-ddd` errors
because the workspace packages have no `dist/` yet. Those are false; do not
report them.

Any failure is a **blocking** finding. Quote it, trimmed to the violating
lines; do not re-derive it by reading code. With the `docs` plugin installed,
a new error code also needs its row in `apps/docs/docs/errors.md` ("A new code
needs four things" in `nestjs-architecture.md`).

## 2. Ledger drift

Known violations are ledgered in `LEDGER` in `scripts/check-api-structure.mjs`
and in every `pathNot` list in `apps/api/.dependency-cruiser.cjs` that names a
specific file ("Ledger entries" in `ARCHITECTURE.md`: known violations, not
exemptions). Diff both against the base. An **added** entry is blocking,
because it silences a rule; name the commit that added it. A **removed** entry
goes under "Paid down".

Nothing already ledgered is a new finding, unless the code under the entry got
worse (a new route on a controller already ledgered as outside a slice).

## 3. Scope

- With `--base`: every file under `apps/api/src/**` and
  `packages/backend/ddd/src/**` changed since the base, skipping `*.spec.ts`,
  `migrations/` and generated files.
- With `--module`: every file in that module.

## 4. Checklist

What the scripts in step 1 cannot see. Check each file against the rows for
its layer; each row names where the rule is written.

| Key | Applies to | Rule (and where it is written) |
| --- | --- | --- |
| `HEX-CMD-RETURN` | `*.command-handler.ts` | A command handler returns only the aggregate id, or nothing — never an entity, a DTO or a read model; the controller dispatches a follow-up query. Per-request data no query could read back may ride beside the id (api-tokens' one-time `secret`). (nestjs-architecture.md, "CQRS command/query handlers") |
| `HEX-QUERY-WRITE` | `*.query-handler.ts` | Queries are read-only: no writes, no dispatched commands, no events. (same) |
| `HEX-THIN-CONTROLLER` | `*.http.controller.ts` | No business logic: it dispatches on `CommandBus`/`QueryBus` and maps the result. Branching on domain state, computing values, looping over domain data, calling another injected service, or catching and translating domain errors is a finding. (ARCHITECTURE.md, "Controller") |
| `HEX-MAPPER-OWNS-SHAPE` | handlers, `application/`, controllers | Field-by-field translation between representations lives in the mapper. A hand-assembled literal of three or more fields copied from another shape, or `as unknown as` / repeated `as Record<…>` outside a mapper, is a finding. (nestjs-architecture.md, "Mapper"; apps/api/AGENTS.md) |
| `HEX-ENCAPSULATION` | everything outside `domain/` | Aggregate state changes only through the entity's own methods; writing to `props`, to `getProps()`'s result or to a public field from outside is a finding (a mapper's `toDomain` construction excepted). (ARCHITECTURE.md, "Domain entity / aggregate") |
| `HEX-ALWAYS-VALID` | `domain/*.entity.ts`, value objects | Invariants live in `validate()` or the value-object constructor, and a state change keeps the entity valid. A subclass redeclaring `_id` or another base field is forbidden. (nestjs-architecture.md, "Domain layer") |
| `HEX-EVENTS` | `domain/`, `database/*.repository.ts` | The aggregate raises events with `addEvent(...)`; the repository stages them with `OutboxService.stageEvents` inside the write's transaction. Emitting on `EventEmitter2` directly, or staging outside the transaction, is a finding. (nestjs-architecture.md, "Event-driven async processing") |
| `HEX-PORT-OPTION` | `*.repository.port.ts`, `*.port.ts` | Single-row lookups return `Option<T>` from `oxide.ts`, not `T \| null`. (nestjs-architecture.md, "Repository ports & adapters") |
| `HEX-PORT-INJECTION` | handlers, `application/` | A port is injected through its `Symbol` DI token and typed as the port, never as the adapter. (nestjs-di.md) |
| `HEX-ERRORS` | anything that can answer HTTP | Throw `AppError` with a catalog entry: no bare Nest exception, no guard returning `false`, no request data interpolated into `message` (it goes in `detail`), no upstream error passed through unmapped. A plain `Error` only on paths that never answer HTTP. (nestjs-architecture.md, "Structured errors (RFC 7807)") |
| `HEX-LEGACY-SHAPE` | `admin/`, `organizations/` (when kept) | No new route or public service method in the old shape; new operations go in as slices. (apps/api/AGENTS.md, "Delegating façades") |
| `HEX-USE-CASE-LEAK` | `application/`, `infrastructure/` | An operation a user triggers that loads an aggregate, changes it and saves it belongs in a `commands/` slice. (ARCHITECTURE.md, "The module contract") |

Out of scope, because other tools own them: formatting and lint, file
placement and naming, import boundaries, Swagger completeness, test coverage,
performance.

## 5. Verify before reporting

For every candidate, re-open the file and confirm:

1. The line exists at the path and line you cite.
2. You can quote the rule sentence it breaks.
3. It is not ledgered (step 2) and not already reported by step 1.
4. It is not a commented, explicit exception (the seed script reaching Better
   Auth directly is documented in `.dependency-cruiser.cjs`).

Drop anything that fails. Unsure goes under "Worth a look" with one line on
why, never under "Findings"; something verified as allowed goes nowhere.

- **One pattern, one row.** The same violation across several files is one
  finding with every occurrence in the evidence.
- **Systemic.** A pattern in three or more modules is the codebase's
  convention, not one file's lapse: report it once, as drift, and say the
  rule and the code disagree.
- **Rule against reference.** If `users/` (the module `ARCHITECTURE.md` says
  to copy) does what a rule forbids, report it nowhere; put one line under
  "Worth a look" naming the rule and the file, since one of them has to move.

## 6. Report

**blocking** breaks a rule in a way that changes behaviour or the contract (a
command returning a read model, a query that writes, a bare Nest exception, an
event that bypasses the outbox, a ledger addition, a new legacy-shape route);
**drift** breaks its letter without changing behaviour, or is heading there.

```markdown
## Hexagon audit — <YYYY-MM-DD> (base <ref> | module <name>, HEAD <sha>)

**Mechanical:** structure ✅/❌ · boundaries ✅/❌ · route policies ✅/❌
**Ledger:** <+added / −removed> since base

### Findings
| Sev | Key | Where | What | Fix |
| --- | --- | --- | --- | --- |
| blocking | HEX-CMD-RETURN | `path:line` (`Class.method`) | one sentence, quoting the code | one sentence |

<details><summary>Evidence</summary>
Per finding: the offending lines (≤8) and the rule sentence, with its source.
</details>

### Worth a look
### Paid down
```
