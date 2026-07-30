import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClinicSeatsService } from '@/modules/clinic-seats/service';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { OrganizationInvitesPort } from '@/modules/organization-invites/ports';
import type { OrganizationMembershipPort } from '@/modules/organization-membership/ports';
import { TeamSection } from './TeamSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe('TeamSection seat configuration refusal', () => {
  it('renders the compatibility organization and names the missing configuration instead of throwing', async () => {
    const seats = await createClinicSeatsService({
      membershipPort: {
        listByOrganization: async () => [],
      } as unknown as OrganizationMembershipPort,
      invitesPort: {
        countSeatReservationsByOrganization: async () => 0,
      } as unknown as OrganizationInvitesPort,
      orgEntitlementsPort: {
        listOverrides: async () => [],
        getTariffForOrg: async () => null,
      } as unknown as OrgEntitlementsPort,
    }).getSeatStatus('11111111-1111-4111-8111-111111111111');

    render(<TeamSection members={[]} invites={[]} seats={seats} />);

    expect(
      screen.getByText(
        'Места специалистов не настроены. Укажите их в тарифе или в исключении организации.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'укажите число мест специалистов в тарифе или в исключении организации',
    );
    expect(screen.getByRole('button', { name: 'Пригласить' })).toBeDisabled();
  });
});
