import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClinicSeatsService } from '@/modules/clinic-seats/service';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { OrganizationInvitesPort } from '@/modules/organization-invites/ports';
import type { OrganizationMembershipPort } from '@/modules/organization-membership/ports';
import { SaasBillingOverview } from '@/shared/ui/doctor/SaasBillingOverview';
import { TeamSection } from './TeamSection';

const navigation = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation.router }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/app/settings?tab=team');
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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

    render(<TeamSection members={[]} invites={[]} seats={seats} canMutateTeam />);

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

  it('adds only paid subscription allowance to the clinic seat projection', async () => {
    const seats = await createClinicSeatsService({
      membershipPort: {
        listByOrganization: async () => [{ status: 'active', specialistId: 'specialist-1' }],
      } as unknown as OrganizationMembershipPort,
      invitesPort: {
        countSeatReservationsByOrganization: async () => 0,
      } as unknown as OrganizationInvitesPort,
      orgEntitlementsPort: {
        listOverrides: async () => [],
        getTariffForOrg: async () => ({ includedSeats: 1 }),
      } as unknown as OrgEntitlementsPort,
      billingPort: {
        getOrganizationBillingOverview: async () => ({
          subscriptions: [
            { source: 'paid_subscription', paidAdditionalSeats: 2 },
            { source: 'manual', paidAdditionalSeats: 99 },
          ],
        }),
      },
    }).getSeatStatus('11111111-1111-4111-8111-111111111111');

    expect(seats).toEqual({ configured: true, limit: 3, used: 1, available: 2 });
  });
});

describe('TeamSection paid-seat return', () => {
  it('polls the scoped billing GET and replays the saved ordinary invite exactly once after paid', async () => {
    window.history.replaceState({}, '', '/app/settings?tab=team&seatPayment=seat-invoice-1');
    sessionStorage.setItem(
      'clinic-seat-overage-invite',
      JSON.stringify({
        email: 'doctor@example.com',
        role: 'doctor',
        requestKey: 'stable-request-key',
        invoiceId: 'seat-invoice-1',
      }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/clinic/billing') {
        return new Response(
          JSON.stringify({
            ok: true,
            billing: { invoices: [{ id: 'seat-invoice-1', status: 'paid' }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (String(input) === '/api/clinic/invites' && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TeamSection
        members={[]}
        invites={[]}
        seats={{ configured: true, used: 1, limit: 2, available: 1 }}
        canMutateTeam
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/clinic/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'doctor@example.com', role: 'doctor' }),
        }),
      );
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/clinic/invites'),
    ).toHaveLength(1);
    expect(sessionStorage.getItem('clinic-seat-overage-invite')).toBeNull();
  });
});

describe('TeamSection read-only access', () => {
  it('keeps invite and revoke controls available when team mutation is allowed', () => {
    render(
      <TeamSection
        members={[]}
        invites={[
          {
            id: 'invite-1',
            invitedEmail: 'new-doctor@example.com',
            invitedRole: 'doctor',
            expiresAt: '2026-08-09T00:00:00.000Z',
          },
        ]}
        seats={{ configured: true, used: 1, limit: 2, available: 1 }}
        canMutateTeam
      />,
    );

    expect(screen.getByRole('heading', { name: 'Пригласить в команду' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пригласить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
  });

  it('keeps stored members and invites visible while removing every team mutation control', () => {
    render(
      <TeamSection
        members={[
          {
            id: 'member-1',
            displayName: 'Доктор',
            role: 'doctor',
            status: 'active',
            seatConsuming: true,
          },
        ]}
        invites={[
          {
            id: 'invite-1',
            invitedEmail: 'new-doctor@example.com',
            invitedRole: 'doctor',
            expiresAt: '2026-08-09T00:00:00.000Z',
          },
        ]}
        seats={{ configured: true, used: 1, limit: 2, available: 1 }}
        canMutateTeam={false}
      />,
    );

    expect(screen.getByText('Доктор')).toBeInTheDocument();
    expect(screen.getByText('new-doctor@example.com')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Команда сейчас доступна только для просмотра по тарифу клиники.',
    );
    expect(screen.queryByRole('heading', { name: 'Пригласить в команду' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пригласить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Оплатить место' })).not.toBeInTheDocument();
  });
});

describe('SaasBillingOverview paid-seat invoice', () => {
  it('shows a pending seat purpose, quantity and usable checkout link', () => {
    render(
      <SaasBillingOverview
        billing={{
          organizationId: 'org-1',
          subscriptions: [],
          providerEvents: [],
          invoices: [
            {
              id: 'seat-invoice',
              organizationId: 'org-1',
              saasBillingAccountId: 'account-1',
              saasBillingSubscriptionId: 'subscription-1',
              tariffId: 'tariff-1',
              tariffName: 'Стандарт',
              invoiceKind: 'seat_overage',
              additionalSeatQuantity: 1,
              description: null,
              amountMinor: 15_000,
              currency: 'RUB',
              tariffBillingPeriod: 'month',
              tariffSnapshot: null,
              servicePeriodStartsAt: '2026-08-01T00:00:00.000Z',
              servicePeriodEndsAt: '2026-09-01T00:00:00.000Z',
              expiresAt: null,
              status: 'pending',
              providerId: 'mock',
              providerInvoiceRef: 'provider-seat',
              providerCheckoutUrl: 'https://pay.example/seat',
              providerIdempotencyKey: 'seat-key',
              paidAt: null,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Дополнительные места')).toBeInTheDocument();
    expect(screen.getByText(/1 место/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Оплатить' })).toHaveAttribute(
      'href',
      'https://pay.example/seat',
    );
  });
});
