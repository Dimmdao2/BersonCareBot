'use client';

import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { ScheduleKpiFilterKey } from '../scheduleCalendarTypes';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// KPI Row (D2)
// ---------------------------------------------------------------------------

const KPI_ITEMS: Array<{ key: ScheduleKpiFilterKey | 'recordsInPeriod'; label: string }> = [
  { key: 'recordsInPeriod', label: 'Записей всего' },
  { key: 'futureInPeriod', label: 'Впереди' },
  { key: 'firstVisitInPeriod', label: 'Первичных' },
  { key: 'bySubscriptionInPeriod', label: 'По абонементу' },
  { key: 'cancellationsInPeriod', label: 'Отмены' },
  { key: 'reschedulesInPeriod', label: 'Переносы' },
];

type KpiRowTabProps = {
  kpis: ScheduleKpis | null;
  kpisLoading: boolean;
  selectedKpiFilters: ScheduleKpiFilterKey[];
  periodLabel: string;
  onKpiClick?: (key: ScheduleKpiFilterKey | 'recordsInPeriod') => void;
  /**
   * Режим списка: плитки остаются ФИЛЬТРАМИ, но без чисел. Владелец 15.09: «можно скрывать вообще
   * цифры в КПИ» → «ты в режиме списка убрал фильтры — а надо было цифры в них». Числа в ленте
   * описывали бы не то, что на экране: они посчитаны по якорному периоду (`visibleRange`), а лента
   * тянет историю месяцами и конца периода не имеет. Сам отбор по плиткам в ленте работает —
   * `kpiFilterPredicate` применяется в `visibleListAppointments`.
   *
   * Следствие, обязательное вместе с флагом: клик больше не гасится по `value > 0` — значение
   * якорного периода ничего не говорит о ленте, и нулём в нём запиралась бы рабочая плитка.
   *
   * Все пять плиток в ленте работают одинаково: каждый предикат решает по полям самой записи,
   * включая «Первичных» — с 15.09 признак первого посещения едет на записи (`isFirstVisit`), а не
   * списком id за окно КПИ.
   */
  valuesHidden?: boolean;
};

export function KpiRowTab({
  kpis,
  kpisLoading,
  selectedKpiFilters,
  periodLabel,
  onKpiClick,
  valuesHidden = false,
}: KpiRowTabProps) {
  return (
    <div className="flex flex-col gap-2">
      {periodLabel ? (
        // Владелец 14.09: на десктопе/планшете над кнопками фильтров теперь есть отдельный блок
        // «Период» (в правой панели фильтров) — эта подпись стала бы дублем. Прячем её от `md` и
        // выше тем же брейкпоинтом, что делит мобильный тулбар и десктопный/планшетный; на
        // мобильном (<768, `useIsMobileViewport`) блока «Период» в панели фильтров нет — подпись
        // здесь остаётся единственным источником периода для КПИ и не трогается.
        <p className="px-0.5 text-xs text-muted-foreground md:hidden" data-testid="cal-kpi-period">
          Период: {periodLabel}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2" data-testid="cal-kpi-row">
      {KPI_ITEMS.map(({ key, label }) => {
        const value = kpis?.[key] ?? 0;
        // «Записей всего» — не обычный фильтр: она отражает состояние «фильтров нет» (выделена по
        // умолчанию, пока список не сужен) и по клику СБРАСЫВАЕТ остальные, а не добавляется к ним
        // (владелец 14.09: «нажатие на „Записей всего“ должно сбрасывать все остальные»; «карточка
        // должна быть выделяемая и с ободком, если вообще записи есть в периоде» — то есть ободок,
        // как у остальных плиток, появляется только при value > 0).
        const isRecordsTile = key === 'recordsInPeriod';
        const selected = isRecordsTile
          ? selectedKpiFilters.length === 0 && (valuesHidden || value > 0)
          : selectedKpiFilters.includes(key);
        const clickable = isRecordsTile
          ? selectedKpiFilters.length > 0
          : valuesHidden || selected || value > 0;
        const handleClick = onKpiClick && clickable ? () => onKpiClick(key) : undefined;
        return (
          <DoctorStatCard
            key={key}
            id={`kpi-${key}`}
            title={label}
            value={
              valuesHidden ? null : kpisLoading && kpis === null ? (
                <span className="text-sm text-muted-foreground">…</span>
              ) : (
                value
              )
            }
            onClick={handleClick}
            selected={selected}
            testId={`kpi-${key}`}
          />
        );
        })}
      </div>
    </div>
  );
}
