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
  systemSettings: Pick<SystemSettingsService, "getSetting">;
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

export async function notifySpecialistTaskReminder(
  task: SpecialistTaskRow,
  deps: NotifySpecialistTaskReminderDeps,
  opts?: { patientDisplayName?: string | null },
): Promise<{ sent: boolean }> {
  const channels = await deps.getReminderChannels();
  if (channels.length === 0) return { sent: false };

  const text = buildReminderText(task, opts?.patientDisplayName?.trim() || null);
  const ownerId = task.ownerUserId;
  const bindings = await deps.getChannelBindings(ownerId);
  let sent = false;

  if (channels.includes("telegram") && bindings.telegramId?.trim()) {
    sent = true;
    await relayOutbound({
      messageId: `specialist-task:${task.id}:tg:${bindings.telegramId.trim()}`,
      channel: "telegram",
      recipient: bindings.telegramId.trim(),
      text,
      userId: ownerId,
    }).catch((err: unknown) => {
      logger.warn({ err, taskId: task.id }, "specialist task reminder telegram failed");
    });
  }

  if (channels.includes("max") && bindings.maxId?.trim()) {
    sent = true;
    await relayOutbound({
      messageId: `specialist-task:${task.id}:max:${bindings.maxId.trim()}`,
      channel: "max",
      recipient: bindings.maxId.trim(),
      text,
      userId: ownerId,
    }).catch((err: unknown) => {
      logger.warn({ err, taskId: task.id }, "specialist task reminder max failed");
    });
  }

  if (channels.includes("email")) {
    const email = await deps.getProfileEmail(ownerId);
    if (email?.trim()) {
      sent = true;
      const { sendEmailSetupLinkViaIntegrator } = await import(
        "@/infra/integrations/email/integratorEmailAdapter"
      );
      await sendEmailSetupLinkViaIntegrator(email.trim(), "Напоминание о задаче", text).catch(
        (err: unknown) => {
          logger.warn({ err, taskId: task.id }, "specialist task reminder email failed");
        },
      );
    }
  }

  if (channels.includes("web_push")) {
    const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
    if (vapid) {
      const subs = await deps.webPushSubscriptions.listActiveByUserId(ownerId);
      if (subs.length > 0) {
        sent = true;
        const { sendWebPushToSubscriptions } = await import("@/modules/web-push/sendWebPushToSubscriptions");
        const { smtpInnerFromValueJson } = await import("@/modules/outbound-email/sendTransactionalSmtp");
        const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
        const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
        const vapidSubject =
          smtpParsed?.success === true && smtpParsed.data.from.includes("@")
            ? `mailto:${smtpParsed.data.from}`
            : "mailto:noreply@invalid";
        const openUrl = task.patientUserId
          ? `/app/doctor/clients/${task.patientUserId}#doctor-client-section-tasks`
          : "/app/doctor#doctor-today-global-tasks";
        await sendWebPushToSubscriptions({
          subscriptions: subs,
          vapidPublicKey: vapid.publicKey,
          vapidPrivateKey: vapid.privateKey,
          vapidSubject,
          payload: {
            title: "Задача",
            body: task.title,
            url: openUrl,
            tag: `specialist_task:${task.id}`,
          },
          onSubscriptionDead: async (endpoint) => {
            await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
          },
          logContext: { userId: ownerId },
        }).catch((err: unknown) => {
          logger.warn({ err, taskId: task.id }, "specialist task reminder web push failed");
        });
      }
    }
  }

  return { sent };
}

export async function loadSpecialistTaskReminderChannelsFromSettings(
  getDoctorSetting: (
    key: "doctor_specialist_task_reminder_channels",
  ) => Promise<{ valueJson: unknown } | null | undefined>,
): Promise<SpecialistTaskReminderChannelCode[]> {
  const row = await getDoctorSetting("doctor_specialist_task_reminder_channels");
  return parseSpecialistTaskReminderChannels(row?.valueJson ?? null);
}
