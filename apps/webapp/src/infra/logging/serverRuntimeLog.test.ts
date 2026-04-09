import { afterEach, describe, expect, it, vi } from "vitest";

const loggerErrorMock = vi.fn();

vi.mock("./logger", () => ({
  logger: { error: (...args: unknown[]) => loggerErrorMock(...args) },
  serializeError: (e: unknown) =>
    e instanceof Error
      ? { type: e.name, message: e.message, stack: e.stack }
      : { type: "UnknownError", message: String(e), stack: undefined },
}));

import { logServerRuntimeError } from "./serverRuntimeLog";

describe("logServerRuntimeError", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls logger.error with scope, digest, err and returns digest", () => {
    const err = new Error("connection refused");
    const r = logServerRuntimeError("test.scope", err, { route: "/x" });

    expect(r.digest).toMatch(/^[0-9a-f]{8}$/);
    expect(r.message).toBe("connection refused");
    expect(r.name).toBe("Error");
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const [payload, msg] = loggerErrorMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(msg).toBe("server_runtime_error");
    expect(payload.scope).toBe("test.scope");
    expect(payload.digest).toBe(r.digest);
    expect(payload.errMessage).toBe("connection refused");
    expect(payload.route).toBe("/x");
  });
});
