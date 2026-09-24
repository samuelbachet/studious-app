import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DISPLAY_NAME, DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName, restoreDisplayName } from '../displayName.ts';

test('nicknames are trimmed, accept ordinary characters, and stop at 18 characters', () => {
  assert.equal(DISPLAY_NAME_MAX_LENGTH, 18);
  assert.equal(normalizeDisplayName('  Alex  '), 'Alex');
  assert.equal(normalizeDisplayName('Study Buddy'), 'Study Buddy');
  assert.equal(normalizeDisplayName('Christopher-James'), 'Christopher-James');
  assert.equal(normalizeDisplayName("Sam's Notes 2"), "Sam's Notes 2");
  assert.equal(normalizeDisplayName('   '), null);
  assert.equal(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH)), 'a'.repeat(DISPLAY_NAME_MAX_LENGTH));
  assert.equal(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)), null);
});

test('missing or malformed stored nicknames use Scholar', () => {
  assert.equal(restoreDisplayName(null), DEFAULT_DISPLAY_NAME);
  assert.equal(restoreDisplayName('  '), DEFAULT_DISPLAY_NAME);
  assert.equal(restoreDisplayName('  Sam  '), 'Sam');
  assert.equal(restoreDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)), DEFAULT_DISPLAY_NAME);
});
