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

/**
 * The projects a plugin has to install into, as the features each keeps.
 *
 * Not only the starter as it ships. A plugin is added to a project, and a
 * project has been pruned — usually hard: most keep the web app and little
 * else. Installing into the full starter alone never met a pruned feature's
 * shared block, a copied file carrying a block for a feature that is gone, or
 * a Helm template with no `helm/` to land in, and every one of those broke a
 * real install. `null` is the starter untouched.
 */
const SHAPES = [
  { name: 'the full starter', keep: null },
  { name: 'web + e2e', keep: ['web', 'e2e'] },
  { name: 'mobile only', keep: ['mobile'] },
  { name: 'the API alone', keep: [] },
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

/**
 * A scratch copy of the starter pruned to `shape`, committed as its baseline,
 * and the paths the prune took out.
 *
 * Those paths are the other thing an install into a pruned project can get
 * wrong. A plugin file that belongs to a pruned feature — a Helm template in a
 * project without Helm — has to be skipped (`filesNeed`), and copying it
 * anyway brings back a lone fragment of that feature that no check notices,
 * because the feature and its identifiers are gone from the manifest. Only
 * here is the full starter's manifest still at hand to say what was pruned.
 */
function shapedCopy(repo, shape) {
  const dir = scratchCopy(repo);
  if (shape.keep === null) return { dir, pruned: [] };
  const manifest = JSON.parse(readFileSync(join(dir, 'scripts/starter/features.json'), 'utf8'));
  const without = Object.keys(manifest.features).filter((id) => !shape.keep.includes(id));
  if (!without.length) return { dir, pruned: [] };
  const pruned = without.flatMap((id) => manifest.features[id].paths ?? []);
  execFileSync(
    'node',
    ['scripts/starter/prune.mjs', '--without', without.join(','), '--no-install'],
    {
      cwd: dir,
      stdio: 'pipe',
    },
  );
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=rt@flama', '-c', 'user.name=roundtrip', 'commit', '-qm', 'pruned');
  return { dir, pruned };
}

function roundtrip(base, pruned, id, keep) {
  console.log(`\n${id}`);
  const dir = scratchCopy(base);
  try {
    const plugin = join(ROOT, 'plugins', id);
    if (!existsSync(join(plugin, 'plugin.json'))) {
      console.log(`    ✗ plugins/${id}/plugin.json is missing`);
      failures += 1;
      return;
    }

    // The starter as it ships, without the plugin.
    if (!checkAll(dir, 'before')) return;

    const manifest = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'));
    const features = JSON.parse(
      readFileSync(join(dir, 'scripts/starter/features.json'), 'utf8'),
    ).features;

    // Some plugins are features the starter still ships — organizations is in
    // the box, and the plugin is how a project that pruned it gets it back.
    // The starter is the source there and the plugin a copy of it, so the
    // copy is held to it: prune the feature, install the plugin, and the tree
    // has to be the starter again, byte for byte, but for the flag that marks
    // an installed feature. Then the usual round trip runs from the pruned
    // state.
    const ships = Boolean(features[id]);
    if (ships) {
      if (
        !run(dir, 'node', ['scripts/starter/prune.mjs', '--without', id, '--no-install'], 'prune')
      )
        return;
      git(dir, 'add', '-A');
      git(dir, '-c', 'user.email=rt@flama', '-c', 'user.name=roundtrip', 'commit', '-qm', 'pruned');
    }

    // A plugin can need another: the QA pack drives the web control plane, so
    // it cannot install into a project without it. Bring those in first and
    // take them out last, so what is proven is this plugin against a project
    // that can actually hold it. One the project already has is left alone.
    const needed = (manifest.feature?.requires ?? []).filter(
      (dep) => existsSync(join(ROOT, 'plugins', dep, 'plugin.json')) && !features[dep],
    );
    // A requirement that is a shipped feature, pruned from this shape, makes
    // the plugin uninstallable here by design; the installer says so.
    const missing = [manifest, ...needed.map((dep) => readManifest(dep))]
      .flatMap((m) => m.feature?.requires ?? [])
      .filter((dep) => !features[dep] && !existsSync(join(ROOT, 'plugins', dep, 'plugin.json')));
    if (missing.length) {
      console.log(`    – not installable here: requires ${[...new Set(missing)].join(', ')}`);
      return;
    }
    // A control plane builds on its platform's kits, and a project that
    // pruned every app of that platform pruned the kits with them.
    const noKit = (manifest.feature?.shared ?? [])
      .map(({ path }) => path)
      .filter((path) => !(path in (manifest.sharedFiles ?? {})) && !existsSync(join(dir, path)));
    if (noKit.length) {
      console.log(
        `    – not installable here: builds on ${noKit.join(', ')}, pruned with its apps`,
      );
      return;
    }
    for (const dep of needed) {
      if (
        !run(dir, 'node', ['scripts/plugins/plugin.mjs', 'add', dep, '--from', ROOT], `add ${dep}`)
      )
        return;
      console.log(`    ✓ installed ${dep} (required)`);
    }

    if (!run(dir, 'node', ['scripts/plugins/plugin.mjs', 'add', id, '--from', ROOT], 'add')) return;
    console.log('    ✓ installed');
    const revived = git(dir, 'status', '--porcelain', '--untracked-files=all')
      .split('\n')
      .filter((line) => line.startsWith('??'))
      .map((line) => line.slice(3))
      .filter((file) => pruned.some((path) => file === path || file.startsWith(`${path}/`)))
      // A shape can prune the feature this plugin is, or one it requires —
      // organizations ships in the starter — and bringing that back is the
      // whole point.
      .filter(
        (file) =>
          ![manifest, ...needed.map((dep) => readManifest(dep))]
            .flatMap((m) => m.feature?.paths ?? [])
            .some((path) => file === path || file.startsWith(`${path}/`)),
      );
    if (revived.length) {
      console.log('    ✗ the install brought back part of a feature this project pruned:');
      for (const file of revived) console.log(`      ${file}`);
      console.log('      Name the feature it belongs to in the plugin\'s "filesNeed".');
      failures += 1;
      return;
    }
    // With the plugin in, the honesty check now covers it: every mention of
    // the feature has to sit inside a path or a block the plugin owns.
    checkAll(dir, 'with');

    if (ships && !reproducesStarter(dir, id)) return;

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

/**
 * Whether installing a shipped feature's plugin gave back the starter it was
 * pruned from (the commit before HEAD). Everything must match byte for byte
 * except `features.json`, where the installed entry carries `"plugin": true`
 * and must match once that line is gone. A difference means the starter
 * changed and the plugin was not extracted again.
 */
function reproducesStarter(dir, id) {
  git(dir, 'add', '-A');
  const manifestPath = 'scripts/starter/features.json';
  const diff = git(
    dir,
    'diff',
    '--cached',
    '--stat',
    'HEAD~1',
    '--',
    '.',
    `:!${manifestPath}`,
    ...NOT_RESTORED,
  ).trim();
  const starter = git(dir, 'show', `HEAD~1:${manifestPath}`);
  const installed = readFileSync(join(dir, manifestPath), 'utf8');
  const entry = installed.indexOf(`\n    "${id}": {`);
  const unflagged =
    entry === -1
      ? installed
      : installed.slice(0, entry) + installed.slice(entry).replace(/\n\s*"plugin": true,/, '');
  git(dir, 'reset', '-q');
  if (!diff && unflagged === starter) {
    console.log('    ✓ reproduces the starter it was pruned from');
    return true;
  }
  console.log('    ✗ the plugin no longer reproduces the starter — extract it again:');
  console.log(`      node scripts/extract.mjs ${id} --repo <flama-ai>`);
  for (const line of diff.split('\n').filter(Boolean)) console.log(`      ${line}`);
  if (unflagged !== starter) console.log(`      ${manifestPath} differs beyond the plugin flag`);
  failures += 1;
  return false;
}

function readManifest(id) {
  return JSON.parse(readFileSync(join(ROOT, 'plugins', id, 'plugin.json'), 'utf8'));
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

  for (const shape of SHAPES) {
    console.log(`\n━━ ${ids.length} plugin(s) into ${shape.name} (${repo})`);
    const { dir: base, pruned } = shapedCopy(repo, shape);
    try {
      for (const id of ids) roundtrip(base, pruned, id, keep);
    } finally {
      if (!keep) rmSync(base, { recursive: true, force: true });
    }
  }

  console.log(failures ? `\n${failures} failure(s).` : '\nAll plugins round-trip cleanly.');
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
