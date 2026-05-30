"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
import type { CalendarAppointmentEvent, CalendarFilterMeta } from "@/modules/booking-calendar/types";
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
  onClose: () => void;
  onChanged: () => void;
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

function DoctorCalendarEventPanelInner({ apiBase, selected, timeZone, filterMeta, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<"view" | "create" | "reschedule">("view");
  const [cancelType, setCancelType] = useState("free");
  const [newStartLocal, setNewStartLocal] = useState("");
  const [newEndLocal, setNewEndLocal] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<LifecycleResponse | null>(null);

  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createSpecialistId, setCreateSpecialistId] = useState<string | null>(null);
  const [createBranchId, setCreateBranchId] = useState<string | null>(null);
  const [createRoomId, setCreateRoomId] = useState<string | null>(null);
  const [createServiceId, setCreateServiceId] = useState<string | null>(null);
  const [createPhone, setCreatePhone] = useState("");
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!selectedId) return;
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
  }, [apiBase, selectedId]);

  if (!selected) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Запись</h2>
          {mode === "view" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("create")}>
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
            createStart={createStart}
            createEnd={createEnd}
            createSpecialistId={createSpecialistId}
            createBranchId={createBranchId}
            createRoomId={createRoomId}
            createServiceId={createServiceId}
            createPhone={createPhone}
            pending={pending}
            message={message}
            onStartChange={setCreateStart}
            onEndChange={setCreateEnd}
            onSpecialistChange={setCreateSpecialistId}
            onBranchChange={setCreateBranchId}
            onRoomChange={setCreateRoomId}
            onServiceChange={setCreateServiceId}
            onPhoneChange={setCreatePhone}
            onCancel={() => setMode("view")}
            onSubmit={() => {
              if (!createStart || !createEnd) return;
              const startAt = new Date(createStart).toISOString();
              const endAt = new Date(createEnd).toISOString();
              const durationMinutes = Math.max(
                1,
                Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
              );
              startTransition(async () => {
                const res = await fetch(`${apiBase}/appointments/manual`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    startAt,
                    endAt,
                    durationMinutes,
                    specialistId: createSpecialistId,
                    branchId: createBranchId,
                    roomId: createRoomId,
                    serviceId: createServiceId,
                    phoneNormalized: createPhone.trim() || null,
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
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{selected.patientName ?? "Запись"}</h2>
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
            href={`/app/doctor/clients/${encodeURIComponent(selected.platformUserId)}`}
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

      <BookingStaffPaymentPanel apiBase={apiBase} appointmentId={selected.id} />

      <AppointmentStaffCommentsSection appointmentId={selected.id} onChanged={onChanged} />

      {mode === "reschedule" ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label>Начало</Label>
          <Input type="datetime-local" value={newStartLocal} onChange={(e) => setNewStartLocal(e.target.value)} />
          <Label>Окончание</Label>
          <Input type="datetime-local" value={newEndLocal} onChange={(e) => setNewEndLocal(e.target.value)} />
        </div>
      ) : null}

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
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

type CreateFormProps = {
  filterMeta: CalendarFilterMeta;
  createStart: string;
  createEnd: string;
  createSpecialistId: string | null;
  createBranchId: string | null;
  createRoomId: string | null;
  createServiceId: string | null;
  createPhone: string;
  pending: boolean;
  message: string | null;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onSpecialistChange: (v: string | null) => void;
  onBranchChange: (v: string | null) => void;
  onRoomChange: (v: string | null) => void;
  onServiceChange: (v: string | null) => void;
  onPhoneChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

function CreateForm(props: CreateFormProps) {
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <Label>Начало</Label>
      <Input type="datetime-local" value={props.createStart} onChange={(e) => props.onStartChange(e.target.value)} />
      <Label>Окончание</Label>
      <Input type="datetime-local" value={props.createEnd} onChange={(e) => props.onEndChange(e.target.value)} />
      <Select
        value={props.createSpecialistId ?? noneValue()}
        onValueChange={(v) => props.onSpecialistChange(v === noneValue() ? null : v)}
      >
        <SelectTrigger
          displayLabel={
            props.filterMeta.specialists.find((o) => o.id === props.createSpecialistId)?.label ?? "Специалист"
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noneValue()} label="Специалист">
            Специалист
          </SelectItem>
          {props.filterMeta.specialists.map((o) => (
            <SelectItem key={o.id} value={o.id} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={props.createBranchId ?? noneValue()}
        onValueChange={(v) => props.onBranchChange(v === noneValue() ? null : v)}
      >
        <SelectTrigger
          displayLabel={props.filterMeta.branches.find((o) => o.id === props.createBranchId)?.label ?? "Филиал"}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noneValue()} label="Филиал">
            Филиал
          </SelectItem>
          {props.filterMeta.branches.map((o) => (
            <SelectItem key={o.id} value={o.id} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={props.createServiceId ?? noneValue()}
        onValueChange={(v) => props.onServiceChange(v === noneValue() ? null : v)}
      >
        <SelectTrigger
          displayLabel={props.filterMeta.services.find((o) => o.id === props.createServiceId)?.label ?? "Услуга"}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noneValue()} label="Услуга">
            Услуга
          </SelectItem>
          {props.filterMeta.services.map((o) => (
            <SelectItem key={o.id} value={o.id} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={props.createRoomId ?? noneValue()}
        onValueChange={(v) => props.onRoomChange(v === noneValue() ? null : v)}
      >
        <SelectTrigger
          displayLabel={props.filterMeta.rooms.find((o) => o.id === props.createRoomId)?.label ?? "Кабинет"}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={noneValue()} label="Кабинет">
            Кабинет
          </SelectItem>
          {props.filterMeta.rooms.map((o) => (
            <SelectItem key={o.id} value={o.id} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input placeholder="Телефон" value={props.createPhone} onChange={(e) => props.onPhoneChange(e.target.value)} />
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
