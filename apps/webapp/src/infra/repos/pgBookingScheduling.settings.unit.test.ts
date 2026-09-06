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
  it('uses the requested organization for every booking limit', async () => {
    getServerRuntimeInteger
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(30);
    const port = createPgBookingSchedulingPort();

    await expect(port.getMinNoticeHours('clinic-1')).resolves.toBe(0);
    await expect(port.getMaxConsecutiveSlotHours('clinic-1')).resolves.toBe(6);
    // BAH-01/BAH-02: горизонт читается СВОИМ ключом и для ЗАПРОШЕННОЙ клиники. Метод склонирован с
    // соседних двух, поэтому правдоподобная поломка — оставленный ключ соседа: тогда календарём
    // записи молча управляет `booking_min_notice_hours` (0 → пустой календарь у всех клиник).
    await expect(port.getAvailabilityHorizonDays('clinic-1')).resolves.toBe(30);
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
    expect(getServerRuntimeInteger).toHaveBeenNthCalledWith(
      3,
      'booking_availability_horizon_days',
      'clinic-1',
    );
  });
});
