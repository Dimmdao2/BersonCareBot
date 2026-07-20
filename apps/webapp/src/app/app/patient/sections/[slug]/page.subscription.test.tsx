/**
 * Phase 7: инфоблок подписки на странице раздела при membership в `subscription_carousel`.
 */
/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getOptionalPatientSessionMock = vi.hoisted(() => vi.fn());
const resolvePatientEnrollmentOrganizationIdMock = vi.hoisted(() => vi.fn());
const requireEntitlementForActionMock = vi.hoisted(() => vi.fn());
const patientPrincipalContexts = vi.hoisted(() => [] as Array<{ organizationId: string; platformUserId: string }>);

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
}));

vi.mock("@/shared/ui/patient/PatientAppShell", () => ({
  PatientAppShell: ({
    children,
    title,
    patientTitleBadge,
  }: {
    children: React.ReactNode;
    title: string;
    patientTitleBadge?: string;
  }) => (
    <div>
      <span data-testid="shell-title">{title}</span>
      {patientTitleBadge ?
        <span data-testid="patient-header-title-badge">{patientTitleBadge}</span>
      : null}
      {children}
    </div>
  ),
}));

vi.mock("@/app-layer/platform-access", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => true),
  canViewPatientAuthOnlySection: vi.fn(async () => true),
  filterPatientSectionPages: vi.fn(async (_session: unknown, pages: unknown[]) => pages),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: getOptionalPatientSessionMock,
  patientRscPersonalDataGate: vi.fn(),
}));

vi.mock("@/app/api/booking/bookingTenant", () => ({
  resolvePatientEnrollmentOrganizationId: resolvePatientEnrollmentOrganizationIdMock,
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: requireEntitlementForActionMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withPatientOrganizationPrincipal: (
    ctx: { organizationId: string; platformUserId: string },
    fn: () => unknown,
  ) => {
    patientPrincipalContexts.push(ctx);
    return fn();
  },
}));

const FIXTURE_SLUG = "fixture-subscription-section";

const listBlocksWithItemsMock = vi.hoisted(() => vi.fn());
const listBySectionMock = vi.hoisted(() => vi.fn());
const getCourseForDoctorMock = vi.hoisted(() => vi.fn());

function subscriptionCarouselWithFixtureItem() {
  return [
    {
      code: "subscription_carousel" as const,
      title: "Материалы",
      description: "",
      isVisible: true,
      sortOrder: 1,
      items: [
        {
          id: "it-1",
          blockCode: "subscription_carousel" as const,
          targetType: "content_section" as const,
          targetRef: FIXTURE_SLUG,
          titleOverride: null,
          subtitleOverride: null,
          imageUrlOverride: null,
          badgeLabel: null,
          isVisible: true,
          sortOrder: 0,
        },
      ],
    },
  ];
}

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      getBySlug: vi.fn(async (slug: string) =>
        slug === FIXTURE_SLUG
          ? {
              slug: FIXTURE_SLUG,
              title: "Fixture",
              description: "",
              sortOrder: 0,
              isVisible: true,
              requiresAuth: false,
              coverImageUrl: null,
              iconImageUrl: null,
            }
          : null,
      ),
    },
    contentPages: {
      listBySection: listBySectionMock,
    },
    patientHomeBlocks: {
      listBlocksWithItems: listBlocksWithItemsMock,
    },
    reminders: {
      listRulesByUser: vi.fn(async () => []),
    },
    courses: {
      getCourseForDoctor: getCourseForDoctorMock,
    },
    patientOrganization: { resolveActiveOrganizationForPatient: vi.fn() },
    entitlements: null,
  }),
}));

import PatientSectionPage from "./page";

describe("PatientSectionPage / subscription (Phase 7)", () => {
  beforeEach(() => {
    getOptionalPatientSessionMock.mockResolvedValue(null);
    resolvePatientEnrollmentOrganizationIdMock.mockResolvedValue({ ok: false });
    requireEntitlementForActionMock.mockResolvedValue({ ok: false });
    patientPrincipalContexts.length = 0;
    listBlocksWithItemsMock.mockResolvedValue(subscriptionCarouselWithFixtureItem());
    listBySectionMock.mockResolvedValue([]);
    getCourseForDoctorMock.mockReset();
    getCourseForDoctorMock.mockResolvedValue(null);
  });

  it("shows subscription callout when section is in subscription_carousel items", async () => {
    const ui = await PatientSectionPage({ params: Promise.resolve({ slug: FIXTURE_SLUG }) });
    render(ui);
    expect(screen.getByTestId("patient-section-subscription-callout")).toBeInTheDocument();
    expect(screen.getByText(/Доступ ко всем материалам этого раздела/i)).toBeInTheDocument();
    expect(screen.getByTestId("patient-header-title-badge")).toHaveTextContent("По подписке");
  });

  it("hides callout when subscription_carousel has no item for this section", async () => {
    listBlocksWithItemsMock.mockResolvedValueOnce([
      {
        code: "subscription_carousel" as const,
        title: "M",
        description: "",
        isVisible: true,
        sortOrder: 1,
        items: [],
      },
    ]);
    const ui = await PatientSectionPage({ params: Promise.resolve({ slug: FIXTURE_SLUG }) });
    render(ui);
    expect(screen.queryByTestId("patient-section-subscription-callout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("patient-header-title-badge")).not.toBeInTheDocument();
  });

  it("shows Открыть курс for linked published course", async () => {
    const courseId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    listBySectionMock.mockResolvedValueOnce([
      {
        id: "pg-1",
        section: FIXTURE_SLUG,
        slug: "fixture-material-slug",
        title: "Материал",
        summary: "",
        bodyMd: "",
        bodyHtml: "",
        sortOrder: 0,
        isPublished: true,
        requiresAuth: false,
        videoUrl: null,
        videoType: null,
        imageUrl: null,
        archivedAt: null,
        deletedAt: null,
        linkedCourseId: courseId,
      },
    ]);
    getCourseForDoctorMock.mockImplementation(async (id: string) =>
      id === courseId ? { id: courseId, title: "Курс", description: null, status: "published" } : null,
    );
    getOptionalPatientSessionMock.mockResolvedValue({ user: { userId: "patient-a", role: "client" } });
    resolvePatientEnrollmentOrganizationIdMock.mockResolvedValue({ ok: true, organizationId: "org-a" });
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    const ui = await PatientSectionPage({ params: Promise.resolve({ slug: FIXTURE_SLUG }) });
    render(ui);
    expect(screen.getByRole("link", { name: "Открыть курс" })).toHaveAttribute(
      "href",
      `/app/patient/courses?highlight=${encodeURIComponent(courseId)}`,
    );
    expect(patientPrincipalContexts).toEqual([{
      organizationId: "org-a",
      platformUserId: "patient-a",
      source: "app.patient.sections.course-projections",
    }]);
  });

  it.each([
    { label: "the courses mechanic is OFF", organization: { ok: true, organizationId: "org-a" }, entitled: false },
    { label: "the patient has no active enrollment", organization: { ok: false }, entitled: true },
  ])("does not project a linked course when $label", async ({ organization, entitled }) => {
    const courseId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    listBySectionMock.mockResolvedValueOnce([
      {
        id: "pg-1",
        section: FIXTURE_SLUG,
        slug: "fixture-material-slug",
        title: "Материал",
        summary: "",
        bodyMd: "",
        bodyHtml: "",
        sortOrder: 0,
        isPublished: true,
        requiresAuth: false,
        videoUrl: null,
        videoType: null,
        imageUrl: null,
        archivedAt: null,
        deletedAt: null,
        linkedCourseId: courseId,
      },
    ]);
    getOptionalPatientSessionMock.mockResolvedValue({ user: { userId: "patient-a", role: "client" } });
    resolvePatientEnrollmentOrganizationIdMock.mockResolvedValue(organization);
    requireEntitlementForActionMock.mockResolvedValue({ ok: entitled });

    const ui = await PatientSectionPage({ params: Promise.resolve({ slug: FIXTURE_SLUG }) });
    render(ui);
    expect(screen.queryByRole("link", { name: "Открыть курс" })).not.toBeInTheDocument();
    expect(getCourseForDoctorMock).not.toHaveBeenCalled();
    expect(patientPrincipalContexts).toEqual([]);
  });
});
