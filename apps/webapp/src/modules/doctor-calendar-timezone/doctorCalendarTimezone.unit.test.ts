import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ getAppDisplayTimeZone: vi.fn() }));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));

import { getDoctorCalendarDate } from './doctorCalendarTimezone';

describe('getDoctorCalendarDate (NOTE-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');
  });

  it('uses the stored specialist IANA date rather than the server UTC date', async () => {
    const port = { getIanaForDoctor: vi.fn().mockResolvedValue('America/Los_Angeles') };

    await expect(
      getDoctorCalendarDate('11111111-1111-4111-8111-111111111111', port, new Date('2026-09-08T00:30:00Z')),
    ).resolves.toEqual({ iana: 'America/Los_Angeles', date: '2026-09-07' });
  });

  it('falls back to app_display_timezone when the specialist has no stored IANA zone', async () => {
    const port = { getIanaForDoctor: vi.fn().mockResolvedValue(null) };

    await expect(
      getDoctorCalendarDate('11111111-1111-4111-8111-111111111111', port, new Date('2026-09-07T22:30:00Z')),
    ).resolves.toEqual({ iana: 'Europe/Moscow', date: '2026-09-08' });
  });
});
