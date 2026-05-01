import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

type Subscription = { id: string; title: string };

type Props = {
  subscriptions: Subscription[];
};

/** Список тем подписок (настройка по каналам — в `ChannelNotificationToggles`). */
export function SubscriptionsList({ subscriptions }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {subscriptions.map((s) => (
        <li
          key={s.id}
          className={cn(
            patientMutedTextClass,
            "rounded-md border border-dashed border-[var(--patient-border)]/60 px-3 py-2",
          )}
        >
          {s.title}
        </li>
      ))}
    </ul>
  );
}
