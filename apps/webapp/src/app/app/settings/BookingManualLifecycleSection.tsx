"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const CANCEL_TYPES = [
  { value: "free", label: "Бесплатная" },
  { value: "penalized", label: "Штрафная" },
  { value: "package_charged", label: "Со списанием" },
  { value: "no_package_charge", label: "Без списания" },
  { value: "retain_prepayment", label: "Удержание предоплаты" },
  { value: "refund_prepayment", label: "Возврат предоплаты" },
  { value: "custom", label: "Индивидуально" },
] as const;

type BookingManualLifecycleSectionProps = {
  /** API prefix for manual lifecycle (admin default; doctor cabinet uses `/api/doctor/booking-engine`). */
  apiBase?: string;
};

export function BookingManualLifecycleSection({
  apiBase = "/api/admin/booking-engine",
}: BookingManualLifecycleSectionProps) {
  const [appointmentId, setAppointmentId] = useState("");
  const [cancelType, setCancelType] = useState<string>("free");
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ручные перенос и отмена</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>ID канонической записи (be_appointments)</Label>
          <Input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value.trim())} />
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
                  const res = await fetch(
                    `${apiBase}/appointments/${encodeURIComponent(appointmentId)}/manual-cancel`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ decisionType: cancelType }),
                    },
                  );
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  setMessage(json.ok ? "Отмена применена" : (json.error ?? "error"));
                });
              }}
            >
              Отменить
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Новое начало (ISO)</Label>
            <Input value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} />
            <Label>Новое окончание (ISO)</Label>
            <Input value={newEndAt} onChange={(e) => setNewEndAt(e.target.value)} />
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
                  const res = await fetch(
                    `${apiBase}/appointments/${encodeURIComponent(appointmentId)}/manual-reschedule`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        newStartAt,
                        newEndAt,
                        durationMinutes,
                      }),
                    },
                  );
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  setMessage(json.ok ? "Перенос применён" : (json.error ?? "error"));
                });
              }}
            >
              Перенести
            </Button>
          </div>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
