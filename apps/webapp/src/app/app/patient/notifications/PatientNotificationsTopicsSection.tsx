"use client";

import { useMemo } from "react";
import { ensureWebPushInNotificationTopics } from "@/modules/patient-notifications/profileTopicChannelsModel";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientNotificationsTopicMatrix } from "./PatientNotificationsTopicMatrix";

type Props = {
  initialTopics: ProfileNotificationTopicModel[];
  hasMessengerOrEmail: boolean;
  initialHasWebPush: boolean;
};

/**
 * Секция «Типы уведомлений»: учитывает server subscription и client refresh после subscribe.
 */
export function PatientNotificationsTopicsSection({
  initialTopics,
  hasMessengerOrEmail,
  initialHasWebPush,
}: Props) {
  const push = useWebPushClientState();
  const hasWebPush = push.mounted ? push.hasServerSubscription : initialHasWebPush;
  const hasAnyChannel = hasMessengerOrEmail || hasWebPush;

  const topicsForMatrix = useMemo(
    () => ensureWebPushInNotificationTopics(initialTopics, hasWebPush),
    [initialTopics, hasWebPush],
  );

  const canEnablePushOnPage =
    push.uiStatus === "pending_permission" ||
    push.uiStatus === "granted_no_subscription" ||
    push.uiStatus === "needs_pwa";

  const showPushSetupCta = !hasAnyChannel && canEnablePushOnPage;

  if (hasAnyChannel) {
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
