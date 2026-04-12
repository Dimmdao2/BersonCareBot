"use client";

/**
 * Блок «Подключите удобный вам мессенджер»: Telegram/MAX через одноразовый link-token.
 * Для MAX дополнительно показывается команда `/start link_...`, если deep-link не подставился автоматически.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import {
  finishChannelLinkNavigation,
  isMaxChannelDeepLinkUrl,
  shouldDeferChannelLinkBlankWindow,
} from "@/shared/lib/telegramChannelLinkOpen";

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
  const [maxManualCommand, setMaxManualCommand] = useState<string | null>(null);
  const [maxOpenUrl, setMaxOpenUrl] = useState<string | null>(null);

  async function copyMaxCommand(cmd: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      // no-op: browser clipboard may be blocked; command remains visible in UI
    }
  }

  async function startChannelLink(channelCode: "telegram" | "max"): Promise<void> {
    /** В обычном браузере — blank до await (обход popup-blocker). В TG/MAX Mini App — без blank (иначе «Open about:blank?»). */
    const useBlank =
      (channelCode === "telegram" || channelCode === "max") && !shouldDeferChannelLinkBlankWindow();
    const blank = useBlank ? window.open("about:blank", "_blank") : null;
    setError(null);
    setBusy(channelCode);
    setMaxManualCommand(null);
    setMaxOpenUrl(null);
    try {
      const res = await fetch("/api/auth/channel-link/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        manualCommand?: string;
        error?: string;
        message?: string;
      };
      if (res.status === 429 || data.error === "rate_limited") {
        try {
          blank?.close();
        } catch {
          /* ignore */
        }
        setError(data.message ?? "Слишком много запросов. Попробуйте позже.");
        return;
      }
      if (!res.ok || !data.ok || !data.url) {
        try {
          blank?.close();
        } catch {
          /* ignore */
        }
        setError(data.message ?? data.error ?? "Не удалось получить ссылку. Попробуйте позже.");
        return;
      }
      if (channelCode === "max") {
        const deep = typeof data.url === "string" && isMaxChannelDeepLinkUrl(data.url);
        if (deep) {
          setMaxOpenUrl(data.url);
          finishChannelLinkNavigation({
            blankWin: blank,
            url: data.url,
            channel: "max",
            userAgent: navigator.userAgent,
          });
        } else {
          setMaxOpenUrl(null);
          try {
            blank?.close();
          } catch {
            /* ignore */
          }
        }
        setMaxManualCommand(data.manualCommand ?? null);
        if (data.manualCommand) {
          await copyMaxCommand(data.manualCommand);
        }
        return;
      }
      finishChannelLinkNavigation({
        blankWin: blank,
        url: data.url,
        channel: "telegram",
        userAgent: navigator.userAgent,
      });
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
                onClick={() => void startChannelLink("telegram")}
              >
                {busy === "telegram" ? "…" : "Подключить"}
              </Button>
            ) : card.code === "max" ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="w-fit"
                  disabled={busy === "max"}
                  onClick={() => void startChannelLink("max")}
                >
                  {busy === "max" ? "…" : "Подключить"}
                </Button>
                {maxOpenUrl ? (
                  <p className="text-xs text-muted-foreground">
                    Если окно не открылось:{" "}
                    <button
                      type="button"
                      className="inline h-auto min-h-0 p-0 text-xs font-normal text-primary underline"
                      onClick={() =>
                        finishChannelLinkNavigation({
                          blankWin: null,
                          url: maxOpenUrl,
                          channel: "max",
                          userAgent: navigator.userAgent,
                        })
                      }
                    >
                      открыть бота в MAX
                    </button>
                  </p>
                ) : null}
                {maxManualCommand ? (
                  <div className="text-xs text-muted-foreground">
                    <p className="m-0">В чате с ботом MAX отправьте команду:</p>
                    <code className="block rounded bg-muted px-2 py-1">{maxManualCommand}</code>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto min-h-0 px-0 py-0 text-xs font-normal"
                      onClick={() => void copyMaxCommand(maxManualCommand)}
                    >
                      Скопировать команду
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <a
                href={card.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-fit")}
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
