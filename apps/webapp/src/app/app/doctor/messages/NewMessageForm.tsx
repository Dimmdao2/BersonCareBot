"use client";

import React, { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChannelBindings } from "@/shared/types/session";
import type { PrepareDraftResult } from "@/modules/doctor-messaging/service";
import { sendMessageAction, type SendMessageResult } from "@/app/app/doctor/clients/[userId]/actions";
import { getMessageDraftAction } from "./actions";

const MESSAGE_CATEGORIES = [
  { value: "organizational", label: "Организационное" },
  { value: "reminder", label: "Напоминание" },
  { value: "appointment_clarification", label: "Уточнение по записи" },
  { value: "diary_request", label: "Просьба заполнить дневник" },
  { value: "feedback", label: "Обратная связь после приёма" },
  { value: "service", label: "Сервисное" },
] as const;

type ClientOption = { userId: string; displayName: string };

type NewMessageFormProps = {
  clients: ClientOption[];
};

export function NewMessageForm({ clients }: NewMessageFormProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draft, setDraft] = useState<PrepareDraftResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, formAction] = useActionState<SendMessageResult, FormData>(sendMessageAction, {
    success: false,
  });
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  const handleClientChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = e.target.value;
    setSelectedUserId(userId);
    setDraft(null);
    if (!userId) return;
    setLoading(true);
    try {
      const d = await getMessageDraftAction(userId);
      setDraft(d);
    } finally {
      setLoading(false);
    }
  };

  const channelBindings: ChannelBindings = draft?.channelBindings ?? {};
  const availableChannels = draft?.availableChannels ?? [];

  return (
    <div id="doctor-messages-new-message-form-container" className="flex flex-col gap-4">
      <div id="doctor-messages-recipient-select-section">
        <label htmlFor="msg-recipient" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Получатель
        </label>
        <select
          id="msg-recipient"
          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selectedUserId}
          onChange={handleClientChange}
          aria-label="Выберите клиента"
        >
          <option value="">— Выберите клиента —</option>
          {clients.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Загрузка...</p>}

      {selectedUserId && draft && !loading ? (
        <form ref={formRef} id="doctor-messages-send-form" action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={selectedUserId} />
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
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <div id="doctor-messages-channel-options" className="flex flex-wrap gap-2">
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
      ) : selectedUserId && !draft && !loading ? (
        <p className="text-muted-foreground">Не удалось загрузить данные клиента.</p>
      ) : null}
    </div>
  );
}
