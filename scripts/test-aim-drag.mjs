import assert from 'node:assert/strict';
import test from 'node:test';
import { addAim, emptyAimBoard, reorderAim } from '../aimBoard.ts';
import { boundedAimOffset, orderedAimLayouts, previewAimTops, previewIndex, proposedAimIndex } from '../aimDrag.ts';

const rows = [
  { id: 'A', y: 0, height: 48 },
  { id: 'B', y: 48, height: 72 },
  { id: 'C', y: 120, height: 56 },
  { id: 'D', y: 176, height: 64 },
];

function previewOrder(sourceIndex, targetIndex) {
  return rows.map((row, index) => ({ id: row.id, index: previewIndex(index, sourceIndex, targetIndex) }))
    .sort((a, b) => a.index - b.index).map((row) => row.id);
}

test('first aim crosses the second by its leading edge, then proceeds to the last slot', () => {
  assert.equal(proposedAimIndex(rows, 'A', 0, 39), 0);
  assert.equal(proposedAimIndex(rows, 'A', 0, 41), 1);
  assert.deepEqual(previewOrder(0, 1), ['B', 'A', 'C', 'D']);
  assert.equal(proposedAimIndex(rows, 'A', 1, 105), 2);
  assert.equal(proposedAimIndex(rows, 'A', 2, 165), 3);
  assert.deepEqual(previewOrder(0, 3), ['B', 'C', 'D', 'A']);
});

test('last-to-first and middle moves preview the exact committed ID order', () => {
  for (const [sourceIndex, targetIndex, expected] of [
    [3, 0, ['D', 'A', 'B', 'C']],
    [1, 3, ['A', 'C', 'D', 'B']],
    [2, 0, ['C', 'A', 'B', 'D']],
    [0, 0, ['A', 'B', 'C', 'D']],
  ]) {
    assert.deepEqual(previewOrder(sourceIndex, targetIndex), expected);
    let board = emptyAimBoard(new Date(2026, 8, 24, 12));
    const groupId = board.active.groups[0].id;
    for (const row of rows) board = addAim(board, row.id, groupId);
    const ids = board.active.groups[0].aims.map((aim) => aim.id);
    const committed = reorderAim(board, groupId, ids[sourceIndex], targetIndex);
    assert.deepEqual(committed.active.groups[0].aims.map((aim) => aim.text), expected);
    assert.deepEqual(new Set(committed.active.groups[0].aims.map((aim) => aim.id)), new Set(ids));
  }
});

test('upward thresholds and midpoint hysteresis work with variable row heights', () => {
  assert.equal(proposedAimIndex(rows, 'D', 3, 145), 3);
  assert.equal(proposedAimIndex(rows, 'D', 3, 143), 2);
  assert.equal(proposedAimIndex(rows, 'D', 2, 87), 2);
  assert.equal(proposedAimIndex(rows, 'D', 2, 79), 1);
  assert.equal(proposedAimIndex(rows, 'D', 1, 19), 0);
  assert.equal(proposedAimIndex(rows, 'A', 1, 33), 1);
  assert.equal(proposedAimIndex(rows, 'A', 1, 31), 0);
});

test('a tall Aim can switch with a short Aim in either direction while bounded', () => {
  const uneven = [{ id: 'short', y: 0, height: 48 }, { id: 'tall', y: 48, height: 200 }];
  const down = boundedAimOffset(uneven, 'short', 105);
  assert.equal(proposedAimIndex(uneven, 'short', 0, uneven[0].y + down), 1);
  const up = boundedAimOffset(uneven, 'tall', -29);
  assert.equal(proposedAimIndex(uneven, 'tall', 1, uneven[1].y + up), 0);
  assert.equal(proposedAimIndex(uneven, 'tall', 1, uneven[1].y), 1);
});

test('every Aim can reach the first and last slot without leaving the group', () => {
  for (const [index, row] of rows.entries()) {
    const firstOffset = boundedAimOffset(rows, row.id, -1000);
    const lastOffset = boundedAimOffset(rows, row.id, 1000);
    assert.equal(proposedAimIndex(rows, row.id, index, row.y + firstOffset), 0);
    assert.equal(proposedAimIndex(rows, row.id, index, row.y + lastOffset), rows.length - 1);
  }
});

test('preview slots match the resting layout after a drop, including index zero', () => {
  assert.deepEqual([...previewAimTops(rows, 'A', 1)], [['B', 0], ['A', 72], ['C', 120], ['D', 176]]);
  assert.deepEqual([...previewAimTops(rows, 'A', 3)], [['B', 0], ['C', 72], ['D', 128], ['A', 192]]);
  assert.deepEqual([...previewAimTops(rows, 'D', 0)], [['D', 0], ['A', 64], ['B', 112], ['C', 184]]);
  assert.deepEqual([...previewAimTops(rows, 'B', 1)], [['A', 0], ['B', 48], ['C', 120], ['D', 176]]);
});

test('all preview permutations stay contiguous and match the committed Aim IDs', () => {
  let board = emptyAimBoard(new Date(2026, 8, 24, 12));
  const groupId = board.active.groups[0].id;
  for (const row of rows) board = addAim(board, row.id, groupId);
  const aims = board.active.groups[0].aims;
  for (const [sourceIndex, source] of rows.entries()) {
    for (let targetIndex = 0; targetIndex < rows.length; targetIndex += 1) {
      const preview = previewAimTops(rows, source.id, targetIndex);
      const expected = previewOrder(sourceIndex, targetIndex);
      assert.deepEqual([...preview.keys()], expected);
      let nextTop = rows[0].y;
      for (const id of expected) {
        assert.equal(preview.get(id), nextTop);
        nextTop += rows.find((row) => row.id === id).height;
      }
      assert.equal(nextTop, rows.at(-1).y + rows.at(-1).height);
      const committed = reorderAim(board, groupId, aims[sourceIndex].id, targetIndex);
      assert.deepEqual(committed.active.groups[0].aims.map((aim) => aim.text), expected);
    }
  }
});

test('drag offsets stay inside the measured Aim slots', () => {
  assert.equal(boundedAimOffset(rows, 'A', -500), 0);
  assert.equal(boundedAimOffset(rows, 'A', 500), 192);
  assert.equal(boundedAimOffset(rows, 'B', -500), -48);
  assert.equal(boundedAimOffset(rows, 'B', 500), 120);
  assert.equal(boundedAimOffset(rows, 'D', -500), -176);
  assert.equal(boundedAimOffset(rows, 'D', 500), 0);
  assert.equal(boundedAimOffset(rows, 'A', 36), 36);
});

test('a second drag uses the committed order rather than stale positions from the first drag', () => {
  const heights = new Map(rows.map(({ id, height }) => [id, height]));
  const initial = orderedAimLayouts(['A', 'B', 'C', 'D'], heights);
  assert.deepEqual(initial, rows);

  const firstPreview = previewAimTops(initial, 'A', 2);
  assert.deepEqual([...firstPreview], [['B', 0], ['C', 72], ['A', 128], ['D', 176]]);
  const committedIds = [...firstPreview.keys()];
  const secondLayouts = orderedAimLayouts(committedIds, heights);
  assert.deepEqual(secondLayouts, [
    { id: 'B', y: 0, height: 72 },
    { id: 'C', y: 72, height: 56 },
    { id: 'A', y: 128, height: 48 },
    { id: 'D', y: 176, height: 64 },
  ]);
  assert.equal(proposedAimIndex(secondLayouts, 'A', 2, 128), 2);
  assert.equal(proposedAimIndex(secondLayouts, 'A', 2, 20), 0);
  assert.deepEqual([...previewAimTops(secondLayouts, 'A', 0).keys()], ['A', 'B', 'C', 'D']);
  assert.equal(boundedAimOffset(secondLayouts, 'A', -1000), -128);
  assert.equal(boundedAimOffset(secondLayouts, 'A', 1000), 64);
});

test('ordered layouts reject missing or malformed measurements', () => {
  assert.equal(orderedAimLayouts(['A', 'B'], new Map([['A', 48]])), null);
  assert.equal(orderedAimLayouts(['A'], new Map([['A', 0]])), null);
});
