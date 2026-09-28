---
name: frontend-audit
description: Audit the frontend apps (apps/web, apps/mobile) and the frontend packages (packages/frontend/*) against the frontend architecture, UI, forms and render rules, including re-renders the React Compiler does not prevent. Use when asked to audit, review or health-check the frontend, check that the frontend architecture is being followed, or look for unnecessary re-renders or render cost. Runs the mechanical checks, then reviews what they cannot see, and reports. It changes no code.
---

# Frontend audit

A review, not a fixer: it reads, runs the checks and writes a report. It edits
no file, commits nothing, opens no issue and no pull request. Fixing a finding
is a separate task a person asks for.

The rules are the repository's, and this skill adds none:

- `.agents/rules/frontend-architecture.md`: placement, imports, the render
  rules, routing
- `.agents/rules/frontend-ui.md`: the design system, colour, translation, e2e
- `.agents/rules/forms.md`
- `packages/frontend/design-system/AGENTS.md` and each app's `AGENTS.md`

Read them before reviewing any code. A finding cites the rule it breaks by
file and heading, or by the bold lead sentence of a render rule
(`frontend-architecture.md › Subscribe at the leaf`). If you cannot point at
the sentence, it is not a finding.

The apps are whichever of `apps/web` and `apps/mobile` the project kept, and
their kits and design systems; an app a prune removed is out of scope, and so
is a check that went with it. Apps a plugin added (`apps/admin-web`,
`apps/admin-mobile`, `packages/frontend/admin`) are in scope when present,
audited like their consumer twin. With neither app present there is nothing
to audit; say so and stop.

## Arguments

- `full`: every app's source and `packages/frontend/*/src`.
- `diff --base <ref>`: only the frontend files changed since `<ref>`
  (`git diff --name-only <ref>...HEAD -- apps packages/frontend`), plus the
  files that render them or that they render when a finding depends on that.

With no argument, use `diff --base origin/main` when the branch has changes,
and `full` otherwise.

## Step 1: the mechanical checks

Run each and record a failure as a finding under **Checks**. Quote the
check's output; do not re-diagnose it by hand.

| Check | Command |
| --- | --- |
| structure | `pnpm check:structure` |
| boundaries | `pnpm arch` (through Turborepo, which builds the workspace packages first; plain `depcruise` on a fresh checkout cannot resolve `@flama/*` and its errors are false) |
| Biome | `pnpm exec biome lint --error-on-warnings <the frontend directories that exist>` |
| design system | `pnpm lint:design` (rules at `warn` are counts to watch; report one that went up) |
| compiler | `pnpm check:compiler` (fails on a bailout outside `scripts/check-react-compiler.baseline.mjs`; judge each new one against the render rules) |
| render budgets | `pnpm turbo run test` filtered to the frontend apps and kits present (the `*-render.spec.tsx` budgets run there) |
| bundle | `pnpm --filter @flama/web build && pnpm check:bundle` (`full` only; web only) |

If `node_modules` is missing, run `pnpm install --frozen-lockfile` first. A
check that cannot run is reported as such with the reason, never skipped
silently: `check:compiler` exits 2 when an app's compiler is not installed,
which is "could not run", not a pass.

## Step 2: the review

The scripts already reject wrong directories, forbidden imports, `useEffect`
outside `hooks/`, manual memo imports, nested component definitions, raw
colours, a query subscribed to for a single child in the obvious shapes, and a
route file over its cap. **Do not report those again**, unless the script
missed a case; then say which script missed it.

### Render cost

For each component in scope, answer these before looking for a rule to cite:

1. **Which clocks update it?** A keystroke, a hover or press, an open/close, a
   query settling or refetching on focus (or on foreground on mobile), a
   socket message, a timer, a route change, a parent's render.
2. **Where does the state for each clock live?** Is that the lowest component
   that reads it?
3. **On each tick, what re-renders that does not need to?** Count it: "every
   keystroke re-renders 8 rows × 5 cells".
4. **Would the React Compiler prevent it?** Usually not, and the finding
   stands.

The render rules in `frontend-architecture.md` say what the compiler does and
does not do; the short version, for judging a finding:

- It memoises inside a component, so a child whose props did not change is
  skipped. It cannot move state held too high, stabilise a value that really
  changes on every tick (a controlled input value, a context holding a fast
  clock), or narrow a subscription (`useWatch()` without `name`, `watch()`,
  `formState` read at the top of a form, a query without `select`).
- It gives up silently on some functions; `pnpm check:compiler` lists them,
  and a baselined bailout on a fast clock is still worth a finding.
- It caches a render that reads `Date.now()`, `new Date()` or
  `Math.random()`, so a relative time stops moving: a correctness bug. A
  clock that is read correctly can still be in the wrong place: one timer per
  row instead of one for the list.
- An entity query on a plain `useQuery` instead of `useEntityQuery` hands
  every reader a new object per row on each refetch, and every memo keyed on
  one misses.

The render budgets run with the compiler **off** on purpose: they measure the
component's shape. A profiler with the compiler on will not show any of this.

Where a generic hook already exists (a debounce, a controlled/uncontrolled
pair, a ticking clock), hand-rolling it is a finding against the render rule
that names where those hooks live; read that rule for the current package
rather than assuming one.

### UI

Run this pass on every file in scope that returns JSX, even when the render
questions came up empty:

1. **Design system first.** Read the app's design-system barrel in full, the
   "Reach for the design system" table in `frontend-ui.md` and the kit's own
   components. A `div`/`View` styled as a callout, an empty state, a badge or
   a chip where one ships is a finding even when every class is a token:
   `lint:design` checks classes, not what the markup builds. A `role="alert"`
   on a hand-built box is the tell.
2. **Every string the user can read goes through `t()`**, `aria-label`,
   `accessibilityLabel`, `placeholder`, `title` and CSV headers included.
3. **Colour the linter cannot see** (an inline `style`, a `dark:` override),
   **forms** against `forms.md`, and the rest of `frontend-ui.md` for web.

### Evidence bar

Report a render finding only when you can state the clock, where its state
lives, what re-renders on each tick (with a count where you can get one), and
the fix. "This could re-render" is not a finding. When a code comment argues
for the shape (the rules name deliberate exceptions, such as a `rowActions`
dialog's open state living in the table), report it only if the argument is
wrong, and say why.

Prefer a missed finding to a wrong one. Anything you are unsure of goes under
**Worth a look** with one line on why, never under **Findings**. A rule that
seems wrong or unenforceable as written is not a finding against the code:
list it under **Rules to revisit**.

## Output

```markdown
## Frontend audit — <YYYY-MM-DD> (<full | diff base <ref>>, HEAD <sha>)

### Checks
structure ✅/❌ · boundaries ✅/❌ · Biome ✅/❌ · design system ✅/❌ · compiler ✅/❌ · render budgets ✅/❌ · bundle ✅/❌/— (one line of output per failure)

### Findings
| Severity | Rule | Where | What | Fix |
| --- | --- | --- | --- | --- |
| high | frontend-architecture.md › Subscribe at the leaf | `path:line` (`Symbol`) | the clock and what it re-renders or breaks | one sentence |

### Worth a look
### Rules to revisit
```

Highest cost first. `high` is a failing check, or a list or a whole screen
re-rendering on a fast clock; `medium` a real rule break with a bounded cost;
`low` a rule break with no measurable cost today, including one the compiler
happens to make free (it bails out silently, and the next edit can bring the
cost back). Name the component or function beside the line, so a reader can
find it after an edit above it.
