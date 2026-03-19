"use client";

import type { ChannelBindings } from "@/shared/types/session";
import { sendMessageAction, type SendMessageResult } from "./actions";
import { useActionState } from "react";

const MESSAGE_CATEGORIES = [
  { value: "organizational", label: "Организационное" },
  { value: "reminder", label: "Напоминание" },
  { value: "appointment_clarification", label: "Уточнение по записи" },
  { value: "diary_request", label: "Просьба заполнить дневник" },
  { value: "feedback", label: "Обратная связь после приёма" },
  { value: "service", label: "Сервисное" },
] as const;

type SendMessageFormProps = {
  userId: string;
  senderId: string;
  availableChannels: string[];
  channelBindings: ChannelBindings;
};

export function SendMessageForm({
  userId,
  senderId,
  availableChannels,
  channelBindings,
}: SendMessageFormProps) {
  const [state, formAction] = useActionState<SendMessageResult, FormData>(sendMessageAction, {
    success: false,
  });

  return (
    <form action={formAction} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="senderId" value={senderId} />
      <input type="hidden" name="channel_telegram_id" value={channelBindings.telegramId ?? ""} />
      <input type="hidden" name="channel_max_id" value={channelBindings.maxId ?? ""} />
      <input type="hidden" name="channel_vk_id" value={channelBindings.vkId ?? ""} />
      <div>
        <label htmlFor="msg-text" className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
          Текст сообщения
        </label>
        <textarea
          id="msg-text"
          name="text"
          className="auth-input"
          rows={4}
          required
          placeholder="Введите текст..."
        />
      </div>
      <div>
        <label htmlFor="msg-category" className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
          Категория
        </label>
        <select id="msg-category" name="category" className="auth-input">
          {MESSAGE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {availableChannels.length > 0 ? (
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
            Каналы доставки
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {availableChannels.includes("telegram") && (
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" name="channel_telegram" value="1" />
                Telegram
              </label>
            )}
            {availableChannels.includes("max") && (
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" name="channel_max" value="1" />
                MAX
              </label>
            )}
            {availableChannels.includes("vk") && (
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" name="channel_vk" value="1" />
                VK
              </label>
            )}
          </div>
        </div>
      ) : (
        <p className="eyebrow" style={{ color: "#9c4242" }}>
          Нет доступных каналов для доставки.
        </p>
      )}
      {state?.error ? <p style={{ color: "#9c4242", margin: 0 }}>{state.error}</p> : null}
      {state?.success ? <p style={{ color: "#16a34a", margin: 0 }}>Сообщение отправлено.</p> : null}
      <button type="submit" className="button">
        Отправить
      </button>
    </form>
  );
}
