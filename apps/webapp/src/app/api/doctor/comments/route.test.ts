import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-0000000000b1";

const sampleItem = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId,
  authorId: "00000000-0000-4000-8000-0000000000a1",
  targetType: "program_instance" as const,
  targetId,
  commentType: "clinical_note" as const,
  body: "Note",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const {
  listMock,
  createMock,
  getInstanceByIdMock,
  buildAppDepsMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
} = vi.hoisted(() => {
  const listMockInner = vi.fn();
  const createMockInner = vi.fn();
  const getInstanceByIdMockInner = vi.fn();
  const requireDoctorWorkspaceApiContextMockInner = vi.fn();
  const withDoctorWorkspacePrincipalMockInner = vi.fn((_: unknown, fn: () => unknown) => fn());
  return {
    listMock: listMockInner,
    createMock: createMockInner,
    getInstanceByIdMock: getInstanceByIdMockInner,
    requireDoctorWorkspaceApiContextMock: requireDoctorWorkspaceApiContextMockInner,
    withDoctorWorkspacePrincipalMock: withDoctorWorkspacePrincipalMockInner,
    buildAppDepsMock: vi.fn(() => ({
      treatmentProgramInstance: {
        getInstanceById: getInstanceByIdMockInner,
      },
      comments: {
        listByTarget: listMockInner,
        create: createMockInner,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

import { GET, POST } from "./route";

describe("/api/doctor/comments", () => {
  beforeEach(() => {
    listMock.mockClear();
    createMock.mockClear();
    getInstanceByIdMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
    getInstanceByIdMock.mockResolvedValue({ id: targetId, organizationId });
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: {
          user: {
            userId: "00000000-0000-4000-8000-0000000000a1",
            role: "doctor",
            displayName: "D",
            bindings: {},
          },
        },
      },
    });
  });

  it("GET returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await GET(
      new Request(
        `http://localhost/api/doctor/comments?targetType=program_instance&targetId=${targetId}`,
      ),
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 400 on invalid query", async () => {
    const res = await GET(new Request("http://localhost/api/doctor/comments?targetType=bad&targetId=not-uuid"));
    expect(res.status).toBe(400);
  });

  it("GET returns items for doctor", async () => {
    listMock.mockResolvedValue([sampleItem]);
    const res = await GET(
      new Request(
        `http://localhost/api/doctor/comments?targetType=program_instance&targetId=${targetId}`,
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; items: typeof sampleItem[] };
    expect(data.ok).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(getInstanceByIdMock).toHaveBeenCalledWith(targetId);
    expect(listMock).toHaveBeenCalledWith("program_instance", targetId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it("GET rejects unsupported generic targets before listing", async () => {
    const res = await GET(
      new Request(`http://localhost/api/doctor/comments?targetType=lesson&targetId=${targetId}`),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "unsupported_target_type" });
    expect(getInstanceByIdMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it("GET returns 404 when program instance is outside workspace", async () => {
    getInstanceByIdMock.mockResolvedValueOnce({ id: targetId, organizationId: otherOrganizationId });
    const res = await GET(
      new Request(`http://localhost/api/doctor/comments?targetType=program_instance&targetId=${targetId}`),
    );
    expect(res.status).toBe(404);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("POST returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "program_instance",
          targetId,
          commentType: "clinical_note",
          body: "X",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST creates with session userId as author", async () => {
    createMock.mockResolvedValue(sampleItem);
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "program_instance",
          targetId,
          commentType: "clinical_note",
          body: "Note",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; item: typeof sampleItem };
    expect(data.ok).toBe(true);
    expect(createMock).toHaveBeenCalledWith(
      {
        targetType: "program_instance",
        targetId,
        commentType: "clinical_note",
        body: "Note",
      },
      "00000000-0000-4000-8000-0000000000a1",
    );
    expect(data.item.body).toBe("Note");
  });

  it("POST returns 404 when program instance is missing and does not create", async () => {
    getInstanceByIdMock.mockRejectedValueOnce(new Error("not_found"));
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "program_instance",
          targetId,
          commentType: "clinical_note",
          body: "Note",
        }),
      }),
    );
    expect(res.status).toBe(404);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("POST rejects unsupported generic targets before creating", async () => {
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "lesson",
          targetId,
          commentType: "clinical_note",
          body: "Note",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "unsupported_target_type" });
    expect(getInstanceByIdMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
