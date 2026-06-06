import { randomUUID } from "node:crypto";
import type {
  BroadcastAudienceFilter,
  BroadcastAudienceResolveResult,
  BroadcastAuditEntry,
  BroadcastAuditPort,
  BroadcastCategory,
  BroadcastCommand,
  BroadcastPreviewResult,
  DoctorBroadcastDeliveryCommitPort,
} from "./ports";
import { normalizeBroadcastChannels, type BroadcastChannel } from "./broadcastChannels";
import { buildBroadcastMessageText, buildDoctorBroadcastDeliveryJobs } from "./deliveryJobs";
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from "./deliveryQueueKind";
import {
  fanOutBroadcastWebPush,
  type FanOutBroadcastWebPushResult,
} from "./fanOutBroadcastWebPush";
import {
  appendPatientInboundAdminMessage,
  broadcastChatIntegratorMessageId,
} from "@/modules/messaging/appendPatientInboundAdminMessage";
import type { PatientInboundChatPort } from "@/modules/messaging/ports";
import type { PatientWebPushNotifyDeps } from "@/modules/patient-notifications/patientWebPushNotify";
import { logger } from "@/infra/logging/logger";

export type DoctorBroadcastsServiceDeps = {
  resolveBroadcastAudience(
    filter: BroadcastAudienceFilter,
    channels: BroadcastChannel[],
  ): Promise<BroadcastAudienceResolveResult>;
  broadcastAuditPort: BroadcastAuditPort;
  doctorBroadcastDeliveryCommitPort: DoctorBroadcastDeliveryCommitPort;
  fanOutBroadcastWebPush?: (
    input: Parameters<typeof fanOutBroadcastWebPush>[0],
    deps: PatientWebPushNotifyDeps,
  ) => Promise<FanOutBroadcastWebPushResult>;
  patientWebPushNotifyDeps?: PatientWebPushNotifyDeps;
  patientInboundChatPort?: PatientInboundChatPort;
};

const CATEGORIES: BroadcastCategory[] = [
  "service",
  "organizational",
  "marketing",
  "important_notice",
  "schedule_change",
  "reminder",
  "education",
  "survey",
];

function resolvedChannels(command: BroadcastCommand) {
  return normalizeBroadcastChannels(command.channels?.map(String));
}

export function createDoctorBroadcastsService(deps: DoctorBroadcastsServiceDeps) {
  return {
    getCategories(): BroadcastCategory[] {
      return [...CATEGORIES];
    },

    async preview(command: BroadcastCommand): Promise<BroadcastPreviewResult> {
      const channels = resolvedChannels(command);
      const resolved = await deps.resolveBroadcastAudience(command.audienceFilter, channels);
      const { audienceSize, segmentSize, recipientsPreview, deliveryPolicyKind, deliveryPolicyDescriptionRu } = resolved;
      return {
        audienceSize,
        recipientsPreview,
        deliveryPolicyKind,
        deliveryPolicyDescriptionRu,
        ...(segmentSize !== undefined ? { segmentSize } : {}),
        category: command.category,
        audienceFilter: command.audienceFilter,
        channels,
      };
    },

    async execute(command: BroadcastCommand): Promise<{ auditEntry: BroadcastAuditEntry }> {
      const channels = resolvedChannels(command);
      const resolved = await deps.resolveBroadcastAudience(command.audienceFilter, channels);
      const { audienceSize, eligibleClients, notificationPrefsByUserId, webPushEligibleUserIds } = resolved;
      const messageBody = buildBroadcastMessageText(command.message.title, command.message.body);
      const auditId = randomUUID();
      const jobs = buildDoctorBroadcastDeliveryJobs({
        auditId,
        eligibleClients,
        channels,
        messageTitle: command.message.title,
        messageBodyPlain: command.message.body,
        attachMenu: command.attachMenuAfterSend === true,
        audienceFilter: command.audienceFilter,
        notificationPrefsByUserId,
      });
      const auditBase = {
        actorId: command.actorId,
        category: command.category,
        audienceFilter: command.audienceFilter,
        messageTitle: command.message.title,
        messageBody,
        channels,
        previewOnly: false,
        audienceSize,
        deliveryJobsTotal: jobs.length,
        attachMenuAfterSend: command.attachMenuAfterSend === true,
        sentCount: 0,
        errorCount: 0,
        blockedRecipientCount: 0,
      };
      const entry = await deps.doctorBroadcastDeliveryCommitPort.commitAuditAndDeliveryQueue({
        auditId,
        audit: auditBase,
        jobs,
        recipientUserIds: eligibleClients.map((c) => c.userId),
      });

      if (deps.patientInboundChatPort) {
        for (const client of eligibleClients) {
          try {
            await appendPatientInboundAdminMessage(deps.patientInboundChatPort, {
              platformUserId: client.userId,
              text: messageBody,
              integratorMessageId: broadcastChatIntegratorMessageId(auditId, client.userId),
            });
          } catch (err) {
            logger.warn(
              {
                err,
                event: "doctor_broadcast.chat_append_failed",
                auditId,
                platformUserId: client.userId,
              },
              "doctor broadcast chat append failed",
            );
          }
        }
      }

      if (
        channels.includes("push") &&
        deps.fanOutBroadcastWebPush &&
        deps.patientWebPushNotifyDeps
      ) {
        await deps.fanOutBroadcastWebPush(
          {
            auditId,
            broadcastTitle: command.message.title,
            eligibleClients,
            webPushEligibleUserIds,
          },
          deps.patientWebPushNotifyDeps,
        );
      }

      return { auditEntry: entry };
    },

    async listAudit(limit = 50): Promise<BroadcastAuditEntry[]> {
      return deps.broadcastAuditPort.list(limit);
    },
  };
}

export { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE };
