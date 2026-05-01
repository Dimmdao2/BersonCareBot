"use client";

import { useState, useTransition } from "react";
import { setChannelNotificationEnabled } from "./actions";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

type Props = {
  cards: ChannelCard[];
};

export function ChannelNotificationToggles({ cards }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const linked = cards.filter((c) => c.isLinked);

  if (linked.length === 0) {
    return (
      <p className={patientMutedTextClass}>
        Нет привязанных каналов. Подключите телефон, email или мессенджер ниже.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ul className="flex flex-col gap-3">
        {linked.map((c) => (
          <li
            key={c.code}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--patient-border)]/80 px-3 py-2"
          >
            <span className="font-medium">{c.title}</span>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <span className={patientMutedTextClass}>Уведомления</span>
              <input
                type="checkbox"
                className={cn("size-4 accent-primary", pending && "opacity-60")}
                checked={c.isEnabledForNotifications}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked;
                  setError(null);
                  startTransition(() => {
                    void (async () => {
                      const result = await setChannelNotificationEnabled(c.code, next);
                      if (!result.ok) {
                        setError(result.message);
                      }
                    })();
                  });
                }}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
