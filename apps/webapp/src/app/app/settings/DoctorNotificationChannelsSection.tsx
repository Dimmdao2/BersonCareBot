"use client";

import Link from "next/link";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import type { DoctorNotificationTopicModel } from "@/modules/doctor-notifications/doctorProfileTopicChannelsModel";
import { routePaths } from "@/app-layer/routes/paths";
import { DoctorWebPushControls } from "./DoctorWebPushControls";
import { DoctorNotificationsTopicMatrix } from "./DoctorNotificationsTopicMatrix";

type Props = {
  initialTopics: DoctorNotificationTopicModel[];
  hasWebPushSubscription: boolean;
  globalWebPushEnabled: boolean;
  hasTelegram: boolean;
  hasMax: boolean;
  emailVerified: boolean;
};

export function DoctorNotificationChannelsSection({
  initialTopics,
  hasWebPushSubscription,
  globalWebPushEnabled,
  hasTelegram,
  hasMax,
  emailVerified,
}: Props) {
  const pushEffective = hasWebPushSubscription && globalWebPushEnabled;
  const hasMessengerOrEmail = hasTelegram || hasMax || emailVerified;

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Уведомления</DoctorSectionTitle>
      </DoctorSectionHeader>
      <DoctorWebPushControls
        initialHasSubscription={hasWebPushSubscription}
        initialGlobalEnabled={globalWebPushEnabled}
      />
      {!hasMessengerOrEmail && !hasWebPushSubscription ? (
        <p className="text-xs text-muted-foreground">
          Для Telegram, MAX или email подключите каналы в{" "}
          <Link href={routePaths.settings} className="underline">
            настройках аккаунта
          </Link>{" "}
          (email — в блоке выше).
        </p>
      ) : null}
      <DoctorNotificationsTopicMatrix initialTopics={initialTopics} pushEffective={pushEffective} />
    </DoctorSection>
  );
}
