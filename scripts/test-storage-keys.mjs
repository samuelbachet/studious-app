import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE, STUDIOUS_RESET_KEYS } from '../storageKeys.ts';

test('reset is limited to the audited Studious-owned keys', () => {
  assert.deepEqual(STUDIOUS_RESET_KEYS, [
    '@studious/aim',
    'studious.displayName',
    'studious.homeHeadline',
    'studious.relaxHeadline',
    'studious.focusHeadline',
    '@studious/timer',
    '@studious/custom-timer',
    '@studious/session-history',
    'studious.aimBoardState',
    'studious.showPlanDate',
    'studious.showArchiveDates',
    'studious.showRelatedTags',
    'studious.showArchiveHeader',
    'studious.showOrganizeHeader',
    'studious.showSelectHeader',
    'studious.showOrganizerDeleteLabel',
    'studious.showOrganizerCompleteLabel',
    'studious.showOrganizerArchiveLabel',
    'studious.showOrganizerCancelLabel',
    'studious.showOrganizerSaveLabel',
    'studious.showNavigationLabels',
    'studious.showSettingsMinimalismLabel',
    'studious.showSettingsThemeLabel',
    'studious.largeUnlabeledNavigationIcons',
    'studious.largeUnlabeledOrganizeIcon',
    'studious.largeUnlabeledDeleteIcon',
    'studious.largeUnlabeledCompleteIcon',
    'studious.largeUnlabeledArchiveIcon',
    'studious.minimalism',
    'studious.minimalismIconSizes',
    'studious.themeMode',
    'studious.glassScheme',
    'studious.glassStyle',
    'studious.themePalette',
    'studyApp.themeMode',
    'studious.developerMode',
  ]);
  assert.equal(new Set(STUDIOUS_RESET_KEYS).size, STUDIOUS_RESET_KEYS.length);
  assert.deepEqual(STUDIOUS_RESET_KEYS, Object.values(STORAGE));
});
