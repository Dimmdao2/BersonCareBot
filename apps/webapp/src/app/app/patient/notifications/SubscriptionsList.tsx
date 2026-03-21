"use client";

import { useTransition } from "react";
import { toggleSubscriptionChannel } from "./actions";

type Subscription = { id: string; title: string };
type LinkedChannel = { code: string; title: string };

type Props = {
  subscriptions: Subscription[];
  linkedChannels: LinkedChannel[];
};

export function SubscriptionsList({ subscriptions, linkedChannels }: Props) {
  const [pending, startTransition] = useTransition();

  const handleToggle = (subscriptionId: string, channelCode: string, checked: boolean) => {
    startTransition(() => {
      toggleSubscriptionChannel(subscriptionId, channelCode, checked);
    });
  };

  return (
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
                <input
                  type="checkbox"
                  defaultChecked
                  disabled={pending}
                  onChange={(event) =>
                    handleToggle(subscription.id, channel.code, event.target.checked)
                  }
                />
                {channel.title}
              </label>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
