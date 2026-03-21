"use client";

type Subscription = { id: string; title: string };
type LinkedChannel = { code: string; title: string };

type Props = {
  subscriptions: Subscription[];
  linkedChannels: LinkedChannel[];
};

export function SubscriptionsList({ subscriptions, linkedChannels }: Props) {
  return (
    <>
      <p
        style={{
          fontSize: "0.85rem",
          color: "#946200",
          background: "#fff4dc",
          padding: "8px 12px",
          borderRadius: 8,
        }}
      >
        Настройка каналов уведомлений будет доступна в ближайшем обновлении. Сейчас уведомления приходят во все
        подключённые каналы.
      </p>
      <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {subscriptions.map((subscription) => (
        <li key={subscription.id} className="list-item">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{subscription.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {linkedChannels.map((channel) => (
              <label
                key={channel.code}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}
              >
                <input type="checkbox" defaultChecked disabled />
                {channel.title}
              </label>
            ))}
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}
