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
          className="border-border/60 text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm"
        >
          {s.title}
        </li>
      ))}
    </ul>
  );
}
