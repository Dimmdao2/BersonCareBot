import { describe, it, expect } from "vitest";
import { createDoctorBroadcastsService } from "./service";
import type { BroadcastAudienceFilter, BroadcastAuditEntry, DoctorBroadcastQueueJob } from "./ports";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from "./deliveryQueueKind";

describe("doctor-broadcasts service", () => {
  const auditEntries: BroadcastAuditEntry[] = [];
  const committed: Array<{ auditId: string; jobs: DoctorBroadcastQueueJob[] }> = [];

  const client = (id: string, tg?: string): ClientListItem => ({
    userId: id,
    displayName: `User ${id}`,
    phone: "+79990001122",
    bindings: { telegramId: tg },
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
  });

  const resolveBroadcastAudience = async (
    _filter: BroadcastAudienceFilter,
    _channels: unknown[],
  ) => {
    const effective = [client("u1", "12345"), client("u2", "67890")];
    return {
      audienceSize: effective.length,
      recipientsPreview: { names: [], total: effective.length, truncated: false },
      effectiveClients: effective,
    };
  };

  const broadcastAuditPort = {
    async append(entry: Omit<BroadcastAuditEntry, "id" | "executedAt">): Promise<BroadcastAuditEntry> {
      const id = `audit-${auditEntries.length}`;
      const executedAt = new Date().toISOString();
      const full: BroadcastAuditEntry = {
        ...entry,
        messageBody: entry.messageBody ?? "",
        deliveryJobsTotal: entry.deliveryJobsTotal ?? 0,
        id,
        executedAt,
      };
      auditEntries.push(full);
      return full;
    },
    async list(): Promise<BroadcastAuditEntry[]> {
      return [...auditEntries];
    },
  };

  const doctorBroadcastDeliveryCommitPort = {
    async commitAuditAndDeliveryQueue(input: {
      auditId: string;
      audit: Omit<BroadcastAuditEntry, "id" | "executedAt">;
      jobs: readonly DoctorBroadcastQueueJob[];
    }): Promise<BroadcastAuditEntry> {
      committed.push({ auditId: input.auditId, jobs: [...input.jobs] });
      const executedAt = new Date().toISOString();
      const full: BroadcastAuditEntry = {
        ...input.audit,
        id: input.auditId,
        executedAt,
        deliveryJobsTotal: input.jobs.length,
      };
      auditEntries.push(full);
      return full;
    },
  };

  const service = createDoctorBroadcastsService({
    resolveBroadcastAudience,
    broadcastAuditPort,
    doctorBroadcastDeliveryCommitPort,
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
    expect(result.audienceSize).toBe(2);
    expect(result.category).toBe("reminder");
    expect(result.audienceFilter).toBe("with_telegram");
    expect(result.channels).toEqual(["bot_message", "sms"]);
    expect(auditEntries.length).toBe(0);
  });

  it("execute commits audit and queue jobs with delivery totals", async () => {
    const { auditEntry } = await service.execute({
      category: "important_notice",
      audienceFilter: "all",
      message: { title: "Важно", body: "Текст длиннее десяти символов" },
      actorId: "doctor-123",
      channels: ["bot_message"],
    });
    expect(auditEntry.actorId).toBe("doctor-123");
    expect(auditEntry.deliveryJobsTotal).toBe(2);
    expect(auditEntry.messageBody).toContain("Важно");
    expect(committed.length).toBe(1);
    expect(committed[0].jobs.length).toBe(2);
    expect(committed[0].jobs[0].kind).toBe("doctor_broadcast_intent");
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
      resolveBroadcastAudience: async () => ({
        audienceSize: 1,
        segmentSize: 75,
        recipientsPreview: { names: ["Тест"], total: 1, truncated: false },
        effectiveClients: [client("x", "1")],
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
    });
    const result = await svc.preview({
      category: "service",
      audienceFilter: "all",
      message: { title: "T", body: "Body text here" },
      actorId: "a",
    });
    expect(result.audienceSize).toBe(1);
    expect(result.segmentSize).toBe(75);
    expect(result.recipientsPreview).toEqual({
      names: ["Тест"],
      total: 1,
      truncated: false,
    });
  });

  it("listAudit returns entries", async () => {
    const list = await service.listAudit(10);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].messageTitle).toBe("Важно");
  });

  it("throws when delivery job cap exceeded", async () => {
    const many = Array.from({ length: 3000 }, (_, i) => client(`u${i}`, String(100000 + i)));
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: async () => ({
        audienceSize: many.length,
        recipientsPreview: { names: [], total: many.length, truncated: true },
        effectiveClients: many,
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
    });
    await expect(
      svc.execute({
        category: "service",
        audienceFilter: "all",
        message: { title: "T", body: "Body text here long enough" },
        actorId: "a",
        channels: ["bot_message"],
      }),
    ).rejects.toThrow(BROADCAST_DELIVERY_CAP_EXCEEDED_CODE);
  });
});
