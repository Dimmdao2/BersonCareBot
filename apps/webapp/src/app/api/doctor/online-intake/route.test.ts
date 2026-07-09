import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationId = "10000000-0000-4000-8000-000000000001";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, fn: () => unknown) => fn()));
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

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: getOnlineIntakeServiceMock,
}));

import { GET } from "./route";

describe("GET /api/doctor/online-intake", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "d1", role: "doctor", bindings: {}, displayName: "D" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    listForDoctorMock.mockClear();
    getOnlineIntakeServiceMock.mockClear();
    getOnlineIntakeServiceMock.mockImplementation(() => ({
      listForDoctor: listForDoctorMock,
    }));
  });

  it("returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/doctor/online-intake"));
    expect(res.status).toBe(401);
    expect(listForDoctorMock).not.toHaveBeenCalled();
  });

  it("returns patientName and patientPhone for each item", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/online-intake"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ patientName: string; patientPhone: string; patientUserId: string }>;
    };
    expect(body.items[0].patientName).toBe("Тест Пациент");
    expect(body.items[0].patientPhone).toBe("+79001230099");
    expect(body.items[0].patientUserId).toBe("00000000-0000-0000-0000-0000000000bb");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it("accepts booked/rejected status filters", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/online-intake?status=booked"));
    expect(res.status).toBe(200);
    expect(listForDoctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "booked",
        open: false,
      }),
    );
  });
});
