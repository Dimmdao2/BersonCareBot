import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
    // Transaction wrapper just invokes the callback with a fake tx handle;
    // runWebappPgText is mocked so the handle is never dereferenced.
    runWebappTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

import { createPgEmailOtpPublicPort } from "./pgEmailOtpPublic";

describe("pgEmailOtpPublic.findOrCreatePublicEmailUser", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("merged-away email resolves to the CANONICAL user (no ghost account)", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: "canon-user", was_created: false }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("old-merged@example.com");

    expect(result).toEqual({ userId: "canon-user", wasCreated: false });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("app.email_otp_public_find_or_create_user");
  });

  it("unknown email (no canonical, no merged row) falls through to INSERT", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: "new-user", was_created: true }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("brand-new@example.com");

    expect(result).toEqual({ userId: "new-user", wasCreated: true });
  });

  it("existing canonical email returns it directly without touching merge resolution", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ user_id: "existing-user", was_created: false }],
    });

    const port = createPgEmailOtpPublicPort();
    const result = await port.findOrCreatePublicEmailUser("known@example.com");

    expect(result).toEqual({ userId: "existing-user", wasCreated: false });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });
});
