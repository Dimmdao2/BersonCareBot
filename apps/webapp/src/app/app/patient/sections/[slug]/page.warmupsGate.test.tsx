/**
 * D-TST-1 / Phase E-FIX: warmups RSC не дергает персональные данные напоминаний при onboarding (gate guest).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppSession } from "@/shared/types/session";

const listRulesByUserMock = vi.hoisted(() => vi.fn(async () => []));
const getOptionalPatientSessionMock = vi.hoisted(() => vi.fn());
const patientRscPersonalDataGateMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: getOptionalPatientSessionMock,
  patientRscPersonalDataGate: patientRscPersonalDataGateMock,
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
              requiresAuth: false,
            }
          : null,
      ),
      getRedirectNewSlugForOldSlug: vi.fn(async () => null),
    },
    contentPages: {
      listBySection: vi.fn(async () => []),
    },
    reminders: {
      listRulesByUser: listRulesByUserMock,
    },
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

describe("PatientSectionPage /warmups — patientRscPersonalDataGate (Phase E D-TST-1)", () => {
  beforeEach(() => {
    listRulesByUserMock.mockClear();
    getOptionalPatientSessionMock.mockReset();
    patientRscPersonalDataGateMock.mockReset();
  });

  it("does not call listRulesByUser when gate is guest (onboarding / need_activation)", async () => {
    getOptionalPatientSessionMock.mockResolvedValue(clientSession());
    patientRscPersonalDataGateMock.mockResolvedValue("guest");

    await PatientSectionPage({ params: Promise.resolve({ slug: "warmups" }) });

    expect(patientRscPersonalDataGateMock).toHaveBeenCalledWith(
      clientSession(),
      "/app/patient/sections/warmups",
    );
    expect(listRulesByUserMock).not.toHaveBeenCalled();
  });

  it("calls listRulesByUser when gate is allow (tier patient)", async () => {
    getOptionalPatientSessionMock.mockResolvedValue(clientSession());
    patientRscPersonalDataGateMock.mockResolvedValue("allow");
    listRulesByUserMock.mockResolvedValueOnce([]);

    await PatientSectionPage({ params: Promise.resolve({ slug: "warmups" }) });

    expect(listRulesByUserMock).toHaveBeenCalledWith(uid);
  });
});
