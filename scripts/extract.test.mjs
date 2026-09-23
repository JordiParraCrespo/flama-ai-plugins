import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorAt, anchorBeside, coOwnedBlocks, removalHunks } from './extract.mjs';

test('removalHunks reads the deleted runs out of a -U0 diff', () => {
  const diff = [
    'diff --git a/.env.example b/.env.example',
    '--- a/.env.example',
    '+++ b/.env.example',
    '@@ -10,3 +9,0 @@',
    '-# flama:begin widget',
    '-WIDGET_URL=',
    '-# flama:end widget',
  ].join('\n');
  const [hunk] = removalHunks(diff);
  assert.deepEqual(hunk.lines, ['# flama:begin widget', 'WIDGET_URL=', '# flama:end widget']);
  assert.equal(hunk.at, 9);
});

test('removalHunks ignores a hunk that also adds lines', () => {
  // Narrowing `gadget|widget` to `gadget` is a replacement, not a removal —
  // the block stays and belongs to whoever is left.
  const diff = ['@@ -4 +4 @@', '-# flama:begin gadget|widget', '+# flama:begin gadget'].join('\n');
  assert.deepEqual(removalHunks(diff), []);
});

test('anchorAt finds the slot at or after a line', () => {
  const pruned = ['A=', '# flama:plugins env', '# ---- docker ----'].join('\n');
  assert.equal(anchorAt(pruned, 1), 'env');
  assert.equal(anchorAt(pruned, 0), 'env');
  assert.equal(anchorAt(pruned, 2), null);
});

test('coOwnedBlocks finds blocks this feature shares with others', () => {
  const content = [
    '# flama:begin gadget|widget',
    'SHARED=',
    '# flama:end gadget|widget',
    '# flama:begin widget',
    'MINE=',
    '# flama:end widget',
  ].join('\n');
  const found = coOwnedBlocks(content, 'widget');
  assert.equal(found.length, 1, 'the widget-only block is not co-owned');
  assert.equal(found[0].installed.split('\n')[0], '# flama:begin gadget|widget');
  assert.equal(found[0].pruned.split('\n')[0], '# flama:begin gadget');
  assert.equal(found[0].pruned.split('\n')[1], 'SHARED=', 'the body is untouched');
});

test('coOwnedBlocks sees an outer block that encloses an inner one', () => {
  // `sidebars.ts` nests the widget entry inside the co-owned category; a
  // scanner keeping only the innermost open block loses the outer one.
  const content = [
    '// flama:begin gadget|widget',
    'category',
    '// flama:begin widget',
    'entry',
    '// flama:end widget',
    '// flama:end gadget|widget',
  ].join('\n');
  const found = coOwnedBlocks(content, 'widget');
  assert.equal(found.length, 1);
  assert.match(found[0].installed, /category/);
  assert.match(found[0].installed, /entry/);
  assert.equal(found[0].pruned.split('\n').at(-1), '// flama:end gadget');
});

test('coOwnedBlocks ignores blocks this feature has no part in', () => {
  const content = '# flama:begin gadget|doodad\nX=\n# flama:end gadget|doodad';
  assert.deepEqual(coOwnedBlocks(content, 'widget'), []);
});

test('anchorBeside names the block it sits with, and nothing further down', () => {
  const content = [
    '# flama:begin web|admin-web',
    'VITE_API_URL=',
    '# flama:end web|admin-web',
    '# flama:plugins web-env',
    '',
    'PORT=3001',
    '# flama:plugins something-else',
  ].join('\n');
  assert.equal(anchorBeside(content, 2), 'web-env');

  // A block with no anchor beside it gets none, even though the file has one
  // further down — that slot belongs to something else.
  const orphan = ['# flama:begin web', 'A=', '# flama:end web', 'B=', '# flama:plugins later'].join('\n');
  assert.equal(anchorBeside(orphan, 2), null);

  // Anchors stack: several plugins can name the same block.
  const stacked = ['# flama:end web', '# flama:plugins one', '# flama:plugins two'].join('\n');
  assert.equal(anchorBeside(stacked, 0), 'one');
});

test('coOwnedBlocks reports where each block closes', () => {
  const content = [
    'x',
    '// flama:begin web|admin-web',
    'const a = 1;',
    '// flama:end web|admin-web',
  ].join('\n');
  const [block] = coOwnedBlocks(content, 'admin-web');
  assert.equal(block.endLine, 3);
  assert.deepEqual(block.ids, ['web', 'admin-web']);
});
