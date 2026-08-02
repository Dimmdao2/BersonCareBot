import { describe, expect, it, vi } from 'vitest';

const getServerRuntimeInteger = vi.fn();

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getServerRuntimeInteger,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: vi.fn(),
}));

const { createPgBookingSchedulingPort } = await import('./pgBookingScheduling');

describe('createPgBookingSchedulingPort runtime settings', () => {
  it('uses the requested organization for both booking limits', async () => {
    getServerRuntimeInteger.mockResolvedValueOnce(0).mockResolvedValueOnce(6);
    const port = createPgBookingSchedulingPort();

    await expect(port.getMinNoticeHours('clinic-1')).resolves.toBe(0);
    await expect(port.getMaxConsecutiveSlotHours('clinic-1')).resolves.toBe(6);
    expect(getServerRuntimeInteger).toHaveBeenNthCalledWith(
      1,
      'booking_min_notice_hours',
      'clinic-1',
    );
    expect(getServerRuntimeInteger).toHaveBeenNthCalledWith(
      2,
      'booking_max_consecutive_slot_hours',
      'clinic-1',
    );
  });
});
