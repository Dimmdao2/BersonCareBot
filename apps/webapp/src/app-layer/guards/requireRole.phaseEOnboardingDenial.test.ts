/**
 * Фаза E (MASTER_PLAN §5): отказ patient-business API и server actions при tier onboarding
 * (не в whitelist активации — см. patientRouteApiPolicy / SPEC §4).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppSession } from "@/shared/types/session";

const resolveMock = vi.fn();

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const e = new Error("redirect");
    (e as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw e;
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/config/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/config/env")>();
  return {
    ...mod,
    env: { ...mod.env, DATABASE_URL: "postgresql://test/test" },
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({}),
}));

vi.mock("@/modules/platform-access/resolvePlatformAccessContext", () => ({
  resolvePlatformAccessContext: (...args: unknown[]) => resolveMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
}));

import { getCurrentSession } from "@/modules/auth/service";
const getPlatformEntryMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/platformCookie.server", () => ({
  getPlatformEntry: (...args: unknown[]) => getPlatformEntryMock(...(args as [])),
}));
import { requirePatientAccessWithPhone, requirePatientApiBusinessAccess } from "./requireRole";
import { routePaths } from "@/app-layer/routes/paths";

function clientSession(partial?: Partial<AppSession["user"]>): AppSession {
  return {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role: "client",
      displayName: "T",
      phone: "+79990000001",
      bindings: {},
      ...partial,
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

const onboardingCtx = {
  canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  dbRole: "client" as const,
  tier: "onboarding" as const,
  hasPhoneInDb: true,
  phoneTrustedForPatient: false,
  resolution: "resolved_canon" as const,
};

beforeEach(() => {
  resolveMock.mockReset();
  redirectMock.mockClear();
  vi.mocked(getCurrentSession).mockReset();
});

describe("Phase E: onboarding denied outside activation whitelist", () => {
  it("patient-business API allows onboarding for regular web session (no messenger binding)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce(onboardingCtx);
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("standalone");

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/reminders" });
    expect(gate.ok).toBe(true);
  });

  it("patient-business API returns 403 patient_activation_required when tier is onboarding and platform entry is bot", async () => {
    const sess = clientSession({ bindings: { telegramId: "321" }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(onboardingCtx);
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("bot");

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/reminders" });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const data = (await gate.response.json()) as { error?: string; redirectTo?: string };
    expect(data.error).toBe("patient_activation_required");
    expect(data.redirectTo).toContain(routePaths.bindPhone);
    expect(data.redirectTo).toContain(encodeURIComponent("/app/patient/reminders"));
  });

  it("server action gate (requirePatientAccessWithPhone) does not redirect for web session without messenger binding", async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce(onboardingCtx);
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("standalone");

    await expect(requirePatientAccessWithPhone(routePaths.patientReminders)).resolves.not.toThrow();
  });

  it("server action gate (requirePatientAccessWithPhone) redirects to bind-phone when tier is onboarding and platform entry is bot", async () => {
    const sess = clientSession({ bindings: { maxId: "x" }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(onboardingCtx);
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("bot");

    await expect(requirePatientAccessWithPhone(routePaths.patientReminders)).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patientReminders)}`,
    );
  });
});
