import { beforeEach, describe, expect, it, vi } from "vitest";

const sampleItem = {
  id: "00000000-0000-4000-8000-000000000001",
  authorId: "00000000-0000-4000-8000-0000000000a1",
  targetType: "program_instance" as const,
  targetId: "00000000-0000-4000-8000-0000000000b1",
  commentType: "clinical_note" as const,
  body: "Note",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const { listMock, createMock, buildAppDepsMock, getSessionMock } = vi.hoisted(() => {
  const listMockInner = vi.fn();
  const createMockInner = vi.fn();
  const getSessionMockInner = vi.fn();
  return {
    listMock: listMockInner,
    createMock: createMockInner,
    getSessionMock: getSessionMockInner,
    buildAppDepsMock: vi.fn(() => ({
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
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { GET, POST } from "./route";

describe("/api/doctor/comments", () => {
  beforeEach(() => {
    listMock.mockClear();
    createMock.mockClear();
  });

  it("GET returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/comments?targetType=program_instance&targetId=00000000-0000-4000-8000-0000000000b1",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 400 on invalid query", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/comments?targetType=bad&targetId=not-uuid"));
    expect(res.status).toBe(400);
  });

  it("GET returns items for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", displayName: "D", bindings: {} },
    });
    listMock.mockResolvedValue([sampleItem]);
    const res = await GET(
      new Request(
        "http://localhost/api/doctor/comments?targetType=program_instance&targetId=00000000-0000-4000-8000-0000000000b1",
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; items: typeof sampleItem[] };
    expect(data.ok).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith("program_instance", "00000000-0000-4000-8000-0000000000b1");
  });

  it("POST returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "program_instance",
          targetId: "00000000-0000-4000-8000-0000000000b1",
          commentType: "clinical_note",
          body: "X",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST creates with session userId as author", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "00000000-0000-4000-8000-0000000000a1", role: "doctor", displayName: "D", bindings: {} },
    });
    createMock.mockResolvedValue(sampleItem);
    const res = await POST(
      new Request("http://localhost/api/doctor/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "program_instance",
          targetId: "00000000-0000-4000-8000-0000000000b1",
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
        targetId: "00000000-0000-4000-8000-0000000000b1",
        commentType: "clinical_note",
        body: "Note",
      },
      "00000000-0000-4000-8000-0000000000a1",
    );
    expect(data.item.body).toBe("Note");
  });
});
