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

export type DoctorBroadcastsServiceDeps = {
  resolveBroadcastAudience(
    filter: BroadcastAudienceFilter,
    channels: BroadcastChannel[],
  ): Promise<BroadcastAudienceResolveResult>;
  broadcastAuditPort: BroadcastAuditPort;
  doctorBroadcastDeliveryCommitPort: DoctorBroadcastDeliveryCommitPort;
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
      const { audienceSize, eligibleClients, notificationPrefsByUserId } = await deps.resolveBroadcastAudience(
        command.audienceFilter,
        channels,
      );
      const messageBody = buildBroadcastMessageText(command.message.title, command.message.body);
      const auditId = randomUUID();
      const jobs = buildDoctorBroadcastDeliveryJobs({
        auditId,
        eligibleClients,
        channels,
        messageText: messageBody,
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
      };
      const entry = await deps.doctorBroadcastDeliveryCommitPort.commitAuditAndDeliveryQueue({
        auditId,
        audit: auditBase,
        jobs,
      });
      return { auditEntry: entry };
    },

    async listAudit(limit = 50): Promise<BroadcastAuditEntry[]> {
      return deps.broadcastAuditPort.list(limit);
    },
  };
}

export { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE };
