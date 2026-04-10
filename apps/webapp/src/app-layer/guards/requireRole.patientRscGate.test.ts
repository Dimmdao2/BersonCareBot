import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppSession } from "@/shared/types/session";

const patientClientBusinessGateMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/platform-access", () => ({
  patientClientBusinessGate: patientClientBusinessGateMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { patientRscPersonalDataGate } from "./requireRole";

const returnToExample = "/app/patient";

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

beforeEach(() => {
  patientClientBusinessGateMock.mockReset();
  redirectMock.mockReset();
});

describe("patientRscPersonalDataGate", () => {
  it("returns guest without calling gate when session is null", async () => {
    expect(await patientRscPersonalDataGate(null, "/app/patient")).toBe("guest");
    expect(patientClientBusinessGateMock).not.toHaveBeenCalled();
  });

  it("returns guest when gate is need_activation", async () => {
    patientClientBusinessGateMock.mockResolvedValueOnce("need_activation");
    expect(await patientRscPersonalDataGate(clientSession(), returnToExample)).toBe("guest");
    expect(patientClientBusinessGateMock).toHaveBeenCalledTimes(1);
  });

  it("calls redirect when gate is stale_session", async () => {
    patientClientBusinessGateMock.mockResolvedValueOnce("stale_session");
    await patientRscPersonalDataGate(clientSession(), "/app/patient/diary");
    expect(redirectMock).toHaveBeenCalledWith("/app?next=%2Fapp%2Fpatient%2Fdiary");
  });

  it("returns allow when gate is allow", async () => {
    patientClientBusinessGateMock.mockResolvedValueOnce("allow");
    expect(await patientRscPersonalDataGate(clientSession(), "/app/patient")).toBe("allow");
  });

  it("returns allow for non-client without tier check in gate", async () => {
    patientClientBusinessGateMock.mockResolvedValueOnce("allow");
    expect(await patientRscPersonalDataGate(clientSession({ role: "doctor" }), "/x")).toBe("allow");
  });
});
