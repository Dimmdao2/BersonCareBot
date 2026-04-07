"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCachedIanaTimezonesSorted,
  isValidIanaTimeZoneId,
  prioritizeMoscowFirst,
} from "@/shared/timezone/ianaTimezonesForAdminUi";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";

type RuntimeConfigValues = {
  /** HTTPS ссылка поддержки (t.me и т.п.), см. getSupportContactUrl. */
  supportContactUrl: string;
  /** Имя бота для Telegram Login Widget (без @). */
  telegramLoginBotUsername: string;
  /** IANA-таймзона для времени записей в кабинете (см. getAppDisplayTimeZone). */
  appDisplayTimezone: string;
  /** Yandex OAuth (backend-only; не показывается в публичном login). */
  yandexOauthClientId: string;
  yandexOauthClientSecret: string;
  yandexOauthRedirectUri: string;
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

type Props = RuntimeConfigValues;

export function RuntimeConfigSection({
  supportContactUrl,
  telegramLoginBotUsername,
  appDisplayTimezone,
  yandexOauthClientId,
  yandexOauthClientSecret,
  yandexOauthRedirectUri,
  allowedTelegramIds,
  allowedMaxIds,
  adminTelegramIds,
  doctorTelegramIds,
  adminMaxIds,
  doctorMaxIds,
}: Props) {
  const [vals, setVals] = useState({
    supportContactUrl,
    telegramLoginBotUsername,
    appDisplayTimezone,
    yandexOauthClientId,
    yandexOauthClientSecret,
    yandexOauthRedirectUri,
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
  const [tzFilter, setTzFilter] = useState("");

  const baseIanaIds = useMemo(() => {
    const all = getCachedIanaTimezonesSorted();
    const cur = vals.appDisplayTimezone.trim() || "Europe/Moscow";
    if (all.includes(cur)) return all;
    return [cur, ...all];
  }, [vals.appDisplayTimezone]);

  const filteredIanaIds = useMemo(() => {
    const cur = vals.appDisplayTimezone.trim() || "Europe/Moscow";
    const q = tzFilter.trim().toLowerCase();
    if (q) {
      return baseIanaIds.filter((z) => z.toLowerCase().includes(q));
    }
    const list = prioritizeMoscowFirst(baseIanaIds);
    if (!list.includes(cur)) return [cur, ...list];
    return list;
  }, [baseIanaIds, tzFilter, vals.appDisplayTimezone]);

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setVals((v) => ({ ...v, [k]: e.target.value }));
  };

  async function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
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
        const tzRaw = vals.appDisplayTimezone.trim() || "Europe/Moscow";
        if (!isValidIanaTimeZoneId(tzRaw)) {
          setError("Таймзона: выберите валидную зону IANA из списка");
          return;
        }
        const redirectRaw = vals.yandexOauthRedirectUri.trim();
        if (redirectRaw.length > 0) {
          try {
            const u = new URL(redirectRaw);
            if (u.protocol !== "https:" && u.protocol !== "http:") {
              setError("Yandex redirect URI: только http(s)://");
              return;
            }
          } catch {
            setError("Yandex redirect URI: укажите валидный URL");
            return;
          }
        }
        const results = await Promise.all([
          patchSetting("support_contact_url", supportRaw),
          patchSetting("telegram_login_bot_username", vals.telegramLoginBotUsername.trim()),
          patchSetting("app_display_timezone", tzRaw),
          patchSetting("yandex_oauth_client_id", vals.yandexOauthClientId.trim()),
          patchSetting("yandex_oauth_client_secret", vals.yandexOauthClientSecret.trim()),
          patchSetting("yandex_oauth_redirect_uri", redirectRaw),
          patchSetting("allowed_telegram_ids", parseIdTokens(vals.allowedTelegramIds)),
          patchSetting("allowed_max_ids", parseIdTokens(vals.allowedMaxIds)),
          patchSetting("admin_telegram_ids", parseIdTokens(vals.adminTelegramIds)),
          patchSetting("doctor_telegram_ids", parseIdTokens(vals.doctorTelegramIds)),
          patchSetting("admin_max_ids", parseIdTokens(vals.adminMaxIds)),
          patchSetting("doctor_max_ids", parseIdTokens(vals.doctorMaxIds)),
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
    <Card>
      <CardHeader>
        <CardTitle>Runtime конфиг (DB)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Изменения применяются сразу. Ключи интеграций (в т.ч. OAuth) хранятся в БД (`system_settings`).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Контакты</h3>
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
            <span className="text-xs font-medium">Telegram Login Widget — имя бота (без @)</span>
            <Input
              type="text"
              placeholder="bersoncare_bot"
              value={vals.telegramLoginBotUsername}
              onChange={set("telegramLoginBotUsername")}
              disabled={isPending}
              autoComplete="off"
            />
            <span className="text-xs text-muted-foreground">
              Публичное имя бота для кнопки «Войти через Telegram» на веб-странице входа. Пустое — значение из env
              TELEGRAM_BOT_USERNAME.
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">Таймзона отображения записей (IANA)</span>
            <Input
              type="search"
              placeholder="Поиск по названию зоны…"
              value={tzFilter}
              onChange={(e) => setTzFilter(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              className="max-w-lg"
            />
            <Select
              value={vals.appDisplayTimezone.trim() || "Europe/Moscow"}
              onValueChange={(v) => {
                if (v) {
                  setVals((prev) => ({ ...prev, appDisplayTimezone: v }));
                  setTzFilter("");
                }
              }}
              disabled={isPending}
            >
              <SelectTrigger id="app-display-timezone" className="w-full max-w-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {filteredIanaIds.length > 0 ? (
                  filteredIanaIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Нет результатов</div>
                )}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Найдено зон: {filteredIanaIds.length}</span>
            <span className="text-xs text-muted-foreground">
              Время слотов и записей в кабинете пациента и у врача. Список стандартных зон IANA; по умолчанию —
              Europe/Moscow.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Yandex OAuth (backend)
          </h3>
          <p className="text-xs text-muted-foreground">
            Служебный вход: POST <code className="rounded bg-muted px-1">/api/auth/oauth/start</code> с{" "}
            <code className="rounded bg-muted px-1">{`{ "provider": "yandex" }`}</code>, затем редирект на Яндекс. В
            публичном экране входа кнопки нет.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Client ID</span>
            <Input
              type="text"
              value={vals.yandexOauthClientId}
              onChange={set("yandexOauthClientId")}
              disabled={isPending}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Client secret</span>
            <Input
              type="password"
              value={vals.yandexOauthClientSecret}
              onChange={set("yandexOauthClientSecret")}
              disabled={isPending}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Redirect URI (callback)</span>
            <Input
              type="url"
              placeholder="https://example.com/api/auth/oauth/callback"
              value={vals.yandexOauthRedirectUri}
              onChange={set("yandexOauthRedirectUri")}
              disabled={isPending}
              autoComplete="off"
            />
            <span className="text-xs text-muted-foreground">
              Должен совпадать с URI в кабинете приложения Яндекс OAuth.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Вайтлисты (пробел, запятая, новая строка)</h3>
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
                placeholder="123456789 987654321 max-user-1"
                value={vals[k]}
                onChange={set(k)}
                disabled={isPending}
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
