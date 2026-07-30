'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiJson } from '@/shared/lib/apiJson';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { LabeledSwitch } from '@/components/common/form/LabeledSwitch';

type GoogleCalendarSectionProps = {
  platformOAuthConfigured: boolean;
  hasRefreshToken: boolean;
  googleCalendarId: string;
  googleCalendarEnabled: boolean;
  googleConnectedEmail: string;
};

type CalendarItem = { id: string; summary: string; primary: boolean };

const GCAL_ERROR_REASON_LABELS: Record<string, string> = {
  csrf: 'сессия или state не совпали — нажмите «Подключить Google» ещё раз',
  no_code: 'Google не вернул код авторизации',
  no_refresh_token:
    'нет refresh token: отзовите доступ к приложению в аккаунте Google и подключите снова',
  exchange_failed: 'не удалось обменять код на токены',
  not_configured: 'OAuth credentials не заполнены в настройках',
  unauthorized: 'нужна сессия администратора',
  integration_disabled: 'платформа выключила интеграцию Google Calendar',
  tariff_disabled:
    'невозможно подключить внешний календарь: этот раздел не входит в тариф клиники. Включите его в тарифе, чтобы подключить календарь',
  access_denied: 'доступ отклонён в окне Google',
};

function formatGcalErrorMessage(reason: string | null): string {
  if (!reason) return 'Ошибка подключения Google Calendar';
  const mapped = GCAL_ERROR_REASON_LABELS[reason];
  if (mapped) return `Ошибка: ${mapped}`;
  const safe = reason.slice(0, 120).replace(/[^\w.\-]/g, '');
  return safe.length > 0 ? `Ошибка (${safe})` : 'Ошибка подключения Google Calendar';
}

async function patchSetting(
  key: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await apiJson<{ ok: boolean }>('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: { value } }),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Не удалось сохранить настройку календаря',
    };
  }
}

export function GoogleCalendarSection({
  platformOAuthConfigured,
  hasRefreshToken,
  googleCalendarId,
  googleCalendarEnabled,
  googleConnectedEmail,
}: GoogleCalendarSectionProps) {
  const searchParams = useSearchParams();
  const gcalStatus = searchParams.get('gcal');
  const gcalReason = searchParams.get('reason');

  const [calendarId, setCalendarId] = useState(googleCalendarId);
  const [enabled, setEnabled] = useState(googleCalendarEnabled);
  const [connectedEmail] = useState(googleConnectedEmail);

  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  const [calError, setCalError] = useState<string | null>(null);
  const [calendarSaveError, setCalendarSaveError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (gcalStatus === 'connected') setConnectMsg('Google Calendar успешно подключён');
    else if (gcalStatus === 'error') setConnectMsg(formatGcalErrorMessage(gcalReason));
  }, [gcalStatus, gcalReason]);

  const startOAuth = useCallback(() => {
    setConnectMsg(null);
    startTransition(async () => {
      try {
        const data = await apiJson<{ ok: boolean; authUrl: string }>(
          '/api/admin/google-calendar/start',
          { method: 'POST' },
        );
        window.location.href = data.authUrl;
      } catch (e) {
        setConnectMsg(e instanceof Error ? e.message : 'Не удалось начать подключение');
      }
    });
  }, []);

  const loadCalendars = useCallback(() => {
    setCalError(null);
    setLoadingCalendars(true);
    startTransition(async () => {
      try {
        const data = await apiJson<{ ok: boolean; calendars: CalendarItem[] }>(
          '/api/admin/google-calendar/calendars',
        );
        setCalendars(data.calendars);
      } catch (e) {
        setCalError(e instanceof Error ? e.message : 'Не удалось загрузить календари');
      } finally {
        setLoadingCalendars(false);
      }
    });
  }, []);

  const selectCalendar = useCallback(
    (id: string) => {
      const previous = calendarId;
      setCalendarId(id);
      setCalendarSaveError(null);
      startTransition(async () => {
        const result = await patchSetting('google_calendar_id', id);
        if (!result.ok) {
          setCalendarId(previous);
          setCalendarSaveError(result.message);
        }
      });
    },
    [calendarId],
  );

  const toggleEnabled = useCallback(
    (val: boolean) => {
      const previous = enabled;
      setEnabled(val);
      setToggleError(null);
      startTransition(async () => {
        const result = await patchSetting('google_calendar_enabled', val);
        if (!result.ok) {
          setEnabled(previous);
          setToggleError(result.message);
        }
      });
    },
    [enabled],
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Google Calendar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {connectMsg && (
          <p
            className={`text-sm ${gcalStatus === 'connected' ? 'text-green-600' : 'text-destructive'}`}
          >
            {connectMsg}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Подключение</p>
          {hasRefreshToken ? (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">
                Подключено{connectedEmail ? ` (${connectedEmail})` : ''}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Google аккаунт не подключён</p>
          )}
          <Button
            size="sm"
            variant={hasRefreshToken ? 'outline' : 'default'}
            onClick={startOAuth}
            disabled={isPending || !platformOAuthConfigured}
          >
            {hasRefreshToken ? 'Переподключить Google' : 'Подключить Google'}
          </Button>
          {!platformOAuthConfigured && (
            <p className="text-xs text-muted-foreground">
              Платформа ещё не настроила Google OAuth. Попросите глобального администратора
              заполнить Client ID, secret и redirect URI для Calendar.
            </p>
          )}
        </section>

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
                {loadingCalendars ? 'Загрузка...' : 'Загрузить список'}
              </Button>
            </div>
            {calError && <p className="text-xs text-destructive">{calError}</p>}
            {calendarSaveError && <p className="text-xs text-destructive">{calendarSaveError}</p>}
            {calendars.length > 0 && (
              <Select
                value={calendarId}
                onValueChange={(v) => selectCalendar(v ?? '')}
                disabled={isPending}
              >
                <SelectTrigger className="w-full font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— выберите календарь —</SelectItem>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.summary}
                      {c.primary ? ' (основной)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {calendarId && (
              <p className="text-xs text-muted-foreground">
                Текущий: <span className="font-mono">{calendarId}</span>
              </p>
            )}
          </section>
        )}

        {hasRefreshToken && calendarId && (
          <div className="flex flex-col gap-1">
            <LabeledSwitch
              label="Синхронизация включена"
              hint="Записи будут создаваться и обновляться в выбранном Google Calendar"
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
