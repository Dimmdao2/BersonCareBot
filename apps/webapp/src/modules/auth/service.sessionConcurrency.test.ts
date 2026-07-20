import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decodedSession: null as unknown,
  findByUserId: vi.fn(),
  stampDbPrincipalFromSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bersoncare_webapp_session" ? { value: "signed-dev-session" } : undefined,
    set: vi.fn(),
  }),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://unit-test.invalid/bcb",
    NODE_ENV: "development",
    ALLOW_DEV_AUTH_BYPASS: "true",
  },
  isProduction: false,
}));

vi.mock("./envRole", () => ({
  resolveRoleAsync: vi.fn(),
  isWhitelistedAsync: vi.fn(),
}));

vi.mock("./sessionCookie", () => ({
  buildRenewedSessionCookieOptions: vi.fn(),
  buildSessionCookieOptions: vi.fn(),
  clearFreshLoginMarkerCookie: vi.fn(),
  decodeSessionCookie: () => mocks.decodedSession,
  encodeSessionCookie: vi.fn(),
  renewSessionIfActive: vi.fn(),
  sessionTtlSecondsForRole: () => 3_600,
  shouldRenewSession: vi.fn(),
  writeFreshLoginMarkerCookie: vi.fn(),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => "",
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

vi.mock("@/app-layer/principal/sessionPrincipal", () => ({
  stampDbPrincipalFromSession: (...args: unknown[]) =>
    mocks.stampDbPrincipalFromSession(...args),
}));

vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: {
    findByUserId: (...args: unknown[]) => mocks.findByUserId(...args),
  },
}));

import {
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
  runWithDbBootstrapPrincipal,
} from "@bersoncare/db-principal";
import type { AppSession, SessionUser } from "@/shared/types/session";
import { getCurrentSession } from "./service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

function doctorUser(): SessionUser {
  return {
    userId: USER_ID,
    role: "doctor",
    displayName: "DEV Doctor",
    bindings: {},
  };
}

describe("getCurrentSession identity-self concurrency", () => {
  beforeEach(() => {
    mocks.findByUserId.mockReset();
    mocks.stampDbPrincipalFromSession.mockReset();
    mocks.decodedSession = {
      user: doctorUser(),
      issuedAt: 1,
      expiresAt: 9_999_999_999,
      authSource: "dev_bypass",
    } satisfies AppSession;
  });

  it("keeps each concurrent dev-doctor identity read scoped while a sibling promotes to staff", async () => {
    let resolveFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      resolveFirstStarted = resolve;
    });
    let releaseFirstRead: (() => void) | undefined;
    const firstReadMayFinish = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let resolveSecondStamped: (() => void) | undefined;
    const secondStamped = new Promise<void>((resolve) => {
      resolveSecondStamped = resolve;
    });
    let readCount = 0;

    mocks.findByUserId.mockImplementation(async (userId: string) => {
      readCount += 1;
      expect(userId).toBe(USER_ID);
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "patient",
        platformUserId: USER_ID,
      });
      if (readCount === 1) {
        resolveFirstStarted?.();
        await firstReadMayFinish;
        expect(getCurrentDbPrincipal()).toMatchObject({
          kind: "patient",
          platformUserId: USER_ID,
        });
      }
      return doctorUser();
    });
    mocks.stampDbPrincipalFromSession.mockImplementation(async () => {
      enterWithDbStaffPrincipal({
        organizationId: ORGANIZATION_ID,
        platformUserId: USER_ID,
        source: "service.sessionConcurrency.test",
      });
      resolveSecondStamped?.();
    });

    const sessions = await runWithDbBootstrapPrincipal(
      { source: "service.sessionConcurrency.test" },
      async () => {
        const first = getCurrentSession();
        await firstStarted;
        const second = getCurrentSession();
        await secondStamped;
        releaseFirstRead?.();
        return Promise.all([first, second]);
      },
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session?.authSource === "dev_bypass")).toBe(true);
    expect(sessions.every((session) => session?.user.role === "doctor")).toBe(true);
    expect(mocks.findByUserId).toHaveBeenCalledTimes(2);
  });
});
