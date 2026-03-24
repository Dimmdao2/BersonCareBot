import { describe, expect, it, vi } from "vitest";

const { uploadMock, sessionMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  sessionMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    media: { upload: uploadMock },
  }),
}));

import { POST } from "./route";

describe("POST /api/media/upload", () => {
  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(403);
  });

  it("returns 415 for disallowed MIME", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1])], "x.exe", { type: "application/octet-stream" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(415);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("returns 413 when file exceeds 50MB", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    const big = new Uint8Array(50 * 1024 * 1024 + 1);
    const fd = new FormData();
    fd.set("file", new File([big], "big.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads and returns url for allowed image", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    uploadMock.mockResolvedValue({
      record: { id: "mid-1" },
      url: "/api/media/mid-1",
    });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string; mediaId: string };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/mid-1");
    expect(uploadMock).toHaveBeenCalled();
  });
});
