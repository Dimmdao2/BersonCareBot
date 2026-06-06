import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/shared/types/session";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import { getOptionalPatientSession, requireDoctorAccess, requirePatientAccess } from "./requireRole";

function session(role: AppSession["user"]["role"]): AppSession {
  return {
    user: {
      userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role,
      displayName: "User",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  };
}

beforeEach(() => {
  getCurrentSessionMock.mockReset();
  redirectMock.mockReset();
});

describe("requireDoctorAccess", () => {
  it("redirects client to patient hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("client"));
    const target = buildOwnHubUrlWithAccessDeniedToast("client");
    await expect(requireDoctorAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for doctor", async () => {
    const doc = session("doctor");
    getCurrentSessionMock.mockResolvedValueOnce(doc);
    await expect(requireDoctorAccess()).resolves.toBe(doc);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns session for admin", async () => {
    const admin = session("admin");
    getCurrentSessionMock.mockResolvedValueOnce(admin);
    await expect(requireDoctorAccess()).resolves.toBe(admin);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /app when no session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    await expect(requireDoctorAccess()).rejects.toThrow("redirect:/app");
    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});

describe("requirePatientAccess", () => {
  it("redirects doctor to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    const target = buildOwnHubUrlWithAccessDeniedToast("doctor");
    await expect(requirePatientAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("redirects admin to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("admin"));
    const target = buildOwnHubUrlWithAccessDeniedToast("admin");
    await expect(requirePatientAccess()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for client", async () => {
    const client = session("client");
    getCurrentSessionMock.mockResolvedValueOnce(client);
    await expect(requirePatientAccess()).resolves.toBe(client);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("getOptionalPatientSession", () => {
  it("returns null when no session", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    await expect(getOptionalPatientSession()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects doctor to doctor hub with access-denied toast flag", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(session("doctor"));
    const target = buildOwnHubUrlWithAccessDeniedToast("doctor");
    await expect(getOptionalPatientSession()).rejects.toThrow(`redirect:${target}`);
    expect(redirectMock).toHaveBeenCalledWith(target);
  });

  it("returns session for client", async () => {
    const client = session("client");
    getCurrentSessionMock.mockResolvedValueOnce(client);
    await expect(getOptionalPatientSession()).resolves.toBe(client);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
