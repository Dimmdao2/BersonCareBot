import { cn } from "@/lib/utils";
import { PatientRemindersMuteBar } from "./PatientRemindersMuteBar";
import { ReminderDeliveryChannelsNotice } from "./ReminderDeliveryChannelsNotice";

/** Пауза уведомлений и каналы доставки — секция «Дополнительно». */
export function RemindersPageAdditionalSection({ muteUntilLabel }: { muteUntilLabel: string | null }) {
  return (
    <section
      aria-labelledby="reminders-additional-heading"
      className="mt-8 border-t border-[var(--patient-border)] pt-4"
    >
      <h2
        id="reminders-additional-heading"
        className={cn("text-sm font-medium text-foreground")}
      >
        Дополнительно
      </h2>
      <div className="pt-4">
        <PatientRemindersMuteBar muteUntilLabel={muteUntilLabel} className="mb-0" />
        <ReminderDeliveryChannelsNotice className="mt-4 mb-0" />
      </div>
    </section>
  );
}
