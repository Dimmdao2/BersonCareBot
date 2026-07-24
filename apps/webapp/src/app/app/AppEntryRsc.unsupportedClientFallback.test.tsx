/** @vitest-environment node */

/**
 * Runtime (non-grep) proof that the SSR fallback chokepoint in AppEntryRsc is wired to the
 * rollout flag: present with the parsed client environment when enabled, completely absent
 * from the render tree for every client when disabled. Complements the grep-based wiring
 * contract in unsupportedClientFallback.contract.test.ts and the watchdog-level reveal/cancel
 * behavior in clientBootWatchdog.test.tsx.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());
const getUnsupportedClientFallbackEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("unexpected redirect"); }) }));
vi.mock("next/headers", () => ({ headers: headersMock, cookies: vi.fn() }));
vi.mock("@/config/env", () => ({
  env: { NODE_ENV: "test", ALLOW_DEV_AUTH_BYPASS: false },
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: { getCurrentSession: getCurrentSessionMock },
  }),
}));
vi.mock("@/modules/auth/publicAuthSnapshot", () => ({
  buildPrefetchedPublicAuthConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/modules/auth/unsupportedClientFallback", () => ({
  getUnsupportedClientFallbackEnabled: getUnsupportedClientFallbackEnabledMock,
}));
vi.mock("@/shared/lib/platformCookie.server", () => ({
  getPlatformEntry: vi.fn().mockResolvedValue(null),
  getMessengerSurfaceHint: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/shared/ui/patient/PatientAppShell", () => ({
  PatientAppShell: vi.fn(),
}));
vi.mock("./AppEntryLoginContent", () => ({
  AppEntryLoginContent: vi.fn(),
}));
vi.mock("./PatientUnsupportedClientFallback", () => ({
  PatientUnsupportedClientFallback: vi.fn(),
}));

import { AppEntryRsc } from "./AppEntryRsc";
import { PatientUnsupportedClientFallback } from "./PatientUnsupportedClientFallback";
import { routePaths } from "@/app-layer/routes/paths";

const OLD_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Version/15.5 Mobile Safari/604.1";

function fallbackChildren(shell: ReactElement): unknown[] {
  const children = (shell.props as { children?: unknown }).children;
  return Array.isArray(children) ? children : [children];
}

function findFallbackElement(shell: ReactElement): ReactElement | undefined {
  return fallbackChildren(shell).find(
    (child): child is ReactElement =>
      Boolean(child) &&
      typeof child === "object" &&
      (child as ReactElement).type === PatientUnsupportedClientFallback,
  );
}

describe("AppEntryRsc unsupported-client fallback wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSessionMock.mockResolvedValue(null);
    headersMock.mockResolvedValue({ get: () => OLD_IOS_UA });
  });

  it("omits the fallback entirely for every client while the rollout flag is disabled", async () => {
    getUnsupportedClientFallbackEnabledMock.mockResolvedValue(false);

    const result = (await AppEntryRsc({
      searchParams: Promise.resolve({}),
      routeBoundMessengerSurface: null,
    })) as ReactElement;

    expect(findFallbackElement(result)).toBeUndefined();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("mounts the fallback with the SSR-parsed client environment and browser entrySurface when enabled", async () => {
    getUnsupportedClientFallbackEnabledMock.mockResolvedValue(true);

    const result = (await AppEntryRsc({
      searchParams: Promise.resolve({}),
      routeBoundMessengerSurface: null,
    })) as ReactElement;

    const fallback = findFallbackElement(result);
    expect(fallback).toBeDefined();
    const props = fallback!.props as {
      entrySurface: string;
      supportContactHref: string;
      client: { osFamily: string; browserFamily: string; supportBucket: string };
    };
    expect(props.entrySurface).toBe("browser");
    expect(props.supportContactHref).toBe(routePaths.loginContactSupport);
    expect(props.client).toMatchObject({
      osFamily: "ios",
      browserFamily: "safari",
      supportBucket: "within_matrix",
    });
  });

  it("routes the Telegram miniapp entry surface into the fallback when enabled", async () => {
    getUnsupportedClientFallbackEnabledMock.mockResolvedValue(true);

    const result = (await AppEntryRsc({
      searchParams: Promise.resolve({}),
      routeBoundMessengerSurface: "telegram",
    })) as ReactElement;

    const fallback = findFallbackElement(result);
    expect((fallback!.props as { entrySurface: string }).entrySurface).toBe("tg");
  });
});
