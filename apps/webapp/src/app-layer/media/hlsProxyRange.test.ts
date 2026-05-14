import { describe, expect, it } from "vitest";
import { parseSingleBytesRangeHeader } from "@/app-layer/media/hlsProxyRange";

describe("parseSingleBytesRangeHeader", () => {
  it("none when absent", () => {
    expect(parseSingleBytesRangeHeader(null).kind).toBe("none");
  });

  it("invalid for multipart ranges", () => {
    expect(parseSingleBytesRangeHeader("bytes=0-1,3-4").kind).toBe("invalid");
  });

  it("invalid when start>end", () => {
    expect(parseSingleBytesRangeHeader("bytes=5-2").kind).toBe("invalid");
  });

  it("accepts open-ended suffix range", () => {
    const r = parseSingleBytesRangeHeader("bytes=1024-");
    expect(r.kind).toBe("range");
    if (r.kind === "range") expect(r.awsHeader).toBe("bytes=1024-");
  });

  it("accepts closed range", () => {
    const r = parseSingleBytesRangeHeader("bytes=0-99");
    expect(r.kind).toBe("range");
    if (r.kind === "range") expect(r.awsHeader).toBe("bytes=0-99");
  });
});
