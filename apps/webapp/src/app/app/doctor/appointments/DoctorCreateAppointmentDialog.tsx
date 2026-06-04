"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import { BookingPatientSearchPicker, type BookingPatientPick } from "@/app/app/doctor/admin/booking/BookingPatientSearchPicker";

type ServiceOption = { id: string; title: string };
type BranchOption = { id: string; title: string };

export function DoctorCreateAppointmentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [patient, setPatient] = useState<BookingPatientPick | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/doctor/booking-engine/services")
      .then((r) => r.json())
      .then((json: { ok?: boolean; services?: Array<{ id: string; title: string }> }) => {
        if (json.ok && json.services) setServices(json.services);
      })
      .catch(() => {});
    void fetch("/api/admin/booking-engine/branches")
      .then((r) => r.json())
      .then((json: { ok?: boolean; branches?: Array<{ id: string; title: string }> }) => {
        if (json.ok && json.branches) setBranches(json.branches);
      })
      .catch(() => {});
  }, [open]);

  function reset() {
    setPatient(null);
    setServiceId("");
    setBranchId("");
    setStartAt("");
    setEndAt("");
    setMessage(null);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startAt || !endAt) {
      setMessage("Укажите начало и окончание записи.");
      return;
    }
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      setMessage("Дата окончания должна быть позже даты начала.");
      return;
    }
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/doctor/booking-engine/appointments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformUserId: patient?.id ?? null,
          serviceId: serviceId || null,
          branchId: branchId || null,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          durationMinutes,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (json.ok) {
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setMessage(`Ошибка: ${json.error ?? "неизвестная ошибка"}`);
      }
    });
  }

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedBranch = branches.find((b) => b.id === branchId);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Создать запись
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать запись</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <BookingPatientSearchPicker value={patient} onChange={setPatient} />

          {services.length > 0 ? (
            <div className="space-y-2">
              <Label>Услуга</Label>
              <Select value={serviceId} onValueChange={(v) => setServiceId(v ?? "")}>
                <SelectTrigger
                  displayLabel={selectedService?.title ?? (serviceId ? serviceId : undefined)}
                  className="w-full"
                />
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id} label={s.title}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {branches.length > 0 ? (
            <div className="space-y-2">
              <Label>Локация</Label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
                <SelectTrigger
                  displayLabel={selectedBranch?.title ?? (branchId ? branchId : undefined)}
                  className="w-full"
                />
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} label={b.title}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Начало</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Окончание</Label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
              />
            </div>
          </div>

          {message ? (
            <p className="text-sm text-destructive">{message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" size="sm" disabled={pending || !startAt || !endAt}>
              {pending ? "Сохранение..." : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
