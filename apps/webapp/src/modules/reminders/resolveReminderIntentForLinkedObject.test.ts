import { describe, expect, it, vi } from "vitest";
import {
  isWarmupsContentSectionLinkedId,
  resolveReminderIntentForLinkedObject,
} from "./resolveReminderIntentForLinkedObject";

describe("resolveReminderIntentForLinkedObject", () => {
  it("returns warmup for canonical warmups section slug without lookup", async () => {
    await expect(
      resolveReminderIntentForLinkedObject("content_section", "warmups"),
    ).resolves.toBe("warmup");
  });

  it("returns warmup when lookup resolves system_parent_code warmups", async () => {
    const getBySlug = vi.fn().mockResolvedValue({
      systemParentCode: "warmups",
    });
    await expect(
      resolveReminderIntentForLinkedObject("content_section", "my-warmups-alias", { getBySlug }),
    ).resolves.toBe("warmup");
    expect(getBySlug).toHaveBeenCalledWith("my-warmups-alias");
  });

  it("returns generic for non-warmups content_section", async () => {
    const getBySlug = vi.fn().mockResolvedValue({
      systemParentCode: "lessons",
    });
    await expect(
      resolveReminderIntentForLinkedObject("content_section", "lessons", { getBySlug }),
    ).resolves.toBe("generic");
  });

  it("returns generic for unknown section slug without lookup", async () => {
    await expect(
      resolveReminderIntentForLinkedObject("content_section", "unknown-section"),
    ).resolves.toBe("generic");
  });

  it("returns exercises for rehab_program", async () => {
    await expect(
      resolveReminderIntentForLinkedObject("rehab_program", "inst-1"),
    ).resolves.toBe("exercises");
  });

  it("returns generic for lfk_complex", async () => {
    await expect(
      resolveReminderIntentForLinkedObject("lfk_complex", "cx-1"),
    ).resolves.toBe("generic");
  });
});

describe("isWarmupsContentSectionLinkedId", () => {
  it("matches default slug", () => {
    expect(isWarmupsContentSectionLinkedId("warmups")).toBe(true);
    expect(isWarmupsContentSectionLinkedId("  warmups  ")).toBe(true);
    expect(isWarmupsContentSectionLinkedId("lessons")).toBe(false);
  });
});
