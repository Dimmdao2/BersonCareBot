import type {
  BroadcastAudienceFilter,
  BroadcastAuditEntry,
  BroadcastAuditPort,
  BroadcastCategory,
  BroadcastCommand,
  BroadcastPreviewResult,
  BroadcastRecipientsPreview,
} from "./ports";
import { normalizeBroadcastChannels, type BroadcastChannel } from "./broadcastChannels";

export type DoctorBroadcastsServiceDeps = {
  /**
   * Размер аудитории для preview и аудита: `audienceSize` — фактическая доставка с учётом dev_mode;
   * `segmentSize` — размер сегмента по фильтру, если dev_mode сужает охват.
   */
  resolveBroadcastAudienceForPreview(
    filter: BroadcastAudienceFilter,
    channels: BroadcastChannel[],
  ): Promise<{
    audienceSize: number;
    segmentSize?: number;
    recipientsPreview: BroadcastRecipientsPreview;
  }>;
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
      const { audienceSize, segmentSize, recipientsPreview } = await deps.resolveBroadcastAudienceForPreview(
        command.audienceFilter,
        channels,
      );
      return {
        audienceSize,
        recipientsPreview,
        ...(segmentSize !== undefined ? { segmentSize } : {}),
        category: command.category,
        audienceFilter: command.audienceFilter,
        channels,
      };
    },

    async execute(command: BroadcastCommand): Promise<{ auditEntry: BroadcastAuditEntry }> {
      // Аудит + размер аудитории; массовая доставка по каналам не вызывается здесь.
      const channels = resolvedChannels(command);
      const { audienceSize } = await deps.resolveBroadcastAudienceForPreview(command.audienceFilter, channels);
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
