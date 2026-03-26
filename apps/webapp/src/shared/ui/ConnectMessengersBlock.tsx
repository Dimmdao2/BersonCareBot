"use client";

/**
 * Блок «Подключите удобный вам мессенджер»: Telegram (deep-link с одноразовым секретом), MAX — статическая ссылка.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChannelCard } from "@/modules/channel-preferences/types";

type Props = {
  channelCards: ChannelCard[];
  /** Показывать только реализованные каналы (telegram, max). По умолчанию true. */
  implementedOnly?: boolean;
  /** Если false — без заголовка секции (родитель задаёт свой). */
  showHeading?: boolean;
};

export function ConnectMessengersBlock({ channelCards, implementedOnly = true, showHeading = true }: Props) {
  const cards = implementedOnly
    ? channelCards.filter((c): c is ChannelCard => c.code === "telegram" || c.code === "max")
    : channelCards.filter((c) => c.code !== "vk");
  const linkedCount = cards.filter((c) => c.isLinked).length;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openTelegramLink(): Promise<void> {
    setError(null);
    setBusy("telegram");
    try {
      const res = await fetch("/api/auth/channel-link/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode: "telegram" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (data.ok && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Не удалось получить ссылку. Попробуйте позже.");
      }
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) return null;

  return (
    <section id="connect-messengers-section" className={showHeading ? "rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4 mt-4" : "flex flex-col gap-3"}>
      {showHeading ? (
        <h2 className="h3">
          {linkedCount === 0
            ? "Подключите удобный вам мессенджер"
            : linkedCount < cards.length
              ? "Подключите ещё один мессенджер"
              : "Мессенджеры"}
        </h2>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div id="connect-messengers-grid" className="grid grid-cols-2 gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.code}
            id={`connect-messenger-card-${card.code}`}
            className="border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            <strong>{card.title}</strong>
            {card.isLinked ? (
              <Badge variant="secondary" className="w-fit cursor-default font-normal opacity-90">
                Уже подключено
              </Badge>
            ) : card.code === "telegram" ? (
              <Button
                type="button"
                size="sm"
                className="w-fit"
                disabled={busy === "telegram"}
                onClick={() => void openTelegramLink()}
              >
                {busy === "telegram" ? "…" : "Подключить"}
              </Button>
            ) : (
              <a
                href={card.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "w-fit text-primary-foreground hover:text-primary-foreground active:text-primary-foreground"
                )}
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
