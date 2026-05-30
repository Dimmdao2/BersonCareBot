/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  MAX_PROGRAM_SUBMISSION_BYTES,
  validateProgramSubmissionS3Head,
} from "./programSubmissionUploadLimits";

describe("programSubmissionUploadLimits", () => {
  it("allows up to 250 MiB", () => {
    expect(MAX_PROGRAM_SUBMISSION_BYTES).toBe(250 * 1024 * 1024);
  });

  it("rejects S3 object larger than limit", () => {
    const res = validateProgramSubmissionS3Head({
      declaredMime: "video/mp4",
      declaredSizeBytes: MAX_PROGRAM_SUBMISSION_BYTES,
      contentLength: MAX_PROGRAM_SUBMISSION_BYTES + 1,
      contentType: "video/mp4",
    });
    expect(res).toEqual({ ok: false, error: "file_too_large" });
  });

  it("accepts matching video head", () => {
    const res = validateProgramSubmissionS3Head({
      declaredMime: "video/mp4",
      declaredSizeBytes: 1_000_000,
      contentLength: 1_000_000,
      contentType: "video/mp4",
    });
    expect(res).toEqual({ ok: true });
  });
});
