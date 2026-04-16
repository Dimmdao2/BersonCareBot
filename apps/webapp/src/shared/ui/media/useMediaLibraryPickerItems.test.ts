/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildAdminMediaListUrl,
  filterMediaLibraryPickerItemsByQuery,
  narrowMediaLibraryPickerItemsByKind,
} from "@/shared/ui/media/useMediaLibraryPickerItems";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

const baseItem = (overrides: Partial<MediaListItem>): MediaListItem => ({
  id: "1",
  kind: "image",
  filename: "raw.jpg",
  mimeType: "image/jpeg",
  size: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  url: "/api/media/1",
  ...overrides,
});

describe("buildAdminMediaListUrl", () => {
  it("builds url with kind, sort, limit and no q", () => {
    const u = buildAdminMediaListUrl({ apiKind: "image" });
    expect(u).toContain("/api/admin/media?");
    expect(u).toMatch(/kind=image/);
    expect(u).toMatch(/limit=200/);
    expect(u).not.toMatch(/[?&]q=/);
  });

  it("sets folderId=root when folderId is null", () => {
    const u = buildAdminMediaListUrl({ apiKind: "all", folderId: null });
    expect(u).toMatch(/folderId=root/);
  });

  it("sets folderId to uuid when provided", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const u = buildAdminMediaListUrl({ apiKind: "video", folderId: id });
    expect(u).toContain(`folderId=${id}`);
  });
});

describe("filterMediaLibraryPickerItemsByQuery", () => {
  it("returns all when query is empty or whitespace", () => {
    const items = [baseItem({ id: "a" }), baseItem({ id: "b", filename: "other.jpg" })];
    expect(filterMediaLibraryPickerItemsByQuery(items, "")).toEqual(items);
    expect(filterMediaLibraryPickerItemsByQuery(items, "   ")).toEqual(items);
  });

  it("matches filename substring case-insensitively", () => {
    const items = [baseItem({ filename: "Alpha.PNG" }), baseItem({ id: "2", filename: "beta.jpg" })];
    expect(filterMediaLibraryPickerItemsByQuery(items, "pha").map((i) => i.id)).toEqual(["1"]);
  });

  it("matches displayName substring", () => {
    const items = [
      baseItem({ id: "1", displayName: "Демо для пациента", filename: "x.mp4", kind: "video", mimeType: "video/mp4" }),
      baseItem({ id: "2", displayName: "Разминка", filename: "y.mp4", kind: "video", mimeType: "video/mp4" }),
    ];
    expect(filterMediaLibraryPickerItemsByQuery(items, "пациент").map((i) => i.id)).toEqual(["1"]);
  });
});

describe("narrowMediaLibraryPickerItemsByKind", () => {
  it("for image_or_video excludes non-image non-video kinds", () => {
    const items = [
      baseItem({ id: "i", kind: "image", filename: "a.png" }),
      baseItem({ id: "v", kind: "video", filename: "a.mp4", mimeType: "video/mp4" }),
      baseItem({ id: "f", kind: "file", filename: "a.pdf", mimeType: "application/pdf" }),
    ];
    const out = narrowMediaLibraryPickerItemsByKind(items, "image_or_video");
    expect(out.map((i) => i.id).sort()).toEqual(["i", "v"]);
  });

  it("for all returns items unchanged", () => {
    const items = [baseItem({ id: "a" }), baseItem({ id: "b", kind: "file", mimeType: "text/plain" })];
    expect(narrowMediaLibraryPickerItemsByKind(items, "all")).toEqual(items);
  });
});
