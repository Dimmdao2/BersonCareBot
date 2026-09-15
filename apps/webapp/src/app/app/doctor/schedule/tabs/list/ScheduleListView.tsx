'use client';

import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { DoctorAppointmentIndicators } from '@/app/app/doctor/calendar/DoctorAppointmentIndicators';
import { cn } from '@/lib/utils';
import {
  isCancelledAppointmentStatus,
} from '@/modules/booking-calendar/appointmentStatusLabels';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { doctorCalendarBranchColorRgba } from '@/shared/ui/doctor/calendar/doctorCalendarPresentation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { capitalizeRussianLabel, parseFeedInstant } from '../scheduleCalendarUtils';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// List view — continuous, paged appointment feed grouped by month and day
// ---------------------------------------------------------------------------

type ListDayCardProps = {
  dateKey: string;
  label: string;
  appointments: CalendarAppointmentEvent[];
  timeZone: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  nextApptId?: string;
  branchShortLabels: ReadonlyMap<string, string>;
  showSpecialist: boolean;
};

// R29: фон строки списка повторяет статусную палитру календаря (eventClassName);
// прошедшие приглушаются, отменённые — destructive + line-through.
//
// Владелец 15.09.2026: «в списке давай красить в цвет филиала только колонку с датой-временем и
// коротким названием филиала. Само называние филиала писать черным». Поэтому цвет филиала больше
// не заливает СТРОКУ — он живёт ровно в левой колонке (см. `branchColumnClass`), а строка остаётся
// нейтральной. Статусная палитра (отменённая, прошедшая) по-прежнему принадлежит строке: это не
// про филиал.
function listRowClass(appt: CalendarAppointmentEvent, timeZone: string): string {
  if (isCancelledAppointmentStatus(appt.status))
    return 'border-destructive/25 bg-destructive/10 text-destructive/80 hover:bg-destructive/15';
  const isPast = parseFeedInstant(appt.startAt, timeZone) < DateTime.now();
  const base = appt.branchColor
    ? 'border-border/60 bg-transparent text-foreground hover:bg-muted/50'
    : 'border-primary/30 bg-primary/10 hover:bg-primary/15';
  return cn(base, isPast && 'opacity-60');
}

function listRowStyle(appt: CalendarAppointmentEvent): CSSProperties | undefined {
  if (!appt.branchColor || isCancelledAppointmentStatus(appt.status)) return undefined;
  // Заливка колонки заметно плотнее прежней строчной (0.16): раньше цвет дублировался подписью
  // филиала, теперь подпись чёрная и заливка осталась единственным носителем цвета.
  const background = doctorCalendarBranchColorRgba(appt.branchColor, 0.3);
  if (!background) return undefined;
  return { '--list-branch-bg': background } as CSSProperties;
}

function ListDayCard({
  dateKey,
  label,
  appointments,
  timeZone,
  onSelect,
  nextApptId,
  branchShortLabels,
  showSpecialist,
}: ListDayCardProps) {
  return (
    // Владелец 14.09: «стандартный плоский список … заполнение так же как на мобиле, а
    // контейнер … как на десктопных клиентах / чатах» — раньше каждый день был своей
    // скруглённой карточкой (md:rounded-xl md:border md:p-3), а КАЖДАЯ запись внутри неё —
    // ЕЩЁ одной вложенной карточкой (md:rounded-md md:border). Теперь и день, и запись
    // плоские на всех брейкпоинтах (мобильное оформление); цветовую палитру по филиалу/
    // статусу (R29, listRowClass/listRowStyle) не трогаем — она остаётся волосяной нижней
    // границей и фоновой заливкой, просто без обводки со всех сторон и скругления.
    <div className="flex flex-col" data-testid={`list-day-${dateKey}`}>
      <p
        data-list-day-heading={dateKey}
        className="border-b border-border/60 px-[var(--doctor-list-inline-padding,18px)] py-2 text-sm font-semibold capitalize text-foreground"
      >
        {label}
      </p>
      <div className="flex flex-col">
        {appointments.map((appt) => {
          const start = parseFeedInstant(appt.startAt, timeZone).toFormat('HH:mm');
          const end = parseFeedInstant(appt.endAt, timeZone).toFormat('HH:mm');
          const cancelled = isCancelledAppointmentStatus(appt.status);
          const isNext = appt.id === nextApptId;
          const branchLabel = appt.branchId
            ? (branchShortLabels.get(appt.branchId) ?? appt.branchTitle)
            : appt.branchTitle;
          return (
            <Button
              key={appt.id}
              type="button"
              variant="ghost"
              onClick={() => onSelect(appt)}
              style={listRowStyle(appt)}
              className={cn(
                'flex h-auto min-h-0 w-full items-stretch gap-3 whitespace-normal rounded-none border-0 border-b border-border/60 px-[var(--doctor-list-inline-padding,18px)] py-2.5 text-left text-sm',
                listRowClass(appt, timeZone),
                // APPT-LIST-01: отметка ближайшей записи идёт ПОСЛЕ палитры строки — иначе
                // tailwind-merge считает `border-primary/30` из палитры конфликтующим и
                // выбрасывает цвет верхней линии. Нижняя линия остаётся обычным разделителем,
                // чтобы синей была ровно одна линия и только сверху.
                isNext ? 'border-t-2 !border-t-primary border-b-border/60' : '',
              )}
              data-testid={`list-appt-${appt.id}`}
            >
              {/* Единственное место, где живёт цвет филиала: КОЛОНКА «время + короткое имя
                  филиала» — сплошная полоса во всю высоту строки, вплотную к левому краю.
                  Отрицательные отступы гасят паддинги строки, поэтому это колонка, а не таблетка
                  внутри строки. Подпись филиала печатается обычным чёрным текстом; цвет несёт
                  только заливка. */}
              <span
                className={cn(
                  'flex shrink-0 flex-col justify-center gap-0.5 overflow-hidden text-xs',
                  appt.branchColor && !cancelled
                    ? '-my-2.5 -ml-[var(--doctor-list-inline-padding,18px)] w-[5.75rem] bg-[color:var(--list-branch-bg)] py-2.5 pl-[var(--doctor-list-inline-padding,18px)] pr-2'
                    : 'w-[4.75rem]',
                )}
              >
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {start}–{end}
                </span>
                {branchLabel ? (
                  <span
                    className={cn(
                      'truncate',
                      appt.branchColor && !cancelled ? 'font-medium' : 'text-muted-foreground',
                    )}
                    title={appt.branchTitle ?? undefined}
                  >
                    {branchLabel}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', cancelled && 'line-through')}>
                  {appt.patientName ?? 'Запись'}
                </span>
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {showSpecialist && appt.specialistName ? (
                    <span className="truncate">{appt.specialistName}</span>
                  ) : null}
                  {appt.serviceTitle ? <span className="truncate">{appt.serviceTitle}</span> : null}
                </span>
              </span>
              <DoctorAppointmentIndicators
                className="mt-0.5"
                deliveryFormat={appt.deliveryFormat}
                hasPackage={Boolean(appt.packageUsageRef || appt.packageTitle)}
                appointmentStatus={appt.status}
                paymentStatus={appt.payment?.payment?.status ?? appt.paymentStatus}
                paymentAmountMinor={appt.payment?.payment?.amountMinor}
                totalMinor={appt.payment?.totalMinor}
                manualPaidMinor={appt.payment?.manualPaidMinor}
                prepaymentRequiredMinor={appt.payment?.prepayment?.requiredMinor}
                prepaymentPaidMinor={appt.payment?.prepayment?.paidMinor}
                prepaymentPending={appt.prepaymentPending}
                prepaymentExpired={appt.prepaymentExpired}
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

type ListViewProps = {
  appointments: CalendarAppointmentEvent[];
  anchorDate: string;
  timeZone: string;
  loading: boolean;
  loadingEarlier: boolean;
  loadingLater: boolean;
  hasEarlier: boolean;
  hasLater: boolean;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  branchShortLabels: ReadonlyMap<string, string>;
  showSpecialist: boolean;
  scrollToTodayRequest: number;
  /** Дата, которую лента показывает наверху экрана; обновляется при прокрутке (п.7). */
  onVisibleDateChange?: (dateKey: string) => void;
  /**
   * Счётчик полных перезагрузок ленты. Растёт, когда лента перезапрошена целиком (смена фильтров),
   * и заставляет заново встать на `anchorDate`: иначе после подмены всего массива записей браузер
   * оставляет прежний `scrollTop`, а он указывает уже в другое место (владелец 15.09, п.1).
   */
  repositionRequest: number;
};

export function ListView({
  appointments,
  anchorDate,
  timeZone,
  loading,
  loadingEarlier,
  loadingLater,
  hasEarlier,
  hasLater,
  onLoadEarlier,
  onLoadLater,
  onSelect,
  branchShortLabels,
  showSpecialist,
  scrollToTodayRequest,
  onVisibleDateChange,
  repositionRequest,
}: ListViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorMarkerRef = useRef<HTMLDivElement>(null);
  const earlierSentinelRef = useRef<HTMLDivElement>(null);
  const laterSentinelRef = useRef<HTMLDivElement>(null);
  const positionedAnchorRef = useRef<string | null>(null);
  const positionedTodayRequestRef = useRef(0);
  const positionedRepositionRef = useRef(0);
  const prependSnapshotRef = useRef<{ height: number; top: number } | null>(null);
  const dayGroups = useMemo<
    Array<{
      dateKey: string;
      label: string;
      monthKey: string;
      monthLabel: string;
      appointments: CalendarAppointmentEvent[];
    }>
  >(() => {
    const byDay = new Map<string, CalendarAppointmentEvent[]>();
    for (const appointment of appointments) {
      const dayKey = parseFeedInstant(appointment.startAt, timeZone).toISODate();
      if (!dayKey) continue;
      const group = byDay.get(dayKey) ?? [];
      group.push(appointment);
      byDay.set(dayKey, group);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, items]) => {
        const day = DateTime.fromISO(dateKey, { zone: timeZone }).setLocale('ru');
        return {
          dateKey,
          label: day.toFormat('cccc, d LLLL'),
          monthKey: day.toFormat('yyyy-MM'),
          monthLabel: capitalizeRussianLabel(day.toFormat('LLLL yyyy')),
          appointments: items.sort((a, b) => {
            const ac = isCancelledAppointmentStatus(a.status) ? 1 : 0;
            const bc = isCancelledAppointmentStatus(b.status) ? 1 : 0;
            if (ac !== bc) return ac - bc;
            return a.startAt.localeCompare(b.startAt);
          }),
        };
      });
  }, [appointments, timeZone]);

  // SCH-09: find first upcoming non-cancelled appointment across all day groups
  const now = DateTime.now().setZone(timeZone);
  let nextApptId: string | undefined;
  outer: for (const { appointments } of dayGroups) {
    for (const appt of appointments) {
      if (
        !isCancelledAppointmentStatus(appt.status) &&
        parseFeedInstant(appt.startAt, timeZone) > now
      ) {
        nextApptId = appt.id;
        break outer;
      }
    }
  }

  const firstGroupAtOrAfterAnchor = dayGroups.findIndex(({ dateKey }) => dateKey >= anchorDate);
  const anchorMarkerIndex =
    firstGroupAtOrAfterAnchor === -1
      ? Math.max(0, dayGroups.length - 1)
      : firstGroupAtOrAfterAnchor;

  useEffect(() => {
    const scrollNode = scrollRef.current;
    const markerNode = anchorMarkerRef.current;
    if (
      loading ||
      !scrollNode ||
      !markerNode ||
      (positionedAnchorRef.current === anchorDate &&
        positionedTodayRequestRef.current === scrollToTodayRequest &&
        positionedRepositionRef.current === repositionRequest)
    ) {
      return;
    }
    const isExplicitTodayRequest = scrollToTodayRequest > positionedTodayRequestRef.current;
    const frame = window.requestAnimationFrame(() => {
      // Владелец 14.09: наверху экрана должна быть ДАТА, а не строка ближайшей записи — «я вижу
      // весь сегодняшний день». Поэтому цель прокрутки всегда заголовок дня; отметка ближайшей
      // записи остаётся на своём месте как граница прошлого и будущего, но к ней не прокручиваем.
      const targetNode = markerNode;
      const targetTop =
        targetNode.getBoundingClientRect().top -
        scrollNode.getBoundingClientRect().top +
        scrollNode.scrollTop;
      scrollNode.scrollTo({
        top: Math.max(0, targetTop - 8),
        behavior: isExplicitTodayRequest ? 'smooth' : 'auto',
      });
      positionedAnchorRef.current = anchorDate;
      positionedTodayRequestRef.current = scrollToTodayRequest;
      positionedRepositionRef.current = repositionRequest;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchorDate, loading, repositionRequest, scrollToTodayRequest]);

  useEffect(() => {
    const root = scrollRef.current;
    const earlier = earlierSentinelRef.current;
    const later = laterSentinelRef.current;
    if (!root || !earlier || !later || loading || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (
            entry.target === earlier &&
            positionedAnchorRef.current === anchorDate &&
            hasEarlier &&
            !loadingEarlier
          ) {
            prependSnapshotRef.current = { height: root.scrollHeight, top: root.scrollTop };
            onLoadEarlier();
          }
          if (entry.target === later && hasLater && !loadingLater) onLoadLater();
        }
      },
      { root, rootMargin: '240px 0px' },
    );
    observer.observe(earlier);
    observer.observe(later);
    return () => observer.disconnect();
  }, [
    anchorDate,
    hasEarlier,
    hasLater,
    loading,
    loadingEarlier,
    loadingLater,
    onLoadEarlier,
    onLoadLater,
  ]);

  useEffect(() => {
    const snapshot = prependSnapshotRef.current;
    const root = scrollRef.current;
    if (!snapshot || !root || loadingEarlier) return;
    root.scrollTop = snapshot.top + (root.scrollHeight - snapshot.height);
    prependSnapshotRef.current = null;
  }, [appointments.length, loadingEarlier]);

  /**
   * Какая дата сейчас наверху ленты (владелец 15.09, п.7: «в режиме списка писать только дату
   * начала отображаемого списка и обновлять ее при прокрутке списка»).
   *
   * Наблюдаем ЗАГОЛОВКИ ДНЕЙ, а не строки записей: их десятки, а не тысячи, и наблюдатель не
   * просыпается на каждый пиксель прокрутки. Из пересечённых берём последний, чья верхняя граница
   * уже ушла выше линии отсечки — это и есть день, чьи записи сейчас на экране. Результат уходит
   * наверх колбэком, который переписывает подпись кнопки напрямую в DOM, без состояния и без
   * перерисовки ленты.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !onVisibleDateChange || typeof IntersectionObserver === 'undefined') return;
    const headings = [...root.querySelectorAll<HTMLElement>('[data-list-day-heading]')];
    if (headings.length === 0) return;

    const report = () => {
      const rootTop = root.getBoundingClientRect().top;
      let current: string | null = null;
      for (const heading of headings) {
        // 12px — та же щель, что и при прокрутке к якорю (`targetTop - 8`) плюс запас на рамку;
        // без неё заголовок, стоящий ровно на границе, отдавал бы предыдущий день.
        if (heading.getBoundingClientRect().top - rootTop <= 12) {
          current = heading.dataset.listDayHeading ?? null;
        } else break;
      }
      const next = current ?? headings[0]?.dataset.listDayHeading ?? null;
      if (next) onVisibleDateChange(next);
    };

    const observer = new IntersectionObserver(report, {
      root,
      rootMargin: '0px 0px -85% 0px',
    });
    for (const heading of headings) observer.observe(heading);
    report();
    return () => observer.disconnect();
  }, [dayGroups, onVisibleDateChange]);

  return (
    // Владелец 14.09: контейнер списка — как на десктопных «Клиенты»/«Сообщения»/«Комментарии»
    // (`data-doctor-flat-list-surface`, edge-to-edge на мобильном, рамка+скругление от `md:`).
    // Раньше каждый день был своей карточкой с зазором (`md:gap-3`) между ними — теперь один
    // непрерывный список, дни разделяет собственный заголовок дня (`border-b` в `ListDayCard`).
    <div
      ref={scrollRef}
      data-doctor-flat-list-surface
      className="flex h-full min-h-0 flex-col overflow-y-auto rounded-none border-0 bg-card md:rounded-lg md:border md:border-border md:pr-1"
      data-testid="list-view"
    >
      <div ref={earlierSentinelRef} className="h-px" aria-hidden />
      {loadingEarlier ? <DoctorPanelLoading className="py-3" /> : null}
      {loading ? (
        <DoctorPanelLoading className="p-6" />
      ) : dayGroups.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          data-testid="list-empty"
        >
          Записей нет
        </div>
      ) : (
        <>
          {dayGroups.map(({ dateKey, label, appointments }, index) => (
            <Fragment key={dateKey}>
              {index === 0 || dayGroups[index - 1]?.monthKey !== dayGroups[index]?.monthKey ? (
                <p className="mt-2 border-t border-border/70 px-[var(--doctor-list-inline-padding,18px)] py-4 text-center text-base font-normal capitalize text-foreground">
                  {dayGroups[index]?.monthLabel}
                </p>
              ) : null}
              {/*
                Маркер прокрутки — ПОСЛЕ заголовка месяца, чтобы на первом дне месяца целью
                становился заголовок дня, а не заголовок месяца (аудит 14.09, Э1 FAIL).
              */}
              {index === anchorMarkerIndex ? <div ref={anchorMarkerRef} /> : null}
              <ListDayCard
                dateKey={dateKey}
                label={label}
                appointments={appointments}
                timeZone={timeZone}
                onSelect={onSelect}
                nextApptId={nextApptId}
                branchShortLabels={branchShortLabels}
                showSpecialist={showSpecialist}
              />
            </Fragment>
          ))}
        </>
      )}
      {loadingLater ? <DoctorPanelLoading className="py-3" /> : null}
      <div ref={laterSentinelRef} className="h-px" aria-hidden />
    </div>
  );
}
