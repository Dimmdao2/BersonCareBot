import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createBookingFormService } from './service';
import type { BookingFormPort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const upsertFieldAdmin = vi.fn(async () => ({ id: 'field-1' }) as never);
  const port = {
    listActiveFields: vi.fn(async () => []),
    listAllFieldsAdmin: vi.fn(async () => []),
    upsertFieldAdmin,
    saveSubmissions: vi.fn(),
  } as unknown as BookingFormPort;
  const service = createBookingFormService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, upsertFieldAdmin };
}

describe('booking-form — 3.2 physical door (booking)', () => {
  it('refuses upsertAdminField when no booking mutation decision ran first', async () => {
    const { service, upsertFieldAdmin } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.upsertAdminField(ORG_ID, {
          fieldKey: 'phone',
          fieldType: 'text',
          label: 'Телефон',
          isRequired: true,
          visibleToPatient: true,
          visibleToStaff: true,
          sortOrder: 0,
          isActive: true,
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(upsertFieldAdmin).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared booking for this continuation', async () => {
    const { service, upsertFieldAdmin } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      const field = await service.upsertAdminField(ORG_ID, {
        fieldKey: 'phone',
        fieldType: 'text',
        label: 'Телефон',
        isRequired: true,
        visibleToPatient: true,
        visibleToStaff: true,
        sortOrder: 0,
        isActive: true,
      });
      expect(field.id).toBe('field-1');
    });
    expect(upsertFieldAdmin).toHaveBeenCalledOnce();
  });
});
