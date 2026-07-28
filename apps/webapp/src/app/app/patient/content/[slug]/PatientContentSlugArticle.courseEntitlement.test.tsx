/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const resolvePatientEnrollmentOrganizationIdMock = vi.hoisted(() => vi.fn());
const requireEntitlementForActionMock = vi.hoisted(() => vi.fn());
const getCourseForDoctorMock = vi.hoisted(() => vi.fn());
const listForPatientMock = vi.hoisted(() => vi.fn());
const principalContexts = vi.hoisted(
  () => [] as Array<{ organizationId: string; platformUserId: string }>,
);

vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: resolvePatientEnrollmentOrganizationIdMock,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForReadAction: requireEntitlementForActionMock,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: (
    context: { organizationId: string; platformUserId: string },
    fn: () => Promise<unknown>,
  ) => {
    principalContexts.push(context);
    return fn();
  },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: vi.fn(async () => null) },
    courses: { getCourseForDoctor: getCourseForDoctorMock },
    treatmentProgramInstance: { listForPatient: listForPatientMock },
  }),
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPatientRuntimeBool: vi.fn(async () => false),
}));

import { PatientContentSlugArticle } from './PatientContentSlugArticle';

const session = { user: { userId: 'patient-a', role: 'client' as const } };
const dbRow = {
  id: 'page-a',
  linkedCourseId: 'course-a',
};
const item = {
  title: 'Материал',
  summary: '',
  bodyHtml: '',
  bodyMd: '',
  imageUrl: null,
  imageLibraryMedia: null,
};

async function renderArticle() {
  render(
    await PatientContentSlugArticle({
      slug: 'material',
      session: session as never,
      dbRow: dbRow as never,
      item: item as never,
      personalTierOk: true,
      isDailyWarmup: false,
      practiceSource: 'section_page',
      videoPlayableUrl: undefined,
      hostedVideoIframeSrc: null,
      apiMediaId: null,
      warmupNav: null,
      orderedDailyWarmupPages: [],
    }),
  );
}

describe('PatientContentSlugArticle course CTA boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalContexts.length = 0;
    resolvePatientEnrollmentOrganizationIdMock.mockResolvedValue({
      ok: true,
      organizationId: 'org-a',
    });
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    getCourseForDoctorMock.mockResolvedValue({
      id: 'course-a',
      title: 'Course A',
      status: 'published',
      programTemplateId: 'template-a',
    });
    listForPatientMock.mockResolvedValue([]);
  });

  it.each([
    { enrollment: { ok: true, organizationId: 'org-a' }, entitlement: { ok: false } },
    { enrollment: { ok: false }, entitlement: { ok: true } },
  ])(
    'does not expose the CTA without both enrollment and entitlement',
    async ({ enrollment, entitlement }) => {
      resolvePatientEnrollmentOrganizationIdMock.mockResolvedValue(enrollment);
      requireEntitlementForActionMock.mockResolvedValue(entitlement);
      await renderArticle();
      expect(screen.queryByRole('link', { name: 'Открыть курс' })).not.toBeInTheDocument();
      expect(getCourseForDoctorMock).not.toHaveBeenCalled();
      expect(principalContexts).toEqual([]);
    },
  );

  it("resolves the CTA inside the patient's exact organization when enabled", async () => {
    await renderArticle();
    expect(screen.getByRole('link', { name: 'Открыть курс' })).toHaveAttribute(
      'href',
      '/app/patient/courses?highlight=course-a',
    );
    expect(principalContexts).toEqual([
      {
        organizationId: 'org-a',
        platformUserId: 'patient-a',
        source: 'app.patient.content.course-cta',
      },
    ]);
  });
});
