import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const listForDoctorMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        id: "00000000-0000-0000-0000-0000000000aa",
        userId: "00000000-0000-0000-0000-0000000000bb",
        type: "lfk" as const,
        status: "new" as const,
        summary: "summary",
        patientName: "Тест Пациент",
        patientPhone: "+79001230099",
        createdAt: "2026-01-15T10:00:00.000Z",
        updatedAt: "2026-01-15T10:00:00.000Z",
      },
    ],
  }),
);

const getOnlineIntakeServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    listForDoctor: listForDoctorMock,
  })),
);

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: getOnlineIntakeServiceMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/online-intake", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    listForDoctorMock.mockClear();
    getOnlineIntakeServiceMock.mockClear();
    getOnlineIntakeServiceMock.mockImplementation(() => ({
      listForDoctor: listForDoctorMock,
    }));
  });

  it("returns patientName and patientPhone for each item", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/online-intake"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ patientName: string; patientPhone: string }>;
    };
    expect(body.items[0].patientName).toBe("Тест Пациент");
    expect(body.items[0].patientPhone).toBe("+79001230099");
    expect(body.items[0]).not.toHaveProperty("userId");
  });
});
