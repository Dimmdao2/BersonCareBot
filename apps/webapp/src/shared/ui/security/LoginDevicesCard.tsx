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
// ⛔ ТОЛЬКО типы. Значение, импортированное отсюда, потянуло бы в клиентский набор весь путь до
// драйвера базы (`ownLoginDevices` → `userLoginEventsRead` → `runWebappSql`), и сборка падает на
// `worker_threads`. Поймано живым прогоном на DEV: экран отдавал 500.
import type { OwnLoginDevice, OwnLoginDeviceFailures } from '@/app-layer/identity/ownLoginDevices';

function whenText(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleString('ru-RU');
}

function dayText(iso: string | null): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value.toLocaleDateString('ru-RU');
}

function timesText(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} раз`;
  if (last === 1) return `${count} раз`;
  if (last >= 2 && last <= 4) return `${count} раза`;
  return `${count} раз`;
}

/**
 * `capped` значит, что считать разные адреса мы перестали. Тогда говорим «и более»: точного числа мы
 * не знаем и не делаем вид, что знаем — выдуманная точность здесь хуже, чем честное «не менее».
 */
function addressesText(count: number, capped: boolean): string {
  if (capped) return `${count} и более разных адресов`;
  return count === 1 ? 'одного адреса' : `${count} разных адресов`;
}

/** «перед входом 14.09.2026» либо просто «перед этим входом», если даты не осталось. */
function beforeLoginText(at: string | null): string {
  const day = dayText(at);
  return day ? `Перед входом ${day}` : 'Перед одним из входов';
}

/**
 * «, первая попытка — 03.09.2026» — но ТОЛЬКО когда она была раньше дня самого входа.
 *
 * Совпали дни — значит всё уложилось в одни сутки, и «первая попытка — 14.09» рядом с «перед входом
 * 14.09» ничего не добавляет, только тянет строку. Отрезок важен там, где он длинный: год подбора
 * читается совсем иначе, чем полчаса.
 */
function sinceText(since: string | null, at: string | null): string {
  const day = dayText(since);
  return day && day !== dayText(at) ? `, первая попытка — ${day}` : '';
}

/**
 * Что случилось до входов с этого устройства.
 *
 * Показываем НАИБОЛЬШЕЕ за отрезок, а не последнее: счёт обнуляется каждым успешным входом, и у
 * устройства, которым пользуются, последнее значение почти всегда ноль. Экран, показавший ноль,
 * скрыл бы от человека ровно то, ради чего считали, — поэтому рядом с числом стоит и дата.
 *
 * Три строки не сливаются в одну сумму намеренно: «на вашем устройстве», «с чужих устройств» и «код
 * подтверждения» — три разных происшествия, и лечатся они по-разному.
 */
function FailureLines({ failures }: { failures: OwnLoginDeviceFailures }) {
  return (
    <>
      {failures.passwords > 0 ? (
        <span>
          {beforeLoginText(failures.passwordsAt)} {timesText(failures.passwords)} ввели неверный
          пароль на этом устройстве{sinceText(failures.passwordsSince, failures.passwordsAt)}.
        </span>
      ) : null}
      {failures.unknownPasswords > 0 ? (
        <span>
          {beforeLoginText(failures.unknownAt)} {timesText(failures.unknownPasswords)} ввели неверный
          пароль от вашей учётной записи с устройств, с которых к нам не входили
          {failures.unknownSources > 0
            ? ` — с ${addressesText(failures.unknownSources, failures.unknownSourcesCapped)}`
            : ''}
          {sinceText(failures.unknownSince, failures.unknownAt)}.
        </span>
      ) : null}
      {failures.secondFactor > 0 ? (
        <span>
          {beforeLoginText(failures.secondFactorAt)} {timesText(failures.secondFactor)} ввели
          неверный код подтверждения. Пароль при этом уже подошёл — остановил только код.
        </span>
      ) : null}
    </>
  );
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
                {device.failures ? (
                  <span className="flex flex-col gap-1 text-foreground">
                    <FailureLines failures={device.failures} />
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
        входы в том же отрезке, а не за всё время. Неудачные попытки считаются между входами и
        обнуляются, как только вход удался, поэтому здесь показано наибольшее число за отрезок и
        день, когда оно набралось. Сами записи о входах хранятся 13 месяцев, дальше
        удаляются. Страна определяется по адресу на нашем сервере, по справочнику DB-IP (db-ip.com);
        сам адрес никуда не передаётся.
      </p>
    </DoctorSection>
  );
}
