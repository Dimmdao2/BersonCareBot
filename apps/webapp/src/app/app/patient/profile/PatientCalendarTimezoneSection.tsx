"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StylesConfig } from "react-select";
import TimezoneSelect, { type ITimezone, type ITimezoneOption } from "react-timezone-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getBrowserCalendarIanaForAuth } from "@/shared/lib/browserCalendarIana";
import { mergePatientTimezoneSelectLabels } from "@/shared/timezone/patientTimezoneSelectLabels";
import { patientInlineLinkClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { useMobileViewport } from "@/app/app/patient/cabinet/useMobileViewport";
import { PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT } from "../PatientCalendarTimezoneBootstrap";

const patientTzSelectStyles: StylesConfig<ITimezone, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: "var(--patient-card-radius-mobile)",
    borderColor: "var(--patient-border)",
    backgroundColor: "var(--patient-card-bg)",
    boxShadow: "none",
    cursor: "pointer",
    opacity: state.isDisabled ? 0.6 : 1,
    ":hover": { borderColor: "var(--patient-border)" },
  }),
  menuPortal: (base) => ({ ...base, zIndex: 60 }),
  menu: (base) => ({
    ...base,
    borderRadius: 8,
    border: "1px solid var(--patient-border)",
    overflow: "hidden",
    backgroundColor: "var(--patient-card-bg)",
    boxShadow: "var(--patient-shadow-card-mobile)",
  }),
  menuList: (base) => ({ ...base, padding: 0 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "var(--patient-color-primary-soft)" : "var(--patient-card-bg)",
    color: "var(--patient-text-primary)",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: 1.35,
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--patient-text-primary)",
    fontSize: "1rem",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--patient-text-muted)",
    fontSize: "1rem",
  }),
  input: (base) => ({ ...base, color: "var(--patient-text-primary)", fontSize: "1rem" }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: "var(--patient-text-muted)",
    transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
    transition: "transform 0.15s ease",
  }),
};

export function PatientCalendarTimezoneSection() {
  const router = useRouter();
  const isMobileViewport = useMobileViewport();
  /** `null` в UI — в БД ещё нет своего IANA (плейсхолдер по умолчанию приложения). */
  const [iana, setIana] = useState<string | null>(null);
  const [appDefaultTimezonePlaceholder, setAppDefaultTimezonePlaceholder] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const timezoneLabels = useMemo(() => mergePatientTimezoneSelectLabels(iana), [iana]);

  const loadFromApi = useCallback(async () => {
    const res = await fetch("/api/patient/profile/calendar-timezone");
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      calendarTimezone?: string | null;
      appDefaultTimezonePlaceholder?: string;
    };
    if (res.ok && data?.ok) {
      const raw = data.calendarTimezone?.trim() ?? "";
      setIana(raw.length > 0 ? raw : null);
      setAppDefaultTimezonePlaceholder(typeof data.appDefaultTimezonePlaceholder === "string" ? data.appDefaultTimezonePlaceholder : "");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void loadFromApi();
  }, [loadFromApi]);

  useEffect(() => {
    const onBootstrap = () => {
      void loadFromApi();
    };
    window.addEventListener(PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT, onBootstrap);
    return () => window.removeEventListener(PATIENT_CALENDAR_TZ_BOOTSTRAP_EVENT, onBootstrap);
  }, [loadFromApi]);

  const persistCalendarTimezone = async (calendarTimezone: string | null) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/patient/profile/calendar-timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarTimezone }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(
          data.error === "invalid_timezone"
            ? "Выберите корректный пояс из списка."
            : "Не удалось сохранить.",
        );
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const trimmed = iana?.trim() ?? "";
    await persistCalendarTimezone(trimmed === "" ? null : trimmed);
  };

  const applyFromBrowser = async () => {
    const browserTz = getBrowserCalendarIanaForAuth();
    if (!browserTz) {
      setMsg("Не удалось определить пояс в браузере.");
      return;
    }
    setIana(browserTz);
    const ok = await persistCalendarTimezone(browserTz);
    if (!ok) void loadFromApi();
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--patient-border)] pt-4 first:border-t-0 first:pt-0">
      <Label htmlFor="patient-calendar-tz-input" className={cn(patientMutedTextClass, "text-xs font-normal uppercase tracking-wide")}>
        UTC (Часовой пояс)
      </Label>
      <p className={cn(patientMutedTextClass, "text-xs")}>
        Вручную в списке или «Определить автоматически» — из настроек браузера.
      </p>
      <div className="max-w-md">
        {/* react-timezone-select Props intersect react-select `value`/`styles` in a way TS rejects; runtime matches. */}
        <TimezoneSelect
          instanceId="patient-calendar-tz"
          inputId="patient-calendar-tz-input"
          value={(iana ?? undefined) as never}
          onChange={(tz: ITimezoneOption) => {
            setIana(tz.value);
            setMsg(null);
          }}
          timezones={timezoneLabels}
          labelStyle="original"
          displayValue="UTC"
          isDisabled={!loaded || saving}
          isSearchable={!isMobileViewport}
          placeholder={loaded && iana === null ? appDefaultTimezonePlaceholder || undefined : undefined}
          styles={patientTzSelectStyles as never}
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          menuPosition="fixed"
          maxMenuHeight={280}
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-nowrap items-center gap-2">
          <Button type="button" size="sm" disabled={!loaded || saving} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить пояс"}
          </Button>
          <button
            type="button"
            className={cn(patientInlineLinkClass, "text-xs shrink-0 disabled:pointer-events-none disabled:opacity-50")}
            disabled={!loaded || saving}
            onClick={() => void applyFromBrowser()}
          >
            Определить автоматически
          </button>
        </div>
        {msg ? <span className="text-xs text-destructive">{msg}</span> : null}
      </div>
    </div>
  );
}
