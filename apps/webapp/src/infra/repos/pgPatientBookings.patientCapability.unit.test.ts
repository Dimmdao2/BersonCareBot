import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappSql: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: 'patient' as const }),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappSql: fakes.runWebappSql,
}));

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { pgPatientBookingsPort } from './pgPatientBookings';

/** Text and bound values PostgreSQL would receive for the first executed fragment. */
function firstQuery() {
  const call = fakes.runWebappSql.mock.calls[0];
  if (!call) throw new Error('no query was executed');
  return drizzleSqlFragmentToPgQuery(call[1]);
}

describe('pgPatientBookings current-patient read capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappSql.mockResolvedValue({ rows: [] });
  });

  it('keeps an active slot on the upcoming capability path until the server classifies its end', async () => {
    const nowIso = '2026-08-17T09:15:00.000Z';

    await pgPatientBookingsPort.listUpcomingByUser('ignored-current-patient-id', nowIso);

    expect(fakes.runWebappSql).toHaveBeenCalledOnce();
    const { sql: statement, values: params } = firstQuery();
    expect(statement).toContain("app.read_current_patient_booking_rows('upcoming'");
    expect(statement).not.toContain("app.read_current_patient_booking_rows('history'");
    expect(params).toEqual([nowIso]);
  });

  it('uses the complementary history capability path', async () => {
    const nowIso = '2026-08-17T09:15:00.000Z';

    await pgPatientBookingsPort.listHistoryByUser('ignored-current-patient-id', nowIso);

    const { sql: statement, values: params } = firstQuery();
    expect(statement).toContain("app.read_current_patient_booking_rows('history'");
    expect(params).toEqual([nowIso]);
  });
});
