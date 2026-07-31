import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { OrgEntitlementSnapshot, OrgMechanic } from '@/modules/org-entitlements/types';

const fakes = vi.hoisted(() => ({
  requireOrganizationWorkspaceContext: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
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
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireOrganizationWorkspaceContext: fakes.requireOrganizationWorkspaceContext,
  requireDoctorWorkspaceContext: fakes.requireDoctorWorkspaceContext,
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
  DoctorWorkspaceShell: ({
    children,
    coursesEnabled,
    cmsEnabled,
  }: {
    children: ReactNode;
    coursesEnabled?: boolean;
    cmsEnabled?: boolean;
  }) => (
    <main>
      {coursesEnabled ? <span role="link">Курсы</span> : null}
      {cmsEnabled ? <span role="link">Контент</span> : null}
      {children}
    </main>
  ),
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
  PatientHomeToday: ({
    coursesOrganizationId,
    warmupsOrganizationId,
  }: {
    coursesOrganizationId: string | null;
    warmupsOrganizationId: string | null;
  }) => (
    <div>
      <div data-testid="patient-home-courses-organization">
        {coursesOrganizationId ?? 'hidden'}
      </div>
      <div data-testid="patient-home-warmups-organization">
        {warmupsOrganizationId ?? 'hidden'}
      </div>
    </div>
  ),
}));

let DoctorSectionLayout: typeof import('./doctor/layout').default;
let PatientHomePage: typeof import('./patient/page').default;
let DoctorCoursesPage: typeof import('./doctor/courses/page').default;
let DoctorContentPage: typeof import('./doctor/content/page').default;
let coursesIncluded = true;
let cmsIncluded = true;
let warmupsIncluded = true;

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function entitlementSnapshot(): OrgEntitlementSnapshot {
  return {
    tariff: {
      name: 'Тариф с лестницей',
      mechanics: { courses: coursesIncluded, promo: true },
      quotas: {},
      systemAccessPolicy: {
        graceDays: 3,
        readOnlyDays: 2,
        notifications: [
          { offsetDays: -1, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
        ],
        terminalState: 'disabled',
      },
      mechanicAccessPolicies: {},
      includedSeats: null,
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
  [
    { default: DoctorSectionLayout },
    { default: PatientHomePage },
    { default: DoctorCoursesPage },
    { default: DoctorContentPage },
  ] = await Promise.all([
    import('./doctor/layout'),
    import('./patient/page'),
    import('./doctor/courses/page'),
    import('./doctor/content/page'),
  ]);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  coursesIncluded = true;
  cmsIncluded = true;
  warmupsIncluded = true;
  const session = {
    adminMode: false,
    user: { userId, role: 'doctor', displayName: 'Врач' },
  };
  const orgEntitlements = {
    resolveMechanicAccess: async (_organizationId: string, mechanic: OrgMechanic) => {
      const included =
        mechanic === 'cms_pages'
          ? cmsIncluded
          : mechanic === 'warmups'
            ? warmupsIncluded
            : coursesIncluded;
      return included
        ? {
            mechanic,
            state: 'grace' as const,
            policySource: 'system' as const,
            warning: {
              until: '2026-08-01T00:00:00.000Z',
              // Paid period ended 29.07; "now" in this test is 30.07 12:00.
              periodEndsAt: '2026-07-29T00:00:00.000Z',
              notifications: [
                {
                  offsetDays: 1,
                  condition: 'payment_failed' as const,
                  template: 'Тариф {{тариф}} не оплачен. Клиника {{клиника}}.',
                },
                // Not due yet — three days after the period end.
                {
                  offsetDays: 3,
                  condition: 'payment_failed' as const,
                  template: 'Скоро только чтение.',
                },
                // Due by date, but written for the other outcome.
                {
                  offsetDays: 1,
                  condition: 'payment_succeeded' as const,
                  template: 'Спасибо за оплату.',
                },
              ],
              nextState: 'read_only' as const,
            },
          }
        : {
            mechanic,
            state: 'disabled' as const,
            policySource: 'unconfigured' as const,
            warning: null,
          };
    },
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
  fakes.requireDoctorWorkspaceContext.mockResolvedValue({
    organizationId,
    session,
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
    courses: { listCoursesForDoctor: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('access lifecycle on real clinic and patient surfaces', () => {
  // §5a item 2.6a — the banner is the OWNER's text, not a sentence written in code. Breakage this
  // catches: a template variable stops being substituted, a row that has not come due is shown, or
  // a row written for the other payment outcome leaks into the "not paid" banner.
  it("renders the owner's due notification texts in the clinic shell, and only those", async () => {
    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Тариф Тариф с лестницей не оплачен. Клиника Клиника.');
    expect(alert).not.toHaveTextContent('Скоро только чтение.');
    expect(alert).not.toHaveTextContent('Спасибо за оплату.');
    expect(screen.getByText('Рабочая область')).toBeInTheDocument();
  });

  it('hides the specialist course navigation through the shared visibility adapter', async () => {
    coursesIncluded = false;

    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.queryByRole('link', { name: 'Курсы' })).not.toBeInTheDocument();
  });

  it('hides the patient course entry through the shared visibility adapter', async () => {
    coursesIncluded = false;

    render(await PatientHomePage());

    expect(screen.getByTestId('patient-home-courses-organization')).toHaveTextContent('hidden');
  });

  it('does not render a direct specialist course URL through the shared visibility adapter', async () => {
    coursesIncluded = false;

    await expect(DoctorCoursesPage({})).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fakes.buildAppDeps().courses.listCoursesForDoctor).not.toHaveBeenCalled();
  });

  it('hides the specialist content navigation through the shared visibility adapter', async () => {
    cmsIncluded = false;

    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.queryByRole('link', { name: 'Контент' })).not.toBeInTheDocument();
  });

  it('hides the patient daily-warmup home entry through the shared visibility adapter', async () => {
    warmupsIncluded = false;

    render(await PatientHomePage());

    expect(screen.getByTestId('patient-home-warmups-organization')).toHaveTextContent('hidden');
  });

  it('does not render a direct specialist content URL through the shared visibility adapter', async () => {
    cmsIncluded = false;

    await expect(DoctorContentPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
