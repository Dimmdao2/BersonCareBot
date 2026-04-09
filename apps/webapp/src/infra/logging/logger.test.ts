/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { serializeError } from "./logger";

describe("serializeError", () => {
  it("serializes Error", () => {
    const e = new Error("x");
    const s = serializeError(e);
    expect(s.type).toBe("Error");
    expect(s.message).toBe("x");
    expect(s.stack).toBeDefined();
  });

  it("serializes non-Error", () => {
    const s = serializeError("oops");
    expect(s.type).toBe("UnknownError");
    expect(s.message).toBe("oops");
  });
});
