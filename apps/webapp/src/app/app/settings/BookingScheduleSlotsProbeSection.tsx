'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { apiJson } from '@/shared/lib/apiJson';

const OVERVIEW = '/api/admin/booking-engine/overview';
const SLOTS_PROBE = '/api/admin/booking-engine/slots-probe';

type BranchRow = { id: string; title: string; isActive: boolean };
type ServiceRow = { id: string; title: string; isActive: boolean };

export function BookingScheduleSlotsProbeSection() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadCatalog = useCallback(async () => {
    try {
      const json = await apiJson<{
        ok: boolean;
        branches?: BranchRow[];
        services?: ServiceRow[];
      }>(OVERVIEW);
      const activeBranches = (json.branches ?? []).filter((b) => b.isActive);
      const activeServices = (json.services ?? []).filter((s) => s.isActive);
      setBranches(activeBranches);
      setServices(activeServices);
      if (activeBranches[0]) setBranchId((prev) => prev || activeBranches[0]!.id);
      if (activeServices[0]) setServiceId((prev) => prev || activeServices[0]!.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'overview_load_failed');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadCatalog();
    });
  }, [loadCatalog]);

  function probe() {
    if (!branchId || !serviceId || !date) return;
    setError(null);
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({ branchId, serviceId, date });
        const json = await apiJson<{
          ok: boolean;
          slots?: string[];
        }>(`${SLOTS_PROBE}?${qs.toString()}`);
        setSlots(json.slots ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'probe_failed');
        setSlots([]);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Проверка записи глазами пациента</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Слоты считаются тем же каноническим расписанием, что и для пациента при записи.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Локация</Label>
            <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Услуга</Label>
            <Select value={serviceId} onValueChange={(v) => v && setServiceId(v)}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.title}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-slots-probe-date">Дата</Label>
            <DoctorDatePicker
              id="booking-slots-probe-date"
              value={date}
              onChange={setDate}
              className="max-w-md"
            />
          </div>
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={probe}>
          Показать свободные слоты
        </Button>
        {error ? (
          <p className="text-sm text-destructive">
            {error === 'branch_service_mapping_missing'
              ? 'Нет сопоставления локации и услуги для patient API — проверьте доступность.'
              : error}
          </p>
        ) : null}
        {slots.length > 0 ? (
          <p className="text-sm text-muted-foreground">Слоты: {slots.join(', ')}</p>
        ) : null}
        {!error && !pending && slots.length === 0 && branchId && serviceId ? (
          <p className="text-sm text-muted-foreground">На выбранную дату свободных слотов нет.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
