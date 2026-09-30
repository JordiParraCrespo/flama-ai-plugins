import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The starter whose apparatus the fixture runs: `FLAMA_REPO`, or the checkout
 * CI makes beside this repo's own, or the sibling the scripts default to.
 */
const STARTER = [
  process.env.FLAMA_REPO,
  join(HERE, '..', '.flama-ai'),
  join(HERE, '..', '..', 'flama-ai'),
]
  .filter(Boolean)
  .map((path) => resolve(path))
  .find((path) => existsSync(join(path, 'scripts', 'plugins', 'plugin.mjs')));

/** What the fixture copies from the starter: the pruner, the installer, and the checks the round trip runs. */
const APPARATUS = [
  'scripts/plugins/plugin.mjs',
  'scripts/plugins/ops.mjs',
  'scripts/plugins/source.mjs',
  'scripts/starter/prune.mjs',
  'scripts/starter/prune.test.mjs',
  'scripts/lib/markers.mjs',
  'scripts/lib/markers.test.mjs',
  'scripts/lib/json-text.mjs',
];

/**
 * The environment the fixture runs in, without a toolchain: a prune formats
 * what it edited when Biome is on the `PATH`, and the fixture has no
 * `biome.json` to format by.
 */
const ENV = {
  ...process.env,
  PATH: (process.env.PATH ?? '')
    .split(delimiter)
    .filter((entry) => !entry.includes('node_modules'))
    .join(delimiter),
};

const STARTER_VERSION = ['import kit;', '', 'export const providers = {};', ''].join('\n');
const FEATURE_VERSION = [
  'import kit;',
  '// flama:begin omega',
  'import omega;',
  '// flama:end omega',
  '',
  'export const providers = {};',
  '// flama:begin omega',
  'providers.omega = omega;',
  '// flama:end omega',
  '',
].join('\n');

/** A committed mini starter: the apparatus, a manifest, and `files`. */
function starter(features, files) {
  const dir = mkdtempSync(join(tmpdir(), 'flama-mini-'));
  for (const file of APPARATUS) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    cpSync(join(STARTER, file), join(dir, file));
  }
  // The round trip runs the API contract too; this starter has no API.
  writeFileSync(join(dir, 'scripts', 'check-api-structure.mjs'), '');
  const manifest = { features, shared: {} };
  writeFileSync(
    join(dir, 'scripts', 'starter', 'features.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const pkg = { name: 'mini', version: '0.0.0', private: true };
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', [
    '-C',
    dir,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'x',
  ]);
  return dir;
}

test('a feature that replaces a file extracts to a snapshot, installs its version, and removes to the starter’s', {
  skip: STARTER ? false : 'no Flama checkout (set FLAMA_REPO)',
}, () => {
  const omega = {
    title: 'Omega',
    summary: 'omega',
    identifiers: ['omega-sdk'],
    paths: ['omega'],
    replaces: ['src/providers.ts'],
  };
  const fenced = starter(
    { omega },
    { 'src/providers.ts': FEATURE_VERSION, 'omega/index.txt': 'omega-sdk\n' },
  );
  const pruned = starter({}, { 'src/providers.ts': STARTER_VERSION });

  // A plugins repo of its own, so the extraction writes nowhere real.
  const plugins = mkdtempSync(join(tmpdir(), 'flama-plugins-'));
  mkdirSync(join(plugins, 'plugins'));
  cpSync(HERE, join(plugins, 'scripts'), {
    recursive: true,
    filter: (path) => !path.endsWith('.test.mjs'),
  });
  execFileSync('node', [join(plugins, 'scripts', 'extract.mjs'), 'omega', '--repo', fenced], {
    env: ENV,
    stdio: 'pipe',
  });
  const plugin = JSON.parse(readFileSync(join(plugins, 'plugins', 'omega', 'plugin.json'), 'utf8'));
  assert.deepEqual(plugin.feature.replaces, ['src/providers.ts']);
  assert.deepEqual(plugin.snapshots, [
    { file: 'src/providers.ts', source: 'snapshots/src/providers.ts' },
  ]);
  assert.equal(plugin.blocks, undefined);
  assert.equal(
    readFileSync(join(plugins, 'plugins', 'omega', plugin.snapshots[0].source), 'utf8'),
    FEATURE_VERSION,
  );

  // Installed, the file is the feature's version.
  const project = mkdtempSync(join(tmpdir(), 'flama-project-'));
  cpSync(pruned, project, { recursive: true });
  const script = join(project, 'scripts', 'plugins', 'plugin.mjs');
  execFileSync('node', [script, 'add', 'omega', '--no-install', '--from', plugins], {
    env: ENV,
    stdio: 'pipe',
  });
  assert.equal(readFileSync(join(project, 'src', 'providers.ts'), 'utf8'), FEATURE_VERSION);

  // And the round trip, into every shape, gives the starter's back.
  const out = execFileSync(
    'node',
    [join(plugins, 'scripts', 'roundtrip.mjs'), 'omega', '--repo', pruned],
    { encoding: 'utf8', env: ENV, stdio: 'pipe' },
  );
  assert.match(out, /All plugins round-trip cleanly/);
});
