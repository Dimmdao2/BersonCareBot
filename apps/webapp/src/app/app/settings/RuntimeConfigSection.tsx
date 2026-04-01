"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BOOKING_DISPLAY_TZ_PATTERN = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

type RuntimeConfigValues = {
  integratorApiUrl: string;
  bookingUrl: string;
  /** HTTPS ссылка поддержки (t.me и т.п.), см. getSupportContactUrl. */
  supportContactUrl: string;
  /** IANA timezone for booking notification text (integrator reads system_settings). */
  bookingDisplayTimezone: string;
  telegramBotUsername: string;
  /** JSON-array strings */
  allowedTelegramIds: string;
  allowedMaxIds: string;
  adminTelegramIds: string;
  doctorTelegramIds: string;
  adminMaxIds: string;
  doctorMaxIds: string;
};

async function patchSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: { value } }),
  });
  return res.ok;
}

function parseIdArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // comma-separated fallback
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

type Props = RuntimeConfigValues;

export function RuntimeConfigSection({
  integratorApiUrl,
  bookingUrl,
  supportContactUrl,
  bookingDisplayTimezone,
  telegramBotUsername,
  allowedTelegramIds,
  allowedMaxIds,
  adminTelegramIds,
  doctorTelegramIds,
  adminMaxIds,
  doctorMaxIds,
}: Props) {
  const [vals, setVals] = useState({
    integratorApiUrl,
    bookingUrl,
    supportContactUrl,
    bookingDisplayTimezone,
    telegramBotUsername,
    allowedTelegramIds,
    allowedMaxIds,
    adminTelegramIds,
    doctorTelegramIds,
    adminMaxIds,
    doctorMaxIds,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setVals((v) => ({ ...v, [k]: e.target.value }));
  };

  async function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const tzRaw = vals.bookingDisplayTimezone.trim();
        const tz = tzRaw.length > 0 ? tzRaw : "Europe/Moscow";
        if (!BOOKING_DISPLAY_TZ_PATTERN.test(tz)) {
          setError("Некорректный часовой пояс (IANA, например Europe/Moscow)");
          return;
        }
        const supportRaw = vals.supportContactUrl.trim();
        if (supportRaw.length > 0) {
          try {
            const u = new URL(supportRaw);
            if (u.protocol !== "https:" && u.protocol !== "http:") {
              setError("Ссылка поддержки: только http(s)://");
              return;
            }
          } catch {
            setError("Ссылка поддержки: укажите валидный URL (например https://t.me/…)");
            return;
          }
        }
        const results = await Promise.all([
          patchSetting("integrator_api_url", vals.integratorApiUrl.trim()),
          patchSetting("booking_url", vals.bookingUrl.trim()),
          patchSetting("support_contact_url", supportRaw),
          patchSetting("booking_display_timezone", tz),
          patchSetting("telegram_bot_username", vals.telegramBotUsername.trim()),
          patchSetting("allowed_telegram_ids", parseIdArray(vals.allowedTelegramIds)),
          patchSetting("allowed_max_ids", parseIdArray(vals.allowedMaxIds)),
          patchSetting("admin_telegram_ids", parseIdArray(vals.adminTelegramIds)),
          patchSetting("doctor_telegram_ids", parseIdArray(vals.doctorTelegramIds)),
          patchSetting("admin_max_ids", parseIdArray(vals.adminMaxIds)),
          patchSetting("doctor_max_ids", parseIdArray(vals.doctorMaxIds)),
        ]);
        if (results.some((r) => !r)) {
          setError("Не удалось сохранить часть настроек");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <Card className="border-amber-500/40 ring-amber-500/20">
      <CardHeader>
        <CardTitle className="text-amber-700 dark:text-amber-400">Runtime конфиг (DB override)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Переопределяет соответствующие переменные из .env. Пустое поле — использовать env-значение. Изменения применяются в течение 60 сек (TTL кэш).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">URL-адреса</h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">INTEGRATOR_API_URL</span>
            <Input
              type="url"
              placeholder="https://integrator.example.com"
              value={vals.integratorApiUrl}
              onChange={set("integratorApiUrl")}
              disabled={isPending}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Booking URL</span>
            <Input
              type="url"
              placeholder="https://booking.example.com"
              value={vals.bookingUrl}
              onChange={set("bookingUrl")}
              disabled={isPending}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Support contact URL (HTTPS)</span>
            <Input
              type="url"
              placeholder="https://t.me/your_support"
              value={vals.supportContactUrl}
              onChange={set("supportContactUrl")}
              disabled={isPending}
            />
            <span className="text-xs text-muted-foreground">
              Ссылка «Написать в поддержку» в формах OTP и на странице справки. Пустое — дефолт из кода.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Booking display timezone (IANA)</span>
            <Input
              type="text"
              placeholder="Europe/Moscow"
              value={vals.bookingDisplayTimezone}
              onChange={set("bookingDisplayTimezone")}
              disabled={isPending}
            />
            <span className="text-xs text-muted-foreground">
              Текст напоминаний и уведомлений о записи в integrator. Пустое поле при сохранении → Europe/Moscow.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Telegram bot @username</span>
            <Input
              type="text"
              placeholder="MyBot"
              value={vals.telegramBotUsername}
              onChange={set("telegramBotUsername")}
              disabled={isPending}
            />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Вайтлисты (JSON или через запятую)</h3>
          {([
            ["allowedTelegramIds", "Разрешённые Telegram ID (клиенты)"],
            ["adminTelegramIds", "Telegram ID → admin"],
            ["doctorTelegramIds", "Telegram ID → doctor"],
            ["allowedMaxIds", "Разрешённые Max ID (клиенты)"],
            ["adminMaxIds", "Max ID → admin"],
            ["doctorMaxIds", "Max ID → doctor"],
          ] as [keyof typeof vals, string][]).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs font-medium">{label}</span>
              <textarea
                className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                placeholder='["123456789"]'
                value={vals[k]}
                onChange={set(k)}
                disabled={isPending}
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-amber-500/50" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить runtime конфиг"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
