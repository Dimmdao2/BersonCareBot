import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDoctorOnlineIntakeDetailResponse } from "./doctorIntakeDetailResponse";
import type { IntakeRequestFullWithPatientIdentity } from "./types";

vi.mock("@/infra/s3/client", () => ({
  presignGetUrl: vi.fn(async () => "https://signed.example/object"),
  s3PublicUrl: vi.fn((key: string) => `https://public.example/${key}`),
}));

const logServerRuntimeErrorMock = vi.fn(
  (_scope: string, _err: unknown, _extra?: Record<string, string | number | boolean | undefined>) => ({
    digest: "abcd0101",
    name: "Error",
    message: "intake_s3_url_misconfigured",
  }),
);

vi.mock("@/infra/logging/serverRuntimeLog", () => ({
  logServerRuntimeError: (
    scope: string,
    err: unknown,
    extra?: Record<string, string | number | boolean | undefined>,
  ) => logServerRuntimeErrorMock(scope, err, extra),
}));

const { envFixture } = vi.hoisted(() => ({
  envFixture: {
    S3_ENDPOINT: "https://fs.test",
    S3_PUBLIC_BUCKET: "pub-bucket",
    S3_PRIVATE_BUCKET: "",
    S3_ACCESS_KEY: "",
    S3_SECRET_KEY: "",
  },
}));

vi.mock("@/config/env", () => ({
  env: envFixture,
  isS3MediaEnabled: (e: {
    S3_ENDPOINT: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
    S3_PRIVATE_BUCKET: string;
  }) =>
    Boolean(e.S3_ENDPOINT && e.S3_ACCESS_KEY && e.S3_SECRET_KEY && e.S3_PRIVATE_BUCKET),
}));

describe("buildDoctorOnlineIntakeDetailResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envFixture.S3_ENDPOINT = "https://fs.test";
    envFixture.S3_PUBLIC_BUCKET = "pub-bucket";
    envFixture.S3_PRIVATE_BUCKET = "";
    envFixture.S3_ACCESS_KEY = "";
    envFixture.S3_SECRET_KEY = "";
    logServerRuntimeErrorMock.mockImplementation(() => ({
      digest: "abcd0101",
      name: "Error",
      message: "intake_s3_url_misconfigured",
    }));
  });

  it("maps LFK url + file attachments for doctor JSON", async () => {
    const full: IntakeRequestFullWithPatientIdentity = {
      id: "req-1",
      userId: "u1",
      type: "lfk",
      status: "new",
      summary: "x",
      patientName: "Иван",
      patientPhone: "+7900",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      answers: [
        {
          id: "a1",
          requestId: "req-1",
          questionId: "lfk_description",
          ordinal: 1,
          value: "Full text",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      attachments: [
        {
          id: "att-url",
          requestId: "req-1",
          attachmentType: "url",
          s3Key: null,
          url: "https://example.com/doc",
          mimeType: null,
          sizeBytes: null,
          originalName: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "att-file",
          requestId: "req-1",
          attachmentType: "file",
          s3Key: "media/m1/file.pdf",
          url: null,
          mimeType: "application/pdf",
          sizeBytes: 5000,
          originalName: "file.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      statusHistory: [],
    };
    const json = await buildDoctorOnlineIntakeDetailResponse(full);
    expect(json.patientName).toBe("Иван");
    expect(json.patientPhone).toBe("+7900");
    expect(json.description).toBe("Full text");
    expect(json.attachmentUrls).toEqual(["https://example.com/doc"]);
    expect(json.attachmentFiles).toHaveLength(1);
    expect(json.attachmentFiles?.[0].originalName).toBe("file.pdf");
    expect(json.attachmentFiles?.[0].url).toContain("public.example");
    expect(logServerRuntimeErrorMock).not.toHaveBeenCalled();
  });

  it("returns empty file url and logs when S3 is not configured for intake attachments", async () => {
    envFixture.S3_ENDPOINT = "";
    envFixture.S3_PUBLIC_BUCKET = "";
    const full: IntakeRequestFullWithPatientIdentity = {
      id: "req-bad-s3",
      userId: "u1",
      type: "lfk",
      status: "new",
      summary: "x",
      patientName: "A",
      patientPhone: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      answers: [],
      attachments: [
        {
          id: "att-file",
          requestId: "req-bad-s3",
          attachmentType: "file",
          s3Key: "media/m1/file.pdf",
          url: null,
          mimeType: "application/pdf",
          sizeBytes: 100,
          originalName: "file.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      statusHistory: [],
    };
    const json = await buildDoctorOnlineIntakeDetailResponse(full);
    expect(json.attachmentFiles).toHaveLength(1);
    expect(json.attachmentFiles?.[0].url).toBe("");
    expect(logServerRuntimeErrorMock).toHaveBeenCalledWith(
      "online_intake_s3_url",
      expect.any(Error),
      expect.objectContaining({ keyKind: "media" }),
    );
  });

  it("maps statusHistory changedBy null to empty string", async () => {
    const full: IntakeRequestFullWithPatientIdentity = {
      id: "req-2",
      userId: "u1",
      type: "nutrition",
      status: "new",
      summary: "s",
      patientName: "A",
      patientPhone: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      answers: [],
      attachments: [],
      statusHistory: [
        {
          id: "h1",
          requestId: "req-2",
          fromStatus: null,
          toStatus: "new",
          changedBy: null,
          note: null,
          changedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const json = await buildDoctorOnlineIntakeDetailResponse(full);
    expect(json.statusHistory[0].changedBy).toBe("");
  });
});
