import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  MAX_PROGRAM_ITEM_TODAY_DOTS,
  resolveProgramItemExecutionDots,
} from './programItemExecutionDisplay';

const now = DateTime.fromISO('2026-08-17T12:00:00+03:00');

describe('resolveProgramItemExecutionDots', () => {
  it('keeps the dot gray when a stale completedAt/lastIso is today but no done event exists', () => {
    expect(
      resolveProgramItemExecutionDots({
        lastIso: '2026-08-17T08:00:00.000Z',
        todayCount: 0,
        zone: 'Europe/Moscow',
        now,
      }),
    ).toEqual({ variant: 'gray', dotCount: 1, dotOverflow: 0 });
  });

  it('renders exactly one green dot per persisted done event for this item', () => {
    expect(
      resolveProgramItemExecutionDots({
        lastIso: '2026-08-17T08:00:00.000Z',
        todayCount: 1,
        zone: 'Europe/Moscow',
        now,
      }),
    ).toMatchObject({ variant: 'green', dotCount: 1 });
    expect(
      resolveProgramItemExecutionDots({
        lastIso: '2026-08-17T08:00:00.000Z',
        todayCount: 3,
        zone: 'Europe/Moscow',
        now,
      }),
    ).toMatchObject({ variant: 'green', dotCount: 3 });
  });

  it('caps only the visual count and reports overflow', () => {
    expect(
      resolveProgramItemExecutionDots({
        lastIso: null,
        todayCount: MAX_PROGRAM_ITEM_TODAY_DOTS + 2,
        zone: 'Europe/Moscow',
        now,
      }),
    ).toEqual({ variant: 'green', dotCount: MAX_PROGRAM_ITEM_TODAY_DOTS, dotOverflow: 2 });
  });
});
