import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    }).getSeatStatus(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

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
    }).getSeatStatus(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

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
        quote: 'sq1.stub-quote.signature',
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

describe('TeamSection seat overage quote', () => {
  const seats = { configured: true, used: 2, limit: 2, available: 0 } as const;

  function priceQuoteResponse(quote: string, priceMinor: number) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'seat_overage_confirmation_required',
        quote,
        priceMinor,
        currency: 'RUB',
        quoteExpiresAt: '2026-08-19T10:15:00.000Z',
      }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    );
  }

  async function openConfirmation(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    render(<TeamSection members={[]} invites={[]} seats={seats} canMutateTeam />);
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'new-doctor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Пригласить' }));
    await screen.findByRole('button', { name: 'Оплатить место' });
  }

  /**
   * Владелец 19.08: денежное значение из браузера не уходит никуда. Пробивается: покупка снова
   * кладёт в тело сумму, и сервер получает от клиента число, похожее на цену.
   */
  it('sends only the server quote on purchase — no amount, no currency, no request key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/clinic/invites') return priceQuoteResponse('quote-a', 15_000);
      return new Response(
        JSON.stringify({ ok: false, error: 'saas_billing_seat_overage_unavailable' }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    });
    await openConfirmation(fetchMock);
    expect(screen.getByText(/150/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Оплатить место' }));

    await waitFor(() => {
      const billingCall = fetchMock.mock.calls.find(
        ([input]) => String(input) === '/api/clinic/billing',
      );
      expect(billingCall).toBeDefined();
      expect(JSON.parse(String(billingCall![1]?.body))).toEqual({
        purchase: 'seat_overage',
        quote: 'quote-a',
      });
    });
  });

  /**
   * Котировка истекла — экран не платит по ней и не выдумывает цену, а запрашивает её заново и
   * показывает новую человеку. Пробивается: истечение проглатывается и покупка повторяется.
   */
  it('asks for a fresh price instead of paying on an expired quote', async () => {
    let invitePrice = 15_000;
    let inviteQuote = 'quote-a';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/clinic/invites') {
        return priceQuoteResponse(inviteQuote, invitePrice);
      }
      return new Response(JSON.stringify({ ok: false, error: 'seat_overage_quote_expired' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    });
    await openConfirmation(fetchMock);

    invitePrice = 12_000;
    inviteQuote = 'quote-b';
    fireEvent.click(screen.getByRole('button', { name: 'Оплатить место' }));

    // Новая цена на экране, оплата по старой котировке не состоялась, ничего не списано.
    await screen.findByText(/120/);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/clinic/billing'),
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
          billingEmail: null,
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
