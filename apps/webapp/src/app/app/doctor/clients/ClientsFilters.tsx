"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ClientsFiltersProps = {
  defaults: { telegram?: boolean; max?: boolean; appointment?: boolean };
  /** Если задан — мержит все флаги и обновляет URL одним replace (без потери остальных query). */
  onChange?: (next: { telegram: boolean; max: boolean; appointment: boolean }) => void;
};

export function ClientsFilters({ defaults, onChange }: ClientsFiltersProps) {
  const router = useRouter();

  const toggle = (param: "telegram" | "max" | "appointment") => {
    if (onChange) {
      onChange({
        telegram: param === "telegram" ? !defaults.telegram : !!defaults.telegram,
        max: param === "max" ? !defaults.max : !!defaults.max,
        appointment: param === "appointment" ? !defaults.appointment : !!defaults.appointment,
      });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const current = params.get(param) === "1";
    if (current) {
      params.delete(param);
    } else {
      params.set(param, "1");
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
    </div>
  );
}
