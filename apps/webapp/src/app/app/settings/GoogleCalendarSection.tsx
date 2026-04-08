"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";

type GoogleCalendarSectionProps = {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  googleRefreshToken: string;
  googleCalendarId: string;
  googleCalendarEnabled: boolean;
  googleConnectedEmail: string;
};

type CalendarItem = { id: string; summary: string; primary: boolean };

/** Query `reason` from OAuth redirect — short safe labels for admins */
const GCAL_ERROR_REASON_LABELS: Record<string, string> = {
  csrf: "сессия или state не совпали — нажмите «Подключить Google» ещё раз",
  no_code: "Google не вернул код авторизации",
  no_refresh_token:
    "нет refresh token: отзовите доступ к приложению в аккаунте Google и подключите снова",
  exchange_failed: "не удалось обменять код на токены",
  not_configured: "OAuth credentials не заполнены в настройках",
  unauthorized: "нужна сессия администратора",
  access_denied: "доступ отклонён в окне Google",
};

function formatGcalErrorMessage(reason: string | null): string {
  if (!reason) return "Ошибка подключения Google Calendar";
  const mapped = GCAL_ERROR_REASON_LABELS[reason];
  if (mapped) return `Ошибка: ${mapped}`;
  const safe = reason.slice(0, 120).replace(/[^\w.\-]/g, "");
  return safe.length > 0 ? `Ошибка (${safe})` : "Ошибка подключения Google Calendar";
}

async function patchSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: { value } }),
  });
  return res.ok;
}

export function GoogleCalendarSection({
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  googleRefreshToken,
  googleCalendarId,
  googleCalendarEnabled,
  googleConnectedEmail,
}: GoogleCalendarSectionProps) {
  const searchParams = useSearchParams();
  const gcalStatus = searchParams.get("gcal");
  const gcalReason = searchParams.get("reason");

  const [clientId, setClientId] = useState(googleClientId);
  const [clientSecret, setClientSecret] = useState(googleClientSecret);
  const [redirectUri, setRedirectUri] = useState(googleRedirectUri);
  const [calendarId, setCalendarId] = useState(googleCalendarId);
  const [enabled, setEnabled] = useState(googleCalendarEnabled);
  const [connectedEmail] = useState(googleConnectedEmail);

  const hasRefreshToken = googleRefreshToken.length > 0;
  const isConfigured = clientId.trim().length > 0 && clientSecret.trim().length > 0 && redirectUri.trim().length > 0;

  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  const [credsSaved, setCredsSaved] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [calendarSaveError, setCalendarSaveError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (gcalStatus === "connected") setConnectMsg("Google Calendar успешно подключён");
    else if (gcalStatus === "error") setConnectMsg(formatGcalErrorMessage(gcalReason));
  }, [gcalStatus, gcalReason]);

  const saveCredentials = useCallback(() => {
    setCredsSaved(false);
    setCredsError(null);
    startTransition(async () => {
      try {
        const results = await Promise.all([
          patchSetting("google_client_id", clientId.trim()),
          patchSetting("google_client_secret", clientSecret.trim()),
          patchSetting("google_redirect_uri", redirectUri.trim()),
        ]);
        if (results.some((r) => !r)) {
          setCredsError("Не удалось сохранить часть настроек");
          return;
        }
        setCredsSaved(true);
      } catch {
        setCredsError("Ошибка при сохранении");
      }
    });
  }, [clientId, clientSecret, redirectUri]);

  const startOAuth = useCallback(() => {
    setConnectMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/google-calendar/start", { method: "POST" });
        const data = (await res.json()) as { ok: boolean; authUrl?: string; error?: string; message?: string };
        if (!data.ok || !data.authUrl) {
          setConnectMsg(data.message ?? data.error ?? "Ошибка");
          return;
        }
        window.location.href = data.authUrl;
      } catch {
        setConnectMsg("Не удалось начать подключение");
      }
    });
  }, []);

  const loadCalendars = useCallback(() => {
    setCalError(null);
    setLoadingCalendars(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/google-calendar/calendars");
        const data = (await res.json()) as { ok: boolean; calendars?: CalendarItem[]; error?: string; message?: string };
        if (!data.ok || !data.calendars) {
          setCalError(data.message ?? data.error ?? "Ошибка");
          return;
        }
        setCalendars(data.calendars);
      } catch {
        setCalError("Не удалось загрузить календари");
      } finally {
        setLoadingCalendars(false);
      }
    });
  }, []);

  const selectCalendar = useCallback((id: string) => {
    const previous = calendarId;
    setCalendarId(id);
    setCalendarSaveError(null);
    startTransition(async () => {
      const ok = await patchSetting("google_calendar_id", id);
      if (!ok) {
        setCalendarId(previous);
        setCalendarSaveError("Не удалось сохранить выбранный календарь");
      }
    });
  }, [calendarId]);

  const toggleEnabled = useCallback((val: boolean) => {
    const previous = enabled;
    setEnabled(val);
    setToggleError(null);
    startTransition(async () => {
      const ok = await patchSetting("google_calendar_enabled", val);
      if (!ok) {
        setEnabled(previous);
        setToggleError("Не удалось сохранить переключатель синхронизации");
      }
    });
  }, [enabled]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Google Calendar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {connectMsg && (
          <p className={`text-sm ${gcalStatus === "connected" ? "text-green-600" : "text-destructive"}`}>
            {connectMsg}
          </p>
        )}

        {/* 1. OAuth credentials */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">OAuth credentials (Google Cloud Console)</p>
          <Input
            placeholder="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={isPending}
            className="font-mono text-xs"
          />
          <Input
            type="password"
            placeholder="Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            disabled={isPending}
            className="font-mono text-xs"
          />
          <Input
            placeholder="Redirect URI (напр. https://webapp.../api/admin/google-calendar/callback)"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            disabled={isPending}
            className="font-mono text-xs"
          />
          {credsError && <p className="text-xs text-destructive">{credsError}</p>}
          {credsSaved && <p className="text-xs text-green-600">Сохранено</p>}
          <Button size="sm" onClick={saveCredentials} disabled={isPending}>
            {isPending ? "Сохранение..." : "Сохранить credentials"}
          </Button>
        </section>

        {/* 2. Connect / status */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Подключение</p>
          {hasRefreshToken ? (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">
                Подключено{connectedEmail ? ` (${connectedEmail})` : ""}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Google аккаунт не подключён</p>
          )}
          <Button
            size="sm"
            variant={hasRefreshToken ? "outline" : "default"}
            onClick={startOAuth}
            disabled={isPending || !isConfigured}
          >
            {hasRefreshToken ? "Переподключить Google" : "Подключить Google"}
          </Button>
          {!isConfigured && (
            <p className="text-xs text-muted-foreground">
              Сначала заполните и сохраните OAuth credentials выше
            </p>
          )}
        </section>

        {/* 3. Calendar selection */}
        {hasRefreshToken && (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Выбор календаря</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={loadCalendars}
                disabled={isPending || loadingCalendars}
              >
                {loadingCalendars ? "Загрузка..." : "Загрузить список"}
              </Button>
            </div>
            {calError && <p className="text-xs text-destructive">{calError}</p>}
            {calendarSaveError && <p className="text-xs text-destructive">{calendarSaveError}</p>}
            {calendars.length > 0 && (
              <select
                className="input-base font-mono text-xs"
                value={calendarId}
                onChange={(e) => selectCalendar(e.target.value)}
                disabled={isPending}
              >
                <option value="">— выберите календарь —</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}{c.primary ? " (основной)" : ""}
                  </option>
                ))}
              </select>
            )}
            {calendarId && (
              <p className="text-xs text-muted-foreground">
                Текущий: <span className="font-mono">{calendarId}</span>
              </p>
            )}
          </section>
        )}

        {/* 4. Enable toggle */}
        {hasRefreshToken && calendarId && (
          <div className="flex flex-col gap-1">
            <LabeledSwitch
              label="Синхронизация включена"
              hint="Записи из Rubitime будут создаваться/обновляться в выбранном Google Calendar"
              checked={enabled}
              onCheckedChange={toggleEnabled}
              disabled={isPending}
            />
            {toggleError && <p className="text-xs text-destructive">{toggleError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
