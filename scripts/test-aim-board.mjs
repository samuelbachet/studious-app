import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAim, addGroup, archiveSelected, DEFAULT_GROUP_TITLE, deleteAim, deleteGroup, deleteSelected, emptyAimBoard, localDateKey,
  renameAim, renameGroup, reorderAim, restoreAimBoard, retainRecentArchive, rollAimBoard, unarchiveSelected,
  updateAimNote, updateArchivedNote,
} from '../aimBoard.ts';

const today = new Date(2026, 8, 24, 12);
const tomorrow = new Date(2026, 8, 25, 12);

function withAims(count, state = emptyAimBoard(today), groupId = state.active.groups[0].id) {
  let next = state;
  for (let i = 0; i < count; i += 1) next = addAim(next, `Aim ${i + 1}`, groupId, today);
  return next;
}

test('fresh board has one empty default Aims group on the local date', () => {
  const board = emptyAimBoard(today);
  assert.equal(board.active.dateKey, '2026-09-24');
  assert.equal(board.active.groups.length, 1);
  assert.equal(board.active.groups[0].title, DEFAULT_GROUP_TITLE);
  assert.equal(board.active.groups[0].isDefault, true);
  assert.deepEqual(board.active.groups[0].aims, []);
  assert.deepEqual(board.archive, []);
  assert.equal(localDateKey(new Date(2026, 8, 24, 23, 59)), '2026-09-24');
  assert.equal(localDateKey(new Date(2026, 8, 25, 0, 0)), '2026-09-25');
});

test('aim creation targets its group, trims input, and caps each group at five', () => {
  let board = emptyAimBoard(today);
  const rootId = board.active.groups[0].id;
  board = addAim(board, '  Read chapter 4  ', rootId, today);
  assert.equal(board.active.groups[0].aims[0].text, 'Read chapter 4');
  assert.equal(addAim(board, '   ', rootId, today), board);
  for (let i = 2; i <= 5; i += 1) board = addAim(board, `Aim ${i}`, rootId, today);
  assert.equal(addAim(board, 'Sixth', rootId, today).active.groups[0].aims.length, 5);
  board = addGroup(board, '  Psychology  ', today);
  const secondId = board.active.groups[1].id;
  assert.equal(board.active.groups[1].title, 'Psychology');
  assert.equal(board.active.groups[1].isDefault, false);
  assert.deepEqual(board.active.groups[1].aims, []);
  board = withAims(5, board, secondId);
  assert.equal(board.active.groups[0].aims.length, 5);
  assert.equal(board.active.groups[1].aims.length, 5);
  assert.equal(addAim(board, 'Wrong group', 'missing', today), board);
});

test('new groups require a name; renamed empty default retains identity and persists', () => {
  const initial = emptyAimBoard(today);
  assert.equal(addGroup(initial, '   ', today), initial);
  const rootId = initial.active.groups[0].id;
  const renamed = renameGroup(initial, rootId, '  University  ');
  const withSecond = addGroup(renamed, 'Personal', today);
  assert.equal(withSecond.active.groups[0].id, rootId);
  assert.equal(withSecond.active.groups[0].title, 'University');
  assert.equal(withSecond.active.groups[0].isDefault, true);
  assert.equal(restoreAimBoard(JSON.stringify(withSecond), today).active.groups.length, 2);
  assert.equal(restoreAimBoard(JSON.stringify(withSecond), today).active.groups[0].title, 'University');
  assert.equal(renameGroup(withSecond, rootId, ' '), withSecond);
});

test('aim edits and notes persist, with 240-character note cap', () => {
  const initial = withAims(1);
  const aimId = initial.active.groups[0].aims[0].id;
  const renamed = renameAim(initial, aimId, '  Revise slides  ');
  const noted = updateAimNote(renamed, aimId, 'n'.repeat(300));
  assert.equal(noted.active.groups[0].aims[0].text, 'Revise slides');
  assert.equal(noted.active.groups[0].aims[0].note.length, 240);
  assert.equal(restoreAimBoard(JSON.stringify(noted), today).active.groups[0].aims[0].note.length, 240);
  assert.equal(renameAim(noted, aimId, ' '), noted);
});

test('aims reorder within their group without changing text, notes, or another group', () => {
  let board = withAims(3);
  board = addGroup(board, 'Research', today);
  board = withAims(2, board, board.active.groups[1].id);
  const root = board.active.groups[0];
  const other = board.active.groups[1];
  board = updateAimNote(board, root.aims[2].id, 'Keep this note');
  assert.equal(reorderAim(board, root.id, root.aims[0].id, 0), board);
  assert.equal(reorderAim(board, root.id, root.aims[0].id, -1), board);
  assert.equal(reorderAim(board, root.id, root.aims[0].id, 3), board);
  assert.equal(reorderAim(board, root.id, 'missing', 1), board);
  const moved = reorderAim(board, root.id, root.aims[2].id, 0);
  assert.deepEqual(moved.active.groups[0].aims.map((aim) => aim.id), [root.aims[2].id, root.aims[0].id, root.aims[1].id]);
  assert.equal(moved.active.groups[0].aims[0].note, 'Keep this note');
  assert.deepEqual(moved.active.groups[1], other);
  assert.deepEqual(restoreAimBoard(JSON.stringify(moved), today).active.groups[0].aims.map((aim) => aim.id), [root.aims[2].id, root.aims[0].id, root.aims[1].id]);
  const archived = archiveSelected(moved, new Set([root.aims[0].id]), today);
  const restored = unarchiveSelected(archived, new Set([root.aims[0].id]), today);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.id), [root.aims[2].id, root.aims[0].id, root.aims[1].id]);
});

test('empty groups cannot produce archive records', () => {
  const initial = addGroup(emptyAimBoard(today), 'Personal', today);
  assert.equal(archiveSelected(initial, new Set(['not-an-aim']), today), initial);
  assert.equal(initial.archive.length, 0);
  assert.equal(initial.active.groups.length, 2);
});

test('partial archive preserves title; default group stays when its last aim is archived', () => {
  const initial = withAims(3);
  const root = initial.active.groups[0];
  const [first, second, third] = root.aims;
  const renamed = renameGroup(initial, root.id, 'University');
  const withNote = updateAimNote(renamed, second.id, 'Review Durkheim examples');
  const partial = archiveSelected(withNote, new Set([second.id]), today);
  assert.deepEqual(partial.active.groups[0].aims.map((aim) => aim.id), [first.id, third.id]);
  assert.equal(partial.archive[0].title, 'University');
  assert.equal(partial.archive[0].originalDateKey, '2026-09-24');
  assert.equal(partial.archive[0].aims[0].note, 'Review Durkheim examples');
  assert.ok(partial.archive[0].aims[0].archivedAt);
  const done = archiveSelected(partial, new Set([first.id, third.id]), today);
  assert.equal(done.active.groups.length, 1);
  assert.equal(done.active.groups[0].id, root.id);
  assert.equal(done.active.groups[0].title, 'University');
  assert.deepEqual(done.active.groups[0].aims, []);
  assert.equal(done.archive[0].aims.length, 2);
  const updated = updateArchivedNote(done, second.id, 'Review references');
  assert.equal(restoreAimBoard(JSON.stringify(updated), today).archive[1].aims[0].note, 'Review references');
});

test('all aims in a non-default group archive together and remove that group', () => {
  const initial = addGroup(emptyAimBoard(today), 'Psychology', today);
  const group = initial.active.groups[1];
  const withItems = withAims(3, initial, group.id);
  const selected = new Set(withItems.active.groups[1].aims.map((aim) => aim.id));
  const archived = archiveSelected(withItems, selected, today);
  assert.equal(archived.active.groups.length, 1);
  assert.equal(archived.active.groups[0].isDefault, true);
  assert.equal(archived.archive[0].title, 'Psychology');
  assert.equal(archived.archive[0].aims.length, 3);
});

test('archiving the complete default group promotes the next existing group', () => {
  let board = withAims(2);
  const defaultId = board.active.groups[0].id;
  board = addGroup(board, 'Psychology', today);
  board = addAim(board, 'Review lecture', board.active.groups[1].id, today);
  const nextId = board.active.groups[1].id;
  const selected = new Set(board.active.groups[0].aims.map((aim) => aim.id));
  const archived = archiveSelected(board, selected, today);
  assert.equal(archived.active.groups.length, 1);
  assert.equal(archived.active.groups[0].id, nextId);
  assert.equal(archived.active.groups[0].isDefault, true);
  assert.equal(archived.active.groups[0].title, 'Psychology');
  assert.equal(archived.active.groups.some((group) => group.id === defaultId), false);
  assert.equal(archived.archive[0].originalGroupId, defaultId);
  assert.equal(restoreAimBoard(JSON.stringify(archived), today).active.groups[0].id, nextId);
});

test('archiving the only populated default group keeps it ready for new aims', () => {
  const board = withAims(1);
  const root = board.active.groups[0];
  const archived = archiveSelected(board, new Set([root.aims[0].id]), today);
  assert.equal(archived.active.groups.length, 1);
  assert.equal(archived.active.groups[0].id, root.id);
  assert.deepEqual(archived.active.groups[0].aims, []);
});

test('deleting an aim does not archive it; deleting a group removes its aims and promotes the next group', () => {
  let board = withAims(2);
  const root = board.active.groups[0];
  board = addGroup(board, 'Personal', today);
  const personalId = board.active.groups[1].id;
  const deletedAim = deleteAim(board, root.aims[0].id);
  assert.deepEqual(deletedAim.active.groups[0].aims.map((aim) => aim.id), [root.aims[1].id]);
  assert.deepEqual(deletedAim.archive, []);
  assert.equal(deleteAim(board, 'missing'), board);
  const deletedGroup = deleteGroup(deletedAim, root.id);
  assert.equal(deletedGroup.active.groups.length, 1);
  assert.equal(deletedGroup.active.groups[0].id, personalId);
  assert.equal(deletedGroup.active.groups[0].isDefault, true);
  assert.deepEqual(deletedGroup.archive, []);
  assert.equal(deleteGroup(board, 'missing'), board);
  const initial = emptyAimBoard(today);
  const fresh = deleteGroup(initial, initial.active.groups[0].id);
  assert.equal(fresh.active.groups.length, 1);
  assert.equal(fresh.active.groups[0].title, 'Aims');
  assert.notEqual(fresh.active.groups[0].id, initial.active.groups[0].id);
});

test('deleting selected aims keeps unselected aims and never creates archive records', () => {
  let board = withAims(3);
  board = addGroup(board, 'Research', today);
  board = withAims(2, board, board.active.groups[1].id);
  const root = board.active.groups[0];
  const research = board.active.groups[1];
  assert.equal(deleteSelected(board, new Set()), board);
  assert.equal(deleteSelected(board, new Set(['missing'])), board);
  const selected = new Set([root.aims[1].id, research.aims[0].id]);
  const updated = deleteSelected(board, selected);
  assert.deepEqual(updated.active.groups[0].aims.map((aim) => aim.id), [root.aims[0].id, root.aims[2].id]);
  assert.deepEqual(updated.active.groups[1].aims.map((aim) => aim.id), [research.aims[1].id]);
  assert.deepEqual(updated.archive, []);
  assert.deepEqual(restoreAimBoard(JSON.stringify(updated), today).active.groups.map((group) => group.aims.length), [2, 1]);
});

test('deleting selected whole groups promotes the next group or preserves the lone default', () => {
  let board = withAims(2);
  board = addGroup(board, 'Research', today);
  board = withAims(2, board, board.active.groups[1].id);
  const root = board.active.groups[0];
  const research = board.active.groups[1];
  const withoutResearch = deleteSelected(board, new Set(research.aims.map((aim) => aim.id)));
  assert.deepEqual(withoutResearch.active.groups.map((group) => group.id), [root.id]);
  const withoutRoot = deleteSelected(board, new Set(root.aims.map((aim) => aim.id)));
  assert.deepEqual(withoutRoot.active.groups.map((group) => group.id), [research.id]);
  assert.equal(withoutRoot.active.groups[0].isDefault, true);
  const withoutEverything = deleteSelected(board, new Set([...root.aims, ...research.aims].map((aim) => aim.id)));
  assert.equal(withoutEverything.active.groups.length, 1);
  assert.equal(withoutEverything.active.groups[0].id, root.id);
  assert.deepEqual(withoutEverything.active.groups[0].aims, []);
  assert.deepEqual(withoutEverything.archive, []);
});

test('selection may archive aims from several titles in one operation', () => {
  let board = withAims(1);
  board = addGroup(board, 'Research', today);
  board = addAim(board, 'Read a paper', board.active.groups[1].id, today);
  const selected = new Set(board.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const archived = archiveSelected(board, selected, today);
  assert.equal(archived.active.groups.length, 1);
  assert.deepEqual(archived.active.groups[0].aims, []);
  assert.deepEqual(new Set(archived.archive.map((group) => group.title)), new Set(['Aims', 'Research']));
});

test('unarchiving one aim restores its note to the original active group and leaves the rest archived', () => {
  const board = withAims(3);
  const root = board.active.groups[0];
  const noted = updateAimNote(board, root.aims[1].id, 'Original note');
  const archived = archiveSelected(noted, new Set(root.aims.map((aim) => aim.id)), today);
  const edited = updateArchivedNote(archived, root.aims[1].id, 'Edited in Archive');
  const restored = unarchiveSelected(edited, new Set([root.aims[1].id]), today);
  assert.equal(restored.active.groups[0].id, root.id);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.id), [root.aims[1].id]);
  assert.equal(restored.active.groups[0].aims[0].note, 'Edited in Archive');
  assert.equal('archivedAt' in restored.active.groups[0].aims[0], false);
  assert.deepEqual(restored.archive[0].aims.map((aim) => aim.id), [root.aims[0].id, root.aims[2].id]);
  assert.equal(restoreAimBoard(JSON.stringify(restored), today).active.groups[0].aims[0].note, 'Edited in Archive');
});

test('aims return to their original order after out-of-order partial archiving', () => {
  const initial = withAims(4);
  const root = initial.active.groups[0];
  const [first, second, third, fourth] = root.aims;
  const archivedThird = archiveSelected(initial, new Set([third.id]), today);
  const archivedFirst = archiveSelected(archivedThird, new Set([first.id]), today);
  const restoredFirst = unarchiveSelected(archivedFirst, new Set([first.id]), today);
  assert.deepEqual(restoredFirst.active.groups[0].aims.map((aim) => aim.id), [first.id, second.id, fourth.id]);
  const restoredThird = unarchiveSelected(restoredFirst, new Set([third.id]), today);
  assert.deepEqual(restoredThird.active.groups[0].aims.map((aim) => aim.id), [first.id, second.id, third.id, fourth.id]);
  assert.deepEqual(restoredThird.active.groups[0].aims.map((aim) => aim.order), [...restoredThird.active.groups[0].aims.map((aim) => aim.order)].sort((a, b) => a - b));
  assert.deepEqual(restoreAimBoard(JSON.stringify(restoredThird), today).active.groups[0].aims.map((aim) => aim.id), [first.id, second.id, third.id, fourth.id]);
});

test('whole groups return to their original order even when restored in reverse', () => {
  let board = withAims(1);
  board = addGroup(board, 'Second', today);
  board = addAim(board, 'Second aim', board.active.groups[1].id, today);
  board = addGroup(board, 'Third', today);
  board = addAim(board, 'Third aim', board.active.groups[2].id, today);
  const originalIds = board.active.groups.map((group) => group.id);
  const secondAimId = board.active.groups[1].aims[0].id;
  const firstAimId = board.active.groups[0].aims[0].id;
  board = archiveSelected(board, new Set([secondAimId]), today);
  board = archiveSelected(board, new Set([firstAimId]), today);
  assert.deepEqual(board.active.groups.map((group) => group.id), [originalIds[2]]);
  board = unarchiveSelected(board, new Set([secondAimId]), today);
  assert.deepEqual(board.active.groups.map((group) => group.id), [originalIds[1], originalIds[2]]);
  board = unarchiveSelected(board, new Set([firstAimId]), today);
  assert.deepEqual(board.active.groups.map((group) => group.id), originalIds);
  assert.equal(board.active.groups[0].isDefault, true);
  assert.equal(board.active.groups[1].isDefault, false);
});

test('unarchived older aims take their original places when the group is full', () => {
  let board = withAims(5);
  const root = board.active.groups[0];
  const olderIds = root.aims.slice(0, 2).map((aim) => aim.id);
  board = archiveSelected(board, new Set(olderIds), today);
  board = addAim(board, 'New sixth', root.id, today);
  board = addAim(board, 'New seventh', root.id, today);
  board = addGroup(board, 'Later group', today);
  const restored = unarchiveSelected(board, new Set(olderIds), today);
  assert.deepEqual(restored.active.groups.map((group) => group.title), ['Aims', 'Aims', 'Later group']);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.text), ['Aim 1', 'Aim 2', 'Aim 3', 'Aim 4', 'Aim 5']);
  assert.deepEqual(restored.active.groups[1].aims.map((aim) => aim.text), ['New sixth', 'New seventh']);
  assert.equal(restored.active.groups[1].originGroupId, root.id);
  assert.deepEqual(restoreAimBoard(JSON.stringify(restored), today).active.groups.map((group) => group.aims.length), [5, 2, 0]);
});

test('legacy board records without order fields load in their saved order', () => {
  const initial = withAims(3);
  const legacy = JSON.parse(JSON.stringify(initial));
  delete legacy.active.groups[0].order;
  for (const aim of legacy.active.groups[0].aims) delete aim.order;
  const restored = restoreAimBoard(JSON.stringify(legacy), today);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.text), ['Aim 1', 'Aim 2', 'Aim 3']);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.order), [0, 1, 2].map((index) => Date.parse(legacy.active.groups[0].aims[index].createdAt) * 100 + index));
});

test('legacy archived aim with an earlier creation time returns between active aims', () => {
  let board = emptyAimBoard(today);
  const rootId = board.active.groups[0].id;
  board = addAim(board, 'First', rootId, new Date(2026, 8, 24, 9, 0));
  board = addAim(board, 'Second', rootId, new Date(2026, 8, 24, 9, 1));
  board = addAim(board, 'Third', rootId, new Date(2026, 8, 24, 9, 2));
  const secondId = board.active.groups[0].aims[1].id;
  const archived = archiveSelected(board, new Set([secondId]), today);
  const legacy = JSON.parse(JSON.stringify(archived));
  delete legacy.active.groups[0].order;
  for (const aim of legacy.active.groups[0].aims) delete aim.order;
  delete legacy.archive[0].originalGroupOrder;
  delete legacy.archive[0].aims[0].order;
  const restored = unarchiveSelected(restoreAimBoard(JSON.stringify(legacy), today), new Set([secondId]), today);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.text), ['First', 'Second', 'Third']);
});

test('unarchiving across groups restores each title and removes empty archive records', () => {
  let board = withAims(1);
  board = addGroup(board, 'Research', today);
  board = addAim(board, 'Read a paper', board.active.groups[1].id, today);
  const ids = new Set(board.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const archived = archiveSelected(board, ids, today);
  const restored = unarchiveSelected(archived, ids, today);
  assert.equal(restored.archive.length, 0);
  assert.deepEqual(restored.active.groups.map((group) => group.title), ['Aims', 'Research']);
  assert.deepEqual(new Set(restored.active.groups.flatMap((group) => group.aims.map((aim) => aim.id))), ids);
  assert.equal(unarchiveSelected(restored, new Set(['missing']), today), restored);
});

test('older archived aims return to today without exceeding five per title', () => {
  const oldBoard = withAims(5);
  const ids = new Set(oldBoard.active.groups[0].aims.map((aim) => aim.id));
  const archived = rollAimBoard(oldBoard, tomorrow);
  let filled = archived;
  for (let i = 0; i < 5; i += 1) filled = addAim(filled, `Today's aim ${i + 1}`, filled.active.groups[0].id, tomorrow);
  const restored = unarchiveSelected(filled, ids, tomorrow);
  assert.equal(restored.active.dateKey, '2026-09-25');
  assert.equal(restored.active.groups.length, 2);
  assert.deepEqual(restored.active.groups.map((group) => group.aims.length), [5, 5]);
  assert.equal(restored.active.groups[1].title, 'Aims');
  assert.equal(restored.active.groups[1].dateKey, '2026-09-25');
  assert.equal(restored.archive.length, 0);
});

test('new day archives only populated groups and starts one fresh Aims group', () => {
  let board = withAims(2);
  board = addGroup(board, 'Empty', today);
  const rolled = rollAimBoard(board, tomorrow);
  assert.equal(rolled.active.dateKey, '2026-09-25');
  assert.equal(rolled.active.groups.length, 1);
  assert.equal(rolled.active.groups[0].title, 'Aims');
  assert.equal(rolled.active.groups[0].isDefault, true);
  assert.deepEqual(rolled.active.groups[0].aims, []);
  assert.equal(rolled.archive.length, 1);
  assert.equal(rolled.archive[0].aims.length, 2);
  assert.equal(rollAimBoard(rolled, tomorrow), rolled);
  const afterMissedDays = restoreAimBoard(JSON.stringify(board), new Date(2026, 8, 28, 12));
  assert.equal(afterMissedDays.archive.length, 1);
  assert.equal(afterMissedDays.archive[0].originalDateKey, '2026-09-24');
});

test('30-day retention uses original local calendar day', () => {
  const initial = withAims(2);
  const old = archiveSelected(initial, new Set(initial.active.groups[0].aims.map((aim) => aim.id)), today);
  const record = { ...old.archive[0], originalDateKey: '2026-08-26' };
  const expired = { ...record, id: 'expired', originalDateKey: '2026-08-25' };
  assert.deepEqual(retainRecentArchive([record, expired], today).map((group) => group.id), [record.id]);
  const stored = { active: { dateKey: '2026-09-24', groups: [] }, archive: [record, expired] };
  assert.deepEqual(restoreAimBoard(JSON.stringify(stored), today).archive.map((group) => group.id), [record.id]);
});

test('legacy boards gain default identity without losing their first title', () => {
  const initial = withAims(1);
  const old = JSON.parse(JSON.stringify(renameGroup(initial, initial.active.groups[0].id, 'Work')));
  delete old.active.groups[0].isDefault;
  const restored = restoreAimBoard(JSON.stringify(old), today);
  assert.equal(restored.active.groups.length, 1);
  assert.equal(restored.active.groups[0].title, 'Work');
  assert.equal(restored.active.groups[0].isDefault, true);
});

test('malformed storage is ignored while retaining a default group', () => {
  const fresh = restoreAimBoard('{bad json', today);
  assert.equal(fresh.active.groups.length, 1);
  assert.equal(fresh.active.groups[0].title, 'Aims');
  const initial = withAims(1);
  const corrupted = JSON.parse(JSON.stringify(initial));
  corrupted.active.groups[0].aims.push({ id: 'bad', text: '', note: '', createdAt: 'invalid' });
  corrupted.archive = [{ id: 'bad', aims: 'not an array' }];
  const restored = restoreAimBoard(JSON.stringify(corrupted), today);
  assert.equal(restored.active.groups[0].aims.length, 1);
  assert.deepEqual(restored.archive, []);
});
