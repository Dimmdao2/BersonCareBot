"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/doctor/primitives/tabs";
import { BookingPoliciesSection } from "@/app/app/settings/BookingPoliciesSection";
import { BookingEventNotificationsSection } from "@/app/app/settings/BookingEventNotificationsSection";
import { BookingPackagePastUnlinkSetting } from "@/app/app/settings/BookingPackagePastUnlinkSetting";

type Props = {
  allowPastUnlinkPastPackageSessions?: boolean;
};

export function BookingRulesPageClient({
  allowPastUnlinkPastPackageSessions = false,
}: Props) {
  return (
    <Tabs defaultValue="cancellation">
      <TabsList variant="line" className="w-full max-w-md justify-start">
        <TabsTrigger value="cancellation">Отмена</TabsTrigger>
        <TabsTrigger value="reschedule">Перенос</TabsTrigger>
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
      </TabsList>
      <TabsContent value="cancellation" className="mt-4 space-y-4">
        <BookingPoliciesSection defaultKind="cancellation" lockKind />
        <BookingPackagePastUnlinkSetting allowPastUnlink={allowPastUnlinkPastPackageSessions} />
      </TabsContent>
      <TabsContent value="reschedule" className="mt-4">
        <BookingPoliciesSection defaultKind="reschedule" lockKind />
      </TabsContent>
      <TabsContent value="notifications" className="mt-4">
        <BookingEventNotificationsSection layout="compact" />
      </TabsContent>
    </Tabs>
  );
}
