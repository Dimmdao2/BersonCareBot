/**
 * P19 migration (PLAN S14g — specialist-task reminder web_push leg).
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * the web_push leg now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` handles the actual send + VAPID resolution,
 * covered by the pre-fork redirect chokepoint (G1). G2 guard in
 * `sendWebPushToSubscriptions.ts` is kept intact — it retires in S16 after all legs are
 * migrated.
 *
 * Channel-preference + subscription existence + VAPID availability pre-checks are still
 * performed in the webapp to avoid unnecessary relay calls. The integrator re-reads
 * subscriptions and VAPID at send time; the webapp pre-checks are best-effort guards.
 *
 * `smtpInnerFromValueJson` / SMTP fetch / `vapidSubject` derivation removed — the
 * integrator adapter owns VAPID and resolves the subject from its own system settings.
 *
 * The email leg uses `sendEmailSetupLinkViaIntegrator` (rides S9) — left untouched.
 */
import { logger } from "@/app-layer/logging/logger";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { parseSpecialistTaskReminderChannels } from "./reminderChannels";
import type { SpecialistTaskReminderChannelCode, SpecialistTaskRow } from "./types";

export type NotifySpecialistTaskReminderDeps = {
  getReminderChannels: () => Promise<SpecialistTaskReminderChannelCode[]>;
  getChannelBindings: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
  getProfileEmail: (platformUserId: string) => Promise<string | null>;
  webPushSubscriptions: WebPushSubscriptionsPort;
  /** Still used for VAPID pre-check (ownerHasDeliverableChannel + web_push guard). */
  systemSettings: Pick<SystemSettingsService, "getSetting">;
};

export type SpecialistTaskReminderNotifyResult = {
  /** At least one configured channel delivered successfully. */
  sent: boolean;
  /**
   * Owner cannot be reached on any configured channel (no bindings/email/push).
   * Tick should set `reminder_sent_at` to avoid infinite rescans.
   */
  undeliverable: boolean;
};

function buildReminderText(task: SpecialistTaskRow, patientLabel: string | null): string {
  const lines = ["Напоминание о задаче"];
  if (patientLabel) lines.push(`Пациент: ${patientLabel}`);
  lines.push(task.title);
  if (task.dueAt) {
    const d = new Date(task.dueAt);
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Срок: ${d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`);
    }
  }
  return lines.join("\n");
}

async function ownerHasDeliverableChannel(
  channels: SpecialistTaskReminderChannelCode[],
  ownerId: string,
  deps: NotifySpecialistTaskReminderDeps,
): Promise<boolean> {
  if (channels.length === 0) return false;

  const bindings = await deps.getChannelBindings(ownerId);
  if (channels.includes("telegram") && bindings.telegramId?.trim()) return true;
  if (channels.includes("max") && bindings.maxId?.trim()) return true;

  if (channels.includes("email")) {
    const email = await deps.getProfileEmail(ownerId);
    if (email?.trim()) return true;
  }

  if (channels.includes("web_push")) {
    const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
    if (vapid) {
      const subs = await deps.webPushSubscriptions.listActiveByUserId(ownerId);
      if (subs.length > 0) return true;
    }
  }

  return false;
}

export async function notifySpecialistTaskReminder(
  task: SpecialistTaskRow,
  deps: NotifySpecialistTaskReminderDeps,
  opts?: { patientDisplayName?: string | null },
): Promise<SpecialistTaskReminderNotifyResult> {
  const channels = await deps.getReminderChannels();
  if (channels.length === 0) {
    return { sent: false, undeliverable: true };
  }

  const ownerId = task.ownerUserId;
  const deliverable = await ownerHasDeliverableChannel(channels, ownerId, deps);
  if (!deliverable) {
    return { sent: false, undeliverable: true };
  }

  const text = buildReminderText(task, opts?.patientDisplayName?.trim() || null);
  const bindings = await deps.getChannelBindings(ownerId);
  let sent = false;

  if (channels.includes("telegram") && bindings.telegramId?.trim()) {
    const recipient = bindings.telegramId.trim();
    const result = await relayOutbound({
      messageId: `specialist-task:${task.id}:tg:${recipient}`,
      channel: "telegram",
      recipient,
      text,
      userId: ownerId,
    }).catch((err: unknown) => {
      logger.warn({ err, taskId: task.id }, "specialist task reminder telegram failed");
      return { ok: false as const, reason: "exception" };
    });
    if (result.ok) sent = true;
  }

  if (channels.includes("max") && bindings.maxId?.trim()) {
    const recipient = bindings.maxId.trim();
    const result = await relayOutbound({
      messageId: `specialist-task:${task.id}:max:${recipient}`,
      channel: "max",
      recipient,
      text,
      userId: ownerId,
    }).catch((err: unknown) => {
      logger.warn({ err, taskId: task.id }, "specialist task reminder max failed");
      return { ok: false as const, reason: "exception" };
    });
    if (result.ok) sent = true;
  }

  if (channels.includes("email")) {
    const email = await deps.getProfileEmail(ownerId);
    if (email?.trim()) {
      const { sendEmailSetupLinkViaIntegrator } = await import(
        "@/infra/integrations/email/integratorEmailAdapter"
      );
      const result = await sendEmailSetupLinkViaIntegrator(
        email.trim(),
        "Напоминание о задаче",
        text,
      ).catch((err: unknown) => {
        logger.warn({ err, taskId: task.id }, "specialist task reminder email failed");
        return { ok: false as const, error: "exception" };
      });
      if (result.ok) sent = true;
    }
  }

  if (channels.includes("web_push")) {
    // P19 MIGRATION (PLAN S14g): emit a web_push intent to the integrator via relay-outbound
    // instead of calling sendWebPushToSubscriptions directly (G2-guarded webapp sink).
    // The integrator's WebPushDeliveryAdapter resolves subscriptions + VAPID and performs
    // the actual send, covered by the pre-fork redirect chokepoint (G1).
    // In dev (DEV_DELIVERY_REDIRECT=1), the pre-fork redirect collapses to the telegram
    // test chat — ZERO real webpush.sendNotification calls.
    // G2 guard retired (S16) — 0 live callers, secondary safety layer only.
    const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
    if (vapid) {
      const subs = await deps.webPushSubscriptions.listActiveByUserId(ownerId);
      if (subs.length > 0) {
        const openUrl = task.patientUserId
          ? `/app/doctor/clients/${task.patientUserId}#doctor-client-section-tasks`
          : "/app/doctor#doctor-today-global-tasks";
        const tag = `specialist_task:${task.id}`;
        const pushResult = await relayOutbound({
          messageId: `specialist-task:${task.id}:web_push:${ownerId}`,
          channel: "web_push",
          recipient: ownerId,
          text: task.title,
          metadata: {
            title: "Задача",
            url: openUrl,
            pushExtras: { tag },
          },
        }).catch((err: unknown) => {
          logger.warn({ err, taskId: task.id }, "specialist task reminder web push relay failed");
          return { ok: false as const, reason: "relay_error" };
        });
        if (pushResult.ok) sent = true;
      }
    }
  }

  return { sent, undeliverable: false };
}

export async function loadSpecialistTaskReminderChannelsFromSettings(
  getDoctorSetting: (
    key: "doctor_specialist_task_reminder_channels",
  ) => Promise<{ valueJson: unknown } | null | undefined>,
): Promise<SpecialistTaskReminderChannelCode[]> {
  const row = await getDoctorSetting("doctor_specialist_task_reminder_channels");
  return parseSpecialistTaskReminderChannels(row?.valueJson ?? null);
}
