#!/usr/bin/env node
/**
 * The body each plugin carries for a block it shares with a shipped feature.
 *
 * A co-owned block lives in the starter, under the shipped feature's fence,
 * and an install normally only adds the plugin's name to it. A project that
 * pruned that feature pruned the block too, so the plugin carries the body to
 * put back — `coOwned[].source`, fenced with the plugin's id alone.
 *
 * Nothing is ever found by that body, so it cannot break an install the way
 * body-matching did. It can go stale: the starter rewords its block and the
 * copy here keeps the old words. So the body is never written by hand. This
 * script reads it out of the starter, and `--check` fails when the two differ.
 *
 *   node scripts/shared-bodies.mjs --repo ../flama-ai           # write
 *   node scripts/shared-bodies.mjs --repo ../flama-ai --check   # compare
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

/** Where a shared block's body is kept, beside the plugin's other blocks. */
export function bodyPath(block) {
  const slug = block.file.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  return `blocks/shared/${slug}__${block.anchor}.txt`;
}

/**
 * The shared block above `anchor` in the starter, re-fenced for `id` alone.
 * The grammar comes from the starter itself, so there is one parser.
 */
export function sharedBody(markers, content, file, block, id) {
  if (!markers.findAnchor(file, content, block.anchor)) {
    return { error: `${file}: no "flama:plugins ${block.anchor}" anchor` };
  }
  const marked = markers.blockAbove(file, content, block.anchor);
  if (!marked?.ids.some((owner) => owner !== id && block.order?.includes(owner))) {
    return { error: `${file}: the block above "${block.anchor}" is not one ${id} shares` };
  }
  // Fenced for `id` alone, through the grammar's own edits: add it, then
  // take every other owner out. Never `id` itself — in a starter that already
  // has the plugin it is one of the owners, and narrowing a spec to nothing
  // leaves it as it was.
  const others = new Set(marked.ids.filter((owner) => owner !== id));
  const refence = (line) => markers.narrowMarker(markers.widenMarker(line, id, 0), others);
  const lines = content.split('\n');
  const body = [
    refence(lines[marked.begin]),
    ...lines.slice(marked.begin + 1, marked.end),
    refence(lines[marked.end]),
  ];
  return { body: `${body.join('\n')}\n` };
}

/**
 * Write (or with `check`, compare) the shared bodies of `ids`, every plugin
 * when omitted, against the starter at `repo`. Returns the number of
 * problems. `extract.mjs` calls it for the plugin it just regenerated: the
 * extraction rebuilds the plugin directory from scratch, and without this it
 * would drop every body and `source` it had.
 */
export async function syncSharedBodies({ repo, check = false, ids = null }) {
  const markersPath = join(repo, 'scripts/lib/markers.mjs');
  if (!existsSync(markersPath)) fail(`${repo} has no scripts/lib/markers.mjs`);
  const markers = await import(pathToFileURL(markersPath).href);

  let problems = 0;
  for (const id of ids ?? readdirSync(join(ROOT, 'plugins')).sort()) {
    const manifestPath = join(ROOT, 'plugins', id, 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    let changed = false;
    for (const block of manifest.coOwned ?? []) {
      const file = join(repo, block.file);
      if (!existsSync(file)) {
        console.log(`  ✗ ${id}: ${block.file} is not in the starter`);
        problems += 1;
        continue;
      }
      const { body, error } = sharedBody(
        markers,
        readFileSync(file, 'utf8'),
        block.file,
        block,
        id,
      );
      if (error) {
        console.log(`  ✗ ${id}: ${error}`);
        problems += 1;
        continue;
      }
      const target = join(ROOT, 'plugins', id, bodyPath(block));
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (check) {
        if (block.source !== bodyPath(block) || current !== body) {
          console.log(`  ✗ ${id}: ${bodyPath(block)} does not match the starter's block`);
          problems += 1;
        }
        continue;
      }
      if (current !== body) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, body);
        console.log(`  write  ${id}/${bodyPath(block)}`);
      }
      if (block.source !== bodyPath(block)) {
        block.source = bodyPath(block);
        changed = true;
      }
    }
    if (changed) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return problems;
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const repoFlag = argv.indexOf('--repo');
  const repo = resolve(repoFlag === -1 ? '../flama-ai' : argv[repoFlag + 1]);
  const problems = await syncSharedBodies({ repo, check });
  if (check) {
    console.log(
      problems
        ? `\n${problems} shared block(s) out of step with the starter. Run without --check.`
        : 'Every shared block body matches the starter.',
    );
  }
  process.exit(problems ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
