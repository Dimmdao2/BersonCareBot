/**
 * Staff vs patient layout redirects (волна 1 DOCTOR_PATIENT_PWA_SPLIT).
 * Импорты layout — один раз в beforeAll; patient page graphs не тянем.
 */
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";

const redirectMock = vi.fn((url: string) => {
  const e = new Error("redirect");
  (e as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
  throw e;
});

const getCurrentSessionMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/shared/ui/doctor/shell/DoctorWorkspaceShell", () => ({
  DoctorWorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));

function session(role: "client" | "doctor" | "admin") {
  return {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role,
      displayName: "User",
      bindings: {},
    },
    adminMode: role === "admin",
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

describe("staff layout role redirects", () => {
  let SettingsLayout: (typeof import("@/app/app/settings/layout"))["default"];
  let AdminLayout: (typeof import("@/app/app/admin/layout"))["default"];

  beforeAll(async () => {
    SettingsLayout = (await import("@/app/app/settings/layout")).default;
    AdminLayout = (await import("@/app/app/admin/layout")).default;
  }, 60_000);

  beforeEach(() => {
    redirectMock.mockClear();
    getCurrentSessionMock.mockReset();
  });

  it("settings layout redirects client to patient hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));
    await expect(SettingsLayout({ children: null })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(buildOwnHubUrlWithAccessDeniedToast("client"));
  });

  it("settings layout allows doctor without redirect", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    await expect(SettingsLayout({ children: null })).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("admin layout redirects non-admin to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    await expect(AdminLayout({ children: null })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith(buildOwnHubUrlWithAccessDeniedToast("doctor"));
  });

  it("admin layout redirects unauthenticated to /app", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    await expect(AdminLayout({ children: null })).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("admin layout allows admin without redirect", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("admin"));
    await expect(AdminLayout({ children: null })).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
