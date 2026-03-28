"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterDefaults = {
  telegram?: boolean;
  max?: boolean;
  appointment?: boolean;
  visitedMonth?: boolean;
};

type ClientsFiltersProps = {
  defaults: FilterDefaults;
  /** Если задан — мержит все флаги и обновляет URL одним replace (без потери остальных query). */
  onChange?: (next: {
    telegram: boolean;
    max: boolean;
    appointment: boolean;
    visitedMonth: boolean;
  }) => void;
  /** Только на странице «Клиенты» (не подписчики): фильтр совпадает с плиткой дашборда. */
  showVisitedMonthFilter?: boolean;
};

export function ClientsFilters({ defaults, onChange, showVisitedMonthFilter }: ClientsFiltersProps) {
  const router = useRouter();

  const toggle = (param: "telegram" | "max" | "appointment" | "visitedMonth") => {
    if (onChange) {
      onChange({
        telegram: param === "telegram" ? !defaults.telegram : !!defaults.telegram,
        max: param === "max" ? !defaults.max : !!defaults.max,
        appointment: param === "appointment" ? !defaults.appointment : !!defaults.appointment,
        visitedMonth: param === "visitedMonth" ? !defaults.visitedMonth : !!defaults.visitedMonth,
      });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const key = param === "visitedMonth" ? "visitedMonth" : param;
    const current = params.get(key) === "1";
    if (current) {
      params.delete(key);
    } else {
      params.set(key, "1");
    }
    const query = params.toString();
    router.push(`/app/doctor/clients${query ? `?${query}` : ""}`);
  };

  return (
    <div id="doctor-clients-filters" className="mb-4 flex flex-wrap gap-2">
      <Button
        type="button"
        id="doctor-clients-filter-telegram"
        size="sm"
        variant={defaults.telegram ? "default" : "outline"}
        className={cn(!defaults.telegram && "border-dashed")}
        onClick={() => toggle("telegram")}
        aria-pressed={defaults.telegram}
      >
        С Telegram
      </Button>
      <Button
        type="button"
        id="doctor-clients-filter-max"
        size="sm"
        variant={defaults.max ? "default" : "outline"}
        className={cn(!defaults.max && "border-dashed")}
        onClick={() => toggle("max")}
        aria-pressed={defaults.max}
      >
        С MAX
      </Button>
      <Button
        type="button"
        id="doctor-clients-filter-appointment"
        size="sm"
        variant={defaults.appointment ? "default" : "outline"}
        className={cn(!defaults.appointment && "border-dashed")}
        onClick={() => toggle("appointment")}
        aria-pressed={defaults.appointment}
      >
        Есть запись
      </Button>
      {showVisitedMonthFilter ? (
        <Button
          type="button"
          id="doctor-clients-filter-visited-month"
          size="sm"
          variant={defaults.visitedMonth ? "default" : "outline"}
          className={cn(!defaults.visitedMonth && "border-dashed")}
          onClick={() => toggle("visitedMonth")}
          aria-pressed={defaults.visitedMonth}
        >
          Приём в этом месяце
        </Button>
      ) : null}
    </div>
  );
}
