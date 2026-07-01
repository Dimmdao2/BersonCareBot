"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingPrepaymentSection } from "@/app/app/settings/BookingPrepaymentSection";
import { BookingPaymentsSection } from "@/app/app/settings/BookingPaymentsSection";
import { BookingRubitimeMappingSection } from "@/app/app/settings/BookingRubitimeMappingSection";
import { BookingSoloAvailabilitySection } from "@/app/app/settings/BookingSoloAvailabilitySection";
import { BookingSoloFormFieldsSection } from "@/app/app/settings/BookingSoloFormFieldsSection";
import { BookingSoloLocationsSection } from "@/app/app/settings/BookingSoloLocationsSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { BookingRulesPageClient } from "@/app/app/doctor/admin/booking/BookingRulesPageClient";
import { parseBookingPaymentSettingsValue } from "@/modules/payments/bookingPaymentSettings";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { apiJson } from "@/shared/lib/apiJson";
import type { ScheduleTabProps } from "../scheduleTabRegistry";

// ---------------------------------------------------------------------------
// Sub-nav section definition
// ---------------------------------------------------------------------------

type SetupSectionId =
  | "calendar"
  | "locations"
  | "form"
  | "payments"
  | "rules"
  | "integrations";

type SetupSectionDef = {
  id: SetupSectionId;
  label: string;
};

const SETUP_SECTIONS: SetupSectionDef[] = [
  { id: "calendar",      label: "Календарь" },
  { id: "locations",     label: "Локации" },
  { id: "form",          label: "Публичная форма" },
  { id: "payments",      label: "Оплаты" },
  { id: "rules",         label: "Правила записи" },
  { id: "integrations",  label: "Интеграции · Rubitime" },
];

const DEFAULT_SECTION: SetupSectionId = "calendar";

function resolveSectionId(raw: string | undefined): SetupSectionId {
  if (SETUP_SECTIONS.some((s) => s.id === raw)) return raw as SetupSectionId;
  return DEFAULT_SECTION;
}

// ---------------------------------------------------------------------------
// Client-fetching wrapper for BookingPaymentsSection
// Payments page uses SSR props; we fetch them lazily from GET /api/admin/settings.
// ---------------------------------------------------------------------------

type PaymentSettingsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; paymentEnabled: boolean; providersJson: ReturnType<typeof parseBookingPaymentSettingsValue> };

function BookingPaymentsSectionLoader() {
  const [state, setState] = useState<PaymentSettingsState>({ phase: "loading" });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch("/api/admin/settings");
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Array<{ key: string; valueJson: unknown }>;
      } | null;
      if (!res.ok || !json?.ok) {
        setState({ phase: "error", message: "Не удалось загрузить настройки оплаты" });
        return;
      }
      const enabledRow = json.settings?.find((s) => s.key === "booking_payment_enabled");
      const providersRow = json.settings?.find((s) => s.key === "booking_payment_providers");
      const paymentEnabled =
        enabledRow != null &&
        enabledRow.valueJson !== null &&
        typeof enabledRow.valueJson === "object" &&
        (enabledRow.valueJson as Record<string, unknown>).value === true;
      const providersJson = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);
      setState({ phase: "ready", paymentEnabled, providersJson });
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Загрузка настроек оплаты…</p>;
  }
  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <BookingPaymentsSection
      paymentEnabled={state.paymentEnabled}
      providersJson={state.providersJson}
    />
  );
}

// ---------------------------------------------------------------------------
// Client-fetching wrapper for BookingRulesPageClient
// The "allowPastUnlink" flag is loaded from GET /api/admin/settings.
// ---------------------------------------------------------------------------

type RulesSettingsState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; allowPastUnlink: boolean };

function BookingRulesLoader() {
  const [state, setState] = useState<RulesSettingsState>({ phase: "loading" });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch("/api/admin/settings");
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Array<{ key: string; valueJson: unknown }>;
      } | null;
      if (!res.ok || !json?.ok) {
        setState({ phase: "error" });
        return;
      }
      const row = json.settings?.find(
        (s) => s.key === "booking_allow_doctor_unlink_past_package_sessions",
      );
      const allowPastUnlink =
        row != null &&
        row.valueJson !== null &&
        typeof row.valueJson === "object" &&
        (row.valueJson as Record<string, unknown>).value === true;
      setState({ phase: "ready", allowPastUnlink });
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Загрузка правил записи…</p>;
  }
  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Не удалось загрузить настройки</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <BookingRulesPageClient
      allowPastUnlinkPastPackageSessions={state.allowPastUnlink}
    />
  );
}

type CalendarSettingsRow = {
  key: string;
  valueJson: unknown;
};

type CalendarCatalogOption = {
  id: string;
  label: string;
  durationMinutes?: number;
};

type CalendarSettingsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      branches: CalendarCatalogOption[];
      services: CalendarCatalogOption[];
      defaultStart: string;
      defaultEnd: string;
      defaultBranchId: string | null;
      defaultServiceId: string | null;
    };

function getSettingValue(rows: CalendarSettingsRow[], key: string): unknown {
  const valueJson = rows.find((row) => row.key === key)?.valueJson;
  if (valueJson && typeof valueJson === "object" && "value" in valueJson) {
    return (valueJson as { value?: unknown }).value;
  }
  return null;
}

function minuteToTimeInput(minute: number): string {
  const safe = Math.max(0, Math.min(24 * 60, minute));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeInputToMinute(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function parseDefaultWindow(raw: unknown): { startMinute: number; endMinute: number } {
  if (raw && typeof raw === "object") {
    const obj = raw as { startMinute?: unknown; endMinute?: unknown };
    if (typeof obj.startMinute === "number" && typeof obj.endMinute === "number") {
      const startMinute = Math.max(0, Math.min(1439, Math.round(obj.startMinute)));
      const endMinute = Math.max(startMinute + 30, Math.min(1440, Math.round(obj.endMinute)));
      return { startMinute, endMinute };
    }
  }
  return { startMinute: 9 * 60, endMinute: 19 * 60 };
}

function stringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function ScheduleCalendarDefaultsSection() {
  const [state, setState] = useState<CalendarSettingsState>({ phase: "loading" });
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  const fetchCalendarSettings = useCallback(async (): Promise<CalendarSettingsState> => {
    const [settingsJson, calendarJson] = await Promise.all([
      apiJson<{ ok: boolean; settings: CalendarSettingsRow[] }>("/api/doctor/settings"),
      apiJson<{
        ok: boolean;
        filters: {
          branches: CalendarCatalogOption[];
          services: CalendarCatalogOption[];
        };
      }>("/api/doctor/booking-engine/calendar?view=day"),
    ]);
    const windowValue = parseDefaultWindow(
      getSettingValue(settingsJson.settings, "booking_calendar_default_window"),
    );
    return {
      phase: "ready",
      branches: calendarJson.filters.branches,
      services: calendarJson.filters.services,
      defaultStart: minuteToTimeInput(windowValue.startMinute),
      defaultEnd: minuteToTimeInput(windowValue.endMinute),
      defaultBranchId: stringOrNull(
        getSettingValue(settingsJson.settings, "booking_calendar_default_branch_id"),
      ),
      defaultServiceId: stringOrNull(
        getSettingValue(settingsJson.settings, "booking_calendar_default_service_id"),
      ),
    };
  }, []);

  const load = useCallback(() => {
    setSaved(false);
    startTransition(async () => {
      try {
        setState(await fetchCalendarSettings());
      } catch (e) {
        setState({ phase: "error", message: e instanceof Error ? e.message : "load_failed" });
      }
    });
  }, [fetchCalendarSettings]);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const next = await fetchCalendarSettings();
        if (!cancelled) setState(next);
      } catch (e) {
        if (!cancelled) {
          setState({ phase: "error", message: e instanceof Error ? e.message : "load_failed" });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchCalendarSettings]);

  function patchDoctorSetting(key: string, value: unknown): Promise<void> {
    return apiJson("/api/doctor/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: { value } }),
    }).then(() => undefined);
  }

  function updateReady(patch: Partial<Extract<CalendarSettingsState, { phase: "ready" }>>) {
    setState((prev) => (prev.phase === "ready" ? { ...prev, ...patch } : prev));
    setSaved(false);
  }

  function save() {
    if (state.phase !== "ready") return;
    const startMinute = timeInputToMinute(state.defaultStart);
    const endMinute = timeInputToMinute(state.defaultEnd);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      setState({ phase: "error", message: "Проверьте начало и конец окна календаря" });
      return;
    }
    startTransition(async () => {
      try {
        await Promise.all([
          patchDoctorSetting("booking_calendar_default_window", { startMinute, endMinute }),
          patchDoctorSetting("booking_calendar_default_branch_id", state.defaultBranchId),
          patchDoctorSetting("booking_calendar_default_service_id", state.defaultServiceId),
        ]);
        setSaved(true);
      } catch {
        setState({ phase: "error", message: "Не удалось сохранить настройки календаря" });
      }
    });
  }

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Загрузка настроек календаря…</p>;
  }
  if (state.phase === "error") {
    return (
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Календарь</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={load}>
            Повторить
          </Button>
        </div>
      </DoctorSection>
    );
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Календарь</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Окно календаря по умолчанию</Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              className="w-32"
              value={state.defaultStart}
              onChange={(e) => updateReady({ defaultStart: e.target.value })}
            />
            <span className="text-sm text-muted-foreground">—</span>
            <Input
              type="time"
              className="w-32"
              value={state.defaultEnd}
              onChange={(e) => updateReady({ defaultEnd: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Используется, когда в периоде нет рабочих часов или записей; если данные выходят за окно, сетка расширяется.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Филиал по умолчанию</Label>
          <Select
            value={state.defaultBranchId ?? "__none__"}
            onValueChange={(v) => updateReady({ defaultBranchId: v === "__none__" ? null : v })}
          >
            <SelectTrigger displayLabel={state.branches.find((b) => b.id === state.defaultBranchId)?.label ?? "Не выбран"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="Не выбран">Не выбран</SelectItem>
              {state.branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id} label={branch.label}>
                  {branch.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Услуга по умолчанию</Label>
          <Select
            value={state.defaultServiceId ?? "__none__"}
            onValueChange={(v) => updateReady({ defaultServiceId: v === "__none__" ? null : v })}
          >
            <SelectTrigger displayLabel={state.services.find((s) => s.id === state.defaultServiceId)?.label ?? "Не выбрана"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="Не выбрана">Не выбрана</SelectItem>
              {state.services.map((service) => (
                <SelectItem key={service.id} value={service.id} label={service.label}>
                  {service.label}
                  {service.durationMinutes ? ` · ${service.durationMinutes} мин` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" onClick={save}>
          Сохранить
        </Button>
        {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
      </div>
    </DoctorSection>
  );
}

// ---------------------------------------------------------------------------
// Section content components
// ---------------------------------------------------------------------------

function SectionCalendar() {
  return <ScheduleCalendarDefaultsSection />;
}

function SectionLocations() {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloLocationsSection />
      <BookingSoloAvailabilitySection />
    </div>
  );
}

function SectionForm() {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloFormFieldsSection />
      <div className={BOOKING_CARD_GRID_CLASS}>
        <BookingPublicWidgetSection />
        <BookingPublicAttributionSection />
      </div>
    </div>
  );
}

function SectionPayments() {
  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingPaymentsSectionLoader />
      <BookingPrepaymentSection />
    </div>
  );
}

function SectionRules() {
  return <BookingRulesLoader />;
}

function SectionIntegrations() {
  return (
    <div className="flex flex-col gap-4">
      <BookingRubitimeMappingSection />

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className={doctorSectionTitleClass}>Справочник Rubitime</summary>
        <div className="mt-3">
          <RubitimeSection />
        </div>
      </details>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Технические настройки</DoctorSectionTitle>
        </DoctorSectionHeader>
        <BookingEngineSection mode="integrations" />
      </DoctorSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleSetupTab — main component
// ---------------------------------------------------------------------------

/**
 * Таб «Настройки записи» раздела «Расписание».
 * Admin-only: навигация скрыта для не-администраторов.
 * Под-навигация секций по deep-link `section` ↔ scheduleTabRegistry deepLinkKeys: ["section"].
 */
export function ScheduleSetupTab({ deepLinkParams, onDeepLinkChange }: ScheduleTabProps) {
  const [activeSection, setActiveSectionState] = useState<SetupSectionId>(() =>
    resolveSectionId(deepLinkParams.section),
  );

  const setActiveSection = useCallback(
    (id: SetupSectionId) => {
      setActiveSectionState(id);
      onDeepLinkChange("section", id === DEFAULT_SECTION ? null : id);
    },
    [onDeepLinkChange],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="schedule-setup-tab">
      {/* Sub-navigation */}
      <nav
        className="flex flex-wrap gap-1"
        aria-label="Разделы настройки записи"
        data-testid="setup-subnav"
      >
        {SETUP_SECTIONS.map((sec) => (
          <Button
            key={sec.id}
            type="button"
            size="sm"
            variant={activeSection === sec.id ? "default" : "outline"}
            onClick={() => setActiveSection(sec.id)}
            data-testid={`setup-nav-${sec.id}`}
          >
            {sec.label}
          </Button>
        ))}
      </nav>

      {/* Active section content */}
      <div data-testid={`setup-section-${activeSection}`}>
        {activeSection === "calendar"     && <SectionCalendar />}
        {activeSection === "locations"    && <SectionLocations />}
        {activeSection === "form"         && <SectionForm />}
        {activeSection === "payments"     && <SectionPayments />}
        {activeSection === "rules"        && <SectionRules />}
        {activeSection === "integrations" && <SectionIntegrations />}
      </div>
    </div>
  );
}
