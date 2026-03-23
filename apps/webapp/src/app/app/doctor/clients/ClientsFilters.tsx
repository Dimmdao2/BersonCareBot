"use client";

import { useRouter } from "next/navigation";

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
    <div
      id="doctor-clients-filters"
      className="clients-filters"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}
    >
      <button
        type="button"
        id="doctor-clients-filter-telegram"
        className={`button ${defaults.telegram ? "clients-filters__btn--active" : ""}`}
        onClick={() => toggle("telegram")}
        aria-pressed={defaults.telegram}
      >
        С Telegram
      </button>
      <button
        type="button"
        id="doctor-clients-filter-max"
        className={`button ${defaults.max ? "clients-filters__btn--active" : ""}`}
        onClick={() => toggle("max")}
        aria-pressed={defaults.max}
      >
        С MAX
      </button>
      <button
        type="button"
        id="doctor-clients-filter-appointment"
        className={`button ${defaults.appointment ? "clients-filters__btn--active" : ""}`}
        onClick={() => toggle("appointment")}
        aria-pressed={defaults.appointment}
      >
        Есть запись
      </button>
    </div>
  );
}
