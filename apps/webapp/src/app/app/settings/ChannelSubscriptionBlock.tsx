"use client";

/**
 * Блок «Подписки на каналы» на странице настроек.
 * Список каналов (например Telegram, Max): название, статус подключения, ссылка «Открыть бота»,
 * два переключателя — «Сообщения и ответы бота» и «Уведомления и напоминания». При изменении
 * вызывается серверное действие обновления настройки. Отображается только на странице настроек.
 */

import { useTransition } from "react";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import { updateChannelPreference } from "./actions";

type Props = { channelCards: ChannelCard[] };

/** Рендерит список карточек каналов с переключателями и при изменении сохраняет настройки через сервер. */
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
    <section id="settings-channel-subscriptions-section" className="panel stack">
      <h2>Подписки на каналы</h2>
      <p className="empty-state">
        Подключите удобный вам мессенджер для уведомлений и входа в приложение. Если канал уже подключён, настройте доставку ниже.
      </p>
      <ul id="settings-channel-subscriptions-list" className="list">
        {channelCards.map((card) => (
          <li key={card.code} id={`settings-channel-subscription-item-${card.code}`} className="list-item">
            <div id={`settings-channel-subscription-card-${card.code}`} className="stack" style={{ gap: "0.5rem" }}>
              <div>
                <strong>{card.title}</strong>
                {card.isLinked ? (
                  <span className="status-pill" style={{ marginLeft: "0.5rem" }}>Уже подключено</span>
                ) : (
                  <span className="status-pill status-pill--coming-soon" style={{ marginLeft: "0.5rem" }}>не подключён</span>
                )}
              </div>
              {card.isLinked ? (
                <a href={card.openUrl} target="_blank" rel="noopener noreferrer" className="button button--ghost" style={{ alignSelf: "start" }}>
                  Открыть бота
                </a>
              ) : (
                <a href={card.openUrl} target="_blank" rel="noopener noreferrer" className="button button--primary" style={{ alignSelf: "start" }}>
                  Подключить
                </a>
              )}
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
