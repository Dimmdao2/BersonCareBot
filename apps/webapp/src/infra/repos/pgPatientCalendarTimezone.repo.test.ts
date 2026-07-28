import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import {
  getPatientCalendarTimezoneIana,
  setPatientCalendarTimezoneIana,
  trySetInitialCalendarTimezoneIfEmpty,
} from './pgPatientCalendarTimezone';
import { runWithDbPatientPrincipal } from '@bersoncare/db-principal';
import { getCurrentWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';

describe('pgPatientCalendarTimezone (repo SQL parity)', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('getPatientCalendarTimezoneIana filters merged_into_id IS NULL', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ calendar_timezone: 'Europe/Moscow' }] });
    const tz = await getPatientCalendarTimezoneIana('550e8400-e29b-41d4-a716-446655440000');
    expect(tz).toBe('Europe/Moscow');
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('merged_into_id IS NULL');
  });

  it('setPatientCalendarTimezoneIana requires client role', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const ok = await setPatientCalendarTimezoneIana(
      '550e8400-e29b-41d4-a716-446655440000',
      'Europe/Moscow',
    );
    expect(ok).toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("role = 'client'");
  });

  it('sets only the signed current patient through the bounded capability', async () => {
    runWebappPgTextMock.mockImplementationOnce(async () => {
      expect(getCurrentWebappDbOperationFamily()).toBe('patient_calendar_timezone');
      return { rows: [{ updated: true }] };
    });
    const ok = await runWithDbPatientPrincipal(
      {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platformUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      () => setPatientCalendarTimezoneIana('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Europe/Moscow'),
    );

    expect(ok).toBe(true);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('app.set_current_patient_calendar_timezone($1, false)');
    expect(sql).not.toContain('UPDATE platform_users');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['Europe/Moscow']);
  });

  it('trySetInitialCalendarTimezoneIfEmpty skips invalid IANA', async () => {
    await trySetInitialCalendarTimezoneIfEmpty(
      '550e8400-e29b-41d4-a716-446655440000',
      'Not/A/Timezone',
    );
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it('trySetInitialCalendarTimezoneIfEmpty updates when IANA valid', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await trySetInitialCalendarTimezoneIfEmpty(
      '550e8400-e29b-41d4-a716-446655440000',
      'Europe/Moscow',
    );
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('calendar_timezone IS NULL');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      'Europe/Moscow',
    ]);
  });

  it('initializes the signed current patient idempotently through the bounded capability', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ updated: true }] });
    await runWithDbPatientPrincipal(
      {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platformUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      () =>
        trySetInitialCalendarTimezoneIfEmpty(
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Europe/Moscow',
        ),
    );

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('app.set_current_patient_calendar_timezone($1, true)');
    expect(sql).not.toContain('UPDATE platform_users');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['Europe/Moscow']);
  });
});
