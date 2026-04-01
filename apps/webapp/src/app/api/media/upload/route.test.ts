import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/modules/media/uploadAllowedMime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media/uploadAllowedMime")>();
  return {
    ...actual,
    /** Тест 413: реальный размер файла > лимита без подмены size на Blob */
    MAX_PROXY_UPLOAD_BYTES: 100,
  };
});

import { MAX_PROXY_UPLOAD_BYTES } from "@/modules/media/uploadAllowedMime";
import { POST } from "./route";

/** Minimal valid PNG signature + padding for magic-byte check */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00];

describe("POST /api/media/upload", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    sessionMock.mockReset();
  });

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

  it("returns 413 when file exceeds MAX_PROXY_UPLOAD_BYTES", async () => {
    expect(MAX_PROXY_UPLOAD_BYTES).toBe(100);
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    const buf = new Uint8Array(101);
    buf.set([0xff, 0xd8, 0xff, 0xdb, 0x00], 0);
    const file = new File([buf], "big.jpg", { type: "image/jpeg" });
    const fd = new FormData();
    fd.set("file", file);
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads PNG when magic bytes match", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    uploadMock.mockResolvedValue({
      record: { id: "mid-png" },
      url: "/api/media/mid-png",
    });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array(PNG_MAGIC)], "x.png", { type: "image/png" }));
    const res = await POST(new Request("http://localhost/api/media/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/mid-png");
    expect(uploadMock).toHaveBeenCalled();
  });

  it("uploads MOV when declared as video/quicktime and ftyp magic present", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    uploadMock.mockResolvedValue({
      record: { id: "mid-mov" },
      url: "/api/media/mid-mov",
    });
    const movBody = new Uint8Array(12);
    movBody.set([0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70], 0);
    const fd = new FormData();
    fd.set("file", new File([movBody], "clip.mov", { type: "video/quicktime" }));
    const res = await POST(new Request("http://localhost/api/media/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/mid-mov");
    expect(uploadMock).toHaveBeenCalled();
  });

  it("uploads and returns url for allowed image", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    uploadMock.mockResolvedValue({
      record: { id: "mid-1" },
      url: "/api/media/mid-1",
    });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00])], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string; mediaId: string; uploaded: Array<{ mediaId: string }> };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/mid-1");
    expect(json.uploaded).toHaveLength(1);
    expect(uploadMock).toHaveBeenCalled();
  });

  it("returns 415 when MIME does not match magic bytes", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(415);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("file_signature_mismatch");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads multiple files from files[]", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    uploadMock
      .mockResolvedValueOnce({ record: { id: "mid-1" }, url: "/api/media/mid-1" })
      .mockResolvedValueOnce({ record: { id: "mid-2" }, url: "/api/media/mid-2" });
    const fd = new FormData();
    fd.append("files[]", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00])], "a.jpg", { type: "image/jpeg" }));
    fd.append("files[]", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "b.pdf", { type: "application/pdf" }));

    const res = await POST(new Request("http://localhost/api/media/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      uploaded: Array<{ mediaId: string; url: string; filename: string }>;
    };
    expect(json.ok).toBe(true);
    expect(json.uploaded).toHaveLength(2);
    expect(json.uploaded[0]?.filename).toBe("a.jpg");
    expect(json.uploaded[1]?.filename).toBe("b.pdf");
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });

  it("returns detailed error for mixed batch", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "doctor" } });
    const fd = new FormData();
    fd.append("files[]", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00])], "ok.jpg", { type: "image/jpeg" }));
    fd.append("files[]", new File([new Uint8Array([1, 2, 3])], "bad.exe", { type: "application/octet-stream" }));

    const res = await POST(new Request("http://localhost/api/media/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(415);
    const json = (await res.json()) as { error: string; filename: string; index: number };
    expect(json.error).toBe("mime_not_allowed");
    expect(json.filename).toBe("bad.exe");
    expect(json.index).toBe(1);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
