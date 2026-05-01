import type {
  BroadcastAudienceFilter,
  BroadcastAuditEntry,
  BroadcastAuditPort,
  BroadcastCategory,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "./ports";
import { normalizeBroadcastChannels } from "./broadcastChannels";

export type DoctorBroadcastsServiceDeps = {
  /** Resolves number of users matching the audience filter (for preview and audit). */
  resolveAudienceSize(filter: BroadcastAudienceFilter): Promise<number>;
  broadcastAuditPort: BroadcastAuditPort;
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
      const audienceSize = await deps.resolveAudienceSize(command.audienceFilter);
      return {
        audienceSize,
        category: command.category,
        audienceFilter: command.audienceFilter,
        channels,
      };
    },

    async execute(command: BroadcastCommand): Promise<{ auditEntry: BroadcastAuditEntry }> {
      // Аудит + размер аудитории; массовая доставка по каналам не вызывается здесь.
      const channels = resolvedChannels(command);
      const audienceSize = await deps.resolveAudienceSize(command.audienceFilter);
      const entry = await deps.broadcastAuditPort.append({
        actorId: command.actorId,
        category: command.category,
        audienceFilter: command.audienceFilter,
        messageTitle: command.message.title,
        channels,
        previewOnly: false,
        audienceSize,
        sentCount: 0,
        errorCount: 0,
      });
      return { auditEntry: entry };
    },

    async listAudit(limit = 50): Promise<BroadcastAuditEntry[]> {
      return deps.broadcastAuditPort.list(limit);
    },
  };
}
