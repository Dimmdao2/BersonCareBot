"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { BookingCatalogPackagesSection } from "@/app/app/settings/BookingCatalogPackagesSection";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingPrepaymentSection } from "@/app/app/settings/BookingPrepaymentSection";
import { BookingPaymentsSection } from "@/app/app/settings/BookingPaymentsSection";
import { BookingRubitimeMappingSection } from "@/app/app/settings/BookingRubitimeMappingSection";
import { BookingSoloAvailabilitySection } from "@/app/app/settings/BookingSoloAvailabilitySection";
import { BookingSoloFormFieldsSection } from "@/app/app/settings/BookingSoloFormFieldsSection";
import { BookingSoloLocationsSection } from "@/app/app/settings/BookingSoloLocationsSection";
import { BookingSoloServicesSection } from "@/app/app/settings/BookingSoloServicesSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { BookingRulesPageClient } from "@/app/app/doctor/admin/booking/BookingRulesPageClient";
import { parseBookingPaymentSettingsValue } from "@/modules/payments/bookingPaymentSettings";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { Button } from "@/shared/ui/doctor/primitives/button";
import type { ScheduleTabProps } from "../scheduleTabRegistry";

// ---------------------------------------------------------------------------
// Sub-nav section definition
// ---------------------------------------------------------------------------

type SetupSectionId =
  | "services"
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
  { id: "services",      label: "Услуги и пакеты" },
  { id: "locations",     label: "Локации" },
  { id: "form",          label: "Публичная форма" },
  { id: "payments",      label: "Оплаты" },
  { id: "rules",         label: "Правила записи" },
  { id: "integrations",  label: "Интеграции · Rubitime" },
];

const DEFAULT_SECTION: SetupSectionId = "services";

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

// ---------------------------------------------------------------------------
// Section content components
// ---------------------------------------------------------------------------

function SectionServices() {
  return (
    <div className="flex flex-col gap-3">
      <div className={BOOKING_CARD_GRID_CLASS}>
        <BookingSoloServicesSection />
        <BookingCatalogPackagesSection />
      </div>
    </div>
  );
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
        {activeSection === "services"     && <SectionServices />}
        {activeSection === "locations"    && <SectionLocations />}
        {activeSection === "form"         && <SectionForm />}
        {activeSection === "payments"     && <SectionPayments />}
        {activeSection === "rules"        && <SectionRules />}
        {activeSection === "integrations" && <SectionIntegrations />}
      </div>
    </div>
  );
}
