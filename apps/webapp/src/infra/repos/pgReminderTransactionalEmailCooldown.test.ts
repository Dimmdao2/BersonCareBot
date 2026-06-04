import { beforeEach, describe, expect, it, vi } from "vitest";

const cooldownRows = vi.hoisted(() => [] as { lastSentAt: Date }[]);
const recordSentMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => cooldownRows,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: recordSentMock,
      }),
    }),
  }),
}));

import {
  REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY,
  createPgReminderTransactionalEmailCooldownPort,
} from "./pgReminderTransactionalEmailCooldown";

describe("createPgReminderTransactionalEmailCooldownPort", () => {
  beforeEach(() => {
    cooldownRows.length = 0;
    recordSentMock.mockClear();
  });

  it("shouldSkipDueToCooldown returns false when no row (miss)", async () => {
    const port = createPgReminderTransactionalEmailCooldownPort(45);
    await expect(port.shouldSkipDueToCooldown("user-1")).resolves.toBe(false);
  });

  it("shouldSkipDueToCooldown returns true when last send within interval (hit)", async () => {
    cooldownRows.push({ lastSentAt: new Date() });
    const port = createPgReminderTransactionalEmailCooldownPort(45);
    await expect(port.shouldSkipDueToCooldown("user-1")).resolves.toBe(true);
  });

  it("recordSent upserts cooldown row via drizzle insert", async () => {
    const port = createPgReminderTransactionalEmailCooldownPort();
    await port.recordSent("user-2");
    expect(recordSentMock).toHaveBeenCalledTimes(1);
    expect(REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY).toBe("!reminder_txn_v1");
  });
});
