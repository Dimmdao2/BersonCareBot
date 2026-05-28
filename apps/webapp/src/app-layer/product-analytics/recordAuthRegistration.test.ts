import { describe, expect, it, vi } from "vitest";

const { recordEventsBatchMock, writeAuditLogMock } = vi.hoisted(() => ({
  recordEventsBatchMock: vi.fn(async () => undefined),
  writeAuditLogMock: vi.fn(async () => undefined),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: { recordEventsBatch: recordEventsBatchMock },
  }),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));

vi.mock("@/app-layer/admin/auditLog", () => ({
  writeAuditLog: writeAuditLogMock,
}));

import {
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
} from "./recordAuthRegistration";

describe("recordAuthRegistration", () => {
  it("writes attempt to product analytics", async () => {
    recordEventsBatchMock.mockClear();
    await recordAuthRegistrationAttempt({
      attemptId: "11111111-1111-4111-8111-111111111111",
      authMethod: "email_password",
      stage: "start",
      entryChannel: "browser",
      contactType: "email",
      contactValue: "user@example.com",
    });
    expect(recordEventsBatchMock).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: "auth_register_attempt",
        metadata: expect.objectContaining({
          attemptId: "11111111-1111-4111-8111-111111111111",
          contactHint: "u***@example.com",
        }),
      }),
    ]);
  });

  it("mirrors system failure to admin audit log", async () => {
    writeAuditLogMock.mockClear();
    await recordAuthRegistrationFailure({
      attemptId: "22222222-2222-4222-8222-222222222222",
      authMethod: "email_password",
      stage: "confirm",
      entryChannel: "browser",
      contactType: "email",
      contactValue: "user@example.com",
      errorCode: "server_error",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "auth_register_failure",
        status: "error",
      }),
    );
  });
});
