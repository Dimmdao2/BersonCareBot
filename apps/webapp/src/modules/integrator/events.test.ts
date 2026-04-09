import { describe, expect, it, vi } from "vitest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import {
  handleIntegratorEvent,
  setEmailAutobindConflictReporter,
  type IntegratorEventsDeps,
} from "./events";
import { inMemoryReminderProjectionPort } from "@/infra/repos/inMemoryReminderProjection";
import { inMemoryAppointmentProjectionPort } from "@/infra/repos/inMemoryAppointmentProjection";
import { inMemorySupportCommunicationPort } from "@/infra/repos/inMemorySupportCommunication";
import { inMemorySubscriptionMailingProjectionPort } from "@/infra/repos/inMemorySubscriptionMailingProjection";
import type { PatientBookingService } from "@/modules/patient-booking/ports";

const mockDeps: IntegratorEventsDeps = {
  diaries: {
    createSymptomTracking: async () => ({}),
    createLfkComplex: async () => ({}),
    addLfkSession: async () => ({}),
    addSymptomEntry: async () => ({}),
  },
};

describe("handleIntegratorEvent", () => {
  it("reports conflict for user.email.autobind skipped_conflict", async () => {
    const reporter = vi.fn();
    setEmailAutobindConflictReporter(reporter);
    const applyRubitimeEmailAutobind = vi.fn().mockResolvedValue({ outcome: "skipped_conflict" });

    try {
      const result = await handleIntegratorEvent(
        {
          eventType: "user.email.autobind",
          payload: { phoneNormalized: "+79991112233", email: "a@b.co" },
        },
        {
          ...mockDeps,
          users: {
            upsertFromProjection: vi.fn(),
            findByIntegratorId: vi.fn(),
            updatePhone: vi.fn(),
            updateProfileByPhone: vi.fn(),
            ensureClientFromAppointmentProjection: vi.fn(),
            applyRubitimeEmailAutobind,
          },
        }
      );

      expect(result.accepted).toBe(true);
      expect(reporter).toHaveBeenCalledWith({
        phoneNormalized: "+79991112233",
        email: "a@b.co",
      });
    } finally {
      setEmailAutobindConflictReporter((ctx) => {
        console.warn("[user.email.autobind:conflict]", ctx);
      });
    }
  });

  it("accepts diary.symptom.tracking.created with valid payload", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-1", symptomTitle: "Головная боль" },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects diary.symptom.tracking.created without userId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { symptomTitle: "X" },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("userId");
  });

  it("rejects diary.symptom.tracking.created without symptomTitle", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-1" },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("symptomTitle");
  });

  it("accepts diary.symptom.entry.created with valid payload after creating tracking", async () => {
    const deps = buildAppDeps();
    const trackingResult = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-entry-1", symptomTitle: "Спина" },
      },
      { diaries: deps.diaries }
    );
    expect(trackingResult.accepted).toBe(true);

    const trackings = await deps.diaries.listSymptomTrackings("usr-entry-1");
    expect(trackings.length).toBeGreaterThanOrEqual(1);
    const trackingId = trackings[0].id;

    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: {
          userId: "usr-entry-1",
          trackingId,
          value0_10: 7,
          entryType: "instant",
          recordedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);

    const entries = await deps.diaries.listSymptomEntries("usr-entry-1");
    expect(entries.some((e) => e.value0_10 === 7 && e.trackingId === trackingId)).toBe(true);
  });

  it("rejects diary.symptom.entry.created without trackingId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: { userId: "u", value0_10: 5, entryType: "instant", recordedAt: new Date().toISOString() },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("trackingId");
  });

  it("rejects diary.symptom.entry.created with value0_10 out of range", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: {
          userId: "u",
          trackingId: "tr-any",
          value0_10: 11,
          entryType: "instant",
          recordedAt: new Date().toISOString(),
        },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("value0_10");
  });

  it("accepts diary.lfk.complex.created with valid payload", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.complex.created",
        payload: { userId: "usr-lfk-1", title: "Разминка для шеи" },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts diary.lfk.session.created after creating complex", async () => {
    const deps = buildAppDeps();
    const complexResult = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.complex.created",
        payload: { userId: "usr-lfk-2", title: "Спина" },
      },
      { diaries: deps.diaries }
    );
    expect(complexResult.accepted).toBe(true);
    const complexes = await deps.diaries.listLfkComplexes("usr-lfk-2");
    expect(complexes.length).toBeGreaterThanOrEqual(1);
    const complexId = complexes[0].id;
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.session.created",
        payload: {
          userId: "usr-lfk-2",
          complexId,
          completedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("returns not implemented for unknown event type", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "unknown.event",
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });

  it("accepts user.upserted with string integratorUserId", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: { integratorUserId: "12345678901234" },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts user.upserted with number integratorUserId (backward compat)", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: { integratorUserId: 999 },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects user.upserted without integratorUserId", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: {},
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorUserId");
  });

  it("contact.linked creates skeleton user if user.upserted not received yet", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "contact.linked",
        payload: { integratorUserId: "77777", phoneNormalized: "+70001112233" },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(true);
  });

  it("passes channel binding fields from contact.linked to projection upsert", async () => {
    const users = {
      upsertFromProjection: vi.fn().mockResolvedValue({ platformUserId: "platform-1" }),
      findByIntegratorId: vi.fn(),
      updatePhone: vi.fn().mockResolvedValue(undefined),
      updateProfileByPhone: vi.fn(),
      ensureClientFromAppointmentProjection: vi.fn(),
      applyRubitimeEmailAutobind: vi.fn(),
    };
    const result = await handleIntegratorEvent(
      {
        eventType: "contact.linked",
        payload: {
          integratorUserId: "77777",
          phoneNormalized: "+70001112233",
          channelCode: "telegram",
          externalId: "tg77777",
        },
      },
      { ...mockDeps, users }
    );

    expect(result.accepted).toBe(true);
    expect(users.upsertFromProjection).toHaveBeenCalledWith({
      integratorUserId: "77777",
      phoneNormalized: "+70001112233",
      channelCode: "telegram",
      externalId: "tg77777",
    });
    expect(users.updatePhone).toHaveBeenCalledWith("platform-1", "+70001112233");
  });

  it("preferences.updated creates skeleton user if user.upserted not received yet", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "preferences.updated",
        payload: {
          integratorUserId: "88888",
          topics: [{ topicCode: "booking_spb", isEnabled: true }],
        },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(true);
  });

  it("user.upserted non-merge Error stays retryable (503 path), no conflict audit", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi.fn().mockRejectedValue(new Error("connection reset"));
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: { integratorUserId: "42" },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
          ensureClientFromAppointmentProjection: vi.fn(),
          applyRubitimeEmailAutobind: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(false);
    expect(logAutoMergeConflict).not.toHaveBeenCalled();
    expect(result.reason).toContain("connection reset");
  });

  it("user.upserted MergeConflictError → conflict audit + accepted (no 503 loop)", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi.fn().mockRejectedValue(
      new MergeConflictError("two users", [
        "00000000-0000-4000-8000-0000000000a1",
        "00000000-0000-4000-8000-0000000000a2",
      ]),
    );
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: { integratorUserId: "42", phoneNormalized: "+79000000000" },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
          ensureClientFromAppointmentProjection: vi.fn(),
          applyRubitimeEmailAutobind: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(logAutoMergeConflict).toHaveBeenCalledTimes(1);
    expect(upsertFromProjection).toHaveBeenCalled();
  });

  it("contact.linked MergeConflictError → conflict audit + accepted, no updatePhone", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi.fn().mockRejectedValue(
      new MergeConflictError("conflict", [
        "00000000-0000-4000-8000-0000000000b1",
        "00000000-0000-4000-8000-0000000000b2",
      ]),
    );
    const updatePhone = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: "contact.linked",
        payload: { integratorUserId: "77", phoneNormalized: "+79000000001" },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone,
          updateProfileByPhone: vi.fn(),
          ensureClientFromAppointmentProjection: vi.fn(),
          applyRubitimeEmailAutobind: vi.fn(),
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(updatePhone).not.toHaveBeenCalled();
  });

  it("preferences.updated MergeConflictError on upsertFromProjection → audit + accepted, no topic writes", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const upsertFromProjection = vi.fn().mockRejectedValue(
      new MergeConflictError("conflict", [
        "00000000-0000-4000-8000-0000000000c1",
        "00000000-0000-4000-8000-0000000000c2",
      ]),
    );
    const upsertNotificationTopics = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: "preferences.updated",
        payload: {
          integratorUserId: "88",
          topics: [{ topicCode: "booking_spb", isEnabled: true }],
        },
      },
      {
        ...mockDeps,
        conflictAudit: { logAutoMergeConflict },
        users: {
          upsertFromProjection,
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
          ensureClientFromAppointmentProjection: vi.fn(),
          applyRubitimeEmailAutobind: vi.fn(),
        },
        preferences: {
          upsertNotificationTopics,
        },
      },
    );
    expect(result.accepted).toBe(true);
    expect(upsertNotificationTopics).not.toHaveBeenCalled();
  });

  it("contact.linked then user.upserted produces consistent state", async () => {
    const deps = buildAppDeps();
    await handleIntegratorEvent(
      {
        eventType: "contact.linked",
        payload: { integratorUserId: "99999", phoneNormalized: "+70009998877" },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    const result = await handleIntegratorEvent(
      {
        eventType: "user.upserted",
        payload: {
          integratorUserId: "99999",
          displayName: "Test User",
          channelCode: "telegram",
          externalId: "tg99999",
        },
      },
      { diaries: deps.diaries, users: deps.userProjection, preferences: deps.userProjection }
    );
    expect(result.accepted).toBe(true);
  });
});

describe("handleIntegratorEvent: support.* communication ingest", () => {
  const sc = inMemorySupportCommunicationPort;
  const depsWithSc: IntegratorEventsDeps = { ...mockDeps, supportCommunication: sc };

  it("accepts support.conversation.opened", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.opened",
        payload: {
          integratorConversationId: "conv-test-1",
          integratorUserId: "42",
          source: "telegram",
          adminScope: "support",
          status: "open",
          openedAt: "2025-03-01T10:00:00.000Z",
          lastMessageAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.conversation.opened without integratorConversationId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.opened",
        payload: { openedAt: "2025-03-01T10:00:00.000Z" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorConversationId");
  });

  it("accepts support.conversation.message.appended", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.message.appended",
        payload: {
          integratorMessageId: "msg-test-1",
          integratorConversationId: "conv-test-1",
          senderRole: "user",
          text: "Hello from test",
          source: "telegram",
          createdAt: "2025-03-01T10:01:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.conversation.message.appended without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.message.appended",
        payload: { text: "orphan" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required fields missing");
  });

  it("accepts support.conversation.status.changed", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.status.changed",
        payload: {
          integratorConversationId: "conv-test-1",
          status: "closed",
          closedAt: "2025-03-01T10:02:00.000Z",
          closeReason: "resolved",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.conversation.status.changed without status", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.status.changed",
        payload: { integratorConversationId: "conv-test-1" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("status required");
  });

  it("accepts support.question.created", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.created",
        payload: {
          integratorQuestionId: "q-test-1",
          integratorConversationId: "conv-test-1",
          status: "open",
          createdAt: "2025-03-01T10:03:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.question.created without integratorQuestionId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.created",
        payload: { status: "open" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorQuestionId");
  });

  it("accepts support.question.message.appended", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.message.appended",
        payload: {
          integratorQuestionMessageId: "qm-test-1",
          integratorQuestionId: "q-test-1",
          senderRole: "user",
          text: "Why?",
          createdAt: "2025-03-01T10:04:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.question.message.appended without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.message.appended",
        payload: { text: "orphan" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required fields missing");
  });

  it("accepts support.question.answered", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.answered",
        payload: {
          integratorQuestionId: "q-test-1",
          answeredAt: "2025-03-01T10:05:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects support.question.answered without answeredAt", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.question.answered",
        payload: { integratorQuestionId: "q-ans-1" },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("answeredAt required");
  });

  it("accepts support.delivery.attempt.logged", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.delivery.attempt.logged",
        payload: {
          intentEventId: "evt-test-1",
          correlationId: "corr-1",
          channelCode: "telegram",
          status: "success",
          attempt: 1,
          occurredAt: "2025-03-01T10:06:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("idempotent: duplicate conversation opened returns accepted", async () => {
    const payload = {
      integratorConversationId: "conv-idem-1",
      integratorUserId: "50",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-03-01T10:00:00.000Z",
      lastMessageAt: "2025-03-01T10:00:00.000Z",
    };
    const r1 = await handleIntegratorEvent({ eventType: "support.conversation.opened", payload }, depsWithSc);
    const r2 = await handleIntegratorEvent({ eventType: "support.conversation.opened", payload }, depsWithSc);
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });

  it("out-of-order: message before conversation creates skeleton", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.message.appended",
        payload: {
          integratorMessageId: "msg-ooo-1",
          integratorConversationId: "conv-ooo-1",
          senderRole: "user",
          text: "First message, no conversation yet",
          source: "telegram",
          createdAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithSc
    );
    expect(result.accepted).toBe(true);
  });

  it("falls through to not-implemented when supportCommunication dep missing", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "support.conversation.opened",
        payload: { integratorConversationId: "c", openedAt: "2025-01-01T00:00:00Z" },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });
});

describe("handleIntegratorEvent: Stage 7 reminder/content projection ingest", () => {
  const rp = inMemoryReminderProjectionPort;
  const depsWithRp: IntegratorEventsDeps = { ...mockDeps, reminderProjection: rp };

  it("accepts reminder.rule.upserted", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.rule.upserted",
        payload: {
          integratorRuleId: "rule-s7-1",
          integratorUserId: "42",
          category: "exercise",
          isEnabled: true,
          scheduleType: "daily",
          timezone: "Europe/Moscow",
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: "1111111",
          contentMode: "none",
          updatedAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts reminder.rule.upserted with interval fields as numeric strings (JSON coercion)", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.rule.upserted",
        payload: {
          integratorRuleId: "rule-s7-str",
          integratorUserId: "42",
          category: "water",
          isEnabled: false,
          scheduleType: "daily",
          timezone: "UTC",
          intervalMinutes: "120",
          windowStartMinute: "0",
          windowEndMinute: "1440",
          daysMask: "1111111",
          contentMode: "none",
          updatedAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
    const rule = await rp.getRuleByIntegratorUserIdAndCategory("42", "water");
    expect(rule?.intervalMinutes).toBe(120);
  });

  it("rejects reminder.rule.upserted without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.rule.upserted",
        payload: { integratorRuleId: "r1", category: "exercise" },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required payload fields missing");
  });

  it("accepts reminder.occurrence.finalized (sent)", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.occurrence.finalized",
        payload: {
          integratorOccurrenceId: "occ-s7-1",
          integratorRuleId: "rule-s7-1",
          integratorUserId: "42",
          category: "exercise",
          status: "sent",
          deliveryChannel: "telegram",
          errorCode: null,
          occurredAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts reminder.occurrence.finalized (failed)", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.occurrence.finalized",
        payload: {
          integratorOccurrenceId: "occ-s7-2",
          integratorRuleId: "rule-s7-1",
          integratorUserId: "42",
          category: "exercise",
          status: "failed",
          deliveryChannel: "telegram",
          errorCode: "timeout",
          occurredAt: "2025-03-01T10:01:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects reminder.occurrence.finalized without status", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.occurrence.finalized",
        payload: {
          integratorOccurrenceId: "occ-1",
          integratorRuleId: "rule-1",
          integratorUserId: "42",
          category: "exercise",
          occurredAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required payload fields missing");
  });

  it("accepts reminder.delivery.logged", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.delivery.logged",
        payload: {
          integratorDeliveryLogId: "log-s7-1",
          integratorOccurrenceId: "occ-s7-1",
          integratorRuleId: "rule-s7-1",
          integratorUserId: "42",
          channel: "telegram",
          status: "success",
          errorCode: null,
          payloadJson: {},
          createdAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
  });

  it("calls appendDeliveryEventFromProjection with payload when reminder.delivery.logged", async () => {
    const appendSpy = vi.spyOn(rp, "appendDeliveryEventFromProjection").mockResolvedValue();
    try {
      const payload = {
        integratorDeliveryLogId: "log-del-1",
        integratorOccurrenceId: "occ-del-1",
        integratorRuleId: "rule-del-1",
        integratorUserId: "99",
        channel: "telegram",
        status: "failed",
        errorCode: "ERR_RATE_LIMIT",
        payloadJson: { attempt: 1 },
        createdAt: "2025-03-02T14:00:00.000Z",
      };
      const result = await handleIntegratorEvent(
        { eventType: "reminder.delivery.logged", payload },
        depsWithRp
      );
      expect(result.accepted).toBe(true);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledWith({
        integratorDeliveryLogId: "log-del-1",
        integratorOccurrenceId: "occ-del-1",
        integratorRuleId: "rule-del-1",
        integratorUserId: "99",
        channel: "telegram",
        status: "failed",
        errorCode: "ERR_RATE_LIMIT",
        payloadJson: { attempt: 1 },
        createdAt: "2025-03-02T14:00:00.000Z",
      });
    } finally {
      appendSpy.mockRestore();
    }
  });

  it("rejects reminder.delivery.logged without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.delivery.logged",
        payload: { integratorDeliveryLogId: "log-1" },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required payload fields missing");
  });

  it("accepts content.access.granted", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "content.access.granted",
        payload: {
          integratorGrantId: "grant-s7-1",
          integratorUserId: "42",
          contentId: "content-1",
          purpose: "view",
          tokenHash: "abc",
          expiresAt: "2026-01-01T00:00:00.000Z",
          revokedAt: null,
          metaJson: {},
          createdAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects content.access.granted without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "content.access.granted",
        payload: { integratorGrantId: "g1" },
      },
      depsWithRp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required payload fields missing");
  });

  it("calls upsertContentAccessGrantFromProjection with payload when content.access.granted", async () => {
    const mockRp = {
      upsertRuleFromProjection: vi.fn(),
      appendFinalizedOccurrenceFromProjection: vi.fn(),
      appendDeliveryEventFromProjection: vi.fn(),
      upsertContentAccessGrantFromProjection: vi.fn().mockResolvedValue(undefined),
      listRulesByIntegratorUserId: vi.fn().mockResolvedValue([]),
      getRuleByIntegratorUserIdAndCategory: vi.fn().mockResolvedValue(null),
      listHistoryByIntegratorUserId: vi.fn().mockResolvedValue([]),
      getUnseenCount: vi.fn().mockResolvedValue(0),
      getStats: vi.fn().mockResolvedValue({ total: 0, seen: 0, unseen: 0, failed: 0 }),
      markSeen: vi.fn().mockResolvedValue(undefined),
      markAllSeen: vi.fn().mockResolvedValue(undefined),
    };
    const depsContent: IntegratorEventsDeps = { ...mockDeps, reminderProjection: mockRp };
    const payload = {
      integratorGrantId: "grant-spy-1",
      integratorUserId: "43",
      contentId: "content-spy",
      purpose: "view",
      tokenHash: "thash",
      expiresAt: "2026-06-01T00:00:00.000Z",
      revokedAt: null as string | null,
      metaJson: { key: "value" },
      createdAt: "2025-04-01T12:00:00.000Z",
    };
    const result = await handleIntegratorEvent(
      { eventType: "content.access.granted", payload },
      depsContent
    );
    expect(result.accepted).toBe(true);
    expect(mockRp.upsertContentAccessGrantFromProjection).toHaveBeenCalledTimes(1);
    expect(mockRp.upsertContentAccessGrantFromProjection).toHaveBeenCalledWith({
      integratorGrantId: "grant-spy-1",
      integratorUserId: "43",
      contentId: "content-spy",
      purpose: "view",
      tokenHash: "thash",
      expiresAt: "2026-06-01T00:00:00.000Z",
      revokedAt: null,
      metaJson: { key: "value" },
      createdAt: "2025-04-01T12:00:00.000Z",
    });
  });

  const depsWithAp: IntegratorEventsDeps = { ...mockDeps, appointmentProjection: inMemoryAppointmentProjectionPort };

  it("accepts appointment.record.upserted", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-s9-1",
          phoneNormalized: "+79991234567",
          recordAt: "2025-06-01T10:00:00.000Z",
          status: "created",
          payloadJson: {},
          lastEvent: "event-create",
          updatedAt: "2025-05-01T12:00:00.000Z",
        },
      },
      depsWithAp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects appointment.record.upserted without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: { integratorRecordId: "rec-1" },
      },
      depsWithAp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("required payload fields missing");
    expect(result.retryable).toBe(false);
  });

  it("appointment.record.upserted normalizes phone before ensureClientFromAppointmentProjection", async () => {
    const ensureClientFromAppointmentProjection = vi
      .fn()
      .mockResolvedValue({ platformUserId: "user-uuid-1" });
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      appointmentProjection: mockAp,
      patientBooking: { applyRubitimeUpdate } as unknown as PatientBookingService,
      users: {
        upsertFromProjection: vi.fn(),
        findByIntegratorId: vi.fn(),
        findByPhone: vi.fn(),
        updatePhone: vi.fn(),
        updateProfileByPhone: vi.fn(),
        ensureClientFromAppointmentProjection,
      },
    };
    await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-norm-1",
          phoneNormalized: "8 (999) 123-45-67",
          recordAt: "2025-08-01T12:00:00.000Z",
          status: "created",
          payloadJson: {},
          lastEvent: "event-create",
          updatedAt: "2025-07-01T10:00:00.000Z",
        },
      },
      deps,
    );
    expect(ensureClientFromAppointmentProjection).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNormalized: "+79991234567" }),
    );
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-uuid-1" }),
    );
  });

  it("appointment.record.upserted uses payloadJson.phone for ensure path and still suppresses compat lookups on conflict", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const ensureClientFromAppointmentProjection = vi.fn().mockRejectedValue(
      new MergeConflictError("multiple canonical users for phone", [
        "00000000-0000-4000-8000-0000000000e1",
        "00000000-0000-4000-8000-0000000000e2",
      ]),
    );
    const findByPhone = vi.fn();
    const findByIntegratorId = vi.fn();
    const upsertRecordFromProjection = vi.fn().mockResolvedValue(undefined);
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection,
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      conflictAudit: { logAutoMergeConflict },
      appointmentProjection: mockAp,
      patientBooking: { applyRubitimeUpdate } as unknown as PatientBookingService,
      users: {
        upsertFromProjection: vi.fn(),
        findByIntegratorId,
        findByPhone,
        updatePhone: vi.fn(),
        updateProfileByPhone: vi.fn(),
        ensureClientFromAppointmentProjection,
      },
    };

    const result = await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-conflict-payload-phone-1",
          integratorUserId: "501",
          recordAt: "2025-08-01T12:00:00.000Z",
          status: "created",
          payloadJson: { phone: "8 (999) 111-22-33" },
          lastEvent: "event-create",
          updatedAt: "2025-07-01T10:00:00.000Z",
        },
      },
      deps,
    );

    expect(result.accepted).toBe(true);
    expect(ensureClientFromAppointmentProjection).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNormalized: "+79991112233" }),
    );
    expect(logAutoMergeConflict).toHaveBeenCalled();
    expect(findByPhone).not.toHaveBeenCalled();
    expect(findByIntegratorId).not.toHaveBeenCalled();
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, contactPhone: "+79991112233" }),
    );
  });

  it("appointment.record.upserted MergeDependentConflictError on ensureClient → audit, projection upsert, no compat lookups", async () => {
    const logAutoMergeConflict = vi.fn().mockResolvedValue(undefined);
    const ensureClientFromAppointmentProjection = vi.fn().mockRejectedValue(
      new MergeDependentConflictError("overlap", [
        "00000000-0000-4000-8000-0000000000d1",
        "00000000-0000-4000-8000-0000000000d2",
      ]),
    );
    const findByPhone = vi.fn();
    const findByIntegratorId = vi.fn();
    const upsertRecordFromProjection = vi.fn().mockResolvedValue(undefined);
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection,
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      conflictAudit: { logAutoMergeConflict },
      appointmentProjection: mockAp,
      patientBooking: { applyRubitimeUpdate } as unknown as PatientBookingService,
      users: {
        upsertFromProjection: vi.fn(),
        findByIntegratorId,
        findByPhone,
        updatePhone: vi.fn(),
        updateProfileByPhone: vi.fn(),
        ensureClientFromAppointmentProjection,
      },
    };
    const result = await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-conflict-1",
          phoneNormalized: "+79991112233",
          integratorUserId: "501",
          recordAt: "2025-08-01T12:00:00.000Z",
          status: "created",
          payloadJson: {},
          lastEvent: "event-create",
          updatedAt: "2025-07-01T10:00:00.000Z",
        },
      },
      deps,
    );
    expect(result.accepted).toBe(true);
    expect(logAutoMergeConflict).toHaveBeenCalled();
    expect(upsertRecordFromProjection).toHaveBeenCalled();
    expect(findByPhone).not.toHaveBeenCalled();
    expect(findByIntegratorId).not.toHaveBeenCalled();
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, rubitimeId: "rec-conflict-1" }),
    );
  });

  it("appointment.record.upserted passes userId null when phone and integrator lookups miss (compat row)", async () => {
    const findByPhone = vi.fn().mockResolvedValue(null);
    const findByIntegratorId = vi.fn().mockResolvedValue(null);
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      appointmentProjection: mockAp,
      patientBooking: { applyRubitimeUpdate } as unknown as PatientBookingService,
      users: {
        upsertFromProjection: vi.fn(),
        findByIntegratorId,
        findByPhone,
        updatePhone: vi.fn(),
        updateProfileByPhone: vi.fn(),
      },
    };
    const result = await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-unlinked-1",
          phoneNormalized: "+79991112233",
          recordAt: "2025-08-01T12:00:00.000Z",
          status: "created",
          payloadJson: {},
          lastEvent: "event-create",
          updatedAt: "2025-07-01T10:00:00.000Z",
        },
      },
      deps,
    );
    expect(result.accepted).toBe(true);
    expect(findByPhone).toHaveBeenCalled();
    expect(findByIntegratorId).not.toHaveBeenCalled();
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, rubitimeId: "rec-unlinked-1" }),
    );
  });

  it("appointment.record.upserted uses integrator id when phone lookup misses", async () => {
    const findByPhone = vi.fn().mockResolvedValue(null);
    const findByIntegratorId = vi.fn().mockResolvedValue({ platformUserId: "plat-from-int" });
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      appointmentProjection: mockAp,
      patientBooking: { applyRubitimeUpdate } as unknown as PatientBookingService,
      users: {
        upsertFromProjection: vi.fn(),
        findByIntegratorId,
        findByPhone,
        updatePhone: vi.fn(),
        updateProfileByPhone: vi.fn(),
      },
    };
    await handleIntegratorEvent(
      {
        eventType: "appointment.record.upserted",
        payload: {
          integratorRecordId: "rec-int-1",
          phoneNormalized: "+79990001122",
          integratorUserId: "rubitime-user-99",
          recordAt: "2025-08-01T12:00:00.000Z",
          status: "created",
          payloadJson: {},
          lastEvent: "event-create",
          updatedAt: "2025-07-01T10:00:00.000Z",
        },
      },
      deps,
    );
    expect(findByPhone).toHaveBeenCalled();
    expect(findByIntegratorId).toHaveBeenCalledWith("rubitime-user-99");
    expect(applyRubitimeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "plat-from-int" }),
    );
  });

  it("calls upsertRecordFromProjection with payload when appointment.record.upserted", async () => {
    const { vi } = await import("vitest");
    const ap = inMemoryAppointmentProjectionPort;
    const upsertSpy = vi.spyOn(ap, "upsertRecordFromProjection").mockResolvedValue();
    try {
      const payload = {
        integratorRecordId: "rec-spy-1",
        phoneNormalized: "+79990000000",
        recordAt: "2025-07-01T14:00:00.000Z",
        status: "updated",
        payloadJson: { link: "https://example.com" },
        lastEvent: "event-update",
        updatedAt: "2025-06-15T09:00:00.000Z",
      };
      const result = await handleIntegratorEvent(
        { eventType: "appointment.record.upserted", payload },
        depsWithAp
      );
      expect(result.accepted).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        integratorRecordId: "rec-spy-1",
        phoneNormalized: "+79990000000",
        recordAt: "2025-07-01T14:00:00.000Z",
        status: "updated",
        payloadJson: { link: "https://example.com" },
        lastEvent: "event-update",
        updatedAt: "2025-06-15T09:00:00.000Z",
        branchId: null,
      });
    } finally {
      upsertSpy.mockRestore();
    }
  });

  it("appointment.record.upserted with patient and branch calls branches, ensureClientFromAppointmentProjection, and upsert with branchId", async () => {
    const { vi } = await import("vitest");
    const mockBranches = {
      upsertFromProjection: vi.fn().mockResolvedValue({ branchId: "branch-uuid-1" }),
      getByIntegratorBranchId: vi.fn(),
    };
    const mockUsers = {
      upsertFromProjection: vi.fn(),
      findByIntegratorId: vi.fn(),
      updatePhone: vi.fn(),
      updateProfileByPhone: vi.fn().mockResolvedValue(undefined),
      ensureClientFromAppointmentProjection: vi.fn().mockResolvedValue({ platformUserId: "branch-client-1" }),
    };
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      users: mockUsers,
      branches: mockBranches,
      appointmentProjection: mockAp,
    };
    const payload = {
      integratorRecordId: "rec-branch-1",
      phoneNormalized: "+79997654321",
      recordAt: "2025-09-01T11:00:00.000Z",
      status: "created",
      payloadJson: { name: "Петров Пётр" },
      lastEvent: "event-create",
      updatedAt: "2025-08-01T12:00:00.000Z",
      patientFirstName: "Пётр",
      patientLastName: "Петров",
      patientEmail: "petr@example.com",
      integratorBranchId: "202",
      branchName: "Филиал Юг",
    };
    const result = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload },
      deps
    );
    expect(result.accepted).toBe(true);
    expect(mockBranches.upsertFromProjection).toHaveBeenCalledTimes(1);
    expect(mockBranches.upsertFromProjection).toHaveBeenCalledWith({
      integratorBranchId: "202",
      name: "Филиал Юг",
    });
    expect(mockUsers.ensureClientFromAppointmentProjection).toHaveBeenCalledTimes(1);
    expect(mockUsers.ensureClientFromAppointmentProjection).toHaveBeenCalledWith({
      phoneNormalized: "+79997654321",
      integratorUserId: null,
      displayName: "Петров Пётр",
      firstName: "Пётр",
      lastName: "Петров",
      email: "petr@example.com",
    });
    expect(mockAp.upsertRecordFromProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        integratorRecordId: "rec-branch-1",
        branchId: "branch-uuid-1",
      })
    );
  });

  it("appointment.record.upserted sets displayName from payloadJson.name when first/last omitted (ambiguous FIO)", async () => {
    const mockUsers = {
      upsertFromProjection: vi.fn(),
      findByIntegratorId: vi.fn(),
      updatePhone: vi.fn(),
      updateProfileByPhone: vi.fn().mockResolvedValue(undefined),
      ensureClientFromAppointmentProjection: vi.fn().mockResolvedValue({ platformUserId: "fio-client-1" }),
    };
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      users: mockUsers,
      appointmentProjection: mockAp,
    };
    const payload = {
      integratorRecordId: "rec-fio-3",
      phoneNormalized: "+79119975939",
      recordAt: "2026-04-07T13:00:00.000Z",
      status: "created",
      payloadJson: { name: "Карина Викторовна Прокопенкова" },
      lastEvent: "event-create",
      updatedAt: "2026-04-04T20:00:00.000Z",
      patientFirstName: null,
      patientLastName: null,
      patientEmail: null,
    };
    const result = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload },
      deps
    );
    expect(result.accepted).toBe(true);
    expect(mockUsers.ensureClientFromAppointmentProjection).toHaveBeenCalledWith({
      phoneNormalized: "+79119975939",
      integratorUserId: null,
      displayName: "Карина Викторовна Прокопенкова",
      firstName: null,
      lastName: null,
      email: null,
    });
  });

  it("idempotent: duplicate appointment.record.upserted both accepted and upsert called twice", async () => {
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const depsIdem: IntegratorEventsDeps = { ...mockDeps, appointmentProjection: mockAp };
    const payload = {
      integratorRecordId: "rec-idem-1",
      phoneNormalized: "+79991112233",
      recordAt: "2025-08-01T12:00:00.000Z",
      status: "created",
      payloadJson: {},
      lastEvent: "event-create",
      updatedAt: "2025-07-01T10:00:00.000Z",
    };
    const r1 = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload },
      depsIdem
    );
    const r2 = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload },
      depsIdem
    );
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
    expect(mockAp.upsertRecordFromProjection).toHaveBeenCalledTimes(2);
    const expectedArg = {
      integratorRecordId: "rec-idem-1",
      phoneNormalized: "+79991112233",
      recordAt: "2025-08-01T12:00:00.000Z",
      status: "created",
      payloadJson: {},
      lastEvent: "event-create",
      updatedAt: "2025-07-01T10:00:00.000Z",
      branchId: null,
    };
    expect(mockAp.upsertRecordFromProjection).toHaveBeenNthCalledWith(1, expectedArg);
    expect(mockAp.upsertRecordFromProjection).toHaveBeenNthCalledWith(2, expectedArg);
  });

  it("appointment.record.upserted calls applyRubitimeUpdate with mapped status and null slotEnd", async () => {
    const applyRubitimeUpdate = vi.fn().mockResolvedValue(undefined);
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const stubPatientBooking = {
      getSlots: vi.fn().mockResolvedValue([]),
      createBooking: vi.fn(),
      cancelBooking: vi.fn(),
      listMyBookings: vi.fn().mockResolvedValue({ upcoming: [], history: [] }),
      applyRubitimeUpdate,
    };
    const deps: IntegratorEventsDeps = {
      ...mockDeps,
      appointmentProjection: mockAp,
      patientBooking: stubPatientBooking,
    };

    const testCases: Array<{ rubiStatus: string; expectedStatus: string }> = [
      { rubiStatus: "cancel_requested", expectedStatus: "cancelled" },
      { rubiStatus: "rescheduled", expectedStatus: "rescheduled" },
      { rubiStatus: "completed", expectedStatus: "completed" },
      { rubiStatus: "no_show", expectedStatus: "no_show" },
      { rubiStatus: "created", expectedStatus: "confirmed" },
      { rubiStatus: "updated", expectedStatus: "confirmed" },
    ];

    for (const { rubiStatus, expectedStatus } of testCases) {
      applyRubitimeUpdate.mockClear();
      await handleIntegratorEvent(
        {
          eventType: "appointment.record.upserted",
          payload: {
            integratorRecordId: "rec-status-test",
            status: rubiStatus,
            recordAt: "2025-08-01T12:00:00.000Z",
          },
        },
        deps,
      );
      expect(applyRubitimeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          rubitimeId: "rec-status-test",
          status: expectedStatus,
          slotStart: "2025-08-01T12:00:00.000Z",
          slotEnd: null,
        }),
      );
    }
  });

  it("appointment.record.upserted accepts update (e.g. status cancelled) and calls upsert with new payload", async () => {
    const mockAp = {
      getRecordByIntegratorId: vi.fn(),
      listActiveByPhoneNormalized: vi.fn(),
      upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined),
      listHistoryByPhoneNormalized: vi.fn().mockResolvedValue([]),
      softDeleteByIntegratorId: vi.fn().mockResolvedValue(false),
    };
    const depsIdem: IntegratorEventsDeps = { ...mockDeps, appointmentProjection: mockAp };
    const createPayload = {
      integratorRecordId: "rec-update-1",
      phoneNormalized: "+79991112233",
      recordAt: "2025-08-01T12:00:00.000Z",
      status: "created",
      payloadJson: {},
      lastEvent: "event-create",
      updatedAt: "2025-07-01T10:00:00.000Z",
    };
    const updatePayload = {
      ...createPayload,
      status: "cancelled",
      lastEvent: "event-cancel",
      updatedAt: "2025-07-02T14:00:00.000Z",
    };
    const r1 = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload: createPayload },
      depsIdem
    );
    const r2 = await handleIntegratorEvent(
      { eventType: "appointment.record.upserted", payload: updatePayload },
      depsIdem
    );
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
    expect(mockAp.upsertRecordFromProjection).toHaveBeenCalledTimes(2);
    expect(mockAp.upsertRecordFromProjection).toHaveBeenNthCalledWith(1, {
      ...createPayload,
      branchId: null,
    });
    expect(mockAp.upsertRecordFromProjection).toHaveBeenNthCalledWith(2, {
      ...updatePayload,
      branchId: null,
    });
  });

  it("idempotent: duplicate reminder.rule.upserted returns accepted", async () => {
    const payload = {
      integratorRuleId: "rule-idem-1",
      integratorUserId: "43",
      category: "water",
      isEnabled: false,
      scheduleType: "twice_daily",
      timezone: "UTC",
      intervalMinutes: 120,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
      updatedAt: "2025-03-01T10:00:00.000Z",
    };
    const r1 = await handleIntegratorEvent({ eventType: "reminder.rule.upserted", payload }, depsWithRp);
    const r2 = await handleIntegratorEvent({ eventType: "reminder.rule.upserted", payload }, depsWithRp);
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });

  it("falls through to not-implemented when reminderProjection dep missing", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "reminder.rule.upserted",
        payload: {
          integratorRuleId: "r1",
          integratorUserId: "42",
          category: "exercise",
          isEnabled: true,
          scheduleType: "daily",
          timezone: "UTC",
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: "1111111",
          contentMode: "none",
          updatedAt: new Date().toISOString(),
        },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });
});

describe("handleIntegratorEvent: Stage 11 subscription/mailing projection ingest", () => {
  const smp = inMemorySubscriptionMailingProjectionPort;
  const depsWithSmp: IntegratorEventsDeps = { ...mockDeps, subscriptionMailingProjection: smp };

  it("accepts mailing.topic.upserted", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "mailing.topic.upserted",
        payload: {
          integratorTopicId: 100,
          code: "news",
          title: "News",
          key: "news",
          isActive: true,
          updatedAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects mailing.topic.upserted without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "mailing.topic.upserted",
        payload: { integratorTopicId: 100, code: "news" },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorTopicId, code, title, key required");
  });

  it("calls upsertTopicFromProjection with payload when mailing.topic.upserted", async () => {
    const upsertSpy = vi.spyOn(smp, "upsertTopicFromProjection").mockResolvedValue();
    try {
      const payload = {
        integratorTopicId: 101,
        code: "alerts",
        title: "Alerts",
        key: "alerts",
        isActive: false,
        updatedAt: "2025-03-02T12:00:00.000Z",
      };
      const result = await handleIntegratorEvent(
        { eventType: "mailing.topic.upserted", payload },
        depsWithSmp
      );
      expect(result.accepted).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        integratorTopicId: 101,
        code: "alerts",
        title: "Alerts",
        key: "alerts",
        isActive: false,
        updatedAt: "2025-03-02T12:00:00.000Z",
      });
    } finally {
      upsertSpy.mockRestore();
    }
  });

  it("accepts user.subscription.upserted", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "user.subscription.upserted",
        payload: {
          integratorUserId: 1,
          integratorTopicId: 100,
          isActive: true,
          updatedAt: "2025-03-01T10:00:00.000Z",
        },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects user.subscription.upserted without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "user.subscription.upserted",
        payload: { integratorUserId: 1 },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorUserId, integratorTopicId required");
  });

  it("calls upsertUserSubscriptionFromProjection with payload when user.subscription.upserted", async () => {
    const upsertSpy = vi.spyOn(smp, "upsertUserSubscriptionFromProjection").mockResolvedValue();
    try {
      const payload = {
        integratorUserId: 2,
        integratorTopicId: 100,
        isActive: false,
        updatedAt: "2025-03-02T14:00:00.000Z",
      };
      const result = await handleIntegratorEvent(
        { eventType: "user.subscription.upserted", payload },
        depsWithSmp
      );
      expect(result.accepted).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        integratorUserId: 2,
        integratorTopicId: 100,
        isActive: false,
        updatedAt: "2025-03-02T14:00:00.000Z",
      });
    } finally {
      upsertSpy.mockRestore();
    }
  });

  it("accepts mailing.log.sent", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "mailing.log.sent",
        payload: {
          integratorUserId: 1,
          integratorMailingId: 200,
          status: "sent",
          sentAt: "2025-03-01T12:00:00.000Z",
          errorText: null,
        },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects mailing.log.sent without required fields", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "mailing.log.sent",
        payload: { integratorUserId: 1, integratorMailingId: 200 },
      },
      depsWithSmp
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("integratorUserId, integratorMailingId, status required");
  });

  it("calls appendMailingLogFromProjection with payload when mailing.log.sent", async () => {
    const appendSpy = vi.spyOn(smp, "appendMailingLogFromProjection").mockResolvedValue();
    try {
      const payload = {
        integratorUserId: 3,
        integratorMailingId: 201,
        status: "failed",
        sentAt: "2025-03-02T15:00:00.000Z",
        errorText: "timeout",
      };
      const result = await handleIntegratorEvent(
        { eventType: "mailing.log.sent", payload },
        depsWithSmp
      );
      expect(result.accepted).toBe(true);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledWith({
        integratorUserId: 3,
        integratorMailingId: 201,
        status: "failed",
        sentAt: "2025-03-02T15:00:00.000Z",
        errorText: "timeout",
      });
    } finally {
      appendSpy.mockRestore();
    }
  });

  it("falls through to not-implemented when subscriptionMailingProjection dep missing", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "mailing.topic.upserted",
        payload: {
          integratorTopicId: 100,
          code: "news",
          title: "News",
          key: "news",
          isActive: true,
          updatedAt: "2025-03-01T10:00:00.000Z",
        },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });

  it("accepts user.email.autobind and calls applyRubitimeEmailAutobind", async () => {
    const applyRubitimeEmailAutobind = vi.fn().mockResolvedValue({ outcome: "applied" });
    const result = await handleIntegratorEvent(
      {
        eventType: "user.email.autobind",
        payload: { phoneNormalized: "+79991112233", email: "a@b.co" },
      },
      {
        ...mockDeps,
        users: {
          upsertFromProjection: vi.fn(),
          findByIntegratorId: vi.fn(),
          updatePhone: vi.fn(),
          updateProfileByPhone: vi.fn(),
          applyRubitimeEmailAutobind,
        },
      }
    );
    expect(result.accepted).toBe(true);
    expect(applyRubitimeEmailAutobind).toHaveBeenCalledWith({
      phoneNormalized: "+79991112233",
      email: "a@b.co",
    });
  });
});
