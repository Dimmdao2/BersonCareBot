import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDoctorOnlineIntakeDetailResponse } from "./doctorIntakeDetailResponse";
import type { IntakeRequestFull } from "./types";

vi.mock("@/infra/s3/client", () => ({
  presignGetUrl: vi.fn(async () => "https://signed.example/object"),
  s3PublicUrl: vi.fn((key: string) => `https://public.example/${key}`),
}));

vi.mock("@/config/env", () => ({
  env: {
    S3_ENDPOINT: "",
    S3_PUBLIC_BUCKET: "",
    S3_ACCESS_KEY: "",
    S3_SECRET_KEY: "",
  },
}));

describe("buildDoctorOnlineIntakeDetailResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps LFK url + file attachments for doctor JSON", async () => {
    const full: IntakeRequestFull = {
      id: "req-1",
      userId: "u1",
      type: "lfk",
      status: "new",
      summary: "x",
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
    const json = await buildDoctorOnlineIntakeDetailResponse(full, {
      patientName: "Иван",
      patientPhone: "+7900",
    });
    expect(json.description).toBe("Full text");
    expect(json.attachmentUrls).toEqual(["https://example.com/doc"]);
    expect(json.attachmentFiles).toHaveLength(1);
    expect(json.attachmentFiles?.[0].originalName).toBe("file.pdf");
    expect(json.attachmentFiles?.[0].url).toContain("public.example");
  });
});
