"use client";

import { useMemo } from "react";
import {
  applyWebPushColumnAvailability,
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
  globalWebPushEnabled: initialGlobalWebPushEnabled,
}: Props) {
  const push = useWebPushClientState();

  const pushEffective = push.mounted ?
    push.uiStatus === "enabled"
  : initialHasSubscription && initialGlobalWebPushEnabled;

  const topicsForMatrix = useMemo(
    () => applyWebPushColumnAvailability(initialTopics, pushEffective),
    [initialTopics, pushEffective],
  );

  const canEnablePushOnPage =
    push.uiStatus === "pending_permission" ||
    push.uiStatus === "granted_no_subscription" ||
    push.uiStatus === "needs_pwa";

  const showPushSetupCta = !hasMessengerOrEmail && !pushEffective && canEnablePushOnPage;
  const showMatrix =
    hasMessengerOrEmail || pushEffective || topicsForMatrix.some((t) => t.channels.length > 0);

  if (showMatrix) {
    return <PatientNotificationsTopicMatrix initialTopics={topicsForMatrix} pushEffective={pushEffective} />;
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
