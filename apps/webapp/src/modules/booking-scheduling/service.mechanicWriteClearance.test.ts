import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createBookingSchedulingService } from './service';
import type { BookingSchedulingPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const createScheduleBlock = vi.fn(async () => ({
    id: 'block-1',
    organizationId: ORG_ID,
    specialistId: null,
    branchId: null,
    roomId: null,
    startAt: '2026-08-05T10:00:00.000Z',
    endAt: '2026-08-05T11:00:00.000Z',
    blockType: 'manual' as const,
    title: null,
    createdByActorId: null,
    createdAt: '2026-08-05T00:00:00.000Z',
  }));
  const createWorkingHours = vi.fn(async () => ({ id: 'wh-1' }));
  const port = {
    createScheduleBlock,
    deleteScheduleBlock: vi.fn(async () => true),
    createWorkingHours,
  } as unknown as BookingSchedulingPort;
  const service = createBookingSchedulingService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, createScheduleBlock, createWorkingHours };
}

describe('booking-scheduling service — 3.2 physical door (booking)', () => {
  it('refuses createScheduleBlock when no booking mutation decision ran first', () => {
    const { service, createScheduleBlock } = buildService();
    runWithoutMechanicWriteClearance(() => {
      expect(() =>
        service.createScheduleBlock({
          organizationId: ORG_ID,
          startAt: '2026-08-05T10:00:00.000Z',
          endAt: '2026-08-05T11:00:00.000Z',
          blockType: 'manual',
        }),
      ).toThrow(MechanicWriteClearanceRequiredError);
    });
    expect(createScheduleBlock).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared booking for this continuation', async () => {
    const { service, createScheduleBlock } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      const block = await service.createScheduleBlock({
        organizationId: ORG_ID,
        startAt: '2026-08-05T10:00:00.000Z',
        endAt: '2026-08-05T11:00:00.000Z',
        blockType: 'manual',
      });
      expect(block.id).toBe('block-1');
    });
    expect(createScheduleBlock).toHaveBeenCalledOnce();
  });

  it('refuses createWorkingHours when no booking mutation decision ran first', async () => {
    const { service, createWorkingHours } = buildService();
    runWithoutMechanicWriteClearance(() => {
      expect(() =>
        service.createWorkingHours({
          organizationId: ORG_ID,
          weekday: 1,
          startMinute: 540,
          endMinute: 1080,
        }),
      ).toThrow(MechanicWriteClearanceRequiredError);
    });
    expect(createWorkingHours).not.toHaveBeenCalled();
  });
});
