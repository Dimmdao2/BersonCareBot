/**
 * Census finding 0.2 (`docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md`): `getByIdForUser`,
 * `getById`, `getByCanonicalAppointmentId` used to run `SELECT * FROM patient_bookings …`
 * through the hand-typed `Row`. They now go through the Drizzle query builder against the
 * schema-typed `patientBookings` table. These tests are the behavioural proof that the
 * conversion did not change what a caller sees: same filter columns, same single-row result,
 * same mapped record shape — and that these three paths no longer call the raw-SQL bridge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappPgText: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: 'staff' as const }),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: () => ({ select: fakes.select }) }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: fakes.runWebappPgText,
}));

import { pgPatientBookingsPort } from './pgPatientBookings';
import { patientBookings } from '../../../db/schema/schema';

const TABLE_ROW = {
  id: 'booking-1',
  organizationId: 'org-1',
  platformUserId: 'user-1',
  bookingType: 'in_person',
  city: 'msk',
  category: 'rehab_lfk',
  slotStart: '2026-08-20T09:00:00.000Z',
  slotEnd: '2026-08-20T09:30:00.000Z',
  status: 'confirmed',
  cancelledAt: null,
  cancelReason: null,
  gcalEventId: null,
  contactPhone: '+79001234567',
  contactEmail: null,
  contactName: 'Иван Иванов',
  reminder24HSent: false,
  reminder2HSent: false,
  createdAt: '2026-08-18T09:00:00.000Z',
  updatedAt: '2026-08-18T09:00:00.000Z',
  branchId: 'branch-1',
  serviceId: 'service-1',
  branchServiceId: 'branch-service-1',
  cityCodeSnapshot: 'msk',
  branchTitleSnapshot: 'Branch',
  serviceTitleSnapshot: 'Service',
  durationMinutesSnapshot: 30,
  priceMinorSnapshot: 100000,
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
  canonicalAppointmentId: 'canon-1',
};

function buildSelectChain(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.where = vi.fn(self);
  chain.limit = vi.fn(async () => result);
  return chain;
}

const EXPECTED_RECORD = {
  id: 'booking-1',
  organizationId: 'org-1',
  userId: 'user-1',
  bookingType: 'in_person',
  city: 'msk',
  category: 'rehab_lfk',
  slotStart: '2026-08-20T09:00:00.000Z',
  slotEnd: '2026-08-20T09:30:00.000Z',
  status: 'confirmed',
  cancelledAt: null,
  cancelReason: null,
  gcalEventId: null,
  contactPhone: '+79001234567',
  contactEmail: null,
  contactName: 'Иван Иванов',
  reminder24hSent: false,
  reminder2hSent: false,
  createdAt: '2026-08-18T09:00:00.000Z',
  updatedAt: '2026-08-18T09:00:00.000Z',
  branchServiceId: 'branch-service-1',
  branchId: 'branch-1',
  serviceId: 'service-1',
  cityCodeSnapshot: 'msk',
  branchTitleSnapshot: 'Branch',
  serviceTitleSnapshot: 'Service',
  durationMinutesSnapshot: 30,
  priceMinorSnapshot: 100000,
  canonicalAppointmentId: 'canon-1',
  canonicalInPersonContext: null,
  provenanceCreatedBy: null,
  provenanceUpdatedBy: null,
};

describe('pgPatientBookings staff table lookup (SELECT * removed, finding 0.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getByIdForUser filters by id AND platform_user_id and maps the schema row', async () => {
    const chain = buildSelectChain([TABLE_ROW]);
    fakes.select.mockReturnValue(chain);

    const record = await pgPatientBookingsPort.getByIdForUser('booking-1', 'user-1');

    expect(chain.from).toHaveBeenCalledWith(patientBookings);
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(record).toEqual(EXPECTED_RECORD);
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });

  it('getById filters by id only and maps the schema row', async () => {
    const chain = buildSelectChain([TABLE_ROW]);
    fakes.select.mockReturnValue(chain);

    const record = await pgPatientBookingsPort.getById('booking-1');

    expect(chain.from).toHaveBeenCalledWith(patientBookings);
    expect(record).toEqual(EXPECTED_RECORD);
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });

  it('getByCanonicalAppointmentId filters by canonical_appointment_id and maps the schema row', async () => {
    const chain = buildSelectChain([TABLE_ROW]);
    fakes.select.mockReturnValue(chain);

    const record = await pgPatientBookingsPort.getByCanonicalAppointmentId('canon-1');

    expect(chain.from).toHaveBeenCalledWith(patientBookings);
    expect(record).toEqual(EXPECTED_RECORD);
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });

  it('no matching row → null, same as an empty raw-SQL result set before', async () => {
    fakes.select.mockReturnValue(buildSelectChain([]));

    await expect(pgPatientBookingsPort.getById('missing')).resolves.toBeNull();
  });
});
