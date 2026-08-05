import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type {
  MechanicAccessState,
  OrgEntitlementSnapshot,
  OrgMechanic,
} from '@/modules/org-entitlements/types';

const fakes = vi.hoisted(() => ({
  requireOrganizationWorkspaceContext: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
  requirePatientAccess: vi.fn(),
  requirePatientAccessWithPhone: vi.fn(),
  patientRscPersonalDataGate: vi.fn(),
  getCurrentSession: vi.fn(),
  buildAppDeps: vi.fn(),
  resolvePatientOrganizationRequestContext: vi.fn(),
  stampPatientOrganizationRequestContext: vi.fn(),
  getAppDisplayTimeZone: vi.fn(),
  resolvePatientCanViewAuthOnlyContent: vi.fn(),
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  runWithDbClinicBillingPrincipal: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  runWithDbClinicBillingPrincipal: fakes.runWithDbClinicBillingPrincipal,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: vi.fn(() => '/app/doctor/courses'),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireOrganizationWorkspaceContext: fakes.requireOrganizationWorkspaceContext,
  requireDoctorWorkspaceContext: fakes.requireDoctorWorkspaceContext,
  requirePatientAccess: fakes.requirePatientAccess,
  requirePatientAccessWithPhone: fakes.requirePatientAccessWithPhone,
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
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/modules/patient-home/patientGreetingPersonalizedName', () => ({
  patientGreetingPersonalizedName: () => 'Пациент',
}));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({
  DoctorWorkspaceShell: ({
    children,
    coursesEnabled,
    cmsEnabled,
    patientHomeTodayEnabled,
  }: {
    children: ReactNode;
    coursesEnabled?: boolean;
    cmsEnabled?: boolean;
    patientHomeTodayEnabled?: boolean;
  }) => (
    <main>
      {coursesEnabled ? <span role="link">Курсы</span> : null}
      {cmsEnabled ? <span role="link">Контент</span> : null}
      {patientHomeTodayEnabled ? <span role="link">Главная пациента</span> : null}
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
vi.mock('./doctor/content/ContentHubShell', () => ({
  ContentHubShell: ({ patientHomeTodayEnabled }: { patientHomeTodayEnabled: boolean }) => (
    <div data-testid="doctor-patient-home-navigation">
      {patientHomeTodayEnabled ? 'visible' : 'hidden'}
    </div>
  ),
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
      <div data-testid="patient-home-courses-organization">{coursesOrganizationId ?? 'hidden'}</div>
      <div data-testid="patient-home-warmups-organization">{warmupsOrganizationId ?? 'hidden'}</div>
    </div>
  ),
}));

let DoctorSectionLayout: typeof import('./doctor/layout').default;
let PatientHomePage: typeof import('./patient/page').default;
let DoctorCoursesPage: typeof import('./doctor/courses/page').default;
let DoctorCoursesNewPage: typeof import('./doctor/courses/new/page').default;
let DoctorCourseEditPage: typeof import('./doctor/courses/[id]/page').default;
let PatientCoursesPage: typeof import('./patient/courses/page').default;
let DoctorContentPage: typeof import('./doctor/content/page').default;
let DoctorPatientHomeSettingsPage: typeof import('./doctor/patient-home/page').default;
let DoctorContentNewPage: typeof import('./doctor/content/new/page').default;
let DoctorContentEditPage: typeof import('./doctor/content/edit/[id]/page').default;
let DoctorContentSectionNewPage: typeof import('./doctor/content/sections/new/page').default;
let DoctorContentSectionEditPage: typeof import('./doctor/content/sections/edit/[slug]/page').default;
let coursesIncluded = true;
let cmsAccessState: 'grace' | 'read_only' | 'disabled' = 'grace';
let coursesReadOnly = false;
let coursesAccessState: MechanicAccessState | null = null;
let warmupsIncluded = true;
let patientHomeTodayState: 'grace' | 'read_only' | 'disabled' = 'grace';

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
    { default: DoctorCoursesNewPage },
    { default: DoctorCourseEditPage },
    { default: PatientCoursesPage },
    { default: DoctorContentPage },
    { default: DoctorPatientHomeSettingsPage },
    { default: DoctorContentNewPage },
    { default: DoctorContentEditPage },
    { default: DoctorContentSectionNewPage },
    { default: DoctorContentSectionEditPage },
  ] = await Promise.all([
    import('./doctor/layout'),
    import('./patient/page'),
    import('./doctor/courses/page'),
    import('./doctor/courses/new/page'),
    import('./doctor/courses/[id]/page'),
    import('./patient/courses/page'),
    import('./doctor/content/page'),
    import('./doctor/patient-home/page'),
    import('./doctor/content/new/page'),
    import('./doctor/content/edit/[id]/page'),
    import('./doctor/content/sections/new/page'),
    import('./doctor/content/sections/edit/[slug]/page'),
  ]);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  coursesIncluded = true;
  cmsAccessState = 'grace';
  coursesReadOnly = false;
  coursesAccessState = null;
  warmupsIncluded = true;
  patientHomeTodayState = 'grace';
  const session = {
    user: { userId, role: 'doctor', displayName: 'Врач' },
  };
  const orgEntitlements = {
    // Cabinet entry is its own ladder subject (§5a/2.1a); these cases are about mechanics, so the
    // cabinet stays fully open and contributes no warning of its own to the shell banner.
    resolveCabinetAccess: async () => ({
      state: 'full_access' as const,
      policySource: 'system' as const,
      warning: null,
    }),
    resolveMechanicAccess: async (_organizationId: string, mechanic: OrgMechanic) => {
      if (mechanic === 'patient_home_today') {
        return patientHomeTodayState === 'disabled'
          ? {
              mechanic,
              state: 'disabled' as const,
              policySource: 'unconfigured' as const,
              warning: null,
            }
          : {
              mechanic,
              state: patientHomeTodayState,
              policySource: 'system' as const,
              warning: null,
            };
      }
      const state: MechanicAccessState =
        mechanic === 'cms_pages'
          ? cmsAccessState
          : mechanic === 'warmups'
            ? warmupsIncluded
              ? 'grace'
              : 'disabled'
            : !coursesIncluded
              ? 'disabled'
              : coursesAccessState ?? (coursesReadOnly ? 'read_only' : 'grace');
      return state !== 'disabled'
        ? {
            mechanic,
            state,
            policySource: 'system' as const,
            warning: {
              until: '2026-08-01T00:00:00.000Z',
              // Paid period ended 29.07; "now" in this test is 30.07 12:00.
              periodEndsAt: '2026-07-29T00:00:00.000Z',
              // §5a item 7.0 — это неоплата, поэтому строки владельца с условием «ошибка оплаты»
              // и должны сюда дойти; на истёкшем триале их бы не было.
              periodSource: 'paid_period' as const,
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
    getOwnQuotaUsage: async () => ({}),
    prepareLifecycleNotificationContext: async () => ({
      registeredAt: '2026-07-30T12:00:00.000Z',
      trialStartedAt: '2026-07-01T00:00:00.000Z',
      trialEndsAt: '2026-07-29T00:00:00.000Z',
      discountEndsAt: null,
    }),
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
  fakes.requirePatientAccessWithPhone.mockResolvedValue({
    user: { userId, role: 'patient', displayName: 'Пациент' },
  });
  fakes.patientRscPersonalDataGate.mockResolvedValue('allow');
  fakes.resolvePatientCanViewAuthOnlyContent.mockResolvedValue(true);
  fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
    ok: true,
    organizationId,
  });
  fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
  fakes.withPatientOrganizationPrincipal.mockImplementation(
    async (_context: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    async (_context: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
  );
  fakes.runWithDbClinicBillingPrincipal.mockImplementation(
    async (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.getAppDisplayTimeZone.mockResolvedValue('UTC');
  fakes.buildAppDeps.mockReturnValue({
    orgEntitlements,
    bookingEngine: {
      organization: { getOrganization: async () => ({ title: 'Клиника' }) },
    },
    systemSettings: { listSettingsByScope: async () => [], getSetting: async () => null },
    orgBranding: { resolveEffectiveOrgBranding: async () => null },
    saasBilling: {
      getOrganizationBillingOverview: async () => ({ invoices: [], subscriptions: [] }),
    },
    patientOrganization: {},
    contentPages: { listAll: async () => [] },
    contentSections: { listAll: async () => [] },
    materialRating: { listDoctorAggregates: async () => new Map() },
    patientHomeBlocks: { listBlocksWithItems: async () => [] },
    courses: {
      listCoursesForDoctor: vi.fn().mockResolvedValue([]),
      listPublishedCatalog: vi.fn(),
    },
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

    expect(fakes.runWithDbClinicBillingPrincipal).toHaveBeenCalledWith(
      {
        organizationId,
        platformUserId: userId,
        source: 'doctor-layout-billing-warning-read',
      },
      expect.any(Function),
    );
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

  it('keeps the read-only course list visible but removes create and edit controls', async () => {
    coursesReadOnly = true;
    fakes.buildAppDeps().courses.listCoursesForDoctor.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Существующий курс',
        status: 'published',
        updatedAt: '2026-07-30T12:00:00.000Z',
      },
    ]);

    render(await DoctorCoursesPage({}));

    expect(screen.getByText('Существующий курс')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Новый курс' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Существующий курс' })).not.toBeInTheDocument();
  });

  it('keeps the course list and both editor entry points usable at full access', async () => {
    coursesAccessState = 'full_access';
    const courseId = '33333333-3333-4333-8333-333333333333';
    fakes.buildAppDeps().courses.listCoursesForDoctor.mockResolvedValue([
      {
        id: courseId,
        title: 'Существующий курс',
        status: 'published',
        updatedAt: '2026-07-30T12:00:00.000Z',
      },
    ]);
    fakes.buildAppDeps().courses.getCourseForDoctor = vi.fn().mockResolvedValue({
      id: courseId,
      title: 'Существующий курс',
    });
    fakes.buildAppDeps().courses.getCourseUsage = vi.fn().mockResolvedValue(null);
    fakes.buildAppDeps().treatmentProgram = {
      listTemplates: vi.fn().mockResolvedValue([]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };
    fakes.buildAppDeps().contentPages = {
      listAll: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
    };

    render(await DoctorCoursesPage({}));

    expect(screen.getByRole('link', { name: 'Новый курс' })).toHaveAttribute(
      'href',
      '/app/doctor/courses/new',
    );
    expect(screen.getByRole('link', { name: 'Существующий курс' })).toHaveAttribute(
      'href',
      `/app/doctor/courses/${courseId}`,
    );
    await expect(
      DoctorCoursesNewPage({ searchParams: Promise.resolve({}) }),
    ).resolves.toBeDefined();
    await expect(DoctorCourseEditPage({ params: Promise.resolve({ id: courseId }) })).resolves.toBeDefined();
  });

  it('does not render direct course create or edit URLs when courses are read-only', async () => {
    coursesReadOnly = true;

    await expect(
      DoctorCoursesNewPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      DoctorCourseEditPage({
        params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fakes.buildAppDeps().courses.listCoursesForDoctor).not.toHaveBeenCalled();
  });

  it('does not render a direct patient course URL when courses are disabled', async () => {
    coursesIncluded = false;

    await expect(PatientCoursesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(fakes.buildAppDeps().courses.listPublishedCatalog).not.toHaveBeenCalled();
  });

  it('hides the specialist content navigation through the shared visibility adapter', async () => {
    cmsAccessState = 'disabled';

    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.queryByRole('link', { name: 'Контент' })).not.toBeInTheDocument();
  });

  it('hides the patient daily-warmup home entry through the shared visibility adapter', async () => {
    warmupsIncluded = false;

    render(await PatientHomePage());

    expect(screen.getByTestId('patient-home-warmups-organization')).toHaveTextContent('hidden');
  });

  it('keeps the doctor Today navigation visible while the mechanic is read-only', async () => {
    patientHomeTodayState = 'read_only';

    render(await DoctorContentPage());

    expect(screen.getByTestId('doctor-patient-home-navigation')).toHaveTextContent('visible');
  });

  it('keeps Today settings navigation and direct URL available when Today is read-only and CMS is disabled', async () => {
    patientHomeTodayState = 'read_only';
    cmsAccessState = 'disabled';

    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.getByRole('link', { name: 'Главная пациента' })).toBeInTheDocument();
    await expect(DoctorPatientHomeSettingsPage()).resolves.toBeDefined();
  });

  it('hides and refuses the doctor Today settings direct URL when the mechanic is disabled', async () => {
    patientHomeTodayState = 'disabled';

    render(await DoctorSectionLayout({ children: <div>Рабочая область</div> }));

    expect(screen.queryByRole('link', { name: 'Главная пациента' })).not.toBeInTheDocument();
    await expect(DoctorPatientHomeSettingsPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('refuses the patient Today direct URL when the mechanic is disabled', async () => {
    patientHomeTodayState = 'disabled';

    await expect(PatientHomePage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('does not render a direct specialist content URL through the shared visibility adapter', async () => {
    cmsAccessState = 'disabled';
    warmupsIncluded = false;
    patientHomeTodayState = 'disabled';

    await expect(DoctorContentPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('does not open CMS mutation pages during the read-only ladder step', async () => {
    cmsAccessState = 'read_only';
    warmupsIncluded = false;

    await expect(DoctorContentNewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    await expect(
      DoctorContentEditPage({ params: Promise.resolve({ id: 'page-id' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(DoctorContentSectionNewPage({})).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      DoctorContentSectionEditPage({ params: Promise.resolve({ slug: 'articles' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
