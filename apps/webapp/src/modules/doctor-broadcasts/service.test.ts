import { describe, it, expect } from "vitest";
import { createDoctorBroadcastsService } from "./service";
import type { BroadcastAudienceFilter, BroadcastAuditEntry } from "./ports";

describe("doctor-broadcasts service", () => {
  const auditEntries: BroadcastAuditEntry[] = [];

  const resolveBroadcastAudienceForPreview = async (
    _filter: BroadcastAudienceFilter,
    _channels: unknown[],
  ): Promise<{ audienceSize: number; segmentSize?: number }> => {
    if (_filter === "all") return { audienceSize: 42 };
    if (_filter === "with_telegram") return { audienceSize: 30 };
    if (_filter === "with_max") return { audienceSize: 15 };
    return { audienceSize: 0 };
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
    resolveBroadcastAudienceForPreview,
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

  it("preview passes segmentSize when resolver returns it", async () => {
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudienceForPreview: async () => ({ audienceSize: 1, segmentSize: 75 }),
      broadcastAuditPort,
    });
    const result = await svc.preview({
      category: "service",
      audienceFilter: "all",
      message: { title: "T", body: "Body text here" },
      actorId: "a",
    });
    expect(result.audienceSize).toBe(1);
    expect(result.segmentSize).toBe(75);
  });

  it("listAudit returns entries", async () => {
    const list = await service.listAudit(10);
    expect(list.length).toBe(1);
    expect(list[0].messageTitle).toBe("Важно");
  });
});
