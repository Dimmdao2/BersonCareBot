"use client";

import { useState } from "react";
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
import { isStaffDeletableCancelledStatus } from "@/modules/booking-calendar/appointmentStatusLabels";

const API_BASE = "/api/doctor/booking-engine";

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
  recordId: string;
  status: string;
  onChanged?: () => void;
};

function isCanonicalAppointmentId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function actionErrorLabel(error: string | undefined): string {
  if (!error) return "unknown";
  if (error === "not_cancelled") return "Сначала отмените запись.";
  return error;
}

export function DoctorAppointmentActions({ recordId, status, onChanged }: Props) {
  const [pending, setPending] = useState<"cancel" | "reschedule" | "delete" | "noshow" | null>(null);
  const [note, setNote] = useState<string>("");
  const [cancelType, setCancelType] = useState("free");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newStartLocal, setNewStartLocal] = useState("");
  const [newEndLocal, setNewEndLocal] = useState("");

  async function callApi(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || json.ok !== true) {
      throw new Error(json.error ?? `http_${res.status}`);
    }
  }

  async function onCancel() {
    if (!isCanonicalAppointmentId(recordId)) {
      setNote("Запись без канонического id — откройте календарь.");
      return;
    }
    setPending("cancel");
    setNote("");
    try {
      await callApi(`${API_BASE}/appointments/${encodeURIComponent(recordId)}/manual-cancel`, {
        decisionType: cancelType,
      });
      setNote("Отменено.");
      onChanged?.();
    } catch (err) {
      setNote(`Ошибка отмены: ${err instanceof Error ? actionErrorLabel(err.message) : "unknown"}`);
    } finally {
      setPending(null);
    }
  }

  async function onNoShow() {
    if (!isCanonicalAppointmentId(recordId)) {
      setNote("Запись без канонического id — откройте календарь.");
      return;
    }
    if (!window.confirm("Отметить как «не пришёл»?")) return;
    setPending("noshow");
    setNote("");
    try {
      await callApi(`${API_BASE}/appointments/${encodeURIComponent(recordId)}/manual-no-show`, {});
      setNote("Отмечено: не пришёл.");
      onChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      const label = msg === "state_conflict" ? "Уже отмечено как «не пришёл»." : msg;
      setNote(`Ошибка: ${label}`);
    } finally {
      setPending(null);
    }
  }

  async function onDelete() {
    if (!isCanonicalAppointmentId(recordId)) {
      setNote("Запись без канонического id — откройте календарь.");
      return;
    }
    if (!window.confirm("Удалить запись из списка и кабинета пациента?")) return;
    setPending("delete");
    setNote("");
    try {
      await callApi(`${API_BASE}/appointments/${encodeURIComponent(recordId)}/delete`, {});
      setNote("Удалено.");
      onChanged?.();
    } catch (err) {
      setNote(`Ошибка удаления: ${err instanceof Error ? actionErrorLabel(err.message) : "unknown"}`);
    } finally {
      setPending(null);
    }
  }

  async function onRescheduleSubmit() {
    if (!isCanonicalAppointmentId(recordId) || !newStartLocal || !newEndLocal) return;
    setPending("reschedule");
    setNote("");
    try {
      const newStartAt = new Date(newStartLocal).toISOString();
      const newEndAt = new Date(newEndLocal).toISOString();
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(newEndAt).getTime() - new Date(newStartAt).getTime()) / 60_000),
      );
      await callApi(`${API_BASE}/appointments/${encodeURIComponent(recordId)}/manual-reschedule`, {
        newStartAt,
        newEndAt,
        durationMinutes,
      });
      setNote("Перенесено.");
      setRescheduleOpen(false);
      onChanged?.();
    } catch (err) {
      setNote(`Ошибка переноса: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRescheduleOpen((v) => !v)}
          disabled={pending !== null}
          aria-label={`doctor-appointment-reschedule-${recordId}`}
        >
          Перенести
        </Button>
        <Select value={cancelType} onValueChange={(v) => setCancelType(v ?? "free")}>
          <SelectTrigger
            className="h-8 w-[9rem]"
            displayLabel={CANCEL_TYPES.find((t) => t.value === cancelType)?.label}
          >
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
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending !== null}
          aria-label={`doctor-appointment-cancel-${recordId}`}
        >
          Отменить
        </Button>
        {status === "confirmed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNoShow}
            disabled={pending !== null}
            aria-label={`doctor-appointment-noshow-${recordId}`}
          >
            Не пришёл
          </Button>
        ) : null}
        {isStaffDeletableCancelledStatus(status) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
            disabled={pending !== null}
            aria-label={`doctor-appointment-delete-${recordId}`}
          >
            Удалить
          </Button>
        ) : null}
      </div>
      {rescheduleOpen ? (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <Label>Начало</Label>
          <Input type="datetime-local" value={newStartLocal} onChange={(e) => setNewStartLocal(e.target.value)} />
          <Label>Окончание</Label>
          <Input type="datetime-local" value={newEndLocal} onChange={(e) => setNewEndLocal(e.target.value)} />
          <Button type="button" size="sm" disabled={pending !== null} onClick={onRescheduleSubmit}>
            Сохранить перенос
          </Button>
        </div>
      ) : null}
      {note ? (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {note}
        </span>
      ) : null}
    </div>
  );
}
