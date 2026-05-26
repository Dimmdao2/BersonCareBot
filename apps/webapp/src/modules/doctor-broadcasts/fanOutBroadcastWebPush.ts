import { logger } from "@/infra/logging/logger";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import {
  runPatientWebPushNotify,
  type PatientWebPushNotifyDeps,
} from "@/modules/patient-notifications/patientWebPushNotify";
import { buildPatientBroadcastOpenPath } from "@/modules/patient-broadcasts/buildPatientBroadcastOpenPath";
import { broadcastIncludeWebPushJob } from "./broadcastEligible";

const NEWS_TOPIC_CODE = "news";

export type FanOutBroadcastWebPushInput = {
  auditId: string;
  broadcastTitle: string;
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

  for (const client of input.eligibleClients) {
    if (!broadcastIncludeWebPushJob(["push"], input.webPushEligibleUserIds, client.userId)) {
      continue;
    }

    attempted += 1;
    try {
      const openUrl = buildPatientBroadcastOpenPath(input.auditId);
      const result = await runPatientWebPushNotify(
        {
          platformUserId: client.userId,
          topicCode: NEWS_TOPIC_CODE,
          intentType: "news",
          broadcastTitle: input.broadcastTitle,
          openUrl,
          stableKey: `broadcast:${input.auditId}:${client.userId}`.slice(0, 240),
        },
        deps,
      );

      const pushDelivered = typeof result.webPushDelivered === "number" ? result.webPushDelivered : 0;
      const pushErrors = typeof result.webPushErrors === "number" ? result.webPushErrors : 0;
      delivered += pushDelivered;
      errors += pushErrors;
      if (pushDelivered === 0 && pushErrors === 0 && typeof result.skipped === "string") {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      logger.warn(
        {
          err,
          event: "doctor_broadcast.web_push.client_failed",
          auditId: input.auditId,
          platformUserId: client.userId,
        },
        "doctor broadcast web push client failed",
      );
    }
  }

  logger.info(
    {
      event: "doctor_broadcast.web_push.result",
      auditId: input.auditId,
      attempted,
      delivered,
      errors,
      skipped,
    },
    "doctor broadcast web push result",
  );

  return { attempted, delivered, errors, skipped };
}
