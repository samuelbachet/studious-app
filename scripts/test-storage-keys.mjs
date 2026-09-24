import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE, STUDIOUS_RESET_KEYS } from '../storageKeys.ts';

test('reset is limited to the audited Studious-owned keys', () => {
  assert.deepEqual(STUDIOUS_RESET_KEYS, [
    '@studious/aim',
    'studious.displayName',
    '@studious/timer',
    '@studious/custom-timer',
    '@studious/session-history',
    'studious.themeMode',
    'studyApp.themeMode',
    'studious.developerMode',
  ]);
  assert.equal(new Set(STUDIOUS_RESET_KEYS).size, STUDIOUS_RESET_KEYS.length);
  assert.deepEqual(STUDIOUS_RESET_KEYS, Object.values(STORAGE));
});
