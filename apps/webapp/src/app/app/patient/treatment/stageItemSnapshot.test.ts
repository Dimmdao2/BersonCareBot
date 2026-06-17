import { beforeAll, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatRelativeTimeRu, parseCatalogMediaRows } from "./stageItemSnapshot";

beforeAll(() => {
  process.env.TZ = "UTC";
});

/** Фиксированный «сейчас» в UTC; при TZ=UTC совпадает с Luxon `local`. */
function fixedNowUtc() {
  return DateTime.fromObject(
    { year: 2026, month: 5, day: 7, hour: 10, minute: 0, second: 0 },
    { zone: "utc" },
  );
}

describe("formatRelativeTimeRu (сутки с 03:00 локально)", () => {
  it("в текущих сутках — часы назад", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 7, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("3 часа назад");
  });

  it("в текущих сутках — менее часа", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 9, minute: 30, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("менее часа назад");
  });

  it("предыдущие сутки 03:00–03:00 — вчера", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 6, hour: 15, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("вчера");
  });

  it("до 03:00 календарного дня относится к предыдущим суткам — вчера относительно сегодняшнего окна", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 7, hour: 2, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("вчера");
  });

  it("раньше — N дней назад", () => {
    const now = fixedNowUtc();
    const iso = DateTime.fromObject(
      { year: 2026, month: 5, day: 6, hour: 2, minute: 0, second: 0 },
      { zone: "utc" },
    ).toISO()!;
    expect(formatRelativeTimeRu(iso, "UTC", now)).toBe("2 дня назад");
  });
});

// Q-C9 / OBZ-02: exercise thumbnail fix — parseCatalogMediaRows must surface previewSmUrl
describe("parseCatalogMediaRows (Q-C9 obzor thumbs)", () => {
  it("returns empty array for null/undefined/empty input", () => {
    expect(parseCatalogMediaRows(null)).toEqual([]);
    expect(parseCatalogMediaRows(undefined)).toEqual([]);
    expect(parseCatalogMediaRows([])).toEqual([]);
  });

  it("extracts mediaUrl and type for a plain image item", () => {
    const rows = parseCatalogMediaRows([
      { mediaUrl: "https://cdn.example.com/ex.jpg", mediaType: "image", sortOrder: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mediaUrl).toBe("https://cdn.example.com/ex.jpg");
    expect(rows[0]!.mediaType).toBe("image");
  });

  it("extracts previewSmUrl for a video item — this is what PatientTabOverview now uses for thumbnails", () => {
    const rows = parseCatalogMediaRows([
      {
        mediaUrl: "https://cdn.example.com/ex.m3u8",
        mediaType: "video",
        sortOrder: 0,
        previewSmUrl: "https://cdn.example.com/ex-preview-sm.jpg",
        previewMdUrl: "https://cdn.example.com/ex-preview-md.jpg",
        previewStatus: "ready",
      },
    ]);
    expect(rows).toHaveLength(1);
    const item = rows[0]!;
    expect(item.mediaType).toBe("video");
    expect(item.previewSmUrl).toBe("https://cdn.example.com/ex-preview-sm.jpg");
    expect(item.previewMdUrl).toBe("https://cdn.example.com/ex-preview-md.jpg");
    expect(item.previewStatus).toBe("ready");
  });

  it("video is preferred over image when selecting primary media (mirrors PatientTabOverview logic)", () => {
    const media = parseCatalogMediaRows([
      { mediaUrl: "https://cdn.example.com/img.jpg", mediaType: "image", sortOrder: 0 },
      {
        mediaUrl: "https://cdn.example.com/vid.m3u8",
        mediaType: "video",
        sortOrder: 1,
        previewSmUrl: "https://cdn.example.com/vid-sm.jpg",
      },
    ]);
    const primaryMedia = media.find((m) => m.mediaType === "video") ?? media[0] ?? null;
    expect(primaryMedia).not.toBeNull();
    expect(primaryMedia!.mediaType).toBe("video");
    expect(primaryMedia!.previewSmUrl).toBe("https://cdn.example.com/vid-sm.jpg");
  });

  it("skips entries without a valid mediaUrl", () => {
    const rows = parseCatalogMediaRows([
      { mediaUrl: "", mediaType: "image", sortOrder: 0 },
      { mediaUrl: "https://cdn.example.com/ok.jpg", mediaType: "image", sortOrder: 1 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mediaUrl).toBe("https://cdn.example.com/ok.jpg");
  });
});
