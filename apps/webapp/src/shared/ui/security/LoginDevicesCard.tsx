'use client';

/**
 * Карточка «Устройства, с которых входили» (#1112). Одна на два кабинета: админ платформы и
 * специалист.
 *
 * ⛔ Это НЕ список активных сессий, и называть его так нельзя. Сессии у нас не пронумерованы
 * (см. `docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md`, вариант B): узнать, жива ли каждая из
 * них, и погасить ОДНУ мы не можем. Можем показать устройства, с которых входили. Обещать человеку
 * кнопку, которой нет, — хуже, чем её отсутствие.
 *
 * Клиентский компонент ради одного: время показывается в часовом поясе ЧИТАЮЩЕГО. На сервере то же
 * `toLocaleString` отрисовало бы поясом сервера, и человек в другом городе увидел бы чужое время.
 */
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { countriesSummary, deviceSummary, loginMethodLabel } from './loginHistoryText';
import type { OwnLoginDevice } from '@/app-layer/identity/ownLoginDevices';

function whenText(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleString('ru-RU');
}

/**
 * «12 входов» — но именно в рассмотренном окне, а не за всё время: список устройств сворачивается по
 * последним двум тысячам входов (иначе экран зависел бы от длины истории). Поэтому окно названо
 * словами внизу карточки, а число тут не выдаётся за «всего».
 */
function loginCountText(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} входов`;
  if (last === 1) return `${count} вход`;
  if (last >= 2 && last <= 4) return `${count} входа`;
  return `${count} входов`;
}

export function LoginDevicesCard({
  devices,
  loadFailed,
}: {
  devices: OwnLoginDevice[];
  loadFailed: boolean;
}) {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Устройства, с которых входили</DoctorSectionTitle>
      </DoctorSectionHeader>

      {loadFailed ? (
        <p className="text-sm">
          Список устройств сейчас не загрузился. Остальные настройки безопасности на этой странице
          работают.
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
                    сольются в одну строку. Так показываются входы, сделанные до того, как устройства
                    стали помечаться.
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Одно и то же устройство узнаётся даже при смене адреса, поэтому вход через VPN виден как то же
        устройство, но из другой страны. Если почистить в браузере сохранённые данные сайта или зайти
        в приватном окне, устройство будет показано как новое — так устроено везде.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Список собран по двум тысячам последних входов, поэтому счётчик рядом с устройством — это
        входы в том же отрезке, а не за всё время. Сами записи о входах хранятся 13 месяцев, дальше
        удаляются. Страна определяется по адресу на нашем сервере, по справочнику DB-IP (db-ip.com);
        сам адрес никуда не передаётся.
      </p>
    </DoctorSection>
  );
}
