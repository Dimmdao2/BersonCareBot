"use client";

import { useMemo } from "react";
import {
  ensureWebPushInNotificationTopics,
  type ProfileNotificationTopicModel,
} from "@/modules/patient-notifications/profileTopicChannelsModel";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientNotificationsTopicMatrix } from "./PatientNotificationsTopicMatrix";

type Props = {
  initialTopics: ProfileNotificationTopicModel[];
  hasMessengerOrEmail: boolean;
  hasWebPushSubscription: boolean;
  globalWebPushEnabled: boolean;
};

/**
 * Секция «Типы уведомлений»: учитывает server subscription, global web_push pref и client refresh.
 */
export function PatientNotificationsTopicsSection({
  initialTopics,
  hasMessengerOrEmail,
  hasWebPushSubscription: initialHasSubscription,
  globalWebPushEnabled,
}: Props) {
  const push = useWebPushClientState();
  const hasSubscription = push.mounted ? push.hasServerSubscription : initialHasSubscription;
  const pushActive = hasSubscription && globalWebPushEnabled;

  const topicsForMatrix = useMemo(
    () => ensureWebPushInNotificationTopics(initialTopics, hasSubscription, globalWebPushEnabled),
    [initialTopics, hasSubscription, globalWebPushEnabled],
  );

  const canEnablePushOnPage =
    push.uiStatus === "pending_permission" ||
    push.uiStatus === "granted_no_subscription" ||
    push.uiStatus === "needs_pwa";

  const showPushSetupCta = !hasMessengerOrEmail && !pushActive && canEnablePushOnPage;
  const showMatrix =
    hasMessengerOrEmail || pushActive || topicsForMatrix.some((t) => t.channels.length > 0);

  if (showMatrix) {
    return <PatientNotificationsTopicMatrix initialTopics={topicsForMatrix} />;
  }

  if (showPushSetupCta) {
    return (
      <p className={patientMutedTextClass}>
        Включите Push в блоке «Каналы» выше, чтобы настроить уведомления приложения.
      </p>
    );
  }

  return <p className={patientMutedTextClass}>Сначала подключите хотя бы один канал доставки.</p>;
}
