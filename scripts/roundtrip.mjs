#!/usr/bin/env node
/**
 * Prove a plugin against a real Flama checkout, end to end.
 *
 * For each plugin: take a scratch copy of the repo, remove the feature, then
 * install the plugin back, and require the tree to be identical to where it
 * started. That single assertion covers everything a plugin can get wrong —
 * a missing file, a block in the wrong place, a mangled manifest entry, an
 * anchor that drifted — because any of them shows up as a diff.
 *
 *   node scripts/roundtrip.mjs            # every plugin
 *   node scripts/roundtrip.mjs cli mcp    # named ones
 *   node scripts/roundtrip.mjs --repo ../flama-ai --keep
 *
 * The repo's own checks run at both ends: with the plugin removed (the state
 * the starter ships) and with it installed. They are the ones that need no
 * `node_modules` — the honesty check, the grammar tests, the API contract —
 * so this runs anywhere. A full `pnpm build` belongs in the host repo's CI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * Release bookkeeping the pruner rewrites and a plugin deliberately does not
 * restore — see `NOT_A_FEATURE` in extract.mjs. Excluded from the comparison
 * rather than silently tolerated, so the exclusion is visible in the output.
 */
const NOT_RESTORED = [':!.changeset', ':!pnpm-lock.yaml'];

/** Checks that need no workspace install, so they run in any sandbox. */
const CHECKS = [
  ['node', ['scripts/starter/prune.mjs', '--check']],
  ['node', ['--test', 'scripts/lib/markers.test.mjs']],
  ['node', ['--test', 'scripts/starter/prune.test.mjs']],
  ['node', ['scripts/check-api-structure.mjs']],
];

let failures = 0;

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function run(cwd, command, args, label) {
  try {
    execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (error) {
    console.log(`    ✗ ${label}`);
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    for (const line of output.split('\n').slice(-12)) console.log(`      ${line}`);
    failures += 1;
    return false;
  }
}

function checkAll(dir, label) {
  let ok = true;
  for (const [command, args] of CHECKS) {
    if (
      !run(dir, command, args, `${label}: ${args.filter((a) => !a.startsWith('--')).join(' ')}`)
    ) {
      ok = false;
    }
  }
  if (ok) console.log(`    ✓ checks pass ${label}`);
  return ok;
}

function scratchCopy(repo) {
  const dir = mkdtempSync(join(tmpdir(), 'flama-roundtrip-'));
  execFileSync('sh', [
    '-c',
    `tar -c --exclude=node_modules --exclude=.git -C '${repo}' . | tar -x -C '${dir}'`,
  ]);
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=rt@flama', '-c', 'user.name=roundtrip', 'commit', '-qm', 'baseline');
  return dir;
}

function roundtrip(repo, id, keep) {
  console.log(`\n${id}`);
  const dir = scratchCopy(repo);
  try {
    const plugin = join(ROOT, 'plugins', id);
    if (!existsSync(join(plugin, 'plugin.json'))) {
      console.log(`    ✗ plugins/${id}/plugin.json is missing`);
      failures += 1;
      return;
    }

    // The starter as it ships, without the plugin.
    if (!checkAll(dir, 'before')) return;

    // A plugin can need another: the QA pack drives the web control plane, so
    // it cannot install into a project without it. Bring those in first and
    // take them out last, so what is proven is this plugin against a project
    // that can actually hold it.
    const manifest = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'));
    const needed = (manifest.feature?.requires ?? []).filter((dep) =>
      existsSync(join(ROOT, 'plugins', dep, 'plugin.json')),
    );
    for (const dep of needed) {
      if (!run(dir, 'node', ['scripts/plugins/plugin.mjs', 'add', dep, '--from', ROOT], `add ${dep}`))
        return;
      console.log(`    ✓ installed ${dep} (required)`);
    }

    if (!run(dir, 'node', ['scripts/plugins/plugin.mjs', 'add', id, '--from', ROOT], 'add')) return;
    console.log('    ✓ installed');
    // With the plugin in, the honesty check now covers it: every mention of
    // the feature has to sit inside a path or a block the plugin owns.
    checkAll(dir, 'with');

    if (!run(dir, 'node', ['scripts/plugins/plugin.mjs', 'remove', id], 'remove')) return;
    console.log('    ✓ removed');
    for (const dep of [...needed].reverse()) {
      if (!run(dir, 'node', ['scripts/plugins/plugin.mjs', 'remove', dep], `remove ${dep}`)) return;
      console.log(`    ✓ removed ${dep}`);
    }

    const diff = git(dir, 'diff', '--stat', 'HEAD', '--', '.', ...NOT_RESTORED).trim();
    const untracked = git(dir, 'status', '--porcelain', '--untracked-files=all')
      .split('\n')
      .filter((line) => line.startsWith('??'))
      .map((line) => line.slice(3));
    if (diff || untracked.length) {
      console.log('    ✗ install → remove did not return the tree to where it started:');
      for (const line of diff.split('\n').filter(Boolean)) console.log(`      ${line}`);
      for (const file of untracked) console.log(`      ?? ${file}`);
      console.log(
        git(dir, 'diff', 'HEAD', '--', '.', ...NOT_RESTORED)
          .split('\n')
          .slice(0, 60)
          .join('\n'),
      );
      failures += 1;
      return;
    }
    console.log('    ✓ round trip clean — the tree is byte-identical to where it started');
  } finally {
    if (keep) console.log(`    (kept ${dir})`);
    else rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes('--keep');
  const repoFlag = argv.indexOf('--repo');
  const repo = resolve(repoFlag === -1 ? '../flama-ai' : argv[repoFlag + 1]);
  const named = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--repo');

  if (!existsSync(join(repo, 'scripts/plugins/plugin.mjs'))) {
    console.error(`error: ${repo} has no scripts/plugins/plugin.mjs — it predates the installer`);
    process.exit(2);
  }
  const ids = named.length
    ? named
    : readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

  console.log(`Round-tripping ${ids.length} plugin(s) against ${repo}`);
  for (const id of ids) roundtrip(repo, id, keep);

  console.log(failures ? `\n${failures} failure(s).` : '\nAll plugins round-trip cleanly.');
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
