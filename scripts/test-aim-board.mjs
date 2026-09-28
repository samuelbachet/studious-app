import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAim, addGroup, addSeptember23ArchivePreview, addSeptember23PreviewGroup, archiveSelected, completeArchivedSelected, completeSelected, completionDraftChanges, completionInDraft, DEFAULT_GROUP_TITLE, deleteAim, deleteArchivedSelected, deleteEmptyGroups, deleteGroup, deleteOrganizedArchivedSelected, deleteOrganizedSelected, deleteSelected, emptyAimBoard, goalCompletionInDraft, localDateKey,
  MAX_AIMS_PER_GROUP, MAX_GROUPS, prioritizeOldGroups, renameAim, renameGroup, reorderAim, restoreAimBoard, retainRecentArchive, rollAimBoard, selectedItemsAreComplete, setGoalCompletionDraft, unarchiveSelected,
  uncompleteArchivedSelected, uncompleteSelected, updateAimNote, updateArchivedNote,
} from '../aimBoard.ts';

const today = new Date(2026, 8, 24, 12);
const tomorrow = new Date(2026, 8, 25, 12);

function withAims(count, state = emptyAimBoard(today), groupId = state.active.groups[0].id) {
  let next = state;
  for (let i = 0; i < count; i += 1) next = addAim(next, `Aim ${i + 1}`, groupId, today);
  return next;
}

test('fresh empty board has one default Morning session group on the local date', () => {
  const board = emptyAimBoard(today);
  assert.equal(board.archiveTitle, 'Plans');
  assert.equal(board.active.dateKey, '2026-09-24');
  assert.equal(board.active.groups.length, 1);
  assert.equal(board.active.groups[0].title, DEFAULT_GROUP_TITLE);
  assert.equal(board.active.groups[0].isDefault, true);
  assert.deepEqual(board.active.groups[0].aims, []);
  assert.deepEqual(board.archive, []);
  assert.equal(localDateKey(new Date(2026, 8, 24, 23, 59)), '2026-09-24');
  assert.equal(localDateKey(new Date(2026, 8, 25, 0, 0)), '2026-09-25');
});

test('aim creation targets its group, trims input, and caps each group at ten', () => {
  let board = emptyAimBoard(today);
  const rootId = board.active.groups[0].id;
  board = addAim(board, '  Read chapter 4  ', rootId, today);
  assert.equal(board.active.groups[0].aims[0].text, 'Read chapter 4');
  assert.equal(addAim(board, '   ', rootId, today), board);
  for (let i = 2; i <= MAX_AIMS_PER_GROUP; i += 1) board = addAim(board, `Aim ${i}`, rootId, today);
  assert.equal(addAim(board, 'Eleventh', rootId, today).active.groups[0].aims.length, MAX_AIMS_PER_GROUP);
  board = addGroup(board, '  Psychology  ', today);
  const secondId = board.active.groups[1].id;
  assert.equal(board.active.groups[1].title, 'Psychology');
  assert.equal(board.active.groups[1].isDefault, false);
  assert.deepEqual(board.active.groups[1].aims, []);
  board = withAims(5, board, secondId);
  assert.equal(board.active.groups[0].aims.length, MAX_AIMS_PER_GROUP);
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

test('legacy Archive title becomes Plans while custom titles are preserved', () => {
  const board = emptyAimBoard(today);
  assert.equal(restoreAimBoard(JSON.stringify({ ...board, archiveTitle: 'Archive' }), today).archiveTitle, 'Plans');
  assert.equal(restoreAimBoard(JSON.stringify({ ...board, archiveTitle: 'Past work' }), today).archiveTitle, 'Past work');
});

test('headings, goals, steps, and notes can share identical text across Active and Archive', () => {
  let board = emptyAimBoard(today, 'Repeat');
  const firstId = board.active.groups[0].id;
  board = renameGroup(board, firstId, 'Repeat');
  board = addGroup(board, 'Repeat', today);
  board = addAim(board, 'Repeat', firstId, today, 'Repeat');
  board = addAim(board, 'Repeat', board.active.groups[1].id, today, 'Repeat');
  assert.deepEqual(board.active.groups.map((group) => group.title), ['Repeat', 'Repeat']);
  assert.deepEqual(board.active.groups.map((group) => group.aims[0].text), ['Repeat', 'Repeat']);
  assert.deepEqual(board.active.groups.map((group) => group.aims[0].note), ['Repeat', 'Repeat']);
  board = archiveSelected(board, new Set([board.active.groups[0].aims[0].id]), today, new Set(), new Set([firstId]));
  assert.equal(board.archive[0].archiveHeading, 'Repeat');
  assert.equal(board.archive[0].title, 'Repeat');
  board = addGroup(board, 'Repeat', today);
  assert.deepEqual(board.active.groups.map((group) => group.title), ['Repeat', 'Repeat']);
});

test('at most five active goals can be created', () => {
  let board = emptyAimBoard(today);
  for (let i = 2; i <= MAX_GROUPS; i += 1) board = addGroup(board, `Goal ${i}`, today);
  assert.equal(board.active.groups.length, MAX_GROUPS);
  assert.equal(addGroup(board, 'Too many', today), board);
  assert.equal(restoreAimBoard(JSON.stringify(board), tomorrow).active.groups.length, MAX_GROUPS);
});

test('new aims can include a trimmed note within the existing note limit', () => {
  const initial = emptyAimBoard(today);
  const groupId = initial.active.groups[0].id;
  const withNote = addAim(initial, 'Read Chapter 4', groupId, today, '  Key ideas to remember  ');
  assert.equal(withNote.active.groups[0].aims[0].note, 'Key ideas to remember');
  const longNote = addAim(initial, 'Read Chapter 5', groupId, today, 'n'.repeat(300));
  assert.equal(longNote.active.groups[0].aims[0].note.length, 240);
});

test('selected aims can be marked complete without changing other aims', () => {
  const initial = withAims(3);
  const [, second, third] = initial.active.groups[0].aims;
  const completed = completeSelected(initial, new Set([second.id, third.id]));
  assert.deepEqual(completed.active.groups[0].aims.map((aim) => aim.completed), [false, true, true]);
  assert.equal(completeSelected(completed, new Set([second.id])), completed);
  assert.equal(completeSelected(initial, new Set()), initial);
  assert.deepEqual(restoreAimBoard(JSON.stringify(completed), today).active.groups[0].aims.map((aim) => aim.completed), [false, true, true]);
  const reopened = uncompleteSelected(completed, new Set([second.id]));
  assert.deepEqual(reopened.active.groups[0].aims.map((aim) => aim.completed), [false, false, true]);
  assert.equal(uncompleteSelected(reopened, new Set([second.id])), reopened);
});

test('complete selection reopens only when every selected item is already complete', () => {
  const initial = withAims(3);
  const [first, second, third] = initial.active.groups[0].aims;
  const completed = completeSelected(initial, new Set([first.id, second.id]));
  const groups = completed.active.groups;
  const noEmptyGoals = new Set();
  assert.equal(selectedItemsAreComplete(groups, new Set(), noEmptyGoals), false);
  assert.equal(selectedItemsAreComplete(groups, new Set([first.id, second.id]), noEmptyGoals), true);
  assert.equal(selectedItemsAreComplete(groups, new Set([first.id, third.id]), noEmptyGoals), false);
  const mixedResult = completeSelected(completed, new Set([first.id, third.id]));
  assert.deepEqual(mixedResult.active.groups[0].aims.map((aim) => aim.completed), [true, true, true]);
  const reopened = uncompleteSelected(mixedResult, new Set([first.id, third.id]));
  assert.deepEqual(reopened.active.groups[0].aims.map((aim) => aim.completed), [false, true, false]);

  const empty = emptyAimBoard(today);
  const emptyGoalIds = new Set([empty.active.groups[0].id]);
  assert.equal(selectedItemsAreComplete(empty.active.groups, new Set(), emptyGoalIds), false);
  const completedEmpty = completeSelected(empty, new Set(), emptyGoalIds);
  assert.equal(selectedItemsAreComplete(completedEmpty.active.groups, new Set(), emptyGoalIds), true);
  const reopenedEmpty = uncompleteSelected(completedEmpty, new Set(), emptyGoalIds);
  assert.equal(selectedItemsAreComplete(reopenedEmpty.active.groups, new Set(), emptyGoalIds), false);

  const archived = archiveSelected(completed, new Set([first.id, second.id, third.id]), today);
  assert.equal(selectedItemsAreComplete(archived.archive, new Set([first.id, second.id]), new Set()), true);
  assert.equal(selectedItemsAreComplete(archived.archive, new Set([first.id, third.id]), new Set()), false);
  const archivedCompleted = completeArchivedSelected(archived, new Set([first.id, third.id]));
  const archivedReopened = uncompleteArchivedSelected(archivedCompleted, new Set([first.id, third.id]));
  assert.deepEqual(archivedReopened.archive[0].aims.map((aim) => aim.completed), [false, true, false]);
});

test('completion draft previews completed goals and saves mixed changes', () => {
  let initial = withAims(2);
  const [completedAim, incompleteAim] = initial.active.groups[0].aims;
  initial = completeSelected(initial, new Set([completedAim.id]));
  const goal = initial.active.groups[0];
  let draft = new Set([completedAim.id, incompleteAim.id]);
  assert.equal(completionInDraft(completedAim.id, true, draft), false);
  assert.equal(completionInDraft(incompleteAim.id, false, draft), true);
  assert.equal(goalCompletionInDraft(goal, draft), false);
  const changes = completionDraftChanges(initial.active.groups, draft);
  assert.deepEqual([...changes.completeAimIds], [incompleteAim.id]);
  assert.deepEqual([...changes.uncompleteAimIds], [completedAim.id]);
  const confirmed = completeSelected(initial, changes.completeAimIds);
  const remainingDraft = new Set([...draft].filter((id) => !changes.completeAimIds.has(id)));
  assert.deepEqual(confirmed.active.groups[0].aims.map((aim) => aim.completed), [true, true]);
  assert.deepEqual([...completionDraftChanges(confirmed.active.groups, remainingDraft).uncompleteAimIds], [completedAim.id]);
  const saved = uncompleteSelected(completeSelected(initial, changes.completeAimIds), changes.uncompleteAimIds);
  assert.deepEqual(saved.active.groups[0].aims.map((aim) => aim.completed), [false, true]);

  draft = setGoalCompletionDraft(draft, goal, true);
  assert.equal(goalCompletionInDraft(goal, draft), true);
  assert.deepEqual([...draft], [incompleteAim.id]);
  draft = setGoalCompletionDraft(draft, goal, false);
  assert.deepEqual(new Set(draft), new Set([completedAim.id]));
});

test('empty completed goals can be untapped in a draft and restored without saving', () => {
  const initial = emptyAimBoard(today);
  const emptyId = initial.active.groups[0].id;
  const completed = completeSelected(initial, new Set(), new Set([emptyId]));
  const goal = completed.active.groups[0];
  const untapped = setGoalCompletionDraft(new Set(), goal, false);
  assert.equal(goalCompletionInDraft(goal, untapped), false);
  assert.deepEqual([...completionDraftChanges(completed.active.groups, untapped).uncompleteEmptyGroupIds], [emptyId]);
  assert.deepEqual([...setGoalCompletionDraft(untapped, goal, true)], []);
});

test('archived completion drafts keep goal entries separate and save their own changes', () => {
  let initial = withAims(2);
  const [first, second] = initial.active.groups[0].aims;
  initial = completeSelected(initial, new Set([first.id]));
  const archived = archiveSelected(initial, new Set([first.id, second.id]), today);
  const changedIds = new Set([first.id, second.id]);
  const changes = completionDraftChanges(archived.archive, changedIds);
  const saved = uncompleteArchivedSelected(completeArchivedSelected(archived, changes.completeAimIds), changes.uncompleteAimIds);
  assert.deepEqual(saved.archive[0].aims.map((aim) => aim.completed), [false, true]);
});

test('completion state survives manual archive, day change, and unarchive', () => {
  const initial = withAims(2);
  const [done, unfinished] = initial.active.groups[0].aims;
  const completed = completeSelected(initial, new Set([done.id]));
  const archived = archiveSelected(completed, new Set([done.id, unfinished.id]), today);
  assert.deepEqual(archived.archive[0].aims.map((aim) => aim.completed), [true, false]);
  assert.deepEqual(rollAimBoard(completed, tomorrow).active.groups[0].aims.map((aim) => aim.completed), [true, false]);
  assert.deepEqual(rollAimBoard(completed, tomorrow).archive, []);
  const restored = unarchiveSelected(archived, new Set([done.id]), today);
  assert.equal(restored.active.groups.flatMap((group) => group.aims).find((aim) => aim.id === done.id)?.completed, true);
});

test('aims saved before completion support default to incomplete', () => {
  const legacy = JSON.parse(JSON.stringify(withAims(1)));
  delete legacy.active.groups[0].aims[0].completed;
  assert.equal(restoreAimBoard(JSON.stringify(legacy), today).active.groups[0].aims[0].completed, false);
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

test('empty groups archive only when explicitly selected and can be restored', () => {
  const initial = addGroup(emptyAimBoard(today), 'Personal', today);
  assert.equal(archiveSelected(initial, new Set(['not-an-aim']), today), initial);
  const personal = initial.active.groups[1];
  const archived = archiveSelected(initial, new Set(), today, new Set([personal.id]));
  assert.deepEqual(archived.active.groups.map((group) => group.id), [initial.active.groups[0].id]);
  assert.equal(archived.archive[0].title, 'Personal');
  assert.deepEqual(archived.archive[0].aims, []);
  assert.equal(restoreAimBoard(JSON.stringify(archived), today).archive[0].id, archived.archive[0].id);
  const restored = unarchiveSelected(archived, new Set(), today, new Set([archived.archive[0].id]));
  assert.equal(restored.archive.length, 0);
  assert.deepEqual(restored.active.groups.find((group) => group.title === 'Personal')?.aims, []);
});

test('empty default group can archive alone and restore as a separate old group', () => {
  const initial = emptyAimBoard(today);
  const previous = renameGroup(initial, initial.active.groups[0].id, 'University');
  const source = previous.active.groups[0];
  const archived = archiveSelected(previous, new Set(), today, new Set([source.id]));
  assert.equal(archived.active.groups.length, 0);
  assert.equal(restoreAimBoard(JSON.stringify(archived), today).active.groups.length, 0);
  let current = emptyAimBoard(tomorrow);
  current = addGroup(current, 'University', tomorrow);
  const restored = unarchiveSelected({ ...current, archive: archived.archive }, new Set(), tomorrow, new Set([archived.archive[0].id]));
  const oldGroup = restored.active.groups.find((group) => group.restoredFromDateKey === '2026-09-24');
  assert.equal(oldGroup?.title, 'University');
  assert.deepEqual(oldGroup?.aims, []);
  assert.notEqual(oldGroup?.id, current.active.groups[1].id);
  assert.equal(restored.archive.length, 0);
});

test('archived empty groups can be deleted alongside archived aims', () => {
  let board = withAims(1);
  board = addGroup(board, 'Personal', today);
  const aimId = board.active.groups[0].aims[0].id;
  const emptyId = board.active.groups[1].id;
  const archived = archiveSelected(board, new Set([aimId]), today, new Set([emptyId]));
  const emptyArchiveId = archived.archive.find((group) => group.aims.length === 0)?.id;
  assert.ok(emptyArchiveId);
  assert.equal(archived.archive.length, 2);
  const deleted = deleteArchivedSelected(archived, new Set([aimId]), new Set([emptyArchiveId]));
  assert.equal(deleted.archive.length, 0);
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
  assert.deepEqual(fresh.active.groups, []);
  assert.deepEqual(restoreAimBoard(JSON.stringify(fresh), today).active.groups, []);
  assert.deepEqual(rollAimBoard(fresh, today).active.groups, []);
  const addedAfterDelete = addGroup(fresh, 'Personal', today);
  assert.equal(addedAfterDelete.active.groups[0].isDefault, true);
  const selectedForDeletion = deleteEmptyGroups(initial, new Set([initial.active.groups[0].id]));
  assert.deepEqual(selectedForDeletion.active.groups, []);
  const populated = withAims(1);
  assert.equal(deleteEmptyGroups(populated, new Set([populated.active.groups[0].id])), populated);
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

test('explicitly deleting every selected goal leaves the active section empty', () => {
  let board = withAims(1);
  board = addGroup(board, 'Research', today);
  board = addAim(board, 'Read a paper', board.active.groups[1].id, today);
  const stepIds = new Set(board.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const goalIds = new Set(board.active.groups.map((group) => group.id));
  const deleted = deleteSelected(board, stepIds, goalIds);
  assert.deepEqual(deleted.active.groups, []);
  assert.deepEqual(deleted.archive, []);
});

test('organized deletion distinguishes a whole goal and individually chosen steps', () => {
  let board = withAims(2);
  board = addGroup(board, 'Research', today);
  board = withAims(2, board, board.active.groups[1].id);
  const [first, second] = board.active.groups;
  const whole = deleteOrganizedSelected(board, new Set(), new Set([first.id]));
  assert.deepEqual(whole.active.groups.map((group) => group.id), [second.id]);
  const cleared = deleteOrganizedSelected(board, new Set(first.aims.map((aim) => aim.id)), new Set());
  assert.equal(cleared.active.groups[0].id, first.id);
  assert.deepEqual(cleared.active.groups[0].aims, []);
  assert.equal(cleared.active.groups[1].aims.length, 2);
  const partial = deleteOrganizedSelected(board, new Set([first.aims[0].id]), new Set());
  assert.deepEqual(partial.active.groups[0].aims.map((aim) => aim.id), [first.aims[1].id]);
  const stepsOnly = deleteOrganizedSelected(board, new Set(second.aims.map((aim) => aim.id)), new Set());
  assert.deepEqual(stepsOnly.active.groups[1].aims, []);
  assert.equal(stepsOnly.active.groups[1].id, second.id);
});

test('organized Archive deletion keeps each step-cleared archive entry separate', () => {
  let board = withAims(3);
  const goal = board.active.groups[0];
  board = archiveSelected(board, new Set([goal.aims[0].id]), today);
  board = archiveSelected(board, new Set([goal.aims[1].id, goal.aims[2].id]), today);
  const archiveIds = new Set(board.archive.map((fragment) => fragment.id));
  const cleared = deleteOrganizedArchivedSelected(board, new Set(goal.aims.map((aim) => aim.id)), new Set());
  assert.equal(cleared.archive.length, 2);
  assert.ok(cleared.archive.every((entry) => entry.aims.length === 0));
  const oneGoalDeleted = deleteOrganizedArchivedSelected(board, new Set(), new Set([board.archive[0].id]));
  assert.deepEqual(oneGoalDeleted.archive.map((entry) => entry.id), [board.archive[1].id]);
  const whole = deleteOrganizedArchivedSelected(board, new Set(), archiveIds);
  assert.deepEqual(whole.archive, []);
  const partial = deleteOrganizedArchivedSelected(board, new Set([goal.aims[0].id]), new Set());
  assert.deepEqual(partial.archive.flatMap((fragment) => fragment.aims.map((aim) => aim.id)), [goal.aims[1].id, goal.aims[2].id]);
});

test('selection may archive aims from several titles in one operation', () => {
  let board = withAims(1);
  board = addGroup(board, 'Research', today);
  board = addAim(board, 'Read a paper', board.active.groups[1].id, today);
  const selected = new Set(board.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)));
  const archived = archiveSelected(board, selected, today);
  assert.equal(archived.active.groups.length, 1);
  assert.deepEqual(archived.active.groups[0].aims, []);
  assert.deepEqual(new Set(archived.archive.map((group) => group.title)), new Set([DEFAULT_GROUP_TITLE, 'Research']));
});

test('archiving a selected goal removes the whole goal from active groups', () => {
  let board = withAims(2);
  board = addGroup(board, 'Research', today);
  board = withAims(2, board, board.active.groups[1].id);
  const selectedGoal = board.active.groups[0];
  const remainingGoal = board.active.groups[1];
  const archived = archiveSelected(board, new Set(selectedGoal.aims.map((aim) => aim.id)), today, new Set(), new Set([selectedGoal.id]));
  assert.deepEqual(archived.active.groups.map((group) => group.id), [remainingGoal.id]);
  assert.equal(archived.active.groups[0].isDefault, true);
  assert.deepEqual(archived.archive[0].aims.map((aim) => aim.id), selectedGoal.aims.map((aim) => aim.id));

  const singleGoal = withAims(1);
  const onlyGoalArchived = archiveSelected(singleGoal, new Set(singleGoal.active.groups[0].aims.map((aim) => aim.id)), today, new Set(), new Set([singleGoal.active.groups[0].id]));
  assert.equal(onlyGoalArchived.active.groups.length, 0);
  assert.deepEqual(onlyGoalArchived.archive[0].aims.map((aim) => aim.id), singleGoal.active.groups[0].aims.map((aim) => aim.id));
});

test('deselected steps are deleted instead of archived when their selected goal is archived', () => {
  const board = withAims(3);
  const goal = board.active.groups[0];
  const selectedIds = new Set([goal.aims[0].id, goal.aims[2].id]);
  const archived = archiveSelected(board, selectedIds, today, new Set(), new Set([goal.id]));
  assert.equal(archived.active.groups.length, 0);
  assert.deepEqual(archived.archive[0].aims.map((aim) => aim.id), [goal.aims[0].id, goal.aims[2].id]);
  assert.equal(archived.archive[0].aims.some((aim) => aim.id === goal.aims[1].id), false);

  const allDeselected = archiveSelected(board, new Set(), today, new Set(), new Set([goal.id]));
  assert.equal(allDeselected.active.groups.length, 0);
  assert.equal(allDeselected.archive[0].aims.length, 0);
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

test('unarchiving a selected archived goal restores chosen steps and deletes excluded steps', () => {
  const board = withAims(3);
  const goal = board.active.groups[0];
  const archived = archiveSelected(board, new Set(goal.aims.map((aim) => aim.id)), today, new Set(), new Set([goal.id]));
  const restored = unarchiveSelected(archived, new Set([goal.aims[0].id, goal.aims[2].id]), today, new Set(), new Set([archived.archive[0].id]));
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.id), [goal.aims[0].id, goal.aims[2].id]);
  assert.equal(restored.archive.length, 0);
  assert.equal(restored.active.groups.some((group) => group.aims.some((aim) => aim.id === goal.aims[1].id)), false);
});

test('unarchiving a selected archived goal with every step excluded restores an empty goal', () => {
  const board = withAims(2);
  const goal = board.active.groups[0];
  const archived = archiveSelected(board, new Set(goal.aims.map((aim) => aim.id)), today, new Set(), new Set([goal.id]));
  const restored = unarchiveSelected(archived, new Set(), today, new Set(), new Set([archived.archive[0].id]));
  assert.equal(restored.archive.length, 0);
  assert.equal(restored.active.groups.length, 1);
  assert.equal(restored.active.groups[0].title, goal.title);
  assert.deepEqual(restored.active.groups[0].aims, []);
});

test('separate archive entries from one original goal unarchive independently', () => {
  const board = withAims(3);
  const goal = board.active.groups[0];
  const firstFragment = archiveSelected(board, new Set([goal.aims[0].id]), today);
  const splitArchive = archiveSelected(firstFragment, new Set([goal.aims[1].id, goal.aims[2].id]), today, new Set(), new Set([goal.id]));
  assert.equal(splitArchive.archive.length, 2);
  const [newer, older] = splitArchive.archive;
  const restored = unarchiveSelected(splitArchive, new Set([newer.aims[0].id]), today, new Set(), new Set([newer.id]));
  assert.deepEqual(restored.archive.map((entry) => entry.id), [older.id]);
  assert.deepEqual(restored.active.groups.flatMap((group) => group.aims.map((aim) => aim.id)), [goal.aims[1].id]);
  const restoredOther = unarchiveSelected(restored, new Set([older.aims[0].id]), today, new Set(), new Set([older.id]));
  assert.equal(restoredOther.archive.length, 0);
  assert.equal(restoredOther.active.groups.length, 2);
  assert.deepEqual(new Set(restoredOther.active.groups.flatMap((group) => group.aims.map((aim) => aim.id))), new Set([goal.aims[0].id, goal.aims[1].id]));
  assert.notEqual(restoredOther.active.groups[0].id, restoredOther.active.groups[1].id);
});

test('same-named goals with identical steps remain distinct through archive and unarchive', () => {
  let board = emptyAimBoard(today);
  const firstId = board.active.groups[0].id;
  board = renameGroup(board, firstId, 'Repeat');
  board = addAim(board, 'Same step', firstId, today);
  board = addGroup(board, 'Repeat', today);
  const secondId = board.active.groups[1].id;
  board = addAim(board, 'Same step', secondId, today);
  const [first, second] = board.active.groups;
  const archived = archiveSelected(board, new Set([first.aims[0].id, second.aims[0].id]), today, new Set(), new Set([firstId, secondId]));
  assert.equal(archived.archive.length, 2);
  assert.deepEqual(new Set(archived.archive.map((entry) => entry.originalGroupId)), new Set([firstId, secondId]));
  const [secondEntry, firstEntry] = archived.archive;
  const firstRestored = unarchiveSelected(archived, new Set([firstEntry.aims[0].id]), today, new Set(), new Set([firstEntry.id]));
  assert.deepEqual(firstRestored.archive.map((entry) => entry.id), [secondEntry.id]);
  const bothRestored = unarchiveSelected(firstRestored, new Set([secondEntry.aims[0].id]), today, new Set(), new Set([secondEntry.id]));
  assert.equal(bothRestored.active.groups.length, 2);
  assert.deepEqual(bothRestored.active.groups.map((group) => group.title), ['Repeat', 'Repeat']);
  assert.notEqual(bothRestored.active.groups[0].id, bothRestored.active.groups[1].id);
  assert.deepEqual(bothRestored.active.groups.map((group) => group.aims[0].text), ['Same step', 'Same step']);
});

test('unarchiving a whole goal does not merge it with an active same-named remainder', () => {
  const board = withAims(2);
  const original = board.active.groups[0];
  const archived = archiveSelected(board, new Set([original.aims[0].id]), today);
  const archiveEntry = archived.archive[0];
  const restored = unarchiveSelected(archived, new Set([original.aims[0].id]), today, new Set(), new Set([archiveEntry.id]));
  assert.equal(restored.active.groups.length, 2);
  assert.deepEqual(restored.active.groups.map((group) => group.title), [original.title, original.title]);
  assert.deepEqual(restored.active.groups.map((group) => group.aims.map((aim) => aim.id)), [[original.aims[1].id], [original.aims[0].id]]);
  assert.notEqual(restored.active.groups[0].id, restored.active.groups[1].id);
  const rearchived = archiveSelected(restored, new Set([original.aims[0].id, original.aims[1].id]), today, new Set(), new Set(restored.active.groups.map((group) => group.id)));
  assert.equal(rearchived.archive.length, 2);
  assert.deepEqual(new Set(rearchived.archive.map((entry) => entry.originalGroupId)), new Set(restored.active.groups.map((group) => group.id)));
});

test('older archived group restores separately with a date header and Old marker', () => {
  let previousDay = emptyAimBoard(today);
  previousDay = renameGroup(previousDay, previousDay.active.groups[0].id, 'University');
  previousDay = addAim(previousDay, 'Read Chapter 4', previousDay.active.groups[0].id, today);
  const rolled = archiveSelected(previousDay, new Set(previousDay.active.groups[0].aims.map((aim) => aim.id)), today);
  const archivedAimId = rolled.archive[0].aims[0].id;

  let currentDay = emptyAimBoard(tomorrow);
  currentDay = addGroup(currentDay, 'University', tomorrow);
  const currentGroup = currentDay.active.groups[1];
  currentDay = addAim(currentDay, 'Attend lecture', currentGroup.id, tomorrow);
  const restored = unarchiveSelected({ ...currentDay, archive: rolled.archive }, new Set([archivedAimId]), tomorrow);
  const university = restored.active.groups.find((group) => group.id === currentGroup.id);
  const oldUniversity = restored.active.groups.find((group) => group.restoredFromDateKey === '2026-09-24');

  assert.ok(university);
  assert.deepEqual(university.aims.map((aim) => aim.text), ['Attend lecture']);
  assert.ok(oldUniversity);
  assert.equal(oldUniversity.title, 'University');
  assert.notEqual(oldUniversity.id, currentGroup.id);
  assert.deepEqual(oldUniversity.aims.map((aim) => aim.text), ['Read Chapter 4']);
  assert.equal(oldUniversity.restoredFromGroupId, rolled.archive[0].originalGroupId);
  const displayedGroups = prioritizeOldGroups(restored.active.groups);
  assert.equal(displayedGroups[0].id, oldUniversity.id);
  assert.equal(displayedGroups.find((group) => group.isDefault)?.id, restored.active.groups.find((group) => group.isDefault)?.id);
  const hydrated = restoreAimBoard(JSON.stringify(restored), tomorrow);
  assert.equal(hydrated.active.groups.find((group) => group.id === oldUniversity.id)?.restoredFromDateKey, '2026-09-24');
});

test('September 23 preview is a persisted old group separate from a same-named current group', () => {
  let board = addGroup(emptyAimBoard(today), 'University', today);
  board = addAim(board, 'Attend lecture', board.active.groups[1].id, today);
  const preview = addSeptember23PreviewGroup(board, today);
  const currentGroup = preview.active.groups.find((group) => group.id === board.active.groups[1].id);
  const oldGroup = preview.active.groups.find((group) => group.restoredFromDateKey === '2026-09-23');

  assert.ok(currentGroup);
  assert.deepEqual(currentGroup.aims.map((aim) => aim.text), ['Attend lecture']);
  assert.ok(oldGroup);
  assert.equal(oldGroup.title, 'University');
  assert.notEqual(oldGroup.id, currentGroup.id);
  assert.deepEqual(oldGroup.aims.map((aim) => aim.text), ['Read Chapter 4']);
  assert.equal(oldGroup.aims[0].completed, false);
  assert.equal(preview.archive.some((group) => group.aims.some((aim) => aim.text === 'Read Chapter 4')), false);
  const hydrated = restoreAimBoard(JSON.stringify(preview), today);
  assert.equal(hydrated.active.groups.find((group) => group.restoredFromDateKey === '2026-09-23')?.aims[0]?.text, 'Read Chapter 4');

  const archivedAgain = archiveSelected(preview, new Set([oldGroup.aims[0].id]), today);
  const archiveRecord = archivedAgain.archive.find((group) => group.aims.some((aim) => aim.text === 'Read Chapter 4'));
  assert.equal(archiveRecord?.originalDateKey, '2026-09-23');
  assert.equal(archiveRecord?.title, 'University');
});

test('September 23 preview appears in Archive and archived selection can complete or delete it', () => {
  const preview = addSeptember23ArchivePreview(emptyAimBoard(today), today);
  const sample = preview.archive.find((group) => group.title === 'University' && group.aims.some((aim) => aim.text === 'Read Chapter 4'));
  assert.ok(sample);
  assert.equal(sample.originalDateKey, '2026-09-23');
  const aimId = sample.aims.find((aim) => aim.text === 'Read Chapter 4').id;

  const completed = completeArchivedSelected(preview, new Set([aimId]));
  assert.equal(completed.archive.find((group) => group.id === sample.id)?.aims[0].completed, true);
  const reopened = uncompleteArchivedSelected(completed, new Set([aimId]));
  assert.equal(reopened.archive.find((group) => group.id === sample.id)?.aims[0].completed, false);
  assert.equal(completed.active.dateKey, preview.active.dateKey);
  assert.equal(deleteArchivedSelected(completed, new Set([aimId])).archive.length, 0);

  const staleArchive = { ...preview, archive: preview.archive.map((group) => group.id === sample.id ? { ...group, originalDateKey: '2026-09-24' } : group) };
  assert.equal(addSeptember23ArchivePreview(staleArchive, today).archive.find((group) => group.id === sample.id)?.originalDateKey, '2026-09-23');
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
  let board = withAims(10);
  const root = board.active.groups[0];
  const olderIds = root.aims.slice(0, 2).map((aim) => aim.id);
  board = archiveSelected(board, new Set(olderIds), today);
  board = addAim(board, 'New eleventh', root.id, today);
  board = addAim(board, 'New twelfth', root.id, today);
  board = addGroup(board, 'Later group', today);
  const restored = unarchiveSelected(board, new Set(olderIds), today);
  assert.deepEqual(restored.active.groups.map((group) => group.title), [DEFAULT_GROUP_TITLE, DEFAULT_GROUP_TITLE, 'Later group']);
  assert.deepEqual(restored.active.groups[0].aims.map((aim) => aim.text), ['Aim 1', 'Aim 2', 'Aim 3', 'Aim 4', 'Aim 5', 'Aim 6', 'Aim 7', 'Aim 8', 'Aim 9', 'Aim 10']);
  assert.deepEqual(restored.active.groups[1].aims.map((aim) => aim.text), ['New eleventh', 'New twelfth']);
  assert.equal(restored.active.groups[1].originGroupId, root.id);
  assert.deepEqual(restoreAimBoard(JSON.stringify(restored), today).active.groups.map((group) => group.aims.length), [10, 2, 0]);
});

test('unarchive does not exceed five active goals or discard archived data', () => {
  let board = emptyAimBoard(today);
  board = addGroup(board, 'Archived goal', today);
  const archivedGroup = board.active.groups[1];
  board = addAim(board, 'Keep me', archivedGroup.id, today);
  board = archiveSelected(board, new Set([board.active.groups[1].aims[0].id]), today, new Set(), new Set([archivedGroup.id]));
  while (board.active.groups.length < MAX_GROUPS) board = addGroup(board, `Active ${board.active.groups.length + 1}`, today);
  const selectedIds = new Set(board.archive[0].aims.map((aim) => aim.id));
  const unchanged = unarchiveSelected(board, selectedIds, today, new Set(), new Set([board.archive[0].id]));
  assert.equal(unchanged, board);
  assert.equal(unchanged.archive[0].aims[0].text, 'Keep me');
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
  assert.deepEqual(restored.active.groups.map((group) => group.title), [DEFAULT_GROUP_TITLE, 'Research']);
  assert.deepEqual(new Set(restored.active.groups.flatMap((group) => group.aims.map((aim) => aim.id))), ids);
  assert.equal(unarchiveSelected(restored, new Set(['missing']), today), restored);
});

test('older archived aims return to today without exceeding ten per title', () => {
  const oldBoard = withAims(10);
  const ids = new Set(oldBoard.active.groups[0].aims.map((aim) => aim.id));
  const archived = archiveSelected(oldBoard, ids, today);
  let filled = rollAimBoard(archived, tomorrow);
  for (let i = 0; i < 10; i += 1) filled = addAim(filled, `Today's aim ${i + 1}`, filled.active.groups[0].id, tomorrow);
  const restored = unarchiveSelected(filled, ids, tomorrow);
  assert.equal(restored.active.dateKey, '2026-09-25');
  assert.equal(restored.active.groups.length, 2);
  assert.deepEqual(restored.active.groups.map((group) => group.aims.length), [10, 10]);
  assert.equal(restored.active.groups[1].title, DEFAULT_GROUP_TITLE);
  assert.equal(restored.active.groups[1].dateKey, '2026-09-25');
  assert.equal(restored.archive.length, 0);
});

test('new day preserves active goals and steps without automatic archiving', () => {
  let board = withAims(2);
  board = addGroup(board, 'Empty', today);
  const rolled = rollAimBoard(board, tomorrow);
  assert.equal(rolled.active.dateKey, '2026-09-25');
  assert.equal(rolled.active.groups.length, 2);
  assert.equal(rolled.active.groups[0].title, DEFAULT_GROUP_TITLE);
  assert.equal(rolled.active.groups[0].isDefault, true);
  assert.deepEqual(rolled.active.groups[0].aims, board.active.groups[0].aims);
  assert.equal(rolled.active.groups[1].title, 'Empty');
  assert.ok(rolled.active.groups.every((group) => group.dateKey === '2026-09-25'));
  assert.equal(rolled.archive.length, 0);
  assert.equal(rollAimBoard(rolled, tomorrow), rolled);
  const afterMissedDays = restoreAimBoard(JSON.stringify(board), new Date(2026, 8, 28, 12));
  assert.equal(afterMissedDays.archive.length, 0);
  assert.equal(afterMissedDays.active.groups.length, 2);
  assert.deepEqual(afterMissedDays.active.groups[0].aims, board.active.groups[0].aims);
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
  assert.equal(fresh.active.groups[0].title, DEFAULT_GROUP_TITLE);
  const initial = withAims(1);
  const corrupted = JSON.parse(JSON.stringify(initial));
  corrupted.active.groups[0].aims.push({ id: 'bad', text: '', note: '', createdAt: 'invalid' });
  corrupted.archive = [{ id: 'bad', aims: 'not an array' }];
  const restored = restoreAimBoard(JSON.stringify(corrupted), today);
  assert.equal(restored.active.groups[0].aims.length, 1);
  assert.deepEqual(restored.archive, []);
});
