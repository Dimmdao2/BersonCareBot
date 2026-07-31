import { describe, expect, it } from 'vitest';
import { shouldRenderDailyWarmupBlock } from './PatientHomeToday';
import type { AppSession } from '@/shared/types/session';

const session = { user: { userId: 'patient-1' } } as unknown as AppSession;

describe('shouldRenderDailyWarmupBlock', () => {
  it('hides the daily-warmup home block for a logged-in patient whose clinic disabled warmups', () => {
    expect(shouldRenderDailyWarmupBlock(session, null)).toBe(false);
  });

  it('shows the daily-warmup home block for a logged-in patient whose clinic has warmups on', () => {
    expect(shouldRenderDailyWarmupBlock(session, 'org-1')).toBe(true);
  });

  it('shows the daily-warmup home block for an anonymous guest (no enrolled clinic to check)', () => {
    expect(shouldRenderDailyWarmupBlock(null, null)).toBe(true);
  });
});
