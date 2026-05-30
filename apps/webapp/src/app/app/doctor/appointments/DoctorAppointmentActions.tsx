"use client";

import { useState } from "react";
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
};

function isCanonicalAppointmentId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function DoctorAppointmentActions({ recordId }: Props) {
  const [pending, setPending] = useState<"cancel" | "reschedule" | null>(null);
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
    } catch (err) {
      setNote(`Ошибка отмены: ${err instanceof Error ? err.message : "unknown"}`);
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
