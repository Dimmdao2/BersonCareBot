"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
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
import { BookingStaffPaymentPanel } from "./BookingStaffPaymentPanel";
import { apiJson } from "@/shared/lib/apiJson";

const CANCEL_TYPES = [
  { value: "free", label: "Бесплатная" },
  { value: "penalized", label: "Штрафная" },
  { value: "package_charged", label: "Со списанием" },
  { value: "no_package_charge", label: "Без списания" },
  { value: "retain_prepayment", label: "Удержание предоплаты" },
  { value: "refund_prepayment", label: "Возврат предоплаты" },
  { value: "custom", label: "Индивидуально" },
] as const;

type AppointmentOption = { id: string; label: string };

type BookingManualLifecycleSectionProps = {
  /** API prefix for manual lifecycle (admin default; doctor cabinet uses `/api/doctor/booking-engine`). */
  apiBase?: string;
  useDateTimePickers?: boolean;
  /** При заданном ID — подгрузка записей из истории пациента вместо ручного UUID. */
  platformUserId?: string;
};

function isoToLocalInput(iso: string): string {
  if (!iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local.trim()) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}

export function BookingManualLifecycleSection({
  apiBase = "/api/admin/booking-engine",
  useDateTimePickers = false,
  platformUserId,
}: BookingManualLifecycleSectionProps) {
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentOptions, setAppointmentOptions] = useState<AppointmentOption[]>([]);
  const [cancelType, setCancelType] = useState<string>("free");
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      if (!platformUserId) {
        setAppointmentOptions([]);
        return;
      }
      try {
        const json = await apiJson<{
          ok?: boolean;
          timeline?: Array<{
            appointmentId: string | null;
            title: string;
            occurredAt: string;
            category: string;
          }>;
        }>(`/api/doctor/clients/${encodeURIComponent(platformUserId)}/history`);
        if (!json.timeline) {
          setAppointmentOptions([]);
          return;
        }
        const byId = new Map<string, AppointmentOption>();
        for (const item of json.timeline) {
          if (!item.appointmentId) continue;
          if (item.category !== "appointment" && item.category !== "reschedule") continue;
          const at = new Date(item.occurredAt);
          const when = Number.isNaN(at.getTime())
            ? item.occurredAt
            : at.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
          byId.set(item.appointmentId, {
            id: item.appointmentId,
            label: `${item.title} · ${when}`,
          });
        }
        setAppointmentOptions([...byId.values()]);
      } catch {
        setAppointmentOptions([]);
      }
    });
  }, [platformUserId]);

  const appointmentLabel = useMemo(
    () => appointmentOptions.find((o) => o.id === appointmentId)?.label,
    [appointmentOptions, appointmentId],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ручные перенос и отмена</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Запись</Label>
          {platformUserId && appointmentOptions.length > 0 ? (
            <Select value={appointmentId} onValueChange={(v) => v && setAppointmentId(v)}>
              <SelectTrigger displayLabel={appointmentLabel} className="w-full max-w-lg" />
              <SelectContent>
                {appointmentOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id} label={o.label}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder={platformUserId ? "Нет записей в истории" : "ID канонической записи"}
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value.trim())}
              className="max-w-lg"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Тип отмены</Label>
            <Select value={cancelType} onValueChange={(v) => setCancelType(v ?? "free")}>
              <SelectTrigger className="w-[14rem]" displayLabel={CANCEL_TYPES.find((t) => t.value === cancelType)?.label}>
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
              disabled={pending || !appointmentId}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await apiJson(`${apiBase}/appointments/${encodeURIComponent(appointmentId)}/manual-cancel`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ decisionType: cancelType }),
                    });
                    setMessage("Отмена применена");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "error");
                  }
                });
              }}
            >
              Отменить
            </Button>
          </div>
          <div className="space-y-2">
            <Label>{useDateTimePickers ? "Новое начало" : "Новое начало (ISO)"}</Label>
            <Input
              type={useDateTimePickers ? "datetime-local" : "text"}
              value={useDateTimePickers ? isoToLocalInput(newStartAt) : newStartAt}
              onChange={(e) =>
                setNewStartAt(useDateTimePickers ? localInputToIso(e.target.value) : e.target.value)
              }
              className="max-w-xs"
            />
            <Label>{useDateTimePickers ? "Новое окончание" : "Новое окончание (ISO)"}</Label>
            <Input
              type={useDateTimePickers ? "datetime-local" : "text"}
              value={useDateTimePickers ? isoToLocalInput(newEndAt) : newEndAt}
              onChange={(e) =>
                setNewEndAt(useDateTimePickers ? localInputToIso(e.target.value) : e.target.value)
              }
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || !appointmentId || !newStartAt || !newEndAt}
              onClick={() => {
                const durationMinutes = Math.max(
                  1,
                  Math.round((new Date(newEndAt).getTime() - new Date(newStartAt).getTime()) / 60_000),
                );
                startTransition(async () => {
                  try {
                    await apiJson(`${apiBase}/appointments/${encodeURIComponent(appointmentId)}/manual-reschedule`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        newStartAt,
                        newEndAt,
                        durationMinutes,
                      }),
                    });
                    setMessage("Перенос применён");
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "error");
                  }
                });
              }}
            >
              Перенести
            </Button>
          </div>
        </div>
        <BookingStaffPaymentPanel apiBase={apiBase} appointmentId={appointmentId} />
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
