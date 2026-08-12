import { describe, expect, it, vi } from 'vitest';
import type { ClientHistoryPort } from './ports';
import { createClientHistoryService } from './service';

describe('self-service booking policy', () => {
  it('rejects booking when the current-patient root returns false', async () => {
    const port = {
      isCurrentPatientSelfBookingAllowed: vi.fn().mockResolvedValue(false),
    } as unknown as ClientHistoryPort;

    await expect(
      createClientHistoryService(port).assertSelfServiceBookingAllowed(),
    ).rejects.toThrow('booking_blocked');
  });

  it('allows booking when the current-patient root returns true', async () => {
    const port = {
      isCurrentPatientSelfBookingAllowed: vi.fn().mockResolvedValue(true),
    } as unknown as ClientHistoryPort;

    await expect(
      createClientHistoryService(port).assertSelfServiceBookingAllowed(),
    ).resolves.toBeUndefined();
  });
});
