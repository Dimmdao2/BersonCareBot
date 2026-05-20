/**
 * Warmups section RSC: reminder bar removed from section list (reminders live on /app/patient/reminders).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppSession } from "@/shared/types/session";

const listRulesByUserMock = vi.hoisted(() => vi.fn(async () => []));
const listBlocksWithItemsMock = vi.hoisted(() => vi.fn(async () => []));
const getOptionalPatientSessionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: getOptionalPatientSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      getBySlug: vi.fn(async (slug: string) =>
        slug === "warmups"
          ? {
              id: "00000000-0000-4000-8000-000000000101",
              slug: "warmups",
              title: "Разминки",
              description: "",
              sortOrder: 0,
              isVisible: true,
            }
          : null,
      ),
      getRedirectNewSlugForOldSlug: vi.fn(async () => null),
    },
    contentPages: {
      listBySection: vi.fn(async () => []),
    },
    patientHomeBlocks: {
      listBlocksWithItems: listBlocksWithItemsMock,
    },
    reminders: {
      listRulesByUser: listRulesByUserMock,
    },
    courses: { getCourseForDoctor: vi.fn() },
  }),
}));

import PatientSectionPage from "./page";

const uid = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

function clientSession(): AppSession {
  return {
    user: {
      userId: uid,
      role: "client",
      displayName: "T",
      phone: "+79990000001",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

describe("PatientSectionPage /warmups", () => {
  beforeEach(() => {
    listRulesByUserMock.mockClear();
    listBlocksWithItemsMock.mockClear();
    getOptionalPatientSessionMock.mockReset();
  });

  it("does not load reminder rules for warmups section list", async () => {
    getOptionalPatientSessionMock.mockResolvedValue(clientSession());

    await PatientSectionPage({ params: Promise.resolve({ slug: "warmups" }) });

    expect(listRulesByUserMock).not.toHaveBeenCalled();
  });
});
