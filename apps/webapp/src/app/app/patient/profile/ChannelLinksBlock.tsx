"use client";

import type { ChannelCard } from "@/modules/channel-preferences/types";

type Props = { channelCards: ChannelCard[] };

const CHANNEL_ICONS: Record<string, string> = {
  telegram: "✈",
  max: "M",
  vk: "VK",
};

export function ChannelLinksBlock({ channelCards }: Props) {
  const cards = channelCards.filter((card) => card.isImplemented);

  return (
    <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {cards.map((card) => (
        <li
          key={card.code}
          className="list-item"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.25rem", width: 28, textAlign: "center" }}>
              {CHANNEL_ICONS[card.code] ?? "?"}
            </span>
            <span style={{ fontWeight: 500 }}>{card.title}</span>
          </div>
          {card.isLinked ? (
            <span className="status-pill status-pill--available">Подключён</span>
          ) : (
            <a
              href={card.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button"
              style={{ fontSize: "0.875rem", padding: "8px 12px" }}
            >
              Подключить
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
