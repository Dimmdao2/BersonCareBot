/**
 * Domain handling for integrator webhook events (POST /api/integrator/events).
 * Parsed body shape per contracts/integrator-events-body.json.
 * Deps are injected by the route; this module must not import buildAppDeps.
 */
import type { ReminderProjectionPort } from "@/infra/repos/pgReminderProjection";
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import type { AppointmentProjectionPort } from "@/infra/repos/pgAppointmentProjection";
import type { SubscriptionMailingProjectionPort } from "@/infra/repos/pgSubscriptionMailingProjection";
import type { BranchesProjectionPort } from "@/infra/repos/pgBranches";
import type { PatientBookingService } from "@/modules/patient-booking/ports";
import { mapRubitimeStatusToPatientBookingStatus } from "@/infra/repos/pgPatientBookings";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

const REMINDER_RULE_UPSERTED = "reminder.rule.upserted";
const REMINDER_OCCURRENCE_FINALIZED = "reminder.occurrence.finalized";
const REMINDER_DELIVERY_LOGGED = "reminder.delivery.logged";
const CONTENT_ACCESS_GRANTED = "content.access.granted";
const APPOINTMENT_RECORD_UPSERTED = "appointment.record.upserted";
const MAILING_TOPIC_UPSERTED = "mailing.topic.upserted";
const USER_SUBSCRIPTION_UPSERTED = "user.subscription.upserted";
const MAILING_LOG_SENT = "mailing.log.sent";

type EmailAutobindConflictContext = {
  phoneNormalized: string;
  email: string;
};

/**
 * TODO(AUDIT-BACKLOG-020): connect to admin/user notifications pipeline (legacy E-R3.2).
 * For now we keep structured warning to avoid silent conflicts.
 */
let reportEmailAutobindConflict: (ctx: EmailAutobindConflictContext) => void = (ctx) => {
  console.warn("[user.email.autobind:conflict]", ctx);
};

export function setEmailAutobindConflictReporter(
  fn: (ctx: EmailAutobindConflictContext) => void
): void {
  reportEmailAutobindConflict = fn;
}

export type IntegratorEventBody = {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type IntegratorHandleResult = {
  accepted: boolean;
  reason?: string;
  /** When `accepted` is false: `false` = permanent validation/business error (HTTP 422). Omitted/`true` = retry (503). */
  retryable?: boolean;
};

/** Narrow deps for event handling; supplied by the route from buildAppDeps(). */
export type IntegratorEventsDeps = {
  diaries: {
    createSymptomTracking: (params: {
      userId: string;
      symptomKey?: string | null;
      symptomTitle: string;
      symptomTypeRefId?: string | null;
      regionRefId?: string | null;
      side?: "left" | "right" | "both" | null;
      diagnosisText?: string | null;
      diagnosisRefId?: string | null;
      stageRefId?: string | null;
    }) => Promise<unknown>;
    createLfkComplex: (params: {
      userId: string;
      title: string;
      origin?: "manual" | "assigned_by_specialist";
    }) => Promise<unknown>;
    addLfkSession: (params: {
      userId: string;
      complexId: string;
      completedAt?: string;
      source: "bot" | "webapp";
      recordedAt?: string | null;
      durationMinutes?: number | null;
      difficulty0_10?: number | null;
      pain0_10?: number | null;
      comment?: string | null;
    }) => Promise<unknown>;
    addSymptomEntry: (params: {
      userId: string;
      trackingId: string;
      value0_10: number;
      entryType: "daily" | "instant";
      recordedAt: string;
      source: "bot" | "webapp";
      notes: string | null;
    }) => Promise<unknown>;
  };
  users?: {
    upsertFromProjection: (params: {
      integratorUserId: string;
      phoneNormalized?: string;
      displayName?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      channelCode?: string;
      externalId?: string;
    }) => Promise<{ platformUserId: string }>;
    findByIntegratorId: (integratorUserId: string) => Promise<{ platformUserId: string } | null>;
    findByPhone?: (phoneNormalized: string) => Promise<{ platformUserId: string } | null>;
    updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
    updateProfileByPhone: (params: {
      phoneNormalized: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      displayName?: string | null;
    }) => Promise<void>;
    /** Rubitime: ensure `platform_users` row exists for appointment phone (create / enrich / merge). */
    ensureClientFromAppointmentProjection?: (params: {
      phoneNormalized: string;
      integratorUserId?: string | null;
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    }) => Promise<{ platformUserId: string }>;
    applyRubitimeEmailAutobind?: (params: {
      phoneNormalized: string;
      email: string;
    }) => Promise<{
      outcome: "applied" | "skipped_no_user" | "skipped_invalid_email" | "skipped_verified" | "skipped_conflict";
    }>;
  };
  branches?: BranchesProjectionPort;
  preferences?: {
    upsertNotificationTopics: (params: {
      platformUserId: string;
      topics: { topicCode: string; isEnabled: boolean }[];
    }) => Promise<void>;
  };
  supportCommunication?: SupportCommunicationPort;
  reminderProjection?: ReminderProjectionPort;
  appointmentProjection?: AppointmentProjectionPort;
  patientBooking?: Pick<PatientBookingService, "applyRubitimeUpdate">;
  subscriptionMailingProjection?: SubscriptionMailingProjectionPort;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

/** Accepts both string and number for backward compat; returns string or null. */
function coerceToString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Integer fields from JSON may arrive as strings; reject non-finite values. */
function coerceToFiniteInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export async function handleIntegratorEvent(
  event: IntegratorEventBody,
  deps: IntegratorEventsDeps
): Promise<IntegratorHandleResult> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[integrator] event received", event.eventType, event.eventId ?? "");
  }

  if (event.eventType === "diary.symptom.tracking.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.symptom.tracking.created: payload.userId required" };
    }
    const symptomTitle = payload.symptomTitle;
    if (!isNonEmptyString(symptomTitle)) {
      return { accepted: false, reason: "diary.symptom.tracking.created: payload.symptomTitle required" };
    }
    try {
      await deps.diaries.createSymptomTracking({
        userId,
        symptomKey: typeof payload.symptomKey === "string" ? payload.symptomKey : null,
        symptomTitle: symptomTitle.trim(),
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.symptom.tracking.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.lfk.complex.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.lfk.complex.created: payload.userId required" };
    }
    const title = payload.title;
    if (!isNonEmptyString(title)) {
      return { accepted: false, reason: "diary.lfk.complex.created: payload.title required" };
    }
    try {
      await deps.diaries.createLfkComplex({
        userId,
        title: (title as string).trim(),
        origin: payload.origin === "assigned_by_specialist" ? "assigned_by_specialist" : "manual",
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.lfk.complex.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.lfk.session.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.lfk.session.created: payload.userId required" };
    }
    const complexId = payload.complexId;
    if (!isNonEmptyString(complexId)) {
      return { accepted: false, reason: "diary.lfk.session.created: payload.complexId required" };
    }
    const completedAt = payload.completedAt;
    const completedAtStr = typeof completedAt === "string" ? completedAt : new Date().toISOString();
    try {
      await deps.diaries.addLfkSession({
        userId,
        complexId,
        completedAt: completedAtStr,
        source: "bot",
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.lfk.session.created: ${reason}` };
    }
  }

  if (event.eventType === "diary.symptom.entry.created") {
    const payload = event.payload ?? {};
    const userId = payload.userId;
    if (!isNonEmptyString(userId)) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.userId required" };
    }
    const trackingId = payload.trackingId;
    if (!isNonEmptyString(trackingId)) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.trackingId required" };
    }
    const value0_10 = payload.value0_10 ?? payload.value_0_10;
    const num = typeof value0_10 === "number" ? value0_10 : Number(value0_10);
    if (Number.isNaN(num) || num < 0 || num > 10) {
      return { accepted: false, reason: "diary.symptom.entry.created: payload.value0_10 must be 0..10" };
    }
    const entryType = payload.entryType === "daily" ? "daily" : "instant";
    const recordedAt = payload.recordedAt;
    const recordedAtStr = typeof recordedAt === "string" ? recordedAt : new Date().toISOString();
    try {
      await deps.diaries.addSymptomEntry({
        userId,
        trackingId,
        value0_10: Math.round(num),
        entryType,
        recordedAt: recordedAtStr,
        source: "bot",
        notes: typeof payload.notes === "string" ? payload.notes : null,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `diary.symptom.entry.created: ${reason}` };
    }
  }

  if (event.eventType === "user.upserted") {
    const payload = event.payload ?? {};
    const integratorUserId = coerceToString(payload.integratorUserId);
    if (integratorUserId === null) {
      return { accepted: false, reason: "user.upserted: payload.integratorUserId required" };
    }
    if (!deps.users) {
      return { accepted: false, reason: "user.upserted: users dep not available" };
    }
    try {
      await deps.users.upsertFromProjection({
        integratorUserId,
        phoneNormalized: typeof payload.phoneNormalized === "string" ? payload.phoneNormalized : undefined,
        displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
        channelCode: typeof payload.channelCode === "string" ? payload.channelCode : undefined,
        externalId: typeof payload.externalId === "string" ? payload.externalId : undefined,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `user.upserted: ${reason}` };
    }
  }

  if (event.eventType === "contact.linked") {
    const payload = event.payload ?? {};
    const integratorUserId = coerceToString(payload.integratorUserId);
    const phoneNormalized = typeof payload.phoneNormalized === "string" ? payload.phoneNormalized : null;
    const channelCode = typeof payload.channelCode === "string" ? payload.channelCode : undefined;
    const externalId = typeof payload.externalId === "string" ? payload.externalId : undefined;
    if (integratorUserId === null || !phoneNormalized) {
      return { accepted: false, reason: "contact.linked: integratorUserId and phoneNormalized required" };
    }
    if (!deps.users) {
      return { accepted: false, reason: "contact.linked: users dep not available" };
    }
    try {
      const { platformUserId } = await deps.users.upsertFromProjection({
        integratorUserId,
        phoneNormalized,
        channelCode,
        externalId,
      });
      await deps.users.updatePhone(platformUserId, phoneNormalized);
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `contact.linked: ${reason}` };
    }
  }

  if (event.eventType === "preferences.updated") {
    const payload = event.payload ?? {};
    const integratorUserId = coerceToString(payload.integratorUserId);
    if (integratorUserId === null) {
      return { accepted: false, reason: "preferences.updated: integratorUserId required" };
    }
    if (!deps.users || !deps.preferences) {
      return { accepted: false, reason: "preferences.updated: users/preferences deps not available" };
    }
    const topics = Array.isArray(payload.topics) ? payload.topics : [];
    const validTopics = topics.filter(
      (t: unknown): t is { topicCode: string; isEnabled: boolean } =>
        typeof t === "object" && t !== null &&
        typeof (t as Record<string, unknown>).topicCode === "string" &&
        typeof (t as Record<string, unknown>).isEnabled === "boolean"
    );
    if (validTopics.length === 0) {
      return { accepted: false, reason: "preferences.updated: topics array with topicCode+isEnabled required" };
    }
    try {
      const { platformUserId } = await deps.users.upsertFromProjection({
        integratorUserId,
      });
      await deps.preferences.upsertNotificationTopics({
        platformUserId,
        topics: validTopics,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `preferences.updated: ${reason}` };
    }
  }

  // --- Stage 5: support communication history ingest ---
  const sc = deps.supportCommunication;

  if (sc && event.eventType === "support.conversation.opened") {
    const p = event.payload ?? {};
    const id = coerceToString(p.integratorConversationId);
    const openedAt = typeof p.openedAt === "string" ? p.openedAt : "";
    const lastMessageAt = typeof p.lastMessageAt === "string" ? p.lastMessageAt : openedAt;
    if (!id || !openedAt) return { accepted: false, reason: "support.conversation.opened: integratorConversationId, openedAt required" };
    try {
      await sc.upsertConversationFromProjection({
        integratorConversationId: id,
        integratorUserId: coerceToString(p.integratorUserId),
        source: typeof p.source === "string" ? p.source : "telegram",
        adminScope: typeof p.adminScope === "string" ? p.adminScope : "",
        status: typeof p.status === "string" ? p.status : "open",
        openedAt,
        lastMessageAt,
        closedAt: typeof p.closedAt === "string" ? p.closedAt : null,
        closeReason: typeof p.closeReason === "string" ? p.closeReason : null,
        channelCode: typeof p.channelCode === "string" ? p.channelCode : null,
        channelExternalId: typeof p.channelExternalId === "string" ? p.channelExternalId : null,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.conversation.opened: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.conversation.message.appended") {
    const p = event.payload ?? {};
    const msgId = coerceToString(p.integratorMessageId);
    const convId = coerceToString(p.integratorConversationId);
    const text = typeof p.text === "string" ? p.text : "";
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    if (!msgId || !convId) return { accepted: false, reason: "support.conversation.message.appended: required fields missing" };
    try {
      await sc.appendConversationMessageFromProjection({
        integratorMessageId: msgId,
        integratorConversationId: convId,
        senderRole: typeof p.senderRole === "string" ? p.senderRole : "user",
        messageType: typeof p.messageType === "string" ? p.messageType : "text",
        text: text || "[empty]",
        source: typeof p.source === "string" ? p.source : "telegram",
        externalChatId: typeof p.externalChatId === "string" ? p.externalChatId : null,
        externalMessageId: typeof p.externalMessageId === "string" ? p.externalMessageId : null,
        deliveryStatus: typeof p.deliveryStatus === "string" ? p.deliveryStatus : null,
        createdAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.conversation.message.appended: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.conversation.status.changed") {
    const p = event.payload ?? {};
    const id = coerceToString(p.integratorConversationId);
    const status = typeof p.status === "string" ? p.status : "";
    if (!id || !status) return { accepted: false, reason: "support.conversation.status.changed: integratorConversationId, status required" };
    try {
      await sc.setConversationStatusFromProjection({
        integratorConversationId: id,
        status,
        lastMessageAt: typeof p.lastMessageAt === "string" ? p.lastMessageAt : null,
        closedAt: typeof p.closedAt === "string" ? p.closedAt : null,
        closeReason: typeof p.closeReason === "string" ? p.closeReason : null,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.conversation.status.changed: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.question.created") {
    const p = event.payload ?? {};
    const qId = coerceToString(p.integratorQuestionId);
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    if (!qId) return { accepted: false, reason: "support.question.created: integratorQuestionId required" };
    try {
      await sc.upsertQuestionFromProjection({
        integratorQuestionId: qId,
        integratorConversationId: coerceToString(p.integratorConversationId),
        status: typeof p.status === "string" ? p.status : "open",
        createdAt,
        answeredAt: typeof p.answeredAt === "string" ? p.answeredAt : null,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.question.created: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.question.message.appended") {
    const p = event.payload ?? {};
    const qmId = coerceToString(p.integratorQuestionMessageId);
    const qId = coerceToString(p.integratorQuestionId);
    const text = typeof p.text === "string" ? p.text : "";
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    if (!qmId || !qId) return { accepted: false, reason: "support.question.message.appended: required fields missing" };
    try {
      await sc.appendQuestionMessageFromProjection({
        integratorQuestionMessageId: qmId,
        integratorQuestionId: qId,
        senderRole: typeof p.senderRole === "string" ? p.senderRole : "user",
        text: text || "[empty]",
        createdAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.question.message.appended: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.question.answered") {
    const p = event.payload ?? {};
    const qId = coerceToString(p.integratorQuestionId);
    const answeredAt = typeof p.answeredAt === "string" ? p.answeredAt : "";
    if (!qId || !answeredAt) return { accepted: false, reason: "support.question.answered: integratorQuestionId, answeredAt required" };
    try {
      await sc.upsertQuestionFromProjection({
        integratorQuestionId: qId,
        integratorConversationId: null,
        status: "answered",
        createdAt: answeredAt,
        answeredAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.question.answered: ${reason}` };
    }
  }

  if (sc && event.eventType === "support.delivery.attempt.logged") {
    const p = event.payload ?? {};
    const channelCode = typeof p.channelCode === "string" ? p.channelCode : "";
    const status = typeof p.status === "string" ? p.status : "failed";
    const attempt = typeof p.attempt === "number" && Number.isFinite(p.attempt) ? Math.trunc(p.attempt) : 1;
    const occurredAt = typeof p.occurredAt === "string" ? p.occurredAt : new Date().toISOString();
    const payloadJson = typeof p.payloadJson === "object" && p.payloadJson !== null ? (p.payloadJson as Record<string, unknown>) : {};
    try {
      await sc.appendDeliveryEventFromProjection({
        conversationMessageId: null,
        integratorIntentEventId: typeof p.intentEventId === "string" ? p.intentEventId : null,
        correlationId: typeof p.correlationId === "string" ? p.correlationId : null,
        channelCode: channelCode || "unknown",
        status,
        attempt: attempt > 0 ? attempt : 1,
        reason: typeof p.reason === "string" ? p.reason : null,
        payloadJson,
        occurredAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `support.delivery.attempt.logged: ${reason}` };
    }
  }

  // --- Stage 7: reminders + content access projection ingest ---
  const rp = deps.reminderProjection;

  if (rp && event.eventType === REMINDER_RULE_UPSERTED) {
    const p = event.payload ?? {};
    const integratorRuleId = coerceToString(p.integratorRuleId);
    const integratorUserId = coerceToString(p.integratorUserId);
    const category = typeof p.category === "string" ? p.category : "";
    const updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString();
    const intervalMinutes = coerceToFiniteInt(p.intervalMinutes);
    const windowStartMinute = coerceToFiniteInt(p.windowStartMinute);
    const windowEndMinute = coerceToFiniteInt(p.windowEndMinute);
    if (
      !integratorRuleId ||
      !integratorUserId ||
      !category ||
      typeof p.isEnabled !== "boolean" ||
      typeof p.scheduleType !== "string" ||
      typeof p.timezone !== "string" ||
      intervalMinutes === null ||
      windowStartMinute === null ||
      windowEndMinute === null ||
      typeof p.daysMask !== "string" ||
      typeof p.contentMode !== "string"
    ) {
      return { accepted: false, reason: "reminder.rule.upserted: required payload fields missing" };
    }
    try {
      await rp.upsertRuleFromProjection({
        integratorRuleId,
        integratorUserId,
        category,
        isEnabled: p.isEnabled,
        scheduleType: p.scheduleType,
        timezone: p.timezone,
        intervalMinutes,
        windowStartMinute,
        windowEndMinute,
        daysMask: p.daysMask,
        contentMode: p.contentMode,
        updatedAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `reminder.rule.upserted: ${reason}` };
    }
  }

  if (rp && event.eventType === REMINDER_OCCURRENCE_FINALIZED) {
    const p = event.payload ?? {};
    const integratorOccurrenceId = coerceToString(p.integratorOccurrenceId);
    const integratorRuleId = coerceToString(p.integratorRuleId);
    const integratorUserId = coerceToString(p.integratorUserId);
    const category = typeof p.category === "string" ? p.category : "";
    const status = p.status === "sent" || p.status === "failed" ? p.status : null;
    const occurredAt = typeof p.occurredAt === "string" ? p.occurredAt : new Date().toISOString();
    if (!integratorOccurrenceId || !integratorRuleId || !integratorUserId || !category || !status) {
      return { accepted: false, reason: "reminder.occurrence.finalized: required payload fields missing" };
    }
    try {
      await rp.appendFinalizedOccurrenceFromProjection({
        integratorOccurrenceId,
        integratorRuleId,
        integratorUserId,
        category,
        status,
        deliveryChannel: typeof p.deliveryChannel === "string" ? p.deliveryChannel : null,
        errorCode: typeof p.errorCode === "string" ? p.errorCode : null,
        occurredAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `reminder.occurrence.finalized: ${reason}` };
    }
  }

  if (rp && event.eventType === REMINDER_DELIVERY_LOGGED) {
    const p = event.payload ?? {};
    const integratorDeliveryLogId = coerceToString(p.integratorDeliveryLogId);
    const integratorOccurrenceId = coerceToString(p.integratorOccurrenceId);
    const integratorRuleId = coerceToString(p.integratorRuleId);
    const integratorUserId = coerceToString(p.integratorUserId);
    const channel = typeof p.channel === "string" ? p.channel : "";
    const status = typeof p.status === "string" ? p.status : "";
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    const payloadJson = typeof p.payloadJson === "object" && p.payloadJson !== null ? (p.payloadJson as Record<string, unknown>) : {};
    if (
      !integratorDeliveryLogId ||
      !integratorOccurrenceId ||
      !integratorRuleId ||
      !integratorUserId ||
      !channel ||
      !status
    ) {
      return { accepted: false, reason: "reminder.delivery.logged: required payload fields missing" };
    }
    try {
      await rp.appendDeliveryEventFromProjection({
        integratorDeliveryLogId,
        integratorOccurrenceId,
        integratorRuleId,
        integratorUserId,
        channel,
        status,
        errorCode: typeof p.errorCode === "string" ? p.errorCode : null,
        payloadJson,
        createdAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `reminder.delivery.logged: ${reason}` };
    }
  }

  if (rp && event.eventType === CONTENT_ACCESS_GRANTED) {
    const p = event.payload ?? {};
    const integratorGrantId = coerceToString(p.integratorGrantId);
    const integratorUserId = coerceToString(p.integratorUserId);
    const contentId = typeof p.contentId === "string" ? p.contentId : "";
    const purpose = typeof p.purpose === "string" ? p.purpose : "";
    const expiresAt = typeof p.expiresAt === "string" ? p.expiresAt : "";
    const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    const metaJson = typeof p.metaJson === "object" && p.metaJson !== null ? (p.metaJson as Record<string, unknown>) : {};
    if (!integratorGrantId || !integratorUserId || !contentId || !purpose || !expiresAt) {
      return { accepted: false, reason: "content.access.granted: required payload fields missing" };
    }
    try {
      await rp.upsertContentAccessGrantFromProjection({
        integratorGrantId,
        integratorUserId,
        contentId,
        purpose,
        tokenHash: typeof p.tokenHash === "string" ? p.tokenHash : null,
        expiresAt,
        revokedAt: typeof p.revokedAt === "string" ? p.revokedAt : null,
        metaJson,
        createdAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `content.access.granted: ${reason}` };
    }
  }

  const ap = deps.appointmentProjection;
  if (ap && event.eventType === APPOINTMENT_RECORD_UPSERTED) {
    const p = event.payload ?? {};
    const integratorRecordId = coerceToString(p.integratorRecordId);
    const status = typeof p.status === "string" ? p.status : "";
    if (!integratorRecordId || !status) {
      return {
        accepted: false,
        reason: "appointment.record.upserted: required payload fields missing",
        retryable: false,
      };
    }
    const phoneRaw = coerceToString(p.phoneNormalized) ?? null;
    const phoneNormalized = phoneRaw ? normalizeRuPhoneE164(phoneRaw.trim()) : null;
    const recordAt = typeof p.recordAt === "string" ? p.recordAt : null;
    const payloadJson =
      typeof p.payloadJson === "object" && p.payloadJson !== null
        ? (p.payloadJson as Record<string, unknown>)
        : {};
    const lastEvent = typeof p.lastEvent === "string" ? p.lastEvent : "";
    const updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString();
    const patientFirstName = coerceToString(p.patientFirstName) ?? null;
    const patientLastName = coerceToString(p.patientLastName) ?? null;
    const patientEmail = coerceToString(p.patientEmail) ?? null;
    const integratorBranchId = coerceToString(p.integratorBranchId) ?? null;
    const branchName = coerceToString(p.branchName) ?? null;

    let branchId: string | null = null;
    if (deps.branches && integratorBranchId) {
      const { branchId: id } = await deps.branches.upsertFromProjection({
        integratorBranchId,
        name: branchName,
      });
      branchId = id;
    }

    const fullNameFromPayload =
      typeof payloadJson.name === "string" && payloadJson.name.trim().length > 0
        ? payloadJson.name.trim()
        : null;

    let ensuredPlatformUserId: string | null = null;
    if (phoneNormalized && deps.users?.ensureClientFromAppointmentProjection) {
      const integratorUserIdTop =
        coerceToString(p.integratorUserId) ??
        coerceToString(payloadJson.integratorUserId) ??
        coerceToString(payloadJson.integrator_user_id);
      const displayNameForEnsure =
        fullNameFromPayload ||
        [patientLastName, patientFirstName].filter(Boolean).join(" ").trim() ||
        null;
      try {
        const ensured = await deps.users.ensureClientFromAppointmentProjection({
          phoneNormalized,
          integratorUserId: integratorUserIdTop,
          displayName: displayNameForEnsure,
          firstName: patientFirstName,
          lastName: patientLastName,
          email: patientEmail,
        });
        ensuredPlatformUserId = ensured.platformUserId;
      } catch (err) {
        if (err instanceof MergeConflictError || err instanceof MergeDependentConflictError) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            accepted: false,
            reason: `appointment.record.upserted: ${msg}`,
            retryable: true,
          };
        }
        throw err;
      }
    }

    try {
      await ap.upsertRecordFromProjection({
        integratorRecordId,
        phoneNormalized,
        recordAt,
        status,
        payloadJson,
        lastEvent,
        updatedAt,
        branchId,
      });
      const rubitimeId = integratorRecordId;
      // Extract enriched fields for compat-sync create path (Stage 11).
      // Top-level fields from projection payload take precedence over payloadJson fallbacks.
      const payloadServiceTitle =
        coerceToString(p.serviceName) ??
        coerceToString(payloadJson.service_name) ??
        coerceToString(payloadJson.service_title);
      const payloadSlotEnd =
        coerceToString(p.dateTimeEnd) ??
        coerceToString(payloadJson.datetime_end) ??
        coerceToString(payloadJson.date_time_end);
      const rawPayloadPhone = phoneNormalized ?? coerceToString(payloadJson.phone);
      const payloadPhone = rawPayloadPhone ? normalizeRuPhoneE164(String(rawPayloadPhone).trim()) : null;
      const payloadContactName =
        coerceToString(p.patientFirstName) ??
        coerceToString(payloadJson.name) ??
        ([coerceToString(p.patientLastName), coerceToString(p.patientFirstName)].filter(Boolean).join(" ") || null);

      // Resolve userId for compat-create linking (best-effort).
      let resolvedUserId: string | null = ensuredPlatformUserId;
      if (!resolvedUserId && deps.users && payloadPhone) {
        try {
          const foundByPhone = await deps.users.findByPhone?.(payloadPhone);
          resolvedUserId = foundByPhone?.platformUserId ?? null;
        } catch {
          // best-effort
        }
      }
      if (!resolvedUserId && deps.users) {
        const integratorUserId =
          coerceToString(p.integratorUserId) ??
          coerceToString(payloadJson.integratorUserId) ??
          coerceToString(payloadJson.integrator_user_id);
        if (integratorUserId) {
          try {
            const foundByIntegratorId = await deps.users.findByIntegratorId(integratorUserId);
            resolvedUserId = foundByIntegratorId?.platformUserId ?? null;
          } catch {
            // best-effort
          }
        }
      }

      const rubitimeCooperatorId =
        coerceToString(p.rubitimeCooperatorId) ??
        coerceToString(payloadJson.cooperator_id) ??
        (payloadJson.cooperator_id != null ? String(payloadJson.cooperator_id) : null) ??
        coerceToString(payloadJson.specialist_id) ??
        (payloadJson.specialist_id != null ? String(payloadJson.specialist_id) : null);

      const rubitimeManageUrl =
        coerceToString(p.rubitimeManageUrl) ??
        coerceToString(payloadJson.url) ??
        coerceToString(payloadJson.link) ??
        coerceToString(payloadJson.record_url);

      await deps.patientBooking?.applyRubitimeUpdate({
        rubitimeId,
        status: mapRubitimeStatusToPatientBookingStatus(status),
        slotStart: recordAt ?? null,
        slotEnd: payloadSlotEnd,
        userId: resolvedUserId,
        contactPhone: payloadPhone ?? "",
        contactName: payloadContactName,
        branchTitle: branchName,
        serviceTitle: payloadServiceTitle,
        rubitimeBranchId: integratorBranchId,
        rubitimeServiceId: coerceToString(p.serviceId) ?? coerceToString(payloadJson.service_id),
        rubitimeCooperatorId,
        rubitimeManageUrl,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return {
        accepted: false,
        reason: `appointment.record.upserted: ${reason}`,
        retryable: true,
      };
    }
  }

  // --- Stage 11: subscription/mailing projection ingest ---
  const smp = deps.subscriptionMailingProjection;

  if (smp && event.eventType === MAILING_TOPIC_UPSERTED) {
    const p = event.payload ?? {};
    const integratorTopicId = coerceToFiniteInt(p.integratorTopicId);
    const code = typeof p.code === "string" ? p.code : "";
    const title = typeof p.title === "string" ? p.title : "";
    const key = typeof p.key === "string" ? p.key : "";
    const isActive = typeof p.isActive === "boolean" ? p.isActive : true;
    const updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString();
    if (integratorTopicId === null || !code || !title || !key) {
      return { accepted: false, reason: "mailing.topic.upserted: integratorTopicId, code, title, key required" };
    }
    try {
      await smp.upsertTopicFromProjection({
        integratorTopicId,
        code,
        title,
        key,
        isActive,
        updatedAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `mailing.topic.upserted: ${reason}` };
    }
  }

  if (smp && event.eventType === USER_SUBSCRIPTION_UPSERTED) {
    const p = event.payload ?? {};
    const integratorUserId = coerceToFiniteInt(p.integratorUserId);
    const integratorTopicId = coerceToFiniteInt(p.integratorTopicId);
    const isActive = typeof p.isActive === "boolean" ? p.isActive : true;
    const updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString();
    if (integratorUserId === null || integratorTopicId === null) {
      return { accepted: false, reason: "user.subscription.upserted: integratorUserId, integratorTopicId required" };
    }
    try {
      await smp.upsertUserSubscriptionFromProjection({
        integratorUserId,
        integratorTopicId,
        isActive,
        updatedAt,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `user.subscription.upserted: ${reason}` };
    }
  }

  if (event.eventType === "user.email.autobind") {
    const payload = event.payload ?? {};
    const phoneNormalized =
      typeof payload.phoneNormalized === "string" ? payload.phoneNormalized.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!phoneNormalized || !email) {
      return { accepted: false, reason: "user.email.autobind: phoneNormalized and email required" };
    }
    if (!deps.users?.applyRubitimeEmailAutobind) {
      return { accepted: false, reason: "user.email.autobind: applyRubitimeEmailAutobind not configured" };
    }
    const result = await deps.users.applyRubitimeEmailAutobind({ phoneNormalized, email });
    if (result.outcome === "skipped_conflict") {
      reportEmailAutobindConflict({ phoneNormalized, email });
    }
    return { accepted: true };
  }

  if (smp && event.eventType === MAILING_LOG_SENT) {
    const p = event.payload ?? {};
    const integratorUserId = coerceToFiniteInt(p.integratorUserId);
    const integratorMailingId = coerceToFiniteInt(p.integratorMailingId);
    const status = typeof p.status === "string" ? p.status : "";
    const sentAt = typeof p.sentAt === "string" ? p.sentAt : new Date().toISOString();
    const errorText = typeof p.errorText === "string" ? p.errorText : null;
    if (integratorUserId === null || integratorMailingId === null || !status) {
      return { accepted: false, reason: "mailing.log.sent: integratorUserId, integratorMailingId, status required" };
    }
    try {
      await smp.appendMailingLogFromProjection({
        integratorUserId,
        integratorMailingId,
        status,
        sentAt,
        errorText,
      });
      return { accepted: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      return { accepted: false, reason: `mailing.log.sent: ${reason}` };
    }
  }

  return {
    accepted: false,
    reason: "durable ingest is not implemented",
  };
}
