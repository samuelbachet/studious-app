export const ABOUT_TAP_WINDOW_MS = 3_000;

export type AboutTapSequence = { count: number; firstTapAt: number };

export const emptyAboutTapSequence: AboutTapSequence = { count: 0, firstTapAt: 0 };

export function recordAboutTap(previous: AboutTapSequence, now: number): { sequence: AboutTapSequence; unlocked: boolean } {
  const expired = previous.count === 0 || now < previous.firstTapAt || now - previous.firstTapAt > ABOUT_TAP_WINDOW_MS;
  const sequence = expired ? { count: 1, firstTapAt: now } : { count: previous.count + 1, firstTapAt: previous.firstTapAt };
  return sequence.count >= 5
    ? { sequence: emptyAboutTapSequence, unlocked: true }
    : { sequence, unlocked: false };
}
