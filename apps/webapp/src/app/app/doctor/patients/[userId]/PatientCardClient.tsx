"use client";

/**
 * PatientCardClient — Wave 1 placeholder.
 * Shows card header fields and static tab labels.
 * Wave 2 builds the real shell (header + 6-tab client nav + layout).
 */
import { use } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";

type Props = {
  cardHeaderPromise: Promise<PatientCardHeader | null>;
};

const PATIENT_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "karta", label: "Карта" },
  { id: "program", label: "Программа" },
  { id: "records", label: "Записи" },
  { id: "files", label: "Файлы" },
  { id: "account", label: "Учётка" },
] as const;

export function PatientCardClient({ cardHeaderPromise }: Props) {
  const header = use(cardHeaderPromise);

  if (!header) {
    return (
      <div className={doctorSectionCardClass}>
        <p className="text-sm text-muted-foreground">Пациент не найден.</p>
      </div>
    );
  }

  const { identity, support, lastVisit, nextAppointment, totalVisits, cancellationsCount, reschedulesCount } = header;

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header card */}
      <div className={doctorSectionCardClass}>
        <div className="flex flex-wrap gap-3 items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={doctorSectionTitleClass}>
                {[identity.lastName, identity.firstName].filter(Boolean).join(" ") || identity.displayName}
              </p>
              {support.isOnSupport && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  На сопровождении
                </span>
              )}
            </div>
            {identity.displayName && identity.firstName && (
              <p className="text-xs text-muted-foreground">отображаемое: {identity.displayName}</p>
            )}
            {/* TODO (Wave 2): birthDate, age — not available yet */}
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
              {identity.phone && <span className="font-mono">{identity.phone}</span>}
              {identity.email && <span>{identity.email}</span>}
              {identity.bindings.telegramId && (
                <span className="text-xs">TG: {identity.bindings.telegramId}</span>
              )}
              {identity.bindings.maxId && (
                <span className="text-xs">MAX: {identity.bindings.maxId}</span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 text-sm shrink-0">
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Прошлый визит</span>
              <span className="font-semibold">{formatDate(lastVisit?.date ?? null) ?? "—"}</span>
              {/* TODO (Wave 2): lastVisit.visitType, lastVisit.city */}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Следующая запись</span>
              <span className="font-semibold">
                {nextAppointment ? `${formatDate(nextAppointment.date)} · ${nextAppointment.time}` : "—"}
              </span>
              {/* TODO (Wave 2): nextAppointment.city, nextAppointment.appointmentType */}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Визитов</span>
              <span className="font-semibold">{totalVisits}</span>
              <span className="text-xs text-muted-foreground">
                отм: {cancellationsCount} · перен: {reschedulesCount}
              </span>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="mt-3 pt-2 border-t border-border/60 flex gap-1 flex-wrap">
          {PATIENT_TABS.map((tab, i) => (
            <span
              key={tab.id}
              className={[
                "rounded-md px-3 py-1 text-sm cursor-pointer select-none",
                i === 0
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/60",
              ].join(" ")}
            >
              {tab.label}
            </span>
          ))}
        </div>
      </div>

      {/* Tab content placeholder */}
      <div className={doctorSectionCardClass}>
        <p className="text-sm text-muted-foreground">
          {/* TODO (Wave 2): render tab content for Обзор, Карта, Программа, Записи, Файлы, Учётка */}
          Wave 2 — содержимое вкладок пациента
        </p>
      </div>
    </div>
  );
}
