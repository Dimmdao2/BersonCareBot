'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { PatientPackageCard, type PatientPackageCardRow } from './PatientPackageCard';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';

import { DateTime } from 'luxon';

type AppointmentOption = { id: string; label: string };

function notifyPackagesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('patient:packages-changed'));
  }
}

function formatPackagePrice(priceMinor: number | null | undefined): string | null {
  if (priceMinor == null) return null;
  return `${(priceMinor / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatConsumeItemLabel(
  item: PatientPackageCardRow['balance']['items'][number],
  pkg: PatientPackageCardRow,
): string {
  const price = formatPackagePrice(pkg.priceMinor);
  const details = [
    `остаток ${item.remaining}`,
    price ? `стоимость ${price}` : null,
    pkg.notes ? pkg.notes.slice(0, 80) + (pkg.notes.length > 80 ? '…' : '') : null,
  ].filter(Boolean);
  return `${item.serviceTitle ?? item.serviceId} (${details.join(' · ')})`;
}

const ERROR_LABELS: Record<string, string> = {
  invalid_form: 'Проверьте цену и состав абонемента.',
  appointment_already_linked_to_package:
    'Запись уже связана с абонементом. Откройте абонемент и выполните действие в списке записей.',
  appointment_has_consumed_package_session:
    'У записи уже есть списание. Используйте «Вернуть сеанс» в списке записей абонемента.',
  appointment_not_linked_to_package: 'Запись не связана с абонементом.',
  package_no_balance: 'Нет доступных сеансов по выбранной позиции.',
  load_failed: 'Не удалось загрузить абонементы.',
  late_detach_choice_required: 'Выберите исход поздней отвязки в диалоге.',
  past_detach_confirmation_required: 'Нужно двойное подтверждение для прошедшей записи.',
  past_unlink_not_allowed: 'Отвязка прошедших записей отключена в настройках.',
};

type RecalcSummary = {
  debited: Array<{
    appointmentId: string;
    patientPackageItemId: string;
    serviceId: string;
    usageId: string;
  }>;
  skipped: unknown[];
  outOfBalance: unknown[];
};

function pluralizeSessions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'сеансов';
  if (mod10 === 1) return 'сеанс';
  if (mod10 >= 2 && mod10 <= 4) return 'сеанса';
  return 'сеансов';
}

type Props = {
  platformUserId: string;
  appointments?: AppointmentOption[];
  /**
   * When false, the «Назначить из каталога» and «Индивидуальный абонемент» create-forms
   * are hidden. The manual consume section and active-package cards remain.
   * Defaults to true (full panel).
   */
  showCreateForm?: boolean;
  /** Read-only access keeps package history visible but removes every write control. */
  mutationsAllowed?: boolean;
};

export function DoctorClientMembershipsPanel({
  platformUserId,
  appointments = [],
  showCreateForm = true,
  mutationsAllowed = true,
}: Props) {
  const router = useRouter();
  const [packages, setPackages] = useState<PatientPackageCardRow[]>([]);
  const [priceRub, setPriceRub] = useState('');
  const [soldDate, setSoldDate] = useState('');
  const [paidRub, setPaidRub] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number }>>([]);
  const [services, setServices] = useState<
    Array<{ id: string; title: string; isActive: boolean; usableInPackages: boolean }>
  >([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; title: string; priceMinor: number }>>(
    [],
  );
  const [catalogId, setCatalogId] = useState('');
  const [catalogSoldDate, setCatalogSoldDate] = useState('');
  const [catalogPaidRub, setCatalogPaidRub] = useState('');
  const [catalogNotes, setCatalogNotes] = useState('');
  const [consumePackageId, setConsumePackageId] = useState('');
  const [consumeItemId, setConsumeItemId] = useState('');
  const [consumeAppointmentId, setConsumeAppointmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apiBase = '/api/doctor/booking-engine/patient-packages';
  const servicesApi = '/api/doctor/booking-engine/services';
  const catalogApi = '/api/doctor/booking-engine/packages';
  const today = DateTime.now().toFormat('yyyy-MM-dd');

  function showError(code: string | null) {
    if (!code) {
      setError(null);
      return;
    }
    setError(ERROR_LABELS[code] ?? code);
  }

  const loadPackages = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        packages?: PatientPackageCardRow[];
        error?: string;
      };
      if (!json.ok) {
        showError(json.error ?? 'load_failed');
        return;
      }
      setPackages(json.packages ?? []);
      setError(null);
    } catch {
      showError('load_failed');
    }
  }, [platformUserId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPackages();
    });
    if (showCreateForm) {
      void Promise.all([fetch(servicesApi), fetch(catalogApi)]).then(async ([svcRes, catRes]) => {
        const svcJson = (await svcRes.json()) as {
          ok?: boolean;
          services?: Array<{
            id: string;
            title: string;
            isActive: boolean;
            usableInPackages: boolean;
          }>;
        };
        const catJson = (await catRes.json()) as {
          ok?: boolean;
          packages?: Array<{ id: string; title: string; priceMinor: number }>;
        };
        if (svcJson.ok && svcJson.services) setServices(svcJson.services);
        if (catJson.ok && catJson.packages) setCatalog(catJson.packages);
      });
    }
  }, [loadPackages, showCreateForm]);

  const compact = packages.filter((p) => p.status === 'active' || p.status === 'awaiting_payment');

  function addItem() {
    if (!serviceId) return;
    const q = Number.parseInt(quantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setItems((prev) => [...prev, { serviceId, quantity: q }]);
  }

  function createManual() {
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(',', '.')) * 100);
    const paidAmountMinor = paidRub
      ? Math.round(Number.parseFloat(paidRub.replace(',', '.')) * 100)
      : priceMinor;
    if (items.length === 0 || !Number.isFinite(priceMinor)) {
      showError('invalid_form');
      return;
    }
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'manual',
          platformUserId,
          notes: manualNotes.trim() || undefined,
          priceMinor,
          items,
          sendForPayment: false,
          soldAt: soldDate ? new Date(soldDate).toISOString() : new Date().toISOString(),
          paidAmountMinor,
          activateImmediately: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? 'create_failed');
        return;
      }
      toast.success('Абонемент создан');
      setPriceRub('');
      setPaidRub('');
      setSoldDate('');
      setManualNotes('');
      setItems([]);
      void loadPackages();
      router.refresh();
      notifyPackagesChanged();
    });
  }

  function offerCatalog() {
    if (!catalogId) {
      showError('invalid_form');
      return;
    }
    const selected = catalog.find((c) => c.id === catalogId);
    const paidAmountMinor = catalogPaidRub
      ? Math.round(Number.parseFloat(catalogPaidRub.replace(',', '.')) * 100)
      : (selected?.priceMinor ?? 0);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogId,
          notes: catalogNotes.trim() || undefined,
          soldAt: catalogSoldDate
            ? new Date(catalogSoldDate).toISOString()
            : new Date().toISOString(),
          paidAmountMinor,
          activateImmediately: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? 'create_failed');
        return;
      }
      toast.success('Абонемент создан');
      setCatalogId('');
      setCatalogPaidRub('');
      setCatalogSoldDate('');
      setCatalogNotes('');
      void loadPackages();
      router.refresh();
      notifyPackagesChanged();
    });
  }

  function manualConsume() {
    if (!consumePackageId || !consumeItemId) return;
    startTransition(async () => {
      const res = await fetch(`${apiBase}/${consumePackageId}/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientPackageItemId: consumeItemId,
          appointmentId: consumeAppointmentId || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? 'consume_failed');
        return;
      }
      setError(null);
      void loadPackages();
      router.refresh();
      notifyPackagesChanged();
    });
  }

  const selectedPkg = packages.find((p) => p.id === consumePackageId);

  async function recalcPackage(packageId: string) {
    try {
      const res = await fetch(`${apiBase}/${packageId}/recalc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json()) as { ok?: boolean; summary?: RecalcSummary; error?: string };
      if (!json.ok) {
        toast.error('Не удалось пересчитать абонемент');
        return;
      }
      const debitedCount = json.summary?.debited.length ?? 0;
      const msg =
        debitedCount > 0
          ? `Списано ${debitedCount} ${pluralizeSessions(debitedCount)}`
          : 'Нет новых сеансов для списания';
      toast.success(msg);
      void loadPackages();
      router.refresh();
      notifyPackagesChanged();
    } catch {
      toast.error('Ошибка сети при пересчёте');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {compact.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет активных абонементов.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {compact.map((pkg) => (
            <PatientPackageCard
              key={pkg.id}
              pkg={pkg}
              apiBase={apiBase}
              onError={showError}
              onChanged={() => void loadPackages()}
              onRecalc={
                mutationsAllowed && pkg.status === 'active' ? () => void recalcPackage(pkg.id) : undefined
              }
              mutationsAllowed={mutationsAllowed}
            />
          ))}
        </ul>
      )}

      {showCreateForm && mutationsAllowed ? (
        <>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium">Назначить из каталога</summary>
            <div className="mt-3 flex flex-col gap-2">
              {catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Нет шаблонов — создайте в{' '}
                  <span className="font-medium">Расписание → Настройки → Абонементы (шаблоны)</span>
                </p>
              ) : (
                <>
                  <Label htmlFor="pkg-catalog">Шаблон</Label>
                  <Select
                    value={catalogId}
                    onValueChange={(v) => {
                      const val = v ?? '';
                      setCatalogId(val);
                      const row = catalog.find((c) => c.id === val);
                      if (row) setCatalogPaidRub(String(row.priceMinor / 100));
                    }}
                  >
                    <SelectTrigger id="pkg-catalog" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {catalog.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label htmlFor="pkg-catalog-notes">Комментарий</Label>
                  <Input
                    id="pkg-catalog-notes"
                    value={catalogNotes}
                    onChange={(e) => setCatalogNotes(e.target.value)}
                  />
                  <Label htmlFor="pkg-catalog-sold">Дата продажи</Label>
                  <DoctorDatePicker
                    value={catalogSoldDate}
                    onChange={setCatalogSoldDate}
                    max={today}
                  />
                  <Label htmlFor="pkg-catalog-paid">Оплачено, ₽</Label>
                  <Input
                    id="pkg-catalog-paid"
                    value={catalogPaidRub}
                    onChange={(e) => setCatalogPaidRub(e.target.value)}
                  />
                  <Button type="button" size="sm" disabled={pending} onClick={offerCatalog}>
                    Назначить
                  </Button>
                </>
              )}
            </div>
          </details>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium">
              Индивидуальный абонемент
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="pkg-manual-notes">Комментарий</Label>
              <Input
                id="pkg-manual-notes"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
              />
              <Label htmlFor="pkg-price">Цена, ₽</Label>
              <Input
                id="pkg-price"
                value={priceRub}
                onChange={(e) => setPriceRub(e.target.value)}
              />
              <Label htmlFor="pkg-sold">Дата продажи</Label>
              <DoctorDatePicker value={soldDate} onChange={setSoldDate} max={today} />
              <Label htmlFor="pkg-paid">Оплачено, ₽</Label>
              <Input id="pkg-paid" value={paidRub} onChange={(e) => setPaidRub(e.target.value)} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <Label htmlFor="pkg-svc">Услуга</Label>
                  <Select value={serviceId} onValueChange={(v) => setServiceId(v ?? '')}>
                    <SelectTrigger id="pkg-svc" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {services
                        .filter((s) => s.isActive && s.usableInPackages)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  <Label htmlFor="pkg-qty">Кол-во</Label>
                  <Input
                    id="pkg-qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                  Добавить позицию
                </Button>
              </div>
              {items.length > 0 ? (
                <ul className="m-0 list-none space-y-1 p-0">
                  {items.map((it, idx) => {
                    const svc = services.find((s) => s.id === it.serviceId);
                    return (
                      <li key={idx} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-foreground">
                          {svc?.title ?? it.serviceId} — {it.quantity} шт.
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-destructive hover:text-destructive hover:underline"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <Button type="button" size="sm" disabled={pending} onClick={createManual}>
                Сохранить
              </Button>
            </div>
          </details>
        </>
      ) : null}

      {mutationsAllowed ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium">
            Списать сеанс по абонементу
          </summary>
          <div className="mt-3 flex flex-col gap-2">
          <Label>Абонемент</Label>
          <Select
            value={consumePackageId}
            onValueChange={(v) => {
              setConsumePackageId(v ?? '');
              setConsumeItemId('');
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {packages
                .filter((p) => p.status === 'active')
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedPkg ? (
            <>
              <Label>Позиция</Label>
              <Select value={consumeItemId} onValueChange={(v) => setConsumeItemId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {selectedPkg.balance.items.map((it) => (
                    <SelectItem key={it.patientPackageItemId} value={it.patientPackageItemId}>
                      {formatConsumeItemLabel(it, selectedPkg)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          <Label>Запись</Label>
          <Select
            value={consumeAppointmentId}
            onValueChange={(v) => setConsumeAppointmentId(v ?? '')}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Без записи</SelectItem>
              {appointments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={pending} onClick={manualConsume}>
            Списать
          </Button>
          </div>
        </details>
      ) : null}
    </div>
  );
}
