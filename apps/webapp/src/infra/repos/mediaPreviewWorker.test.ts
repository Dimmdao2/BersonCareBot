/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ffmpegSetFfmpegPathMock = vi.fn();
const queryMock = vi.fn();
const s3GetObjectBodyMock = vi.fn();
const s3PutObjectBodyMock = vi.fn();
const presignGetUrlMock = vi.fn();
const mockEnv = {
  FFMPEG_PATH: "",
};

vi.mock("@ffmpeg-installer/ffmpeg", () => ({
  default: { path: "/installer/ffmpeg" },
}));

vi.mock("fluent-ffmpeg", () => {
  const ffmpegFn = vi.fn();
  return {
    default: Object.assign(ffmpegFn, {
      setFfmpegPath: ffmpegSetFfmpegPathMock,
    }),
  };
});

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: mockEnv,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: async () => ({
      query: (...args: unknown[]) => queryMock(...args),
      release: () => {},
    }),
  }),
}));

vi.mock("@/infra/repos/s3MediaStorage", () => ({
  MEDIA_READABLE_STATUS_SQL: "1=1",
}));

vi.mock("@/infra/s3/client", () => ({
  presignGetUrl: (...args: unknown[]) => presignGetUrlMock(...args),
  s3GetObjectBody: (...args: unknown[]) => s3GetObjectBodyMock(...args),
  s3PreviewKey: (id: string, size: "sm" | "md") => `previews/${size}/${id}.jpg`,
  s3PutObjectBody: (...args: unknown[]) => s3PutObjectBodyMock(...args),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type PreviewRow = {
  id: string;
  s3_key: string;
  mime_type: string;
  size_bytes: string;
  preview_attempts: number;
};

function setupSingleRowScenario(row: PreviewRow) {
  let picked = false;
  queryMock.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const text = String(sql);
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [] };
    }
    if (text.includes("SELECT id, s3_key, mime_type")) {
      if (picked) return { rows: [] };
      picked = true;
      return { rows: [row] };
    }
    if (text.includes("UPDATE media_files")) {
      return { rowCount: 1, rows: [], params };
    }
    return { rows: [] };
  });
}

describe("mediaPreviewWorker ffmpeg path", () => {
  beforeEach(() => {
    vi.resetModules();
    ffmpegSetFfmpegPathMock.mockReset();
    mockEnv.FFMPEG_PATH = "";
  });

  it("uses env FFMPEG_PATH when provided", async () => {
    mockEnv.FFMPEG_PATH = "/usr/bin/ffmpeg";
    await import("./mediaPreviewWorker");
    expect(ffmpegSetFfmpegPathMock).toHaveBeenCalledWith("/usr/bin/ffmpeg");
  });

  it("falls back to installer path when env FFMPEG_PATH is empty", async () => {
    mockEnv.FFMPEG_PATH = "";
    await import("./mediaPreviewWorker");
    expect(ffmpegSetFfmpegPathMock).toHaveBeenCalledWith("/installer/ffmpeg");
  });
});

describe("processMediaPreviewBatch", () => {
  const row: PreviewRow = {
    id: "11111111-1111-4111-8111-111111111111",
    s3_key: "media/source.jpg",
    mime_type: "image/jpeg",
    size_bytes: "1024",
    preview_attempts: 0,
  };

  beforeEach(() => {
    vi.resetModules();
    mockEnv.FFMPEG_PATH = "";
    queryMock.mockReset();
    s3GetObjectBodyMock.mockReset();
    s3PutObjectBodyMock.mockReset();
    presignGetUrlMock.mockReset();
  });

  it("skips image/heic without reading object from S3", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heic" });
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 1, errors: 0 });
    expect(s3GetObjectBodyMock).not.toHaveBeenCalled();
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(true);
  });

  it("skips image/heif without reading object from S3", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heif" });
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 1, errors: 0 });
    expect(s3GetObjectBodyMock).not.toHaveBeenCalled();
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(true);
  });

  it("marks permanent SIGSEGV errors as skipped without retry backoff", async () => {
    setupSingleRowScenario(row);
    s3GetObjectBodyMock.mockRejectedValueOnce(new Error("ffmpeg was killed with signal SIGSEGV"));
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 0, errors: 1 });
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(true);
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_next_attempt_at = now()")),
    ).toBe(false);
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_attempts = $2")),
    ).toBe(false);
  });

  it("increments attempts and sets retry backoff for transient errors", async () => {
    setupSingleRowScenario(row);
    s3GetObjectBodyMock.mockRejectedValueOnce(new Error("temporary network issue"));
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 0, errors: 1 });
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_next_attempt_at = now()")),
    ).toBe(true);
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_attempts = $2")),
    ).toBe(true);
  });
});
