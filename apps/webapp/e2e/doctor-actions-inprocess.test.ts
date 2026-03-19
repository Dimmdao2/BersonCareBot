/**
 * E2E (in-process): doctor server actions are exported and callable.
 */
import { describe, expect, it } from "vitest";

describe("doctor actions e2e (in-process)", () => {
  it("sendMessageAction is exported and is a function", async () => {
    const actions = await import("@/app/app/doctor/clients/[userId]/actions");
    expect(typeof actions.sendMessageAction).toBe("function");
  });

  it("getMessageDraftAction is exported and is a function", async () => {
    const actions = await import("@/app/app/doctor/messages/actions");
    expect(typeof actions.getMessageDraftAction).toBe("function");
  });
});
