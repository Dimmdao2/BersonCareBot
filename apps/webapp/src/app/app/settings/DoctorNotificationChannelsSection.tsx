"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Уведомления</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
      </CardContent>
    </Card>
  );
}
