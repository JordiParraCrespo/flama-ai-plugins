#!/usr/bin/env node
/**
 * Extract a Flama starter feature into a plugin.
 *
 * A plugin has to reproduce a feature exactly — the same files, the same
 * marked blocks, in the same places — or installing it leaves a diff against
 * the starter it came from. Rather than transcribe that by hand, this script
 * derives it: it runs the starter's own pruner against a scratch copy, and
 * whatever the prune removed *is* the plugin.
 *
 *   node scripts/extract.mjs cli --repo ../flama-ai
 *
 * What comes out is `plugins/<id>/`, ready for `pnpm plugin:add <id>`:
 *
 *   plugin.json          the features.json entry, the files, the blocks
 *   files/…              every path the feature owned, copied whole
 *   blocks/<file>.txt    each marked block, verbatim, fences included
 *
 * The round trip is the test: `plugin:remove <id>` then `plugin:add <id>`
 * against a clean checkout must leave no diff. `scripts/roundtrip.mjs` runs it.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * Release bookkeeping, not part of any feature. The pruner drops a removed
 * package from a changeset's frontmatter; a plugin restoring that would be
 * rewriting history it does not own.
 */
const NOT_A_FEATURE = [/^\.changeset\//, /^pnpm-lock\.yaml$/];

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** A scratch copy of the repo at HEAD, with a baseline commit to diff against. */
function scratchCopy(repo) {
  const dir = mkdtempSync(join(tmpdir(), 'flama-extract-'));
  execFileSync('sh', [
    '-c',
    `tar -c --exclude=node_modules --exclude=.git -C '${repo}' . | tar -x -C '${dir}'`,
  ]);
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(
    dir,
    '-c',
    'user.email=extract@flama',
    '-c',
    'user.name=extract',
    'commit',
    '-qm',
    'baseline',
  );
  return dir;
}

/**
 * The removal hunks of a `git diff -U0`, each one a contiguous run of lines
 * the prune took out, with where it sat in the pruned file.
 *
 * git does the diffing rather than this script: a hand-rolled line matcher
 * re-synchronises in the wrong place on repeated lines — blank lines, a
 * closing `# ---` rule — and splits one block into several.
 *
 * `at` is the 1-based line of the pruned file the run followed, so the run
 * belongs immediately after it: index `at` in a 0-based array.
 */
export function removalHunks(diff) {
  const hunks = [];
  let current = null;
  for (const line of diff.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      current = {
        at: Number(header[1]),
        added: header[2] === undefined ? 1 : Number(header[2]),
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('-')) current.lines.push(line.slice(1));
  }
  // A hunk that also adds lines is not a clean removal, and a plugin cannot
  // reproduce it by inserting a block.
  return hunks.filter((hunk) => hunk.lines.length > 0 && hunk.added === 0);
}

const FENCE_RE = /^(\s*(?:#|\/\/|<!--|\{\{-?\s*\/\*|\/\*)\s*flama:)(begin|end)(\s+)([\w|-]+)/;

/**
 * Blocks whose marker names this feature *and* others — `flama:begin mcp|cli`.
 *
 * These belong to the set, not to one member: the block survives while any
 * owner remains, and the pruner narrows the spec to whoever is left. So the
 * plugin cannot carry them as content to delete and restore. It carries the
 * two forms of the same block — with its own name in the fence and without —
 * and installing swaps one for the other.
 *
 * The whole block is stored, fences and body, because the body is what makes
 * it findable: a narrowed `flama:begin mcp` fence is textually identical to
 * the fence of an mcp-only block elsewhere in the same file.
 */
export function coOwnedBlocks(content, id) {
  const lines = content.split('\n');
  const found = [];
  // A stack, not a single slot: in `sidebars.ts` the co-owned `cli|mcp`
  // category encloses the `cli` entry inside it, and a scanner that keeps
  // only the innermost open block loses the outer one entirely.
  const open = [];
  lines.forEach((line, index) => {
    const match = FENCE_RE.exec(line);
    if (!match) return;
    const ids = match[4].split('|');
    if (match[2] === 'begin') {
      open.push({ start: index, ids });
      return;
    }
    const block = open.pop();
    if (!block || !block.ids.includes(id) || block.ids.length < 2) return;
    const spec = block.ids.join('|');
    const installed = lines.slice(block.start, index + 1);
    const kept = block.ids.filter((other) => other !== id).join('|');
    const pruned = installed.map((blockLine) => {
      const fence = FENCE_RE.exec(blockLine);
      return fence && fence[4] === spec ? blockLine.replace(spec, kept) : blockLine;
    });
    found.push({
      installed: installed.join('\n'),
      pruned: pruned.join('\n'),
      ids: block.ids,
    });
  });
  return found;
}

/** The first `flama:plugins <slot>` anchor at or after a line of the pruned file. */
export function anchorAt(afterContent, at) {
  const lines = afterContent.split('\n');
  for (let i = Math.max(0, at); i < lines.length; i += 1) {
    const match = /flama:plugins\s+([\w-]+)\b/.exec(lines[i]);
    if (match) return match[1];
  }
  return null;
}

/**
 * The feature that owns a file, if it is not this one.
 *
 * A block can land in a file another optional feature brings — the CLI's
 * sidebar entry lives in `apps/docs/sidebars.ts`, which belongs to `docs`.
 * In a project without that feature the file is simply absent, and the block
 * has nowhere to go and nothing to say. Recording the owner lets the
 * installer skip it there instead of refusing to install at all, while a
 * missing file that *no* feature explains stays a loud failure, because then
 * it means an anchor moved.
 */
export function ownerOf(features, file, self) {
  for (const [id, feature] of Object.entries(features)) {
    if (id === self) continue;
    if ((feature.paths ?? []).some((p) => file === p || file.startsWith(`${p}/`))) return id;
  }
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const id = argv.find(
    (arg, i) => !arg.startsWith('--') && !['--repo', '--also'].includes(argv[i - 1]),
  );
  const repoFlag = argv.indexOf('--repo');
  const repo = resolve(repoFlag === -1 ? '../flama-ai' : argv[repoFlag + 1]);
  const alsoFlag = argv.indexOf('--also');
  const also = alsoFlag === -1 ? [] : (argv[alsoFlag + 1] ?? '').split(',').filter(Boolean);
  if (!id) fail('usage: extract.mjs <feature-id> [--repo ../flama-ai] [--also <id,id>]');
  if (!existsSync(join(repo, 'scripts/starter/features.json'))) fail(`${repo} is not a Flama repo`);

  const manifest = JSON.parse(readFileSync(join(repo, 'scripts/starter/features.json'), 'utf8'));
  const feature = manifest.features[id];
  if (!feature) fail(`"${id}" is not a feature of ${repo}`);

  const scratch = scratchCopy(repo);
  try {
    execFileSync(
      'node',
      ['scripts/starter/prune.mjs', '--without', id, '--no-install'],
      { cwd: scratch, stdio: 'pipe' },
    );

    const out = join(ROOT, 'plugins', id);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, 'files'), { recursive: true });

    // No global trim: porcelain's first column is a space for unstaged
    // changes, and trimming the whole output eats it off the first line.
    const status = git(scratch, 'status', '--porcelain').split('\n').filter(Boolean);
    const deleted = [];
    const modified = [];
    for (const line of status) {
      const path = line.slice(3).trim();
      if (NOT_A_FEATURE.some((re) => re.test(path))) continue;
      (line.trim().startsWith('D') ? deleted : modified).push(path);
    }

    // Whole paths the feature owned. Copy the declared roots rather than each
    // deleted file, so the plugin carries directories as directories.
    const files = {};
    for (const path of feature.paths) {
      if (!deleted.some((file) => file === path || file.startsWith(`${path}/`))) continue;
      files[path] = `files/${path}`;
      mkdirSync(dirname(join(out, 'files', path)), { recursive: true });
      // verbatimSymlinks: every CLAUDE.md is a relative link to the AGENTS.md
      // beside it, and resolving those on copy bakes this machine's absolute
      // path into the plugin.
      cpSync(join(repo, path), join(out, 'files', path), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }

    // Marked blocks in files that survive.
    mkdirSync(join(out, 'blocks'), { recursive: true });
    const blocks = [];
    const jsonBlocks = [];
    for (const file of modified) {
      const after = readFileSync(join(scratch, file), 'utf8');
      // A feature can own several blocks in one file — `helm/values.yaml`
      // carries one per app it deploys, `ingress.yaml` one per host. Each is
      // restored at an anchor of its own, so each becomes its own entry.
      const found = removalHunks(git(scratch, 'diff', '-U0', '--', file));
      found.forEach((block, n) => {
        const source = `blocks/${file.replace(/[/.]/g, '_')}${n ? `_${n}` : ''}.txt`;
        writeFileSync(join(out, source), `${block.lines.join('\n')}\n`);
        const needs = ownerOf(manifest.features, file, id);
        const anchor = anchorAt(after, block.at);
        if (anchor) {
          blocks.push({ file, anchor, source, ...(needs ? { needs } : {}) });
          console.log(`  block  ${file} → ${anchor}${needs ? ` (only with ${needs})` : ''}`);
          return;
        }
        // JSON holds no comments, so it can hold no anchor. The line the run
        // followed is the anchor instead: content rather than a marker, which
        // is why it has to be unique in the file — otherwise the installer
        // would be choosing between identical places to put it back.
        if (!file.endsWith('.json')) {
          fail(
            `${file}: no "flama:plugins <slot>" anchor after the block removed at line ${block.at} — add one where the block sits, or the installer has nowhere to put it back`,
          );
        }
        const lines = after.split('\n');
        const preceding = lines[block.at - 1];
        const occurrences = lines.filter((line) => line === preceding).length;
        if (preceding === undefined || occurrences !== 1) {
          fail(
            `${file}: the line above the removed run appears ${occurrences} times, so it cannot say where the run goes back`,
          );
        }
        jsonBlocks.push({ file, after: preceding, source, ...(needs ? { needs } : {}) });
        console.log(`  json   ${file} (after ${preceding.trim()})`);
      });
    }

    // Co-owned blocks live in files the prune only narrowed, so they do not
    // all show up as removals; scan the tracked text files directly.
    const coOwned = [];
    const tracked = git(repo, 'ls-files').split('\n').filter(Boolean);
    for (const file of tracked) {
      if (NOT_A_FEATURE.some((re) => re.test(file))) continue;
      const full = join(repo, file);
      // git tracks gitlinks and symlinks too; only real files can be scanned,
      // and every CLAUDE.md here is a link to the AGENTS.md beside it.
      if (!existsSync(full) || lstatSync(full).isSymbolicLink() || !statSync(full).isFile())
        continue;
      if (Object.keys(files).some((owned) => file === owned || file.startsWith(`${owned}/`)))
        continue;
      const buffer = readFileSync(full);
      if (buffer.includes(0)) continue;
      const blocks = coOwnedBlocks(buffer.toString('utf8'), id);
      blocks.forEach((block, n) => {
        const source = `blocks/co-owned/${file.replace(/[/.]/g, '_')}${n ? `_${n}` : ''}.txt`;
        mkdirSync(join(out, 'blocks', 'co-owned'), { recursive: true });
        writeFileSync(join(out, source), `${block.installed}\n`);
        const needs = ownerOf(manifest.features, file, id);
        coOwned.push({ file, source, ...(needs ? { needs } : {}) });
        console.log(
          `  shared block ${file} (${block.ids.join('|')})${needs ? ` (only with ${needs})` : ''}`,
        );
      });
    }

    const shared = Object.entries(manifest.shared)
      .filter(([, entry]) => entry.neededBy.includes(id))
      .map(([path, entry]) => ({
        path,
        identifiers: entry.identifiers,
        neededBy: entry.neededBy,
      }));
    // A shared path outlives this feature while another dependant remains, so
    // normally a plugin owns only its membership. But when every dependant is
    // leaving to become a plugin too, the path goes with the last of them and
    // somebody has to bring it back. Each carries it and the first one
    // installed wins; the rest find it already there. `--also` names the
    // others, because a prune of this feature alone cannot know.
    const alsoLeaving = new Set([id, ...also]);
    const sharedFiles = {};
    for (const entry of shared) {
      if (!entry.neededBy.every((dep) => alsoLeaving.has(dep))) {
        console.log(`  shared ${entry.path}`);
        continue;
      }
      const dest = `shared/${entry.path}`;
      sharedFiles[entry.path] = dest;
      mkdirSync(dirname(join(out, dest)), { recursive: true });
      cpSync(join(repo, entry.path), join(out, dest), { recursive: true, verbatimSymlinks: true });
      console.log(`  shared ${entry.path} (carried — every dependant is leaving)`);
    }

    const covered = [...Object.keys(files), ...Object.keys(sharedFiles)];
    const orphan = deleted.find((file) => !covered.some((p) => file.startsWith(p)));
    if (orphan) {
      fail(`${orphan} was removed but neither a feature path nor a carried shared path covers it`);
    }

    const plugin = {
      id,
      flama: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version ?? '0.0.0',
      feature: {
        title: feature.title,
        summary: feature.summary,
        identifiers: feature.identifiers,
        paths: feature.paths,
        ...(feature.requires ? { requires: feature.requires } : {}),
        ...(feature.scripts ? { scripts: feature.scripts } : {}),
        ...(feature.json ? { json: feature.json } : {}),
        // Shared paths this feature is a dependant of. It does not own them —
        // they outlive it while another dependant remains — but its name is
        // in their `neededBy`, and an install or removal that leaves that
        // list stale fails the starter's honesty check.
        ...(shared.length ? { shared } : {}),
      },
      files,
      ...(Object.keys(sharedFiles).length ? { sharedFiles } : {}),
      ...(blocks.length ? { blocks } : {}),
      ...(jsonBlocks.length ? { jsonBlocks } : {}),
      ...(coOwned.length ? { coOwned } : {}),
    };
    writeFileSync(join(out, 'plugin.json'), `${JSON.stringify(plugin, null, 2)}\n`);
    for (const path of Object.keys(files)) console.log(`  copy   ${path}`);
    console.log(`\nExtracted ${id} → plugins/${id}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
