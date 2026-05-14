import { describe, expect, it } from "vitest";
import { classifyS3GetObjectFailure } from "@/infra/s3/client";

describe("classifyS3GetObjectFailure", () => {
  it("maps SDK-shaped errors by name", () => {
    expect(classifyS3GetObjectFailure({ name: "NoSuchKey" })).toBe("missing_object");
    expect(classifyS3GetObjectFailure({ name: "AccessDenied" })).toBe("upstream_403");
    expect(classifyS3GetObjectFailure({ name: "InvalidRange" })).toBe("range_not_satisfiable");
  });

  it("maps timeout-ish messages", () => {
    expect(classifyS3GetObjectFailure(new Error("socket ETIMEDOUT"))).toBe("upstream_timeout");
  });

  it("defaults to s3_read_failed", () => {
    expect(classifyS3GetObjectFailure(new Error("boom"))).toBe("s3_read_failed");
  });
});
