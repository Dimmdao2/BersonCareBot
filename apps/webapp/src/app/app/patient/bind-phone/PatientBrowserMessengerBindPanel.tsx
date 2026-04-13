"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { finishChannelLinkNavigation, isMaxChannelDeepLinkUrl } from "@/shared/lib/telegramChannelLinkOpen";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";

const POLL_MS = 4000;

type Props = {
  hint?: string;
  supportContactHref?: string;
};

/**
 * Браузер: нет привязки TG/MAX — deep link через POST /api/auth/channel-link/start.
 */
export function PatientBrowserMessengerBindPanel({ hint, supportContactHref }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"telegram" | "max" | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [maxOpenUrl, setMaxOpenUrl] = useState<string | null>(null);
  const [maxCommand, setMaxCommand] = useState<string | null>(null);

  const startLink = useCallback(async (channelCode: "telegram" | "max") => {
    const blank = null as Window | null;
    setLoading(channelCode);
    setTelegramUrl(null);
    setMaxOpenUrl(null);
    setMaxCommand(null);
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
        toast.error(data.message ?? "Слишком много запросов. Попробуйте позже.");
        return;
      }
      if (!res.ok || !data.ok || !data.url) {
        try {
          blank?.close();
        } catch {
          /* ignore */
        }
        toast.error(data.message ?? data.error ?? "Не удалось получить ссылку");
        return;
      }
      if (channelCode === "telegram") {
        setTelegramUrl(data.url);
        finishChannelLinkNavigation({
          blankWin: blank,
          url: data.url,
          channel: "telegram",
          userAgent: navigator.userAgent,
        });
      } else {
        setMaxCommand(data.manualCommand ?? null);
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
        if (data.manualCommand) {
          try {
            await navigator.clipboard.writeText(data.manualCommand);
            toast.success("Команда скопирована — вставьте её в чат с ботом в Max");
          } catch {
            toast("Скопируйте команду вручную в чат с ботом в Max");
          }
        }
      }
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <div id="patient-browser-messenger-bind-panel" className="flex flex-col gap-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Привязка телефона</p>
      <p className="text-muted-foreground text-sm">
        {hint ??
          "Для стабильной работы приложения и синхронизации на всех платформах необходимо привязать номер телефона. Он не будет использоваться для SMS-рассылок."}
      </p>
      <p className="text-sm text-foreground">Выберите мессенджер, в котором удобнее подтвердить номер:</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={loading !== null}
          onClick={() => void startLink("telegram")}
        >
          {loading === "telegram" ? "Загрузка…" : "Телеграм"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={loading !== null}
          onClick={() => void startLink("max")}
        >
          {loading === "max" ? "Загрузка…" : "Макс"}
        </Button>
      </div>
      {telegramUrl ? (
        <p className="text-xs text-muted-foreground">
          Если окно не открылось, перейдите по ссылке:{" "}
          <button
            type="button"
            className="inline h-auto min-h-0 p-0 text-xs font-normal text-primary underline"
            onClick={() =>
              finishChannelLinkNavigation({
                blankWin: null,
                url: telegramUrl,
                channel: "telegram",
                userAgent: navigator.userAgent,
              })
            }
          >
            открыть бота
          </button>
        </p>
      ) : null}
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
      {maxCommand ? (
        <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all" data-testid="max-manual-command">
          {maxCommand}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        После нажатия Start в боте и отправки контакта эта страница обновится сама (или обновите вручную через несколько секунд).
      </p>
      {supportContactHref ? (
        <SupportContactLink href={supportContactHref} className="text-sm text-primary underline">
          Связаться с поддержкой
        </SupportContactLink>
      ) : null}
    </div>
  );
}
