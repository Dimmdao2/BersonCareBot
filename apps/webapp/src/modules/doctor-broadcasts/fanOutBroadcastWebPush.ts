import { logger } from '@/infra/logging/logger';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import {
  runPatientWebPushNotify,
  type PatientWebPushNotifyDeps,
} from '@/modules/patient-notifications/patientWebPushNotify';
import { broadcastNotificationTopicCode } from '@/modules/patient-notifications/notificationTopicCodes';
import { broadcastIncludeWebPushJob } from './broadcastEligible';
import { buildBroadcastMessageText, stripMarkdownToPlain } from './deliveryJobs';
import type { BroadcastCategory } from './ports';

export type FanOutBroadcastWebPushInput = {
  organizationId: string;
  auditId: string;
  broadcastCategory: BroadcastCategory;
  broadcastTitle: string;
  broadcastBody: string;
  notificationOpenUrl: string;
  eligibleClients: readonly ClientListItem[];
  webPushEligibleUserIds: ReadonlySet<string>;
};

export type FanOutBroadcastWebPushResult = {
  attempted: number;
  delivered: number;
  errors: number;
  skipped: number;
};

export async function fanOutBroadcastWebPush(
  input: FanOutBroadcastWebPushInput,
  deps: PatientWebPushNotifyDeps,
): Promise<FanOutBroadcastWebPushResult> {
  let attempted = 0;
  let delivered = 0;
  let errors = 0;
  let skipped = 0;
  const topicCode = broadcastNotificationTopicCode(input.broadcastCategory);

  for (const client of input.eligibleClients) {
    if (!broadcastIncludeWebPushJob(['push'], input.webPushEligibleUserIds, client.userId)) {
      continue;
    }

    attempted += 1;
    try {
      const result = await runPatientWebPushNotify(
        {
          organizationId: input.organizationId,
          platformUserId: client.userId,
          topicCode,
          intentType: 'news',
          broadcastTitle: stripMarkdownToPlain(
            buildBroadcastMessageText(input.broadcastTitle, input.broadcastBody),
          ),
          openUrl: input.notificationOpenUrl,
          stableKey: `broadcast:${input.auditId}:${client.userId}`.slice(0, 240),
        },
        deps,
      );

      const pushDelivered =
        typeof result.webPushDelivered === 'number' ? result.webPushDelivered : 0;
      const pushErrors = typeof result.webPushErrors === 'number' ? result.webPushErrors : 0;
      delivered += pushDelivered;
      errors += pushErrors;
      if (pushDelivered === 0 && pushErrors === 0 && typeof result.skipped === 'string') {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      logger.warn(
        {
          err,
          event: 'doctor_broadcast.web_push.client_failed',
          auditId: input.auditId,
          platformUserId: client.userId,
        },
        'doctor broadcast web push client failed',
      );
    }
  }

  logger.info(
    {
      event: 'doctor_broadcast.web_push.result',
      auditId: input.auditId,
      attempted,
      delivered,
      errors,
      skipped,
    },
    'doctor broadcast web push result',
  );

  return { attempted, delivered, errors, skipped };
}
