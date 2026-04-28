/**
 * Phase 7: инфоблок подписки на странице раздела при membership в `subscription_carousel`.
 */
/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
}));

vi.mock("@/shared/ui/AppShell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <span data-testid="shell-title">{title}</span>
      {children}
    </div>
  ),
}));

vi.mock("@/modules/platform-access", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => true),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: vi.fn(async () => null),
  patientRscPersonalDataGate: vi.fn(),
}));

const FIXTURE_SLUG = "fixture-subscription-section";

const listBlocksWithItemsMock = vi.hoisted(() => vi.fn());

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
      listBySection: vi.fn(async () => []),
    },
    patientHomeBlocks: {
      listBlocksWithItems: listBlocksWithItemsMock,
    },
    reminders: {
      listRulesByUser: vi.fn(async () => []),
    },
  }),
}));

import PatientSectionPage from "./page";

describe("PatientSectionPage / subscription (Phase 7)", () => {
  beforeEach(() => {
    listBlocksWithItemsMock.mockResolvedValue(subscriptionCarouselWithFixtureItem());
  });

  it("shows subscription callout when section is in subscription_carousel items", async () => {
    const ui = await PatientSectionPage({ params: Promise.resolve({ slug: FIXTURE_SLUG }) });
    render(ui);
    expect(screen.getByTestId("patient-section-subscription-callout")).toBeInTheDocument();
    expect(screen.getByText(/Доступ ко всем материалам этого раздела/i)).toBeInTheDocument();
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
  });
});
