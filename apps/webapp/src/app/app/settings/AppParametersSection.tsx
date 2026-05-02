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
import { isValidSupportContactSetting } from "@/lib/url/isValidSupportContactSetting";
import {
  getCachedIanaTimezonesSorted,
  isValidIanaTimeZoneId,
  prioritizeMoscowFirst,
} from "@/shared/timezone/ianaTimezonesForAdminUi";
import { patchAdminSetting } from "./patchAdminSetting";

export type AppParametersSectionProps = {
  /** Публичный origin веб-приложения (https://…), без завершающего слеша. */
  appBaseUrl: string;
  supportContactUrl: string;
  appDisplayTimezone: string;
};

function isValidAppBaseUrl(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AppParametersSection({ appBaseUrl, supportContactUrl, appDisplayTimezone }: AppParametersSectionProps) {
  const [appUrl, setAppUrl] = useState(appBaseUrl);
  const [support, setSupport] = useState(supportContactUrl);
  const [timezone, setTimezone] = useState(appDisplayTimezone);
  const [tzFilter, setTzFilter] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const baseIanaIds = useMemo(() => {
    const all = getCachedIanaTimezonesSorted();
    const cur = timezone.trim() || "Europe/Moscow";
    if (all.includes(cur)) return all;
    return [cur, ...all];
  }, [timezone]);

  const filteredIanaIds = useMemo(() => {
    const cur = timezone.trim() || "Europe/Moscow";
    const q = tzFilter.trim().toLowerCase();
    if (q) {
      return baseIanaIds.filter((z) => z.toLowerCase().includes(q));
    }
    const list = prioritizeMoscowFirst(baseIanaIds);
    if (!list.includes(cur)) return [cur, ...list];
    return list;
  }, [baseIanaIds, tzFilter, timezone]);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const appUrlRaw = appUrl.trim();
        if (appUrlRaw.length > 0 && !isValidAppBaseUrl(appUrlRaw)) {
          setError("Публичный URL приложения: укажите https://… (http допустим в dev) или оставьте пустым для env");
          return;
        }
        const supportRaw = support.trim();
        if (supportRaw.length > 0 && !isValidSupportContactSetting(supportRaw)) {
          setError("Ссылка поддержки: укажите путь /app/… или URL https://… (http допустим в dev)");
          return;
        }
        const tzRaw = timezone.trim() || "Europe/Moscow";
        if (!isValidIanaTimeZoneId(tzRaw)) {
          setError("Таймзона: выберите валидную зону IANA из списка");
          return;
        }
        const results = await Promise.all([
          patchAdminSetting("app_base_url", appUrlRaw),
          patchAdminSetting("support_contact_url", supportRaw),
          patchAdminSetting("app_display_timezone", tzRaw),
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
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Параметры приложения</CardTitle>
        <p className="text-xs text-muted-foreground">
          Значения хранятся в БД (<code className="rounded bg-muted px-1">system_settings</code>, scope admin),
          применяются без передеплоя.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Публичный URL приложения</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">App base URL (origin)</span>
            <Input
              type="url"
              placeholder="https://bersoncare.ru"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
            <span className="text-xs text-muted-foreground">
              Без завершающего /. Ссылки для ботов и OAuth строятся отсюда; пусто — используется{" "}
              <code className="rounded bg-muted px-1">APP_BASE_URL</code> из окружения.
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Контакты и поддержка</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Support contact (путь или URL)</span>
            <Input
              type="text"
              placeholder="/app/patient/support или https://t.me/…"
              value={support}
              onChange={(e) => setSupport(e.target.value)}
              disabled={isPending}
            />
            <span className="text-xs text-muted-foreground">
              Путь вида /app/… (форма в приложении) или внешняя ссылка https://… Пустое — дефолт из кода.
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Таймзона отображения записей</p>
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
            value={timezone.trim() || "Europe/Moscow"}
            onValueChange={(v) => {
              if (v) {
                setTimezone(v);
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
            IANA-зона для времени слотов и записей в кабинете. По умолчанию — Europe/Moscow.
          </span>
        </section>

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
