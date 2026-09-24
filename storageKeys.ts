export const STORAGE = {
  aim: '@studious/aim',
  displayName: 'studious.displayName',
  timer: '@studious/timer',
  custom: '@studious/custom-timer',
  history: '@studious/session-history',
  aimBoard: 'studious.aimBoardState',
  theme: 'studious.themeMode',
  legacyTheme: 'studyApp.themeMode',
  developer: 'studious.developerMode',
} as const;

export const STUDIOUS_RESET_KEYS = Object.values(STORAGE);
