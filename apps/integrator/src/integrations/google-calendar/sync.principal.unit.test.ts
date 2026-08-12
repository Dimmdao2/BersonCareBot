import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import { syncCanonicalAppointmentToCalendar } from './sync.js';
import type { GoogleCalendarConfig } from './config.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';
const config: GoogleCalendarConfig = {
  enabled: true,
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/oauth',
  calendarId: 'calendar',
  refreshToken: 'refresh',
};

describe('canonical calendar organization boundary', () => {
  it('rejects a lifecycle event without an organization before DB access', async () => {
    await expect(
      syncCanonicalAppointmentToCalendar(
        {
          action: 'canceled',
          appointmentId: APPOINTMENT_ID,
          organizationId: '',
          startAt: '2026-08-11T10:00:00.000Z',
          endAt: '2026-08-11T11:00:00.000Z',
        },
        { config },
      ),
    ).rejects.toThrow('organizationId is required for canonical calendar sync');
  });

  it('keeps both calendar roots inside the event organization principal', async () => {
    const seenOrganizations: Array<string | undefined> = [];
    const query = vi
      .fn()
      .mockImplementationOnce(async () => {
        seenOrganizations.push(getCurrentOrganizationPrincipalId());
        return { rows: [{ gcal_event_id: 'gcal-1' }] };
      })
      .mockImplementationOnce(async () => {
        seenOrganizations.push(getCurrentOrganizationPrincipalId());
        return { rows: [] };
      });
    const db = { query, tx: vi.fn() } as unknown as DbPort;
    const deleteEvent = vi.fn().mockResolvedValue(undefined);

    await syncCanonicalAppointmentToCalendar(
      {
        action: 'canceled',
        appointmentId: APPOINTMENT_ID,
        organizationId: ORGANIZATION_ID,
        startAt: '2026-08-11T10:00:00.000Z',
        endAt: '2026-08-11T11:00:00.000Z',
      },
      {
        config,
        db,
        client: { deleteEvent, upsertEvent: vi.fn() },
      },
    );

    expect(deleteEvent).toHaveBeenCalledWith('gcal-1');
    expect(seenOrganizations).toEqual([ORGANIZATION_ID, ORGANIZATION_ID]);
  });
});
