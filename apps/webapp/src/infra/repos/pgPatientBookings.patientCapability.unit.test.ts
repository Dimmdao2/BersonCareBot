import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappPgText: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: 'patient' as const }),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: fakes.runWebappPgText,
}));

import { pgPatientBookingsPort } from './pgPatientBookings';

describe('pgPatientBookings current-patient read capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappPgText.mockResolvedValue({ rows: [] });
  });

  it('keeps an active slot on the upcoming capability path until the server classifies its end', async () => {
    const nowIso = '2026-08-17T09:15:00.000Z';

    await pgPatientBookingsPort.listUpcomingByUser('ignored-current-patient-id', nowIso);

    expect(fakes.runWebappPgText).toHaveBeenCalledOnce();
    const [statement, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain("app.read_current_patient_booking_rows('upcoming'");
    expect(statement).not.toContain("app.read_current_patient_booking_rows('history'");
    expect(params).toEqual([nowIso]);
  });

  it('uses the complementary history capability path', async () => {
    const nowIso = '2026-08-17T09:15:00.000Z';

    await pgPatientBookingsPort.listHistoryByUser('ignored-current-patient-id', nowIso);

    const [statement, params] = fakes.runWebappPgText.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain("app.read_current_patient_booking_rows('history'");
    expect(params).toEqual([nowIso]);
  });
});
