import { expect, it, vi } from 'vitest';

const relayOperatorAlert = vi.hoisted(() => vi.fn());

vi.mock('@/modules/operator-alerts/relayOperatorAlert', () => ({ relayOperatorAlert }));

import { sendAdminIncidentStaffWebPush } from './sendAdminIncidentStaffWebPush';

it('does not restore raw staff fallback when the eligible push audience is empty', async () => {
  const listActiveStaffUserIds = vi.fn(async () => ['unsubscribed-staff']);

  await expect(
    sendAdminIncidentStaffWebPush(
      {
        organizationId: 'organization-1',
        topic: 'health',
        dedupKey: 'health-1',
        pushTitle: 'Health',
        pushBody: 'Health changed',
        pushUrl: '/app/admin/system-health',
      },
      {
        staffUsers: {
          listActiveStaffUserIds,
          listActiveStaffOrganizationRecipients: async () => [],
        },
      },
    ),
  ).resolves.toBe(0);

  expect(listActiveStaffUserIds).not.toHaveBeenCalled();
  expect(relayOperatorAlert).not.toHaveBeenCalled();
});
