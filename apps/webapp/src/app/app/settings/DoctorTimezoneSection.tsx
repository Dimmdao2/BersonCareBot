"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StylesConfig } from "react-select";
import TimezoneSelect, { type ITimezone, type ITimezoneOption } from "react-timezone-select";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { apiJson } from "@/shared/lib/apiJson";
import { getBrowserCalendarIanaForAuth } from "@/shared/lib/browserCalendarIana";
import { mergePatientTimezoneSelectLabels } from "@/shared/timezone/patientTimezoneSelectLabels";

/**
 * Styles for react-timezone-select adapted to the doctor Shadcn theme.
 * Uses standard Shadcn CSS custom properties so it matches the rest of the UI.
 */
const doctorTzSelectStyles: StylesConfig<ITimezone, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
    backgroundColor: "hsl(var(--background))",
    boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring) / 0.2)" : "none",
    cursor: "pointer",
    opacity: state.isDisabled ? 0.5 : 1,
    "&:hover": { borderColor: "hsl(var(--border))" },
    fontSize: "0.875rem",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 60 }),
  menu: (base) => ({
    ...base,
    borderRadius: "calc(var(--radius) - 2px)",
    border: "1px solid hsl(var(--border))",
    overflow: "hidden",
    backgroundColor: "hsl(var(--popover))",
    boxShadow: "0 4px 16px rgb(0 0 0 / 0.12)",
    fontSize: "0.875rem",
  }),
  menuList: (base) => ({ ...base, padding: 0 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "hsl(var(--accent))" : "hsl(var(--popover))",
    color: state.isFocused ? "hsl(var(--accent-foreground))" : "hsl(var(--popover-foreground))",
    cursor: "pointer",
    fontSize: "0.875rem",
    lineHeight: 1.4,
  }),
  singleValue: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
    fontSize: "0.875rem",
  }),
  placeholder: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
    fontSize: "0.875rem",
  }),
  input: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
    fontSize: "0.875rem",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
    transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
    transition: "transform 0.15s ease",
  }),
};

export type DoctorTimezoneSectionProps = {
  initialTimezone: string | null;
};

export function DoctorTimezoneSection({ initialTimezone }: DoctorTimezoneSectionProps) {
  const [iana, setIana] = useState<string>(initialTimezone ?? "Europe/Moscow");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build timezone labels including any non-standard IANA from the doctor's saved value
  const timezoneLabels = useMemo(() => mergePatientTimezoneSelectLabels(iana), [iana]);

  // Dismiss the "Сохранено" flash after 3 s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  const persistTimezone = useCallback(async (value: string): Promise<boolean> => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/doctor/account/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: value }),
      });
      setSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка при сохранении");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSave = () => {
    void persistTimezone(iana);
  };

  const handleDetectFromBrowser = async () => {
    const browserTz = getBrowserCalendarIanaForAuth();
    if (!browserTz) {
      setError("Не удалось определить пояс в браузере.");
      return;
    }
    setIana(browserTz);
    await persistTimezone(browserTz);
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Часовой пояс</DoctorSectionTitle>
        <p className="text-xs text-muted-foreground">
          Вручную в списке или «Определить автоматически» — из настроек браузера.
        </p>
      </DoctorSectionHeader>
      <div className="flex flex-col gap-3 max-w-lg">
        {/* react-timezone-select/react-select value types conflict at TS level; runtime is correct */}
        <TimezoneSelect
          instanceId="doctor-calendar-tz"
          inputId="doctor-calendar-tz-input"
          value={iana as never}
          onChange={(tz: ITimezoneOption) => {
            setIana(tz.value);
            setSaved(false);
            setError(null);
          }}
          timezones={timezoneLabels}
          labelStyle="original"
          displayValue="UTC"
          isDisabled={saving}
          isSearchable
          styles={doctorTzSelectStyles as never}
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          menuPosition="fixed"
          maxMenuHeight={280}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={saving}
            onClick={() => void handleDetectFromBrowser()}
          >
            Определить автоматически
          </button>
        </div>
        {saved && <span className="text-xs text-green-600">Сохранено</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </DoctorSection>
  );
}
