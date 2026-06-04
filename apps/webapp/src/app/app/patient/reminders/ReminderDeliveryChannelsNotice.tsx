import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { buttonVariants } from "@/shared/ui/patient/primitives/button-variants";
import { cn } from "@/lib/utils";
import { patientHeroBookingCardChromeClass, patientMutedTextClass } from "@/shared/ui/patient/patientVisual";

export const REMINDER_DELIVERY_CHANNELS_NOTICE =
  "Уведомления приходят в доступные каналы, если они включены";

/** Блок про каналы доставки на странице «Расписание напоминаний». */
export function ReminderDeliveryChannelsNotice({ className }: { className?: string }) {
  return (
    <div className={cn(patientHeroBookingCardChromeClass, "mb-4 flex flex-col gap-3 p-4 md:p-[18px]", className)}>
      <p className={cn(patientMutedTextClass, "text-sm")}>{REMINDER_DELIVERY_CHANNELS_NOTICE}</p>
      <Link
        href={routePaths.notifications}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto")}
      >
        Настроить каналы доставки
      </Link>
    </div>
  );
}
