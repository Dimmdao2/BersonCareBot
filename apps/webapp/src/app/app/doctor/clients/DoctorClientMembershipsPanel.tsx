'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
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
} from '@/shared/ui/doctor/primitives/select';
import { PatientPackageCard, type PatientPackageCardRow } from './PatientPackageCard';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { localQrCodeDataUri } from '@/app/app/doctor/calendar/localQrCode';
import { sendPaymentLinkToPatientChat } from '@/app/app/doctor/sendPaymentLinkToPatientChat';

import { DateTime } from 'luxon';

type AppointmentOption = { id: string; label: string };

/**
 * MONEY-03: a sale is one decision — «сколько» plus «как платят», not two free-floating numbers.
 * The paid amount is never typed independently: for a staff-recorded sale the server derives it
 * from the package price (`pgMemberships.createManualPatientPackage`,
 * `activatePatientPackageFromDoctorSale`), and for an online sale it is the captured intent.
 */
type SalePaymentMethod = 'cash' | 'link' | 'free';

const SALE_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  cash: 'Наличными',
  link: 'Ссылка на оплату',
  free: 'Бесплатно',
};

/** Result of one create call, so the sale has a visible next step instead of a silent success. */
type SaleResult = {
  packageId: string;
  status: string;
  checkoutUrl: string | null;
  method: SalePaymentMethod;
  /** Named by the server when a pay-link sale produced no link. Never inferred here. */
  paymentLinkError: string | null;
  /** Whether the cash actually reached the canonical ledger this clinic's KPIs read. */
  cashLedgerRecorded: boolean;
};

/**
 * One sale attempt has one identity, and a retry of the SAME attempt reuses it — that is what makes
 * a repeated tap converge on one package and one payment instead of selling twice. It is cleared
 * only on success, so every failure path retries under the original key.
 */
function newSaleIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

/** The package's real state, said in the doctor's words — not a phrase invented at render time. */
const PACKAGE_STATUS_LABELS: Record<string, string> = {
  offered: 'предложен',
  awaiting_payment: 'ждёт оплаты',
  active: 'активен',
  expired: 'истёк',
  cancelled: 'отменён',
};

const ERROR_LABELS: Record<string, string> = {
  invalid_form: 'Проверьте цену и состав абонемента.',
  create_failed: 'Не удалось сохранить абонемент.',
  entitlement_required: 'Действие не входит в тариф клиники.',
  payments_disabled: 'Приём платежей выключен для клиники.',
  payment_provider_unavailable: 'Платёжный провайдер не настроен.',
  payments_unavailable: 'Платёжный модуль недоступен.',
  memberships_unavailable: 'Модуль абонементов недоступен.',
  catalog_package_not_found: 'Шаблон абонемента не найден.',
  catalog_not_found: 'Шаблон абонемента не найден.',
  sale_link_requires_price: 'Ссылку на оплату нельзя выставить на нулевую цену.',
  sale_cash_requires_price: 'Для наличной продажи нужна цена больше нуля.',
  sale_free_requires_zero_price: 'Бесплатная выдача возможна только при нулевой цене.',
  chat_send_failed: 'Не удалось отправить ссылку в чат пациента.',
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
  /** Controls which create and sale mutations are available. */
  mutationsAllowed?: boolean;
  /** Existing purchased packages remain consumable through the access lifecycle. */
  consumptionAllowed?: boolean;
  /** Configuration/detail mode can reuse the forms without duplicating the package list. */
  showPackageList?: boolean;
  /** Host surfaces (modal, patient card) need the sale outcome to refresh and close. */
  onCreated?: () => void;
};

export function DoctorClientMembershipsPanel({
  platformUserId,
  appointments = [],
  showCreateForm = true,
  mutationsAllowed = true,
  consumptionAllowed = true,
  showPackageList = true,
  onCreated,
}: Props) {
  const router = useRouter();
  const [packages, setPackages] = useState<PatientPackageCardRow[]>([]);
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
  const [patientChatAvailable, setPatientChatAvailable] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [saleKey, setSaleKey] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [priceRub, setPriceRub] = useState('');
  const [soldDate, setSoldDate] = useState('');
  const [manualMethod, setManualMethod] = useState<SalePaymentMethod>('cash');
  const [catalogMethod, setCatalogMethod] = useState<SalePaymentMethod>('cash');
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
        onlinePaymentAvailable?: boolean;
        patientChatAvailable?: boolean;
      };
      if (!json.ok) {
        showError(json.error ?? 'load_failed');
        return;
      }
      setPackages(json.packages ?? []);
      setOnlinePaymentAvailable(json.onlinePaymentAvailable === true);
      setPatientChatAvailable(json.patientChatAvailable === true);
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

  const selectedCatalogPriceMinor = catalog.find((c) => c.id === catalogId)?.priceMinor ?? null;

  // Picking a zero-price template retires the link option the same way (server refuses it too).
  useEffect(() => {
    if (selectedCatalogPriceMinor !== 0) return;
    setCatalogMethod((current) => (current === 'link' ? 'cash' : current));
  }, [selectedCatalogPriceMinor]);

  // A method the clinic cannot actually execute must never stay selected (MONEY-03/08).
  useEffect(() => {
    if (onlinePaymentAvailable) return;
    setManualMethod((current) => (current === 'link' ? 'cash' : current));
    setCatalogMethod((current) => (current === 'link' ? 'cash' : current));
  }, [onlinePaymentAvailable]);

  const compact = packages.filter((p) => p.status === 'active' || p.status === 'awaiting_payment');

  /**
   * Only methods the clinic can really execute on THIS package. «Ссылка на оплату» needs both a
   * configured provider and something to invoice: a zero-price template used to be offered a link,
   * activate anyway, and then be described as «ждёт оплаты» while already active.
   */
  const saleMethodOptions = (
    allowFree: boolean,
    priceMinor: number | null,
  ): SalePaymentMethod[] => [
    'cash',
    ...(onlinePaymentAvailable && priceMinor !== 0 ? (['link'] as const) : []),
    ...(allowFree ? (['free'] as const) : []),
  ];

  function applySaleResult(
    pkg: {
      id: string;
      status: string;
      checkoutUrl?: string | null;
    },
    method: SalePaymentMethod,
    outcome: { paymentLinkError: string | null; cashLedgerRecorded: boolean },
  ) {
    setSaleResult({
      packageId: pkg.id,
      status: pkg.status,
      checkoutUrl: pkg.checkoutUrl ?? null,
      method,
      paymentLinkError: outcome.paymentLinkError,
      cashLedgerRecorded: outcome.cashLedgerRecorded,
    });
    setLinkCopied(false);
    setLinkSent(false);
    void loadPackages();
    router.refresh();
    notifyPackagesChanged();
    // A pay-link sale still owes the doctor a next step (QR / copy / send) — or, when the link
    // could not be issued, an error they have to read. Releasing the host surface in that second
    // case closed the modal over the message before it could render, so the doctor saw only the
    // success toast. The surface is released only when this sale really has nothing left to show.
    if (method !== 'link') onCreated?.();
  }

  function copySaleLink() {
    const url = saleResult?.checkoutUrl;
    if (!url) return;
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
      } catch {
        setLinkCopied(false);
      }
    });
  }

  function sendSaleLinkToChat() {
    const url = saleResult?.checkoutUrl;
    if (!url || !saleResult) return;
    startTransition(async () => {
      setError(null);
      const ok = await sendPaymentLinkToPatientChat({
        patientUserId: platformUserId,
        subjectRef: `patient_package:${saleResult.packageId}`,
        link: url,
      }).catch(() => false);
      if (ok) setLinkSent(true);
      else showError('chat_send_failed');
    });
  }

  function addItem() {
    if (!serviceId) return;
    const q = Number.parseInt(quantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setItems((prev) => [...prev, { serviceId, quantity: q }]);
  }

  /**
   * One sale entrypoint, parameterized by method — not three create paths. The client states the
   * method and the sale date and nothing else about the money: the paid amount, the resulting
   * status and whether a payment intent is created are all derived on the server from the price
   * snapshot and the real payment result.
   */
  function saleFields(method: SalePaymentMethod, soldAtDate: string, idempotencyKey: string) {
    return {
      saleMethod: method,
      saleIdempotencyKey: idempotencyKey,
      ...(method === 'link'
        ? {}
        : {
            soldAt: soldAtDate
              ? new Date(soldAtDate).toISOString()
              : new Date().toISOString(),
          }),
    };
  }

  function createManual() {
    const priceMinor =
      manualMethod === 'free' ? 0 : Math.round(Number.parseFloat(priceRub.replace(',', '.')) * 100);
    const selectedQuantity = Number.parseInt(quantity, 10);
    const packageItems =
      items.length > 0
        ? items
        : serviceId && Number.isFinite(selectedQuantity) && selectedQuantity > 0
          ? [{ serviceId, quantity: selectedQuantity }]
          : [];
    if (packageItems.length === 0 || !Number.isFinite(priceMinor) || priceMinor < 0) {
      showError('invalid_form');
      return;
    }
    if (manualMethod === 'link' && priceMinor === 0) {
      showError('invalid_form');
      return;
    }
    const attemptKey = saleKey ?? newSaleIdempotencyKey();
    setSaleKey(attemptKey);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'manual',
          platformUserId,
          notes: manualNotes.trim() || undefined,
          priceMinor,
          items: packageItems,
          ...saleFields(manualMethod, soldDate, attemptKey),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        package?: { id: string; status: string; checkoutUrl?: string | null };
        paymentLinkError?: string | null;
        cashLedgerRecorded?: boolean;
      };
      if (!json.ok || !json.package) {
        showError(json.error ?? 'create_failed');
        return;
      }
      toast.success('Абонемент создан');
      setSaleKey(null);
      setPriceRub('');
      setSoldDate('');
      setManualNotes('');
      setItems([]);
      setError(null);
      applySaleResult(json.package, manualMethod, {
        paymentLinkError: json.paymentLinkError ?? null,
        cashLedgerRecorded: json.cashLedgerRecorded === true,
      });
    });
  }

  function offerCatalog() {
    if (!catalogId) {
      showError('invalid_form');
      return;
    }
    const attemptKey = saleKey ?? newSaleIdempotencyKey();
    setSaleKey(attemptKey);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'catalog',
          platformUserId,
          subscriptionPackageId: catalogId,
          notes: catalogNotes.trim() || undefined,
          ...saleFields(catalogMethod, catalogSoldDate, attemptKey),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        package?: { id: string; status: string; checkoutUrl?: string | null };
        paymentLinkError?: string | null;
        cashLedgerRecorded?: boolean;
      };
      if (!json.ok || !json.package) {
        showError(json.error ?? 'create_failed');
        return;
      }
      toast.success('Абонемент создан');
      setSaleKey(null);
      setCatalogId('');
      setCatalogSoldDate('');
      setCatalogNotes('');
      setError(null);
      applySaleResult(json.package, catalogMethod, {
        paymentLinkError: json.paymentLinkError ?? null,
        cashLedgerRecorded: json.cashLedgerRecorded === true,
      });
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
  const selectedConsumeItem = selectedPkg?.balance.items.find(
    (item) => item.patientPackageItemId === consumeItemId,
  );

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

      {!showPackageList ? null : compact.length === 0 ? (
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
                mutationsAllowed && pkg.status === 'active'
                  ? () => void recalcPackage(pkg.id)
                  : undefined
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
                  <Select value={catalogId} onValueChange={(v) => setCatalogId(v ?? '')}>
                    <SelectTrigger
                      id="pkg-catalog"
                      className="w-full"
                      displayLabel={catalog.find((item) => item.id === catalogId)?.title ?? '—'}
                    />
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
                  <Label htmlFor="pkg-catalog-method">Способ оплаты</Label>
                  <Select
                    value={catalogMethod}
                    onValueChange={(v) => setCatalogMethod((v as SalePaymentMethod) ?? 'cash')}
                  >
                    <SelectTrigger
                      id="pkg-catalog-method"
                      className="w-full"
                      displayLabel={SALE_METHOD_LABELS[catalogMethod]}
                    />
                    <SelectContent>
                      {saleMethodOptions(false, selectedCatalogPriceMinor).map((method) => (
                        <SelectItem key={method} value={method}>
                          {SALE_METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {catalogMethod === 'link' ? null : (
                    <>
                      <Label htmlFor="pkg-catalog-sold">Дата продажи</Label>
                      <DoctorDatePicker
                        value={catalogSoldDate}
                        onChange={setCatalogSoldDate}
                        max={today}
                      />
                    </>
                  )}
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
              <Label htmlFor="pkg-manual-method">Способ оплаты</Label>
              <Select
                value={manualMethod}
                onValueChange={(v) => setManualMethod((v as SalePaymentMethod) ?? 'cash')}
              >
                <SelectTrigger
                  id="pkg-manual-method"
                  className="w-full"
                  displayLabel={SALE_METHOD_LABELS[manualMethod]}
                />
                <SelectContent>
                  {saleMethodOptions(true, null).map((method) => (
                    <SelectItem key={method} value={method}>
                      {SALE_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualMethod === 'free' ? null : (
                <>
                  <Label htmlFor="pkg-price">Цена, ₽</Label>
                  <Input
                    id="pkg-price"
                    inputMode="decimal"
                    value={priceRub}
                    onChange={(e) => setPriceRub(e.target.value)}
                  />
                </>
              )}
              {manualMethod === 'link' ? null : (
                <>
                  <Label htmlFor="pkg-sold">Дата продажи</Label>
                  <DoctorDatePicker value={soldDate} onChange={setSoldDate} max={today} />
                </>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <Label htmlFor="pkg-svc">Услуга</Label>
                  <Select value={serviceId} onValueChange={(v) => setServiceId(v ?? '')}>
                    <SelectTrigger
                      id="pkg-svc"
                      className="w-full"
                      displayLabel={services.find((item) => item.id === serviceId)?.title ?? '—'}
                    />
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

      {saleResult && saleResult.method === 'link' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-3 text-sm">
          {saleResult.checkoutUrl ? (
            <>
              <a
                className="break-all text-primary underline"
                href={saleResult.checkoutUrl}
                target="_blank"
                rel="noreferrer"
              >
                {saleResult.checkoutUrl}
              </a>
              <Image
                width={144}
                height={144}
                alt="QR-код платёжной ссылки"
                src={localQrCodeDataUri(saleResult.checkoutUrl)}
                unoptimized
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={copySaleLink}
                >
                  {linkCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
                </Button>
                {patientChatAvailable ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={sendSaleLinkToChat}
                  >
                    {linkSent ? 'Отправлено в чат' : 'Отправить в чат'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSaleResult(null);
                    onCreated?.();
                  }}
                >
                  Готово
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* The reason is the server's, and the state is the package's own — neither is
                  guessed here. The old copy blamed the provider for every empty link and called an
                  already-active package «ждёт оплаты». */}
              <p className="text-destructive">
                Ссылка на оплату не создана:{' '}
                {ERROR_LABELS[saleResult.paymentLinkError ?? ''] ??
                  saleResult.paymentLinkError ??
                  'причина не названа сервером'}
              </p>
              <p className="text-muted-foreground">
                Абонемент сохранён, текущий статус —{' '}
                {PACKAGE_STATUS_LABELS[saleResult.status] ?? saleResult.status}. Оплату можно
                принять наличными или выставить ссылку позже.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSaleResult(null);
                    onCreated?.();
                  }}
                >
                  Понятно
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {consumptionAllowed ? (
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
              <SelectTrigger
                className="w-full"
                displayLabel={packages.find((item) => item.id === consumePackageId)?.title ?? '—'}
              />
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
                  <SelectTrigger
                    className="w-full"
                    displayLabel={
                      selectedConsumeItem
                        ? formatConsumeItemLabel(selectedConsumeItem, selectedPkg)
                        : '—'
                    }
                  />
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
              <SelectTrigger
                className="w-full"
                displayLabel={
                  appointments.find((item) => item.id === consumeAppointmentId)?.label ??
                  'Без записи'
                }
              />
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
