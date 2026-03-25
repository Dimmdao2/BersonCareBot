/**
 * E2E (in-process): CMS upload → saveContentPage.
 * Stage 10 — шаг G.2: POST /api/media/upload (fake JPEG) → получить mediaId → saveContentPage с ссылкой.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { uploadMock, upsertMock, sessionMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  upsertMock: vi.fn(),
  sessionMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1", role: "doctor" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    media: { upload: uploadMock },
    contentPages: { upsert: upsertMock },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST as uploadPost } from "@/app/api/media/upload/route";
import { saveContentPage } from "@/app/app/doctor/content/actions";

/** JPEG magic bytes: минимально валидный заголовок для magic-bytes проверки. */
const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);

describe("CMS e2e: upload → saveContentPage (in-process)", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    upsertMock.mockReset();
    sessionMock.mockReset();
  });

  it("upload valid JPEG → returns mediaId and url", async () => {
    sessionMock.mockResolvedValue({ user: { id: "doc-1", role: "doctor" } });
    uploadMock.mockResolvedValue({ record: { id: "media-abc" }, url: "/api/media/media-abc" });

    const fd = new FormData();
    fd.set("file", new File([FAKE_JPEG], "photo.jpg", { type: "image/jpeg" }));

    const res = await uploadPost(
      new Request("http://localhost/api/media/upload", { method: "POST", body: fd })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; mediaId: string; url: string };
    expect(json.ok).toBe(true);
    expect(json.mediaId).toBe("media-abc");
    expect(json.url).toBe("/api/media/media-abc");
  });

  it("saveContentPage with markdown referencing uploaded media → page saved", async () => {
    upsertMock.mockResolvedValue(undefined);
    const mediaUrl = "/api/media/media-abc";

    const fd = new FormData();
    fd.set("section", "lessons");
    fd.set("slug", "lesson-with-photo");
    fd.set("title", "Урок с фотографией");
    fd.set("summary", "Краткое описание");
    fd.set("body_md", `Текст урока.\n\n![Фото](${mediaUrl})\n\nПродолжение.`);
    fd.set("sort_order", "1");
    fd.set("is_published", "on");

    const result = await saveContentPage(null, fd);
    expect(result.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "lesson-with-photo",
        title: "Урок с фотографией",
        isPublished: true,
        bodyMd: expect.stringContaining("media-abc"),
      })
    );
  });

  it("full chain: upload JPEG → saveContentPage with returned url", async () => {
    sessionMock.mockResolvedValue({ user: { id: "doc-1", role: "doctor" } });
    uploadMock.mockResolvedValue({ record: { id: "mid-chain" }, url: "/api/media/mid-chain" });
    upsertMock.mockResolvedValue(undefined);

    // Step 1: upload
    const uploadFd = new FormData();
    uploadFd.set("file", new File([FAKE_JPEG], "lesson-img.jpg", { type: "image/jpeg" }));
    const uploadRes = await uploadPost(
      new Request("http://localhost/api/media/upload", { method: "POST", body: uploadFd })
    );
    expect(uploadRes.status).toBe(200);
    const { mediaId, url } = (await uploadRes.json()) as { mediaId: string; url: string };
    expect(mediaId).toBe("mid-chain");

    // Step 2: save page with media reference
    const contentFd = new FormData();
    contentFd.set("section", "lessons");
    contentFd.set("slug", "chain-lesson");
    contentFd.set("title", "Урок через цепочку");
    contentFd.set("body_md", `Смотри изображение: ![img](${url})`);
    contentFd.set("sort_order", "0");

    const saveResult = await saveContentPage(null, contentFd);
    expect(saveResult.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "chain-lesson",
        bodyMd: expect.stringContaining("mid-chain"),
      })
    );
  });
});
