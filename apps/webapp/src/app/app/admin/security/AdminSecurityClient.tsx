'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { notificationText } from '@/shared/notifications/notificationText';
import {
  staffSecurityErrorText,
  staffSecurityNetworkErrorText,
} from '@/shared/ui/auth/staffSecurityErrorText';
import {
  countriesSummary,
  deviceSummary,
  loginMethodLabel,
} from '@/shared/ui/security/loginHistoryText';

export type SecurityDevice = {
  key: string;
  /** true — устройство опознано меткой; false — только по строке браузера, то есть приблизительно. */
  identifiedByMarker: boolean;
  lastSeenAt: string;
  loginCount: number;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  method: string | null;
  countries: string[];
};

function whenText(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleString('ru-RU');
}

/**
 * «12 входов» — но именно в рассмотренном окне, а не за всё время: список устройств сворачивается по
 * последним двум тысячам входов (иначе экран зависел бы от длины истории). Поэтому окно названо
 * словами внизу экрана, а число тут не выдаётся за «всего».
 */
function loginCountText(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} входов`;
  if (last === 1) return `${count} вход`;
  if (last >= 2 && last <= 4) return `${count} входа`;
  return `${count} входов`;
}

export function AdminSecurityClient({
  devices,
  loadFailed,
}: {
  devices: SecurityDevice[];
  loadFailed: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function revokeEverywhere() {
    setBusy(true);
    try {
      const response = await fetch('/api/account/security/sessions/revoke', { method: 'POST' });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!result?.ok) {
        toast.error(staffSecurityErrorText(result?.error, 'revoke_sessions'));
        return;
      }
      toast.success(notificationText.authOtherSessionsEnded);
    } catch {
      toast.error(staffSecurityNetworkErrorText('revoke_sessions'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Устройства, с которых входили</DoctorSectionTitle>
        </DoctorSectionHeader>

        {loadFailed ? (
          <p className="text-sm">
            Список устройств сейчас не загрузился. Выйти со всех устройств можно и без него — кнопка
            ниже работает.
          </p>
        ) : devices.length === 0 ? (
          <p className="text-sm">Входов пока не записано.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {devices.map((device) => {
              const countries = countriesSummary(device.countries);
              return (
                <li key={device.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <span className="font-medium">
                    {deviceSummary({
                      deviceKind: device.deviceKind,
                      os: device.os,
                      browser: device.browser,
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {countries ?? 'Страна не определилась'} · последний вход{' '}
                    {whenText(device.lastSeenAt)} · {loginCountText(device.loginCount)}
                  </span>
                  {device.method ? (
                    <span className="text-muted-foreground">
                      В последний раз вошли так: {loginMethodLabel(device.method)}
                    </span>
                  ) : null}
                  {device.identifiedByMarker ? null : (
                    <span className="text-xs text-muted-foreground">
                      Это устройство узнано только по названию браузера — одинаковые телефоны здесь
                      сольются в одну строку. Так показываются входы, сделанные до того, как
                      устройства стали помечаться.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Одно и то же устройство узнаётся даже при смене адреса, поэтому вход через VPN виден как
          то же устройство, но из другой страны. Если почистить в браузере сохранённые данные сайта
          или зайти в приватном окне, устройство будет показано как новое — так устроено везде.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Список собран по двум тысячам последних входов, поэтому счётчик рядом с устройством — это
          входы в том же отрезке, а не за всё время. Сами записи о входах хранятся 13 месяцев,
          дальше удаляются. Страна определяется по адресу на нашем сервере, по справочнику DB-IP
          (db-ip.com); сам адрес никуда не передаётся.
        </p>
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Если вход сделали не вы</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-sm">
          Можно закрыть вход сразу на всех устройствах — и на своих тоже. После этого везде
          потребуется войти заново. Закрыть один отдельный вход, оставив остальные, пока нельзя.
        </p>
        <div className="mt-3">
          <Button type="button" variant="destructive" disabled={busy} onClick={revokeEverywhere}>
            Выйти со всех устройств
          </Button>
        </div>
      </DoctorSection>
    </div>
  );
}
