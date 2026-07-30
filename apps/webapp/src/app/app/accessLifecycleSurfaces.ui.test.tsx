import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { OrgEntitlementSnapshot } from '@/modules/org-entitlements/types';

const fakes = vi.hoisted(() => ({
  requireOrganizationWorkspaceContext: vi.fn(),
  requirePatientAccess: vi.fn(),
  patientRscPersonalDataGate: vi.fn(),
  getCurrentSession: vi.fn(),
  buildAppDeps: vi.fn(),
  resolvePatientOrganizationRequestContext: vi.fn(),
  stampPatientOrganizationRequestContext: vi.fn(),
  getAppDisplayTimeZone: vi.fn(),
  resolvePatientCanViewAuthOnlyContent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireOrganizationWorkspaceContext: fakes.requireOrganizationWorkspaceContext,
  requirePatientAccess: fakes.requirePatientAccess,
  patientRscPersonalDataGate: fakes.patientRscPersonalDataGate,
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: fakes.getCurrentSession,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  resolvePatientOrganizationRequestContext: fakes.resolvePatientOrganizationRequestContext,
  stampPatientOrganizationRequestContext: fakes.stampPatientOrganizationRequestContext,
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));
vi.mock('@/app-layer/platform-access', () => ({
  resolvePatientCanViewAuthOnlyContent: fakes.resolvePatientCanViewAuthOnlyContent,
}));
vi.mock('@/modules/patient-home/patientGreetingPersonalizedName', () => ({
  patientGreetingPersonalizedName: () => 'Пациент',
}));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({
  DoctorWorkspaceShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/ui/patient/LegalFooterLinks', () => ({
  LegalFooterLinks: () => null,
}));
vi.mock('./patient/home/PatientHomeGreeting', () => ({
  greetingPrefixFromHour: () => 'Здравствуйте',
  PatientHomeGreetingMobileHeader: () => null,
}));
vi.mock('./patient/home/PatientHomeToday', () => ({
  PatientHomeToday: ({ coursesOrganizationId }: { coursesOrganizationId: string | null }) => (
    <div data-testid="patient-home-courses-organization">
      {coursesOrganizationId ?? 'hidden'}
    </div>
  ),
}));

let DoctorSectionLayout: typeof import('./doctor/layout').default;
let PatientHomePage: typeof import('./patient/page').default;
let coursesIncluded = true;

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function entitlementSnapshot(): OrgEntitlementSnapshot {
  return {
    tariff: {
      mechanics: { courses: coursesIncluded, promo: true },
      quotas: {},
      systemAccessPolicy: {
        graceDays: 3,
        readOnlyDays: 2,
        warningCount: 4,
        terminalState: 'disabled',
      },
      mechanicAccessPolicies: {},
      includedSeats: null,
      includedSeatsWarningAtPercent: null,
    },
    overrides: [],
    access: {
      lifecycle: 'grace',
      tariffId: '33333333-3333-4333-8333-333333333333',
      source: 'trial',
      degradationStartedAt: '2026-07-29T00:00:00.000Z',
    },
  };
}

beforeAll(async () => {
  [{ default: DoctorSectionLayout }, { default: PatientHomePage }] = await Promise.all([
    import('./doctor/layout'),
    import('./patient/page'),
  ]);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  coursesIncluded = true;
  const session = {
    adminMode: false,
    user: { userId, role: 'doctor', displayName: 'Врач' },
  };
  const orgEntitlements = {
    getSnapshot: async () => entitlementSnapshot(),
    getTariffForOrg: async () => null,
    listOverrides: async () => [],
    getEffectiveCommercialAccess: async () => entitlementSnapshot().access,
    getEnforcedQuotaUsage: async () => ({}),
  };
  fakes.getCurrentSession.mockResolvedValue(null);
  fakes.requireOrganizationWorkspaceContext.mockResolvedValue({
    session,
    organizationId,
    membershipId: 'membership',
    membershipRole: 'owner',
    specialistId: 'specialist',
    canManageOrganization: true,
    canManageAllSpecialists: true,
    canAccessClinicalWorkspace: true,
  });
  fakes.requirePatientAccess.mockResolvedValue({
    user: { userId, role: 'patient', displayName: 'Пациент' },
  });
  fakes.patientRscPersonalDataGate.mockResolvedValue('allow');
  fakes.resolvePatientCanViewAuthOnlyContent.mockResolvedValue(true);
  fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
    ok: true,
    organizationId,
  });
  fakes.getAppDisplayTimeZone.mockResolvedValue('UTC');
  fakes.buildAppDeps.mockReturnValue({
    orgEntitlements,
    bookingEngine: {
      organization: { getOrganization: async () => ({ title: 'Клиника' }) },
    },
    systemSettings: { listSettingsByScope: async () => [] },
    orgBranding: { resolveEffectiveOrgBranding: async () => null },
    patientOrganization: {},
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('access lifecycle on real clinic and patient surfaces', () => {
  it('shows the resolver warning with its date, count and next state in the clinic shell', async () => {
    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Курсы: полный доступ до 01.08.2026. Затем — только чтение. Предупреждений: 4.',
    );
    expect(screen.getByText('Рабочая область')).toBeInTheDocument();
  });

  it('hides the patient course entry through the shared visibility adapter', async () => {
    coursesIncluded = false;

    render(await PatientHomePage());

    expect(screen.getByTestId('patient-home-courses-organization')).toHaveTextContent('hidden');
  });
});
