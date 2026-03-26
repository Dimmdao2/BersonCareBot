"use client";

import React, { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChannelBindings } from "@/shared/types/session";
import { sendMessageAction, type SendMessageResult } from "./actions";

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
  availableChannels: string[];
  channelBindings: ChannelBindings;
};

export function SendMessageForm({
  userId,
  availableChannels,
  channelBindings,
}: SendMessageFormProps) {
  const [state, formAction] = useActionState<SendMessageResult, FormData>(sendMessageAction, {
    success: false,
  });
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} id="doctor-client-send-message-form" action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="channel_telegram_id" value={channelBindings.telegramId ?? ""} />
      <input type="hidden" name="channel_max_id" value={channelBindings.maxId ?? ""} />
      <input type="hidden" name="channel_vk_id" value={channelBindings.vkId ?? ""} />
      <div>
        <label htmlFor="msg-text" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Текст сообщения
        </label>
        <Textarea
          id="msg-text"
          name="text"
          rows={4}
          required
          placeholder="Введите текст..."
        />
      </div>
      <div>
        <label htmlFor="msg-category" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Категория
        </label>
        <select
          id="msg-category"
          name="category"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {MESSAGE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {availableChannels.length > 0 ? (
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Каналы доставки
          </span>
          <div id="doctor-client-send-message-channel-options" className="flex flex-wrap gap-2">
            {availableChannels.includes("telegram") && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="channel_telegram" value="1" />
                Telegram
              </label>
            )}
            {availableChannels.includes("max") && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="channel_max" value="1" />
                MAX
              </label>
            )}
            {availableChannels.includes("vk") && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="channel_vk" value="1" />
                VK
              </label>
            )}
          </div>
        </div>
      ) : (
        <p className="text-destructive">Нет доступных каналов для доставки.</p>
      )}
      {state?.error ? <p className="m-0 text-destructive">{state.error}</p> : null}
      {state?.success ? <p className="m-0 text-green-600">Сообщение отправлено.</p> : null}
      <Button type="submit">Отправить</Button>
    </form>
  );
}
