"use client";

/**
 * Блок «Подключите удобный вам мессенджер»: два столбца (Telegram, MAX).
 * Если канал подключён — «Уже подключено» (неактивная кнопка); если нет — кнопка «Подключить» (ссылка на бота).
 * Показывается на главной пациента и может дублироваться в настройках.
 */

import type { ChannelCard } from "@/modules/channel-preferences/types";

type Props = {
  channelCards: ChannelCard[];
  /** Показывать только реализованные каналы (telegram, max). По умолчанию true. */
  implementedOnly?: boolean;
};

export function ConnectMessengersBlock({ channelCards, implementedOnly = true }: Props) {
  const cards = implementedOnly
    ? channelCards.filter((c): c is ChannelCard => c.code === "telegram" || c.code === "max")
    : channelCards.filter((c) => c.code !== "vk");
  const linkedCount = cards.filter((c) => c.isLinked).length;

  if (cards.length === 0) return null;

  return (
    <section id="connect-messengers-section" className="panel stack" style={{ marginTop: "1rem" }}>
      <h2 className="h3">
        {linkedCount === 0
          ? "Подключите удобный вам мессенджер"
          : linkedCount < cards.length
            ? "Подключите ещё один мессенджер"
            : "Мессенджеры"}
      </h2>
      <div
        id="connect-messengers-grid"
        className="feature-grid"
        style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}
      >
        {cards.map((card) => (
          <div
            key={card.code}
            id={`connect-messenger-card-${card.code}`}
            className="stack"
            style={{
              padding: "0.75rem",
              border: "1px solid var(--border, #e0e0e0)",
              borderRadius: "8px",
              gap: "0.5rem",
            }}
          >
            <strong>{card.title}</strong>
            {card.isLinked ? (
              <span
                className="status-pill"
                style={{
                  opacity: 0.9,
                  alignSelf: "start",
                  cursor: "default",
                }}
              >
                Уже подключено
              </span>
            ) : (
              <a
                href={card.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--primary"
                style={{ alignSelf: "start" }}
              >
                Подключить
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
