import { describe, it, expect } from "vitest";
import { createDoctorBroadcastsService } from "./service";
import type { BroadcastAudienceFilter, BroadcastAuditEntry } from "./ports";

describe("doctor-broadcasts service", () => {
  const auditEntries: BroadcastAuditEntry[] = [];

  const resolveAudienceSize = async (filter: BroadcastAudienceFilter): Promise<number> => {
    if (filter === "all") return 42;
    if (filter === "with_telegram") return 30;
    if (filter === "with_max") return 15;
    return 0;
  };

  const broadcastAuditPort = {
    async append(
      entry: Omit<BroadcastAuditEntry, "id" | "executedAt">
    ): Promise<BroadcastAuditEntry> {
      const id = `audit-${auditEntries.length}`;
      const executedAt = new Date().toISOString();
      const full: BroadcastAuditEntry = { ...entry, id, executedAt };
      auditEntries.push(full);
      return full;
    },
    async list(): Promise<BroadcastAuditEntry[]> {
      return [...auditEntries];
    },
  };

  const service = createDoctorBroadcastsService({
    resolveAudienceSize,
    broadcastAuditPort,
  });

  it("returns categories list", () => {
    const categories = service.getCategories();
    expect(categories).toContain("service");
    expect(categories).toContain("reminder");
    expect(categories.length).toBeGreaterThan(0);
  });

  it("preview returns audience size without writing audit", async () => {
    const result = await service.preview({
      category: "reminder",
      audienceFilter: "with_telegram",
      message: { title: "Test", body: "Body" },
      actorId: "actor-1",
    });
    expect(result.audienceSize).toBe(30);
    expect(result.category).toBe("reminder");
    expect(result.audienceFilter).toBe("with_telegram");
    expect(result.channels).toEqual(["bot_message", "sms"]);
    expect(auditEntries.length).toBe(0);
  });

  it("execute writes audit entry with author and params", async () => {
    const { auditEntry } = await service.execute({
      category: "important_notice",
      audienceFilter: "all",
      message: { title: "Важно", body: "Текст" },
      actorId: "doctor-123",
    });
    expect(auditEntry.actorId).toBe("doctor-123");
    expect(auditEntry.category).toBe("important_notice");
    expect(auditEntry.audienceFilter).toBe("all");
    expect(auditEntry.messageTitle).toBe("Важно");
    expect(auditEntry.previewOnly).toBe(false);
    expect(auditEntry.audienceSize).toBe(42);
    expect(auditEntry.sentCount).toBe(0);
    expect(auditEntry.errorCount).toBe(0);
    expect(auditEntry.channels).toEqual(["bot_message", "sms"]);
    expect(auditEntries.length).toBe(1);
  });

  it("preview respects explicit channels subset", async () => {
    const result = await service.preview({
      category: "reminder",
      audienceFilter: "all",
      message: { title: "T", body: "Body text here" },
      actorId: "a",
      channels: ["sms"],
    });
    expect(result.channels).toEqual(["sms"]);
  });

  it("listAudit returns entries", async () => {
    const list = await service.listAudit(10);
    expect(list.length).toBe(1);
    expect(list[0].messageTitle).toBe("Важно");
  });
});
