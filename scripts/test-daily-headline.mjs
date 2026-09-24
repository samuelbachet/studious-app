import assert from 'node:assert/strict';
import test from 'node:test';
import { DAILY_HEADLINES, getDailyHeadline } from '../dailyHeadline.ts';

test('uses the approved phrases in order and wraps after seven local dates', () => {
  assert.deepEqual(DAILY_HEADLINES, [
    'Grow with calm',
    'Focus with ease',
    'Progress with peace',
    'Learn with intention',
    'Move with clarity',
    'Breathe then begin',
    'Steady mind forward',
  ]);
  for (let day = 0; day < 14; day += 1) {
    assert.equal(getDailyHeadline(new Date(2026, 0, day + 1, 12)), DAILY_HEADLINES[day % 7]);
  }
});

test('is stable across the full local day and changes on the next local date', () => {
  const atStart = new Date(2026, 2, 8, 0, 0);
  const atEnd = new Date(2026, 2, 8, 23, 59);
  const nextDay = new Date(2026, 2, 9, 0, 0);
  assert.equal(getDailyHeadline(atStart), getDailyHeadline(atEnd));
  assert.notEqual(getDailyHeadline(atEnd), getDailyHeadline(nextDay));
  assert.equal(getDailyHeadline(atStart), getDailyHeadline(new Date(atStart.getTime())));
});

test('handles dates before the anchor without a negative index', () => {
  assert.equal(getDailyHeadline(new Date(2025, 11, 31, 12)), DAILY_HEADLINES[6]);
});
