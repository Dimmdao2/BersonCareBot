/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
);
const getSessionMock = vi.hoisted(() => vi.fn());
const personalGateMock = vi.hoisted(() => vi.fn());
const getRememberedMock = vi.hoisted(() => vi.fn());
const resolveContextMock = vi.hoisted(() => vi.fn());
const warmupTargetMock = vi.hoisted(() => vi.fn());
const planTargetMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: getSessionMock,
  patientRscPersonalDataGate: personalGateMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ patientOrganization: {} }),
}));
vi.mock("@/app-layer/patient-organization/requestContext", () => ({
  getRememberedPatientOrganizationId: getRememberedMock,
  resolvePatientOrganizationRequestContext: resolveContextMock,
}));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withPatientOrganizationPrincipal: vi.fn(async (_principal, fn: () => unknown) => fn()),
}));
vi.mock("../resolvePatientReminderGoTargets", () => ({
  resolveDailyWarmupStartPathForPatient: warmupTargetMock,
  resolvePlanStartLessonPathForPatient: planTargetMock,
}));

import PatientGoReminderTargetPage from "./page";

const PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

describe("PatientGoReminderTargetPage organization continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { userId: PATIENT_ID, role: "client" } });
    personalGateMock.mockResolvedValue("allow");
    warmupTargetMock.mockResolvedValue("/app/patient/content/warmup?from=daily_warmup");
    planTargetMock.mockResolvedValue("/app/patient/treatment/program-a");
  });

  it("never substitutes remembered B for a reminder targeting A", async () => {
    getRememberedMock.mockResolvedValue(ORG_B);
    await expect(
      PatientGoReminderTargetPage({
        params: Promise.resolve({ kind: "daily-warmup" }),
        searchParams: Promise.resolve({ from: "reminder", organizationId: ORG_A }),
      }),
    ).rejects.toThrow(
      `redirect:/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_A}&goKind=daily-warmup`,
    );
    expect(resolveContextMock).not.toHaveBeenCalled();
  });

  it("revalidates a matching exact target without trusting a raw notice query", async () => {
    getRememberedMock.mockResolvedValue(ORG_A);
    resolveContextMock.mockResolvedValue({ ok: true, organizationId: ORG_A });
    await expect(
      PatientGoReminderTargetPage({
        params: Promise.resolve({ kind: "daily-warmup" }),
        searchParams: Promise.resolve({
          from: "reminder",
          organizationId: ORG_A,
        }),
      }),
    ).rejects.toThrow("redirect:/app/patient/content/warmup?from=daily_warmup");
    expect(resolveContextMock).toHaveBeenCalledWith({}, PATIENT_ID, {
      verifiedTargetOrganizationId: ORG_A,
    });
  });

  it("preserves a validated exact reminder target through unauthenticated login", async () => {
    getSessionMock.mockResolvedValue(null);
    const continuation = `/app/patient/go/daily-warmup?from=reminder&organizationId=${ORG_A}`;
    await expect(
      PatientGoReminderTargetPage({
        params: Promise.resolve({ kind: "daily-warmup" }),
        searchParams: Promise.resolve({ from: "reminder", organizationId: ORG_A }),
      }),
    ).rejects.toThrow(`redirect:/app?next=${encodeURIComponent(continuation)}`);
  });

  it("does not preserve an invalid reminder target through login", async () => {
    getSessionMock.mockResolvedValue(null);
    const recovery = "/app/patient/organizations?reason=reminder_target_missing";
    await expect(
      PatientGoReminderTargetPage({
        params: Promise.resolve({ kind: "daily-warmup" }),
        searchParams: Promise.resolve({ from: "reminder", organizationId: "not-an-org" }),
      }),
    ).rejects.toThrow(`redirect:/app?next=${encodeURIComponent(recovery)}`);
  });

  it("sends a legacy reminder without an exact organization to the neutral chooser", async () => {
    await expect(
      PatientGoReminderTargetPage({
        params: Promise.resolve({ kind: "plan-start-lesson" }),
        searchParams: Promise.resolve({ from: "reminder" }),
      }),
    ).rejects.toThrow("redirect:/app/patient/organizations?reason=reminder_target_missing");
  });
});
