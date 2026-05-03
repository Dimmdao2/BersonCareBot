import { describe, expect, it } from "vitest";
import { redactUrlLikeSubstrings, serializePresignFailureForLog } from "./presignLogRedaction";

describe("presignLogRedaction", () => {
  it("redacts http(s) URLs in arbitrary strings", () => {
    expect(redactUrlLikeSubstrings("fail https://bucket.example/x?sig=abc end")).toBe(
      "fail [url_redacted] end",
    );
  });

  it("serializePresignFailureForLog redacts message bodies", () => {
    const e = new Error('Problem at https://minio.test/media/u/v.mp4?X-Amz-Signature=zzz');
    expect(serializePresignFailureForLog(e)).toEqual({
      name: "Error",
      message: "Problem at [url_redacted]",
    });
  });

  it("handles non-Error throws", () => {
    expect(serializePresignFailureForLog("oops")).toEqual({
      name: "unknown",
      message: "oops",
    });
  });
});
