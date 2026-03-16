"use client";

import { useTransition } from "react";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import { updateChannelPreference } from "./actions";

type Props = { channelCards: ChannelCard[] };

export function ChannelSubscriptionBlock({ channelCards }: Props) {
  const [pending, startTransition] = useTransition();

  function handleMessagesChange(code: ChannelCard["code"], checked: boolean, card: ChannelCard) {
    startTransition(() => {
      updateChannelPreference(code, checked, card.isEnabledForNotifications);
    });
  }
  function handleNotificationsChange(code: ChannelCard["code"], checked: boolean, card: ChannelCard) {
    startTransition(() => {
      updateChannelPreference(code, card.isEnabledForMessages, checked);
    });
  }

  return (
    <section className="panel stack">
      <h2>Подписки на каналы</h2>
      <p className="empty-state">
        Выберите, в какие мессенджеры отправлять сообщения и уведомления. Сначала откройте бота по ссылке и запустите его.
      </p>
      <ul className="list">
        {channelCards.map((card) => (
          <li key={card.code} className="list-item">
            <div className="stack" style={{ gap: "0.5rem" }}>
              <div>
                <strong>{card.title}</strong>
                {card.isLinked ? (
                  <span className="status-pill" style={{ marginLeft: "0.5rem" }}>подключён</span>
                ) : (
                  <span className="status-pill status-pill--coming-soon" style={{ marginLeft: "0.5rem" }}>не подключён</span>
                )}
              </div>
              <a href={card.openUrl} target="_blank" rel="noopener noreferrer" className="button button--ghost" style={{ alignSelf: "start" }}>
                Открыть бота
              </a>
              {card.isImplemented ? (
                <div className="stack" style={{ gap: "0.25rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={card.isEnabledForMessages}
                      disabled={pending}
                      onChange={(e) => handleMessagesChange(card.code, e.target.checked, card)}
                    />
                    <span>Сообщения и ответы бота</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={card.isEnabledForNotifications}
                      disabled={pending}
                      onChange={(e) => handleNotificationsChange(card.code, e.target.checked, card)}
                    />
                    <span>Уведомления и напоминания</span>
                  </label>
                </div>
              ) : (
                <p className="empty-state" style={{ fontSize: "0.9rem" }}>Скоро будет доступно</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
