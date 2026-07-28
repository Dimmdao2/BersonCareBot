/** @vitest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import type { Tariff } from '@/modules/org-entitlements/types';
import {
  ClinicsConsoleClient,
  type PlatformClinicMember,
  type PlatformClinicsData,
} from './ClinicsConsoleClient';

const TARIFF_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const tariff: Tariff = {
  id: TARIFF_ID,
  name: 'Профессиональный',
  description: '',
  priceMinor: 100_000,
  currency: 'RUB',
  billingPeriod: 'month',
  mechanics: {},
  quotas: {},
  includedSeats: 3,
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function organization(
  id: string,
  title: string,
  lifecycle: PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
): PlatformOrganizationSummary {
  return {
    id,
    title,
    tariffId: TARIFF_ID,
    manualTariffId: TARIFF_ID,
    isActive: true,
    commercialAccessState: 'active',
    effectiveAccess: { lifecycle, tariffId: TARIFF_ID, source: 'assignment' },
    overrides: [],
    trial: null,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ClinicsConsoleClient', () => {
  it('renders clinic names, tariffs, every commercial lifecycle and trial state in the list', () => {
    const active = organization(ORGANIZATION_ID, 'Клиника Альфа', 'active');
    active.trial = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tariffId: TARIFF_ID,
      status: 'active',
      startedAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      graceEndsAt: '2026-08-05T00:00:00.000Z',
    };
    const data: PlatformClinicsData = {
      tariffs: [tariff],
      organizations: [
        active,
        organization('33333333-3333-4333-8333-333333333333', 'Клиника Бета', 'grace'),
        organization('44444444-4444-4444-8444-444444444444', 'Клиника Гамма', 'read_only'),
        organization('55555555-5555-4555-8555-555555555555', 'Клиника Дельта', 'blocked'),
      ],
      enforcedQuotaUsage: {},
    };

    render(<ClinicsConsoleClient initialData={data} />);

    expect(screen.getByText('Клиника Альфа')).toBeInTheDocument();
    expect(screen.getAllByText('Профессиональный')).toHaveLength(4);
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText('Льготный период')).toBeInTheDocument();
    expect(screen.getByText('Только чтение')).toBeInTheDocument();
    expect(screen.getByText('Заблокирована')).toBeInTheDocument();
    expect(screen.getByText(/Активен · до/)).toBeInTheDocument();
    expect(screen.getAllByText('Не запускался')).toHaveLength(3);
  });

  it('renders the clinic card, override and only the two real usage numbers', () => {
    const clinic = organization(ORGANIZATION_ID, 'Клиника Альфа', 'read_only');
    clinic.commercialAccessState = 'no_trial';
    clinic.overrides = [
      {
        id: '66666666-6666-4666-8666-666666666666',
        organizationId: ORGANIZATION_ID,
        mechanic: 'courses',
        enabled: true,
        quota: {
          kind: 'numeric',
          limit: 10,
          unit: 'items',
          period: 'snapshot',
          usagePolicy: 'snapshot',
        },
        expiresAt: null,
        seatLimitOverride: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ];
    const data: PlatformClinicsData = {
      tariffs: [tariff],
      organizations: [clinic],
      // Courses and specialist seats have real snapshot counters. A placeholder for files must
      // stay invisible because that mechanic still has no enforcement.
      enforcedQuotaUsage: { [ORGANIZATION_ID]: { courses: 7, clinic_team: 2, files: 0 } },
    };
    const members: PlatformClinicMember[] = [
      {
        id: 'membership-owner',
        displayName: 'Анна Владелец',
        role: 'owner',
        status: 'active',
        createdAt: '2026-07-10T00:00:00.000Z',
        specialistLinked: false,
      },
      {
        id: 'membership-doctor',
        displayName: 'Борис Врач',
        role: 'doctor',
        status: 'disabled',
        createdAt: '2026-07-11T00:00:00.000Z',
        specialistLinked: true,
      },
    ];

    render(
      <ClinicsConsoleClient
        initialData={data}
        initialMembers={members}
        organizationId={ORGANIZATION_ID}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Клиника Альфа' })).toBeInTheDocument();
    expect(
      screen.getByText('Клинические карточки недоступны в режиме платформы'),
    ).toBeInTheDocument();
    expect(screen.getByText('Профессиональный')).toBeInTheDocument();
    expect(screen.getByText('Только чтение')).toBeInTheDocument();
    expect(screen.getByText('Без триала')).toBeInTheDocument();
    expect(screen.getByText('Пробный период не запускался.')).toBeInTheDocument();
    expect(screen.getByText('лимит 10 штуки')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Аккаунты клиники' })).toBeInTheDocument();
    expect(screen.getByText('Анна Владелец')).toBeInTheDocument();
    expect(screen.getByText('Борис Врач')).toBeInTheDocument();
    expect(screen.getByText('Владелец')).toBeInTheDocument();
    expect(screen.getByText('Врач')).toBeInTheDocument();
    expect(screen.getByText('Отключён')).toBeInTheDocument();
    expect(screen.getByText('Есть')).toBeInTheDocument();
    expect(screen.getByText('Нет')).toBeInTheDocument();
    expect(screen.getByText(/10 июл/)).toBeInTheDocument();

    const usageSection = screen
      .getByRole('heading', { name: 'Расход' })
      .closest<HTMLElement>('section');
    expect(usageSection).not.toBeNull();
    const coursesTile = within(usageSection!)
      .getByText('Курсы')
      .closest<HTMLElement>('div.rounded-lg');
    expect(coursesTile).not.toBeNull();
    expect(within(coursesTile!).getByText('7')).toBeInTheDocument();
    const clinicTeamTile = within(usageSection!)
      .getByText('Режим клиники')
      .closest<HTMLElement>('div.rounded-lg');
    expect(clinicTeamTile).not.toBeNull();
    expect(within(clinicTeamTile!).getByText('2')).toBeInTheDocument();
    // 14 -> 13: clinic_team left the untracked group after gaining the real
    // application_transaction_snapshot seat counter; all other declared mechanics stay explicit.
    expect(screen.getAllByText('не отслеживается')).toHaveLength(13);
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/телефон/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/почт/i)).not.toBeInTheDocument();
  });

  it('explains an access denial and the next step', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ ok: false, error: 'forbidden' }),
      })),
    );

    render(<ClinicsConsoleClient />);

    expect(await screen.findByText('Сессия не имеет платформенного доступа.')).toBeInTheDocument();
    expect(
      screen.getByText('Войдите под глобальным администратором и повторите.'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/admin/organizations', { cache: 'no-store' });
  });
});
