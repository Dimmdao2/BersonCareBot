import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const runIntegratorNamedRoot = vi.hoisted(() => vi.fn());
const runIntegratorSql = vi.hoisted(() => vi.fn());

vi.mock('../../infra/db/runIntegratorSql.js', () => ({
  runIntegratorNamedRoot,
  runIntegratorSql,
}));

import { resolveGoogleCalendarDescriptionContext } from './calendarDescription.js';

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const db = {} as DbPort;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Google Calendar protected booking enrichment', () => {
  it('reads only the narrow profile and latest-comment roots by appointment UUID', async () => {
    runIntegratorNamedRoot.mockImplementation(async (_db: DbPort, identity: string) =>
      identity === 'app.read_booking_calendar_patient_profile(uuid)'
        ? { rows: [{ is_problematic: true, problematic_note: 'Нужен контроль' }] }
        : { rows: [{ body: 'Комментарий врача' }] },
    );
    runIntegratorSql
      .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }] })
      .mockResolvedValueOnce({ rows: [{ title: 'Программа' }] });

    await expect(
      resolveGoogleCalendarDescriptionContext(db, {
        appointmentId: APPOINTMENT_ID,
        phoneNormalized: '+79001234567',
      }),
    ).resolves.toEqual({
      phoneNormalized: '+79001234567',
      staffComment: 'Комментарий врача',
      isProblematic: true,
      supportProgramTitle: 'Программа',
    });

    expect(runIntegratorNamedRoot).toHaveBeenCalledTimes(2);
    expect(runIntegratorNamedRoot.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ['app.read_booking_calendar_patient_profile(uuid)', [APPOINTMENT_ID]],
      ['app.read_booking_calendar_latest_staff_comment(uuid)', [APPOINTMENT_ID]],
    ]);
  });

  it('still resolves protected appointment context when no phone was supplied', async () => {
    runIntegratorNamedRoot.mockImplementation(async (_db: DbPort, identity: string) =>
      identity === 'app.read_booking_calendar_patient_profile(uuid)'
        ? { rows: [{ is_problematic: false, problematic_note: 'Только заметка' }] }
        : { rows: [] },
    );

    await expect(
      resolveGoogleCalendarDescriptionContext(db, { appointmentId: APPOINTMENT_ID }),
    ).resolves.toMatchObject({
      staffComment: 'Только заметка',
      isProblematic: false,
      supportProgramTitle: null,
    });
    expect(runIntegratorSql).not.toHaveBeenCalled();
  });
});
