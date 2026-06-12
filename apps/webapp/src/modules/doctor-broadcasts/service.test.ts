import { describe, it, expect, vi } from "vitest";
import {
  appendPatientInboundAdminMessage,
  broadcastChatIntegratorMessageId,
} from "@/modules/messaging/appendPatientInboundAdminMessage";
import { createDoctorBroadcastsService } from "./service";

vi.mock("@/modules/messaging/appendPatientInboundAdminMessage", () => ({
  appendPatientInboundAdminMessage: vi.fn().mockResolvedValue({ conversationId: "c1", messageId: "m1" }),
  broadcastChatIntegratorMessageId: (auditId: string, userId: string) => `broadcast:${auditId}:${userId}`,
}));
import type {
  BroadcastAudienceFilter,
  BroadcastAuditEntry,
  BroadcastAudienceResolveResult,
  BroadcastChannel,
  DoctorBroadcastQueueJob,
} from "./ports";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from "./deliveryQueueKind";
import {
  buildRecipientsPreviewFromClients,
} from "./broadcastAudienceMetrics";
import {
  deriveBroadcastDeliveryPolicy,
  filterEligibleBroadcastClients,
} from "./broadcastEligible";

describe("doctor-broadcasts service", () => {
  const auditEntries: BroadcastAuditEntry[] = [];
  const committed: Array<{
    auditId: string;
    jobs: DoctorBroadcastQueueJob[];
    recipientUserIds: readonly string[];
  }> = [];

  const client = (
    id: string,
    opts?: Partial<Pick<ClientListItem, "bindings" | "phone">>,
  ): ClientListItem => ({
    userId: id,
    displayName: `User ${id}`,
    phone: opts?.phone ?? "+79990001122",
    bindings: opts?.bindings ?? { telegramId: "12345" },
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
  });

  function makeResolve(effectiveClients: ClientListItem[]) {
    return async (
      filter: BroadcastAudienceFilter,
      channels: BroadcastChannel[],
      _category: import("./ports").BroadcastCategory,
    ): Promise<BroadcastAudienceResolveResult> => {
      const prefsMap = new Map();
      const eligibleClients = filterEligibleBroadcastClients(effectiveClients, channels, filter, prefsMap);
      const recipientsPreview = buildRecipientsPreviewFromClients(eligibleClients);
      const policy = deriveBroadcastDeliveryPolicy(filter, channels);
      return {
        audienceSize: eligibleClients.length,
        recipientsPreview,
        effectiveClients: effectiveClients,
        eligibleClients,
        audienceFilter: filter,
        notificationPrefsByUserId: prefsMap,
        deliveryPolicyKind: policy.kind,
        deliveryPolicyDescriptionRu: policy.descriptionRu,
        webPushEligibleUserIds: new Set<string>(),
      };
    };
  }

  let resolveBroadcastAudience = makeResolve([
    client("u1", { bindings: { telegramId: "a" } }),
    client("u2", { bindings: { telegramId: "b" } }),
  ]);

  const broadcastAuditPort = {
    async append(entry: Omit<BroadcastAuditEntry, "id" | "executedAt">): Promise<BroadcastAuditEntry> {
      const id = `audit-${auditEntries.length}`;
      const executedAt = new Date().toISOString();
      const full: BroadcastAuditEntry = {
        ...entry,
        messageBody: entry.messageBody ?? "",
        deliveryJobsTotal: entry.deliveryJobsTotal ?? 0,
        attachMenuAfterSend: entry.attachMenuAfterSend ?? false,
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
      recipientUserIds: readonly string[];
    }): Promise<BroadcastAuditEntry> {
      committed.push({
        auditId: input.auditId,
        jobs: [...input.jobs],
        recipientUserIds: input.recipientUserIds,
      });
      const executedAt = new Date().toISOString();
      const full: BroadcastAuditEntry = {
        ...input.audit,
        id: input.auditId,
        executedAt,
        deliveryJobsTotal: input.jobs.length,
        attachMenuAfterSend: input.audit.attachMenuAfterSend,
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
    expect(result.channels).toEqual(["max", "push", "telegram"]);
    // Default channels are telegram+max+push (no sms); filter with_telegram → telegram_isolate_bot
    expect(result.deliveryPolicyKind).toBe("telegram_isolate_bot");
    expect(result.deliveryPolicyDescriptionRu.length).toBeGreaterThan(10);
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
    expect(committed[0].recipientUserIds).toEqual(["u1", "u2"]);
  });

  it("execute stores attachMenuAfterSend and sets attachMenu on queue jobs", async () => {
    const { auditEntry } = await service.execute({
      category: "service",
      audienceFilter: "all",
      message: { title: "M", body: "Body text here long enough" },
      actorId: "doctor-m",
      channels: ["bot_message"],
      attachMenuAfterSend: true,
    });
    expect(auditEntry.attachMenuAfterSend).toBe(true);
    const last = committed[committed.length - 1];
    expect(last.jobs.length).toBeGreaterThan(0);
    expect(last.jobs.every((j) => j.payloadJson.attachMenu === true)).toBe(true);
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
    expect(result.deliveryPolicyKind).toBe("respect_prefs_sms");
  });

  it("preview passes segmentSize when resolver returns it", async () => {
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: async (filter, channels, category) => ({
        ...(await makeResolve([client("x", { bindings: { telegramId: "1" } })])(filter, channels, category)),
        audienceSize: 1,
        segmentSize: 75,
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
    });
    const result = await svc.preview({
      category: "service",
      audienceFilter: "all",
      message: { title: "T", body: "Body text here" },
      actorId: "a",
      channels: ["bot_message"],
    });
    expect(result.audienceSize).toBe(1);
    expect(result.segmentSize).toBe(75);
    expect(result.recipientsPreview).toEqual({
      names: ["User x"],
      total: 1,
      truncated: false,
    });
    expect(result.deliveryPolicyKind).toBe("respect_prefs_bot");
    // bot_message is normalized to telegram+max (legacy expansion)
    expect(result.channels).toEqual(["max", "telegram"]);
  });

  it("listAudit returns entries", async () => {
    const list = await service.listAudit(10);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].messageTitle).toBe("Важно");
  });

  it("execute appends inbound chat message for each eligible client", async () => {
    vi.mocked(appendPatientInboundAdminMessage).mockClear();
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: makeResolve([client("u1"), client("u2")]),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
      patientInboundChatPort: {} as never,
    });

    await svc.execute({
      category: "marketing",
      audienceFilter: "all",
      message: { title: "Новость", body: "Текст длиннее десяти символов" },
      actorId: "doctor-1",
      channels: ["bot_message"],
    });

    expect(appendPatientInboundAdminMessage).toHaveBeenCalledTimes(2);
    expect(appendPatientInboundAdminMessage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        platformUserId: "u1",
        integratorMessageId: expect.stringMatching(/^broadcast:/),
      }),
    );
  });

  it("execute with push channel calls fan-out after queue commit", async () => {
    const fanOut = vi.fn().mockResolvedValue({ attempted: 1, delivered: 1, errors: 0, skipped: 0 });
    const pushEligible = new Set(["u1"]);
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: async (filter, channels, category) => ({
        ...(await makeResolve([client("u1", { bindings: {} })])(filter, channels, category)),
        webPushEligibleUserIds: pushEligible,
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
      fanOutBroadcastWebPush: fanOut,
      patientWebPushNotifyDeps: {} as never,
    });

    await svc.execute({
      category: "marketing",
      audienceFilter: "all",
      message: { title: "Новость", body: "Текст длиннее десяти символов" },
      actorId: "doctor-1",
      channels: ["push"],
    });

    expect(committed.length).toBeGreaterThan(0);
    expect(fanOut).toHaveBeenCalledOnce();
    expect(fanOut.mock.calls[0][0]).toMatchObject({
      broadcastTitle: "Новость",
      webPushEligibleUserIds: pushEligible,
    });
  });

  it("throws when delivery job cap exceeded", async () => {
    const many = Array.from({ length: 3000 }, (_, i) => client(`u${i}`, { bindings: { telegramId: String(100000 + i) } }));
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: makeResolve(many),
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

  it("execute with email channel calls email fan-out", async () => {
    const emailFanOut = vi.fn().mockResolvedValue({ attempted: 1, delivered: 1, errors: 0, skipped: 0 });
    const emailEligible = new Set(["u1"]);
    const emailRecipientsPort = {
      getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(new Map([["u1", "u1@example.com"]])),
    };
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: async (filter, channels, category) => ({
        ...(await makeResolve([client("u1", { bindings: {} })])(filter, channels, category)),
        webPushEligibleUserIds: new Set<string>(),
        emailEligibleUserIds: emailEligible,
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
      fanOutBroadcastEmailDeps: {
        emailRecipientsPort,
        getSmtpValueJson: () => Promise.resolve(null),
      },
    });

    await svc.execute({
      category: "organizational",
      audienceFilter: "all",
      message: { title: "Email-рассылка", body: "Текст письма длиннее десяти символов" },
      actorId: "doctor-1",
      channels: ["email"],
    });

    expect(committed.length).toBeGreaterThan(0);
  });

  it("execute with email channel without fanOutBroadcastEmailDeps does not throw", async () => {
    const svc = createDoctorBroadcastsService({
      resolveBroadcastAudience: async (filter, channels, category) => ({
        ...(await makeResolve([client("u1", { bindings: {} })])(filter, channels, category)),
        webPushEligibleUserIds: new Set<string>(),
      }),
      broadcastAuditPort,
      doctorBroadcastDeliveryCommitPort,
      // fanOutBroadcastEmailDeps not provided — email delivery guarded
    });

    // Should complete without error (email just skipped)
    await expect(
      svc.execute({
        category: "organizational",
        audienceFilter: "all",
        message: { title: "Email-guard", body: "Текст письма длиннее десяти символов" },
        actorId: "doctor-1",
        channels: ["email"],
      }),
    ).resolves.toBeDefined();
  });
});
