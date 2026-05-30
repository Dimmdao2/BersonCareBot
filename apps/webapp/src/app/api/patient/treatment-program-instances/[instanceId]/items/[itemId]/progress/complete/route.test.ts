import { beforeEach, describe, expect, it, vi } from "vitest";

const { gateMock, patientCompleteSimpleItemMock, buildAppDepsMock } = vi.hoisted(() => {
  const patientCompleteSimpleItemMockInner = vi.fn();
  return {
    gateMock: vi.fn(),
    patientCompleteSimpleItemMock: patientCompleteSimpleItemMockInner,
    buildAppDepsMock: vi.fn(() => ({
      treatmentProgramProgress: {
        patientCompleteSimpleItem: patientCompleteSimpleItemMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: gateMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST progress complete route", () => {
  beforeEach(() => {
    gateMock.mockReset();
    patientCompleteSimpleItemMock.mockReset();
    gateMock.mockResolvedValue({
      ok: true as const,
      session: {
        user: {
          userId: patientUserId,
          role: "client" as const,
          phone: "+79990001122",
          bindings: {},
        },
      },
    });
    patientCompleteSimpleItemMock.mockResolvedValue({ id: instanceId });
  });

  it("accepts legacy empty POST body", async () => {
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ instanceId, itemId }),
    });
    expect(res.status).toBe(200);
    expect(patientCompleteSimpleItemMock).toHaveBeenCalledWith({
      patientUserId,
      instanceId,
      stageItemId: itemId,
      completion: undefined,
    });
  });

  it("accepts new completion payload", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perceivedDifficulty: "hard",
          reps: 12,
          weightKg: 5,
        }),
      }),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(200);
    expect(patientCompleteSimpleItemMock).toHaveBeenCalledWith({
      patientUserId,
      instanceId,
      stageItemId: itemId,
      completion: {
        perceivedDifficulty: "hard",
        reps: 12,
        weightKg: 5,
      },
    });
  });

  it("rejects invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reps: -1 }),
      }),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(400);
    expect(patientCompleteSimpleItemMock).not.toHaveBeenCalled();
  });
});
