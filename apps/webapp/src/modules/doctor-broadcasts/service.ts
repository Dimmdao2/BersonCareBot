import { randomUUID } from 'node:crypto';
import type {
  BroadcastAudienceFilter,
  BroadcastAudienceResolveResult,
  BroadcastAuditEntry,
  BroadcastAuditPort,
  BroadcastCategory,
  BroadcastCommand,
  BroadcastPreviewResult,
  DoctorBroadcastDeliveryCommitPort,
} from './ports';
import { normalizeBroadcastChannels, type BroadcastChannel } from './broadcastChannels';
import {
  buildBroadcastMessageText,
  buildDoctorBroadcastDeliveryJobs,
  stripMarkdownToPlain,
} from './deliveryJobs';
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from './deliveryQueueKind';
import {
  fanOutBroadcastWebPush,
  type FanOutBroadcastWebPushResult,
} from './fanOutBroadcastWebPush';
import {
  fanOutBroadcastEmail,
  type FanOutBroadcastEmailDeps,
  type FanOutBroadcastEmailResult,
} from './fanOutBroadcastEmail';
import {
  appendPatientInboundAdminMessage,
  broadcastChatIntegratorMessageId,
} from '@/modules/messaging/appendPatientInboundAdminMessage';
import type { PatientInboundChatPort } from '@/modules/messaging/ports';
import type { PatientWebPushNotifyDeps } from '@/modules/patient-notifications/patientWebPushNotify';
import { logger } from '@/infra/logging/logger';
import { routePaths } from '@/app-layer/routes/paths';
import { env } from '@/config/env';

export type DoctorBroadcastsServiceDeps = {
  resolveBroadcastAudience(
    filter: BroadcastAudienceFilter,
    channels: BroadcastChannel[],
    category: BroadcastCategory,
  ): Promise<BroadcastAudienceResolveResult>;
  broadcastAuditPort: BroadcastAuditPort;
  doctorBroadcastDeliveryCommitPort: DoctorBroadcastDeliveryCommitPort;
  fanOutBroadcastWebPush?: (
    input: Parameters<typeof fanOutBroadcastWebPush>[0],
    deps: PatientWebPushNotifyDeps,
  ) => Promise<FanOutBroadcastWebPushResult>;
  patientWebPushNotifyDeps?: PatientWebPushNotifyDeps;
  patientInboundChatPort?: PatientInboundChatPort;
  /**
   * Email fan-out deps. Если не задан — email-отправка не выполняется (канал
   * остаётся видимым, счётчик реальный, но фактическая рассылка guarded).
   */
  fanOutBroadcastEmailDeps?: FanOutBroadcastEmailDeps;
};

export type DoctorBroadcastExecutionOptions = {
  organizationId?: string;
  reserveAudienceGrowth?: (audienceSize: number) => Promise<void>;
  runDeliveryCommit?: <T>(fn: () => Promise<T>) => Promise<T>;
};

const CATEGORIES: BroadcastCategory[] = [
  'service',
  'organizational',
  'marketing',
  'important_notice',
  'schedule_change',
  'reminder',
  'education',
  'survey',
];

function resolvedChannels(command: BroadcastCommand) {
  return normalizeBroadcastChannels(command.channels?.map(String));
}

export function buildPatientNotificationsOpenUrl(appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/$/, '');
  const path = `${routePaths.patient}?notifications=1`;
  if (!base.trim()) return path;
  return `${base}${path}`;
}

export function createDoctorBroadcastsService(deps: DoctorBroadcastsServiceDeps) {
  return {
    getCategories(): BroadcastCategory[] {
      return [...CATEGORIES];
    },

    async preview(command: BroadcastCommand): Promise<BroadcastPreviewResult> {
      const channels = resolvedChannels(command);
      const resolved = await deps.resolveBroadcastAudience(
        command.audienceFilter,
        channels,
        command.category,
      );
      const {
        audienceSize,
        segmentSize,
        recipientsPreview,
        deliveryPolicyKind,
        deliveryPolicyDescriptionRu,
      } = resolved;
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

    async execute(
      command: BroadcastCommand,
      options?: DoctorBroadcastExecutionOptions,
    ): Promise<{ auditEntry: BroadcastAuditEntry }> {
      const channels = resolvedChannels(command);
      const resolved = await deps.resolveBroadcastAudience(
        command.audienceFilter,
        channels,
        command.category,
      );
      const {
        audienceSize,
        eligibleClients,
        notificationPrefsByUserId,
        webPushEligibleUserIds,
        emailEligibleUserIds,
      } = resolved;
      await options?.reserveAudienceGrowth?.(audienceSize);
      const messageBody = buildBroadcastMessageText(command.message.title, command.message.body);
      const notificationOpenUrl = buildPatientNotificationsOpenUrl(env.APP_BASE_URL);
      // In-app chat has no markup → patient sees clean text, not raw **/-/_ markers.
      const messageBodyPlainText = stripMarkdownToPlain(messageBody);
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
        imageUrl: command.message.mediaUrl ?? null,
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
      const runDeliveryCommit = options?.runDeliveryCommit ?? (<T>(fn: () => Promise<T>) => fn());
      const entry = await runDeliveryCommit(() =>
        deps.doctorBroadcastDeliveryCommitPort.commitAuditAndDeliveryQueue({
          auditId,
          audit: auditBase,
          jobs,
          recipientUserIds: eligibleClients.map((c) => c.userId),
        }),
      );

      if (deps.patientInboundChatPort) {
        for (const client of eligibleClients) {
          try {
            await appendPatientInboundAdminMessage(deps.patientInboundChatPort, {
              platformUserId: client.userId,
              text: messageBodyPlainText,
              integratorMessageId: broadcastChatIntegratorMessageId(auditId, client.userId),
              source: 'doctor_broadcast',
              mediaUrl: command.message.mediaUrl ?? null,
              mediaType: command.message.mediaType ?? null,
            });
          } catch (err) {
            logger.warn(
              {
                err,
                event: 'doctor_broadcast.chat_append_failed',
                auditId,
                platformUserId: client.userId,
              },
              'doctor broadcast chat append failed',
            );
          }
        }
      }

      if (
        channels.includes('push') &&
        deps.fanOutBroadcastWebPush &&
        deps.patientWebPushNotifyDeps
      ) {
        if (!options?.organizationId) throw new Error('doctor_broadcast_organization_required');
        await deps.fanOutBroadcastWebPush(
          {
            organizationId: options.organizationId,
            auditId,
            broadcastCategory: command.category,
            broadcastTitle: command.message.title,
            broadcastBody: command.message.body,
            notificationOpenUrl,
            eligibleClients,
            webPushEligibleUserIds,
          },
          deps.patientWebPushNotifyDeps,
        );
      }

      if (channels.includes('email') && deps.fanOutBroadcastEmailDeps) {
        if (!options?.organizationId) throw new Error('doctor_broadcast_organization_required');
        const emailClients = emailEligibleUserIds
          ? eligibleClients.filter((c) => emailEligibleUserIds.has(c.userId))
          : eligibleClients;
        await fanOutBroadcastEmail(
          {
            organizationId: options.organizationId,
            auditId,
            broadcastCategory: command.category,
            broadcastTitle: command.message.title,
            broadcastBody: stripMarkdownToPlain(command.message.body),
            mediaUrl: command.message.mediaUrl ?? null,
            eligibleClients: emailClients,
          },
          deps.fanOutBroadcastEmailDeps,
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
