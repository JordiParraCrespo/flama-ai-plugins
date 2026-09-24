# flama-ai-plugins

Optional pieces of [Flama](https://github.com/JordiParraCrespo/flama-ai) that
the starter deliberately does not ship, packaged so a project can add them back.

```bash
# in your Flama project
pnpm plugin:list
pnpm plugin:add    cli
pnpm plugin:remove cli
```

| Plugin | What it adds |
|---|---|
| `cli` | `apps/cli` — the `flama` command-line interface, driven by scoped API tokens |
| `docs` | `apps/docs` — the Docusaurus site |
| `admin-web` | `apps/admin-web` — the Vite control plane for users, roles, permissions and feature flags |
| `admin-mobile` | `apps/admin-mobile` — the Expo control plane |
| `qa` | `qa/` — the scenario-driven Playwright QA pack (requires `admin-web`) |
| `billing` | `apps/api/src/billing` — Stripe subscriptions: checkout, customer portal, webhooks, revenue metrics |

## The idea

Flama prunes. `scripts/starter/prune.mjs` ships every app the starter knows how
to build and takes out what a project does not want. A plugin is that in
reverse, and the two halves are deliberately the same machine:

- A plugin **is** a feature entry. Installing writes it into `features.json`,
  the starter's own manifest, marked `"plugin": true`. There is one catalog, so
  from that moment the honesty check covers the plugin and
  `starter:prune --without <id>` removes it.
- **Removal is the pruner.** `plugin:remove` shells out to `prune.mjs`. There is
  no second implementation of "take this feature out" to keep in step, so the
  uninstall path is as tested as the prune path has always been.
- Plugins are **generated, not written**. `scripts/extract.mjs` runs a real
  prune against a scratch copy of the starter, and whatever the prune removed
  *is* the plugin. Nothing is transcribed by hand, so nothing drifts.

Installed source becomes your code. There is no npm package, no version range
and no upgrade command — Flama's own packages are all `private: true`, and a
plugin is the same deal as the starter itself.

`list` and `add` fetch this repository themselves — a depth-1 clone into a
temporary directory, discarded when the command ends — so a project needs no
checkout of it sitting alongside:

```bash
pnpm plugin:add cli --ref v0.3.0              # a branch, a tag or a commit
pnpm plugin:add cli --repo <url>              # a fork
pnpm plugin:add cli --from ../flama-ai-plugins # a checkout you already have
```

`--from` is what this repo's own harnesses use, and the offline route.
`plugin:remove` fetches nothing: it is the pruner, running against the project.

## What a plugin holds

```
plugins/cli/
├── plugin.json              the feature entry, the files, the blocks
├── files/…                  every path the feature owned, copied whole
└── blocks/
    ├── _env_example.txt     a marked block, verbatim, fences included
    └── co-owned/…           blocks shared with features that stay behind
```

Three kinds of thing, because a feature is three kinds of thing:

**Files** are copied whole — `apps/cli`, its docs page. Directories stay
directories and symlinks stay symlinks (every `CLAUDE.md` in Flama is a link to
the `AGENTS.md` beside it).

**Blocks** are the lines a feature contributes to files it does not own: its
`.env.example` section, its entry in the docs sidebar. They are stored verbatim,
fences and indentation included, and inserted immediately above a
`# flama:plugins <slot>` anchor in the host repo. Verbatim because the comment
syntax and indentation belong to the file the block lands in; reconstructing
them would mean guessing, and guessing wrong is a diff that looks like the
plugin edited code it does not own.

**Co-owned blocks** are the awkward ones. `flama:begin mcp|cli` belongs to both
features: it survives while either remains, and the pruner narrows the spec to
whoever is left. So the plugin cannot delete and restore it — it stores the
widened form and swaps it for the narrowed one on install.

## Proving a plugin

```bash
node scripts/roundtrip.mjs            # every plugin
node scripts/roundtrip.mjs cli --repo ../flama-ai
```

For each plugin, against a scratch copy of a real Flama checkout:

1. Run the host repo's checks on the starter as it ships.
2. `plugin:add` — then run them again, now covering the plugin.
3. `plugin:remove`.
4. **Require the tree to be byte-identical to step 1.**

That last assertion is the whole test. A missing file, a block one line off, an
anchor that drifted, a manifest entry that reformatted the file it landed in —
all of them show up as a diff, and none of them need a working `node_modules`
to catch. The heavier checks (`tsc`, `vitest`, `pnpm build`) belong to the host
repo's CI, which runs them on the plugin's files once installed.

Two things are excluded from the comparison, deliberately and visibly:
`.changeset/` and `pnpm-lock.yaml`. The pruner rewrites a changeset's
frontmatter to drop a removed package, and a plugin restoring that would be
rewriting release history it does not own.

## Adding a plugin

```bash
node scripts/extract.mjs <feature-id> --repo ../flama-ai
node scripts/roundtrip.mjs <feature-id> --repo ../flama-ai
```

The feature has to exist in the starter's `features.json` first — extraction
reads the manifest entry and derives the rest. If a block it removes has no
`flama:plugins` anchor after it, extraction stops and says so: the installer
would otherwise have nowhere to put the block back.

## Known limits

- **A block every owner has left cannot be recreated.** Widening a co-owned
  block composes now — two plugins that share one both install, in either
  order — but only while some owner remains to hold the block. `cli` and `mcp`
  share three blocks and `mcp` stays behind to hold them; if it left too, the
  block would go with it and installing `cli` would have nowhere to widen.
  Creating one from nothing is still a design decision about how shared
  configuration should be modelled, not a missing function.
- **A failed install is not undone.** Installing copies files, inserts blocks
  and then widens; a failure at the last step leaves the earlier ones in
  place. `plugin:remove` cleans up, but nothing rolls back on its own.
- **Prose is not restored.** The pruner rewrites config, not sentences; a
  README table or an architecture paragraph naming a plugin is edited by hand
  in the starter, as it always was.
- **Migrations are never reverted.** No plugin ships one yet; when one does,
  `plugin:remove` will warn rather than pretend.
