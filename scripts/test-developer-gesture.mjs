import assert from 'node:assert/strict';
import test from 'node:test';
import { ABOUT_TAP_WINDOW_MS, emptyAboutTapSequence, recordAboutTap } from '../developerGesture.ts';

test('unlocks on five taps within three seconds', () => {
  let sequence = emptyAboutTapSequence;
  for (const time of [0, 550, 1100, 1650, 2200]) {
    const result = recordAboutTap(sequence, time);
    sequence = result.sequence;
    assert.equal(result.unlocked, time === 2200);
  }
  assert.deepEqual(sequence, emptyAboutTapSequence);
  assert.equal(ABOUT_TAP_WINDOW_MS, 3000);
});

test('expired and reversed timestamps restart the sequence', () => {
  const first = recordAboutTap(emptyAboutTapSequence, 100).sequence;
  assert.deepEqual(recordAboutTap(first, 3101).sequence, { count: 1, firstTapAt: 3101 });
  assert.deepEqual(recordAboutTap(first, 50).sequence, { count: 1, firstTapAt: 50 });
});
