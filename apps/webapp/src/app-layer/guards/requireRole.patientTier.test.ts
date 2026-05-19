import { describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/shared/types/session";

const resolveMock = vi.fn();

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

/** Прямой мок: `patientClientBusinessGate` импортирует resolver из файла, не из barrel. */
vi.mock("@/modules/platform-access/resolvePlatformAccessContext", () => ({
  resolvePlatformAccessContext: (...args: unknown[]) => resolveMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
}));

const getPlatformEntryMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/platformCookie.server", () => ({
  getPlatformEntry: (...args: unknown[]) => getPlatformEntryMock(...(args as [])),
}));

import { getCurrentSession } from "@/modules/auth/service";
import { requirePatientApiBusinessAccess, requirePatientApiSessionWithPhone } from "./requireRole";

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

describe("requirePatientApiBusinessAccess / requirePatientApiSessionWithPhone — tier patient (Phase C fix)", () => {
  it("allows web/OAuth/email user without phone even with messenger binding when entry is standalone", async () => {
    const sess = clientSession({ bindings: { telegramId: "123" }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "onboarding",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "resolved_canon",
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("standalone");

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/diary" });
    expect(gate.ok).toBe(true);
  });

  it("returns 403 patient_activation_required when tier is onboarding and platform entry is bot (miniapp)", async () => {
    const sess = clientSession({ bindings: { telegramId: "123" }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "onboarding",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "resolved_canon",
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("bot");

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/diary" });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const data = (await gate.response.json()) as { error?: string };
    expect(data.error).toBe("patient_activation_required");
  });

  it("allows when tier is patient", async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "patient",
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: "resolved_canon",
    });

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(true);
  });

  it("allows web/OAuth/email user without phone even with max binding when entry is standalone", async () => {
    const sess = clientSession({ bindings: { maxId: "m123" }, phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "onboarding",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "resolved_canon",
    });
    vi.mocked(getPlatformEntryMock).mockResolvedValueOnce("standalone");

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/diary" });
    expect(gate.ok).toBe(true);
  });

  it("allows when getPlatformEntry throws (treat as standalone)", async () => {
    const sess = clientSession({ phone: undefined });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "onboarding",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "resolved_canon",
    });
    vi.mocked(getPlatformEntryMock).mockRejectedValueOnce(new Error("boom"));

    const gate = await requirePatientApiBusinessAccess({ returnPath: "/app/patient/diary" });
    expect(gate.ok).toBe(true);
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(null);

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("returns 401 when role is not client (doctor)", async () => {
    const sess = clientSession({ role: "doctor" as const });
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);

    const gate = await requirePatientApiBusinessAccess();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("returns 401 when platform row missing", async () => {
    vi.mocked(getCurrentSession).mockResolvedValueOnce(clientSession());
    resolveMock.mockResolvedValueOnce({
      canonicalUserId: null,
      dbRole: null,
      tier: "guest",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "session_user_missing",
    });

    const gate = await requirePatientApiSessionWithPhone();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
  });

  it("alias requirePatientApiSessionWithPhone matches requirePatientApiBusinessAccess", async () => {
    const ctx = {
      canonicalUserId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      dbRole: "client",
      tier: "patient" as const,
      hasPhoneInDb: true,
      phoneTrustedForPatient: true,
      resolution: "resolved_canon" as const,
    };
    const sess = clientSession();
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(ctx);
    const a = await requirePatientApiBusinessAccess();
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sess);
    resolveMock.mockResolvedValueOnce(ctx);
    const b = await requirePatientApiSessionWithPhone();
    expect(a.ok && b.ok).toBe(true);
  });
});
