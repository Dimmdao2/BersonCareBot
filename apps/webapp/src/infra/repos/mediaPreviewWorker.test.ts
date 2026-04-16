/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const ffmpegSetFfmpegPathMock = vi.fn();
const ffmpegRunModeMock = vi.fn((): "end" | "error" => "end");
const ffmpegErrorFactoryMock = vi.fn((): Error => new Error("ffmpeg_error"));
const queryMock = vi.fn();
const s3GetObjectBodyMock = vi.fn();
const s3PutObjectBodyMock = vi.fn();
const presignGetUrlMock = vi.fn();
const mkdtempMock = vi.fn();
const readFileMock = vi.fn();
const rmMock = vi.fn();
const spawnMock = vi.fn();
const pipelineMock = vi.fn();
const createWriteStreamMock = vi.fn();
const mockEnv = {
  FFMPEG_PATH: "",
  MAGICK_PATH: "",
};

vi.mock("@ffmpeg-installer/ffmpeg", () => ({
  default: { path: "/installer/ffmpeg" },
}));

vi.mock("fluent-ffmpeg", () => {
  const ffmpegFn = vi.fn(() => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const cmd = {
      seekInput: vi.fn().mockReturnThis(),
      outputOptions: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
        return cmd;
      }),
      run: vi.fn(() => {
        const mode = ffmpegRunModeMock();
        const cb = handlers.get(mode === "end" ? "end" : "error");
        if (cb) {
          if (mode === "end") {
            cb();
          } else {
            cb(ffmpegErrorFactoryMock());
          }
        }
      }),
      kill: vi.fn(),
    };
    return cmd;
  });
  return {
    default: Object.assign(ffmpegFn, {
      setFfmpegPath: ffmpegSetFfmpegPathMock,
    }),
  };
});

vi.mock("sharp", () => ({
  default: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: (...args: unknown[]) => mkdtempMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  rm: (...args: unknown[]) => rmMock(...args),
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock("node:stream/promises", () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

vi.mock("node:fs", () => ({
  createWriteStream: (...args: unknown[]) => createWriteStreamMock(...args),
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
    mockEnv.MAGICK_PATH = "";
    ffmpegRunModeMock.mockReset();
    ffmpegRunModeMock.mockReturnValue("end");
    ffmpegErrorFactoryMock.mockReset();
    ffmpegErrorFactoryMock.mockReturnValue(new Error("ffmpeg_error"));
    queryMock.mockReset();
    s3GetObjectBodyMock.mockReset();
    s3PutObjectBodyMock.mockReset();
    presignGetUrlMock.mockReset();
    presignGetUrlMock.mockResolvedValue("https://example.test/media.mp4");
    mkdtempMock.mockReset();
    mkdtempMock.mockResolvedValue("/tmp/media-prev-v-test");
    readFileMock.mockReset();
    readFileMock.mockResolvedValue(Buffer.from("poster"));
    rmMock.mockReset();
    rmMock.mockResolvedValue(undefined);
    pipelineMock.mockReset();
    pipelineMock.mockResolvedValue(undefined);
    createWriteStreamMock.mockReset();
    createWriteStreamMock.mockReturnValue({} as never);
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const proc = {
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers.set(event, cb);
          return proc;
        }),
        kill: vi.fn(),
      };
      queueMicrotask(() => {
        handlers.get("close")?.(0);
      });
      return proc;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream(),
      } satisfies Partial<Response>),
    );

    const sharpMock = vi.mocked(sharp);
    sharpMock.mockReset();
    sharpMock.mockImplementation(() => {
      const chain = {
        rotate: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("preview")),
      };
      return chain as never;
    });
  });

  it("generates sm preview for image/heic via ffmpeg path", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heic" });
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 1, errors: 0 });
    expect(presignGetUrlMock).toHaveBeenCalledTimes(1);
    expect(s3PutObjectBodyMock).toHaveBeenCalledWith(
      "previews/sm/11111111-1111-4111-8111-111111111111.jpg",
      expect.any(Buffer),
      "image/jpeg",
    );
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'ready'")),
    ).toBe(true);
  });

  it("skips image/heif when file size is too large for ffmpeg preview", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heif", size_bytes: String(4 * 1024 * 1024 * 1024) });
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 1, errors: 0 });
    expect(presignGetUrlMock).not.toHaveBeenCalled();
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(true);
  });

  it("falls back to ImageMagick for image/heic when ffmpeg decoding fails", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heic" });
    ffmpegRunModeMock.mockReturnValue("error");
    ffmpegErrorFactoryMock.mockReturnValue(new Error("Invalid data found when processing input"));
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 1, errors: 0 });
    expect(spawnMock).toHaveBeenCalled();
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'ready'")),
    ).toBe(true);
  });

  it("marks image/heic as skipped when ffmpeg fails and magick also fails permanently", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heic" });
    ffmpegRunModeMock.mockReturnValue("error");
    ffmpegErrorFactoryMock.mockReturnValue(new Error("Invalid data found when processing input"));
    spawnMock.mockImplementation(() => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const proc = {
        stderr: { on: vi.fn((_: string, cb: (chunk: unknown) => void) => cb("Invalid data found when processing input")) },
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers.set(event, cb);
          return proc;
        }),
        kill: vi.fn(),
      };
      queueMicrotask(() => {
        handlers.get("close")?.(1);
      });
      return proc;
    });
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 0, errors: 1 });
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(true);
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_next_attempt_at = now()")),
    ).toBe(false);
  });

  it("schedules retry when heic fallback download times out", async () => {
    setupSingleRowScenario({ ...row, mime_type: "image/heic" });
    ffmpegRunModeMock.mockReturnValue("error");
    ffmpegErrorFactoryMock.mockReturnValue(new Error("Invalid data found when processing input"));
    const abortErr = new Error("request aborted");
    abortErr.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));
    const { processMediaPreviewBatch } = await import("./mediaPreviewWorker");
    const result = await processMediaPreviewBatch(2);

    expect(result).toEqual({ processed: 0, errors: 1 });
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_next_attempt_at = now()")),
    ).toBe(true);
    expect(
      queryMock.mock.calls.some((call) => String(call[0]).includes("preview_status = 'skipped'")),
    ).toBe(false);
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
