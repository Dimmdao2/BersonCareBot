import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerRuntimeError } from "./serverRuntimeLog";

describe("logServerRuntimeError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON line to stderr and returns digest", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("connection refused");
    const r = logServerRuntimeError("test.scope", err, { route: "/x" });

    expect(r.digest).toMatch(/^[0-9a-f]{8}$/);
    expect(r.message).toBe("connection refused");
    expect(r.name).toBe("Error");
    expect(spy).toHaveBeenCalled();
    const first = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(first) as { scope: string; digest: string; errMessage: string; route: string };
    expect(parsed.scope).toBe("test.scope");
    expect(parsed.digest).toBe(r.digest);
    expect(parsed.errMessage).toBe("connection refused");
    expect(parsed.route).toBe("/x");
  });
});
