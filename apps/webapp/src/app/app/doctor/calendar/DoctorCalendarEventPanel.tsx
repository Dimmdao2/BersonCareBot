"use client";

import Link from "next/link";
import { doctorClientProfileHref } from "../clients/doctorClientProfileHref";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  doctorClientOverviewPrimaryCardClass,
  doctorClientSectionTitleClass,
} from "../clients/doctorClientCardChrome";
import type { CalendarAppointmentEvent, CalendarFilterMeta } from "@/modules/booking-calendar/types";
import type { CalendarCreateActiveFilters } from "@/modules/booking-calendar/calendarCreateFieldMode";
import {
  resolveCalendarCreateFieldMode,
  resolveCalendarCreateFieldValue,
} from "@/modules/booking-calendar/calendarCreateFieldMode";
import type {
  AppointmentCancellationRecord,
  AppointmentRescheduleRecord,
} from "@/modules/booking-appointment-lifecycle/ports";
import { appointmentStatusLabel } from "@/modules/booking-calendar/appointmentStatusLabels";
import {
  cancellationDecisionTypeLabel,
  paymentStatusLabel,
} from "@/modules/client-history/labels";
import { BookingStaffPaymentPanel } from "@/app/app/settings/BookingStaffPaymentPanel";
import { AppointmentStaffCommentsSection } from "@/app/app/doctor/clients/AppointmentStaffCommentsSection";
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from "./DoctorCalendarPatientSearch";
import { DoctorCalendarCreateFormField } from "./DoctorCalendarCreateFormField";

const CANCEL_TYPES = [
  { value: "free", label: "Бесплатная" },
  { value: "penalized", label: "Штрафная" },
  { value: "package_charged", label: "Со списанием" },
  { value: "no_package_charge", label: "Без списания" },
  { value: "retain_prepayment", label: "Удержание предоплаты" },
  { value: "refund_prepayment", label: "Возврат предоплаты" },
  { value: "custom", label: "Индивидуально" },
] as const;

type Props = {
  apiBase: string;
  selected: CalendarAppointmentEvent | null;
  timeZone: string;
  filterMeta: CalendarFilterMeta;
  activeFilters: CalendarCreateActiveFilters;
  onClose: () => void;
  onChanged: () => void;
  legacyReadOnly?: boolean;
};

type LifecycleResponse = {
  ok: boolean;
  reschedules: AppointmentRescheduleRecord[];
  cancellations: AppointmentCancellationRecord[];
};

function formatEventAt(iso: string, timeZone: string): string {
  return DateTime.fromISO(iso).setZone(timeZone).toFormat("dd.MM.yyyy HH:mm");
}

function noneValue() {
  return "__none__";
}

export function DoctorCalendarEventPanel(props: Props) {
  return <DoctorCalendarEventPanelInner key={props.selected?.id ?? "none"} {...props} />;
}

function DoctorCalendarEventPanelInner({
  apiBase,
  selected,
  timeZone,
  filterMeta,
  activeFilters,
  onClose,
  onChanged,
  legacyReadOnly = false,
}: Props) {
  const [mode, setMode] = useState<"view" | "create" | "reschedule">("view");
  const [cancelType, setCancelType] = useState("free");
  const [newStartLocal, setNewStartLocal] = useState("");
  const [newEndLocal, setNewEndLocal] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<LifecycleResponse | null>(null);

  const [createStart, setCreateStart] = useState("");
  const [createSpecialistId, setCreateSpecialistId] = useState<string | null>(null);
  const [createBranchId, setCreateBranchId] = useState<string | null>(null);
  const [createRoomId, setCreateRoomId] = useState<string | null>(null);
  const [createServiceId, setCreateServiceId] = useState<string | null>(null);
  const [createPatient, setCreatePatient] = useState<CalendarPatientOption | null>(null);
  const selectedId = selected?.id ?? null;

  const isLegacyEvent = legacyReadOnly || selected?.source === "rubitime_legacy";

  useEffect(() => {
    if (!selectedId || isLegacyEvent) return;
    let cancelled = false;
    void fetch(`${apiBase}/appointments/${encodeURIComponent(selectedId)}/lifecycle`)
      .then((res) => res.json())
      .then((json: LifecycleResponse) => {
        if (!cancelled && json.ok) setLifecycle(json);
      })
      .catch(() => {
        if (!cancelled) setLifecycle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, isLegacyEvent, selectedId]);

  const createDurationMinutes = useMemo(() => {
    if (!createServiceId) return null;
    return filterMeta.services.find((s) => s.id === createServiceId)?.durationMinutes ?? null;
  }, [createServiceId, filterMeta.services]);

  const openCreateForm = () => {
    setCreateSpecialistId(
      resolveCalendarCreateFieldValue(filterMeta.specialists, activeFilters.specialistId, createSpecialistId),
    );
    setCreateBranchId(
      resolveCalendarCreateFieldValue(filterMeta.branches, activeFilters.branchId, createBranchId),
    );
    setCreateRoomId(resolveCalendarCreateFieldValue(filterMeta.rooms, activeFilters.roomId, createRoomId));
    const nextServiceId = resolveCalendarCreateFieldValue(
      filterMeta.services,
      activeFilters.serviceId,
      createServiceId,
    );
    setCreateServiceId(nextServiceId);
    setMode("create");
  };

  if (!selected) {
    return (
      <div className={doctorClientOverviewPrimaryCardClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={doctorClientSectionTitleClass}>Запись</h2>
          {mode === "view" ? (
            <Button type="button" size="sm" variant="outline" onClick={openCreateForm}>
              Создать
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
              ×
            </Button>
          )}
        </div>
        {mode === "view" ? (
          <p className="text-sm text-muted-foreground">Выберите событие в календаре.</p>
        ) : (
          <CreateForm
            filterMeta={filterMeta}
            activeFilters={activeFilters}
            createStart={createStart}
            createDurationMinutes={createDurationMinutes}
            createSpecialistId={createSpecialistId}
            createBranchId={createBranchId}
            createRoomId={createRoomId}
            createServiceId={createServiceId}
            createPatient={createPatient}
            pending={pending}
            message={message}
            onStartChange={setCreateStart}
            onSpecialistChange={setCreateSpecialistId}
            onBranchChange={setCreateBranchId}
            onRoomChange={setCreateRoomId}
            onServiceChange={setCreateServiceId}
            onPatientChange={setCreatePatient}
            onCancel={() => setMode("view")}
            onSubmit={() => {
              if (!createStart || !createDurationMinutes) return;
              const startAt = new Date(createStart).toISOString();
              const endAt = new Date(
                new Date(createStart).getTime() + createDurationMinutes * 60_000,
              ).toISOString();
              startTransition(async () => {
                const res = await fetch(`${apiBase}/appointments/manual`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    startAt,
                    endAt,
                    durationMinutes: createDurationMinutes,
                    specialistId: createSpecialistId,
                    branchId: createBranchId,
                    roomId: createRoomId,
                    serviceId: createServiceId,
                    platformUserId: createPatient?.id ?? null,
                    phoneNormalized: createPatient?.phone?.trim() || null,
                  }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string };
                setMessage(json.ok ? "Создано" : (json.error ?? "error"));
                if (json.ok) {
                  setMode("view");
                  onChanged();
                }
              });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={doctorClientOverviewPrimaryCardClass}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className={doctorClientSectionTitleClass}>{selected.patientName ?? "Запись"}</h2>
          <p className="text-xs text-muted-foreground">{formatEventAt(selected.startAt, timeZone)}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        <Badge variant="outline">{appointmentStatusLabel(selected.status)}</Badge>
        {selected.prepaymentPending ? <Badge variant="secondary">Ожидает предоплаты</Badge> : null}
        {selected.serviceTitle ? <p>{selected.serviceTitle}</p> : null}
        {selected.specialistName ? <p>{selected.specialistName}</p> : null}
        {selected.branchTitle ? <p>{selected.branchTitle}</p> : null}
        {selected.roomTitle ? <p>{selected.roomTitle}</p> : null}
        {selected.patientPhone ? <p>{selected.patientPhone}</p> : null}
        {selected.platformUserId ? (
          <Link
            href={doctorClientProfileHref(selected.platformUserId, {
              profileListScope: "appointments",
            })}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Карточка клиента
          </Link>
        ) : null}
        {selected.packageTitle ? <Badge variant="secondary">{selected.packageTitle}</Badge> : null}
        {selected.paymentStatus ? (
          <Badge variant="secondary">Оплата: {paymentStatusLabel(selected.paymentStatus)}</Badge>
        ) : null}
        {selected.originalStartAt ? (
          <p className="text-xs text-muted-foreground">
            Исходное время: {formatEventAt(selected.originalStartAt, timeZone)}
          </p>
        ) : null}
        {selected.rescheduleCount > 0 ? (
          <p className="text-xs text-muted-foreground">Переносов: {selected.rescheduleCount}</p>
        ) : null}
        {selected.formComments.map((c) => (
          <p key={c.label} className="text-xs">
            {c.label}: {c.value}
          </p>
        ))}
        {lifecycle?.reschedules.length ? (
          <div className="space-y-1 border-t border-border pt-2">
            {lifecycle.reschedules.map((r) => (
              <p key={r.id} className="text-xs text-muted-foreground">
                Перенос: {formatEventAt(r.fromStartAt, timeZone)} → {formatEventAt(r.toStartAt, timeZone)}
                {r.staffComment ? ` · ${r.staffComment}` : ""}
              </p>
            ))}
          </div>
        ) : null}
        {lifecycle?.cancellations.length ? (
          <div className="space-y-1">
            {lifecycle.cancellations.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                Отмена ({cancellationDecisionTypeLabel(c.cancellationType)})
                {c.staffComment ? `: ${c.staffComment}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {isLegacyEvent ? null : <BookingStaffPaymentPanel apiBase={apiBase} appointmentId={selected.id} />}

      {isLegacyEvent ? null : (
        <AppointmentStaffCommentsSection appointmentId={selected.id} onChanged={onChanged} />
      )}

      {mode === "reschedule" && !isLegacyEvent ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label>Начало</Label>
          <Input type="datetime-local" value={newStartLocal} onChange={(e) => setNewStartLocal(e.target.value)} />
          <Label>Окончание</Label>
          <Input type="datetime-local" value={newEndLocal} onChange={(e) => setNewEndLocal(e.target.value)} />
        </div>
      ) : null}

      {isLegacyEvent ? null : (
      <div className="mt-4 flex flex-wrap gap-2">
        {mode !== "reschedule" ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setMode("reschedule")}>
            Перенести
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending || !newStartLocal || !newEndLocal}
            onClick={() => {
              const newStartAt = new Date(newStartLocal).toISOString();
              const newEndAt = new Date(newEndLocal).toISOString();
              const durationMinutes = Math.max(
                1,
                Math.round((new Date(newEndAt).getTime() - new Date(newStartAt).getTime()) / 60_000),
              );
              startTransition(async () => {
                const res = await fetch(`${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-reschedule`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ newStartAt, newEndAt, durationMinutes }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string };
                setMessage(json.ok ? "Перенесено" : (json.error ?? "error"));
                if (json.ok) onChanged();
                else setMode("view");
              });
            }}
          >
            Сохранить
          </Button>
        )}
        <Select value={cancelType} onValueChange={(v) => setCancelType(v ?? "free")}>
          <SelectTrigger className="w-[9rem]" displayLabel={CANCEL_TYPES.find((t) => t.value === cancelType)?.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CANCEL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} label={t.label}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const res = await fetch(`${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decisionType: cancelType }),
              });
              const json = (await res.json()) as { ok?: boolean; error?: string };
              setMessage(json.ok ? "Отменено" : (json.error ?? "error"));
              if (json.ok) onChanged();
            });
          }}
        >
          Отменить
        </Button>
      </div>
      )}
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

type CreateFormProps = {
  filterMeta: CalendarFilterMeta;
  activeFilters: CalendarCreateActiveFilters;
  createStart: string;
  createDurationMinutes: number | null;
  createSpecialistId: string | null;
  createBranchId: string | null;
  createRoomId: string | null;
  createServiceId: string | null;
  createPatient: CalendarPatientOption | null;
  pending: boolean;
  message: string | null;
  onStartChange: (v: string) => void;
  onSpecialistChange: (v: string | null) => void;
  onBranchChange: (v: string | null) => void;
  onRoomChange: (v: string | null) => void;
  onServiceChange: (v: string | null) => void;
  onPatientChange: (v: CalendarPatientOption | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

function CreateForm(props: CreateFormProps) {
  const durationLabel =
    props.createDurationMinutes != null ? `${props.createDurationMinutes} мин` : "—";

  const specialistMode = resolveCalendarCreateFieldMode(
    props.filterMeta.specialists,
    props.activeFilters.specialistId,
  );
  const branchMode = resolveCalendarCreateFieldMode(props.filterMeta.branches, props.activeFilters.branchId);
  const serviceMode = resolveCalendarCreateFieldMode(props.filterMeta.services, props.activeFilters.serviceId);
  const roomMode = resolveCalendarCreateFieldMode(props.filterMeta.rooms, props.activeFilters.roomId);

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <DoctorCalendarPatientSearch
        value={props.createPatient}
        onChange={props.onPatientChange}
        disabled={props.pending}
      />
      <Label>Начало</Label>
      <Input type="datetime-local" value={props.createStart} onChange={(e) => props.onStartChange(e.target.value)} />
      <DoctorCalendarCreateFormField
        fieldLabel="Специалист"
        mode={specialistMode}
        options={props.filterMeta.specialists}
        value={props.createSpecialistId}
        noneLabel="Специалист"
        onChange={props.onSpecialistChange}
      />
      <DoctorCalendarCreateFormField
        fieldLabel="Филиал"
        mode={branchMode}
        options={props.filterMeta.branches}
        value={props.createBranchId}
        noneLabel="Филиал"
        onChange={props.onBranchChange}
      />
      <DoctorCalendarCreateFormField
        fieldLabel="Услуга"
        mode={serviceMode}
        options={props.filterMeta.services}
        value={props.createServiceId}
        noneLabel="Услуга"
        onChange={props.onServiceChange}
      />
      <Label>Длительность</Label>
      <Input readOnly value={durationLabel} aria-label="Длительность" />
      <DoctorCalendarCreateFormField
        fieldLabel="Кабинет"
        mode={roomMode}
        options={props.filterMeta.rooms}
        value={props.createRoomId}
        noneLabel="Кабинет"
        onChange={props.onRoomChange}
      />
      <div className="flex gap-2 pt-2">
        <Button type="button" size="sm" disabled={props.pending} onClick={props.onSubmit}>
          Сохранить
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={props.onCancel}>
          Отмена
        </Button>
      </div>
      {props.message ? <p className="text-xs text-muted-foreground">{props.message}</p> : null}
    </div>
  );
}
