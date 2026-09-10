'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { formatMinorAmount } from '@/shared/lib/formatMinorAmount';
import type { OrgQuotaProjection } from '@/modules/org-entitlements/types';
import type { storagePackageOffersBody } from '@/app/api/clinic/billing/storagePackagePurchase';
import { formatQuotaValue, QUOTA_THRESHOLD_LABEL } from './billingQuotaFormat';

/**
 * Витрина приезжает ровно тем составом, который выписывает сервер: тип берётся у самой витрины, а
 * не объявляется здесь второй раз. Цены без котировки в нём не существует — и повторить её на
 * клиенте нечем.
 */
export type ClinicStorageOffers = ReturnType<typeof storagePackageOffersBody>;

type Props = {
  /**
   * Проекция механики `files` — ТО ЖЕ число, что и в списке «Использовано из включённого», и тот же
   * потолок, который разрешает загрузку (`fileQuotaWithPurchasedStorage`: тариф + купленный пакет).
   * `null` — у объёма нет числового потолка, полосе заполнения не от чего считаться.
   */
  fill: OrgQuotaProjection | null;
  offers: ClinicStorageOffers;
  /** Отказ уже оформлен: пакет работает до конца оплаченного периода и не продлевается (Р-18). */
  releaseScheduled: boolean;
};

const PURCHASE_ERROR_MESSAGES: Record<string, string> = {
  saas_billing_storage_package_unavailable: 'Этот пакет сейчас не продаётся.',
  // Р-15: пропорция считается внутрь оплаченного периода — остатка нет, продавать не во что.
  storage_package_paid_period_over:
    'Оплаченный период тарифа закончился. Оплатите продление — после этого можно докупить объём.',
  // Р-18: уже оплаченное назад не отбирается, поэтому меньший пакет — это отказ, а не покупка.
  storage_package_downgrade_at_period_end:
    'Пакет меньшего объёма вступает с начала следующего периода: отключите текущий пакет.',
  billing_admin_required: 'Докупать объём может владелец или администратор клиники.',
};

const RELEASE_ERROR_MESSAGES: Record<string, string> = {
  saas_billing_no_storage_package: 'Докупленного пакета нет — отключать нечего.',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

type PurchasablePackage = Extract<ClinicStorageOffers['packages'][number], { state: 'purchasable' }>;

function isPurchasable(row: ClinicStorageOffers['packages'][number]): row is PurchasablePackage {
  return row.state === 'purchasable';
}

/**
 * Блок «Объём файлов» вкладки «Тариф и биллинг» (владелец 10.09, вечер): заполненность полосой от
 * ДОСТУПНОГО объёма, купленный пакет подписан прямо здесь, рядом — «Увеличить место» и «Отключить».
 *
 * Композиции блок НЕ различает намеренно: «докупка места в настройках должна быть у всех» —
 * соло-кабинет прячет только строки про команду, объём файлов есть у всех одинаково.
 */
export function StorageSpaceBlock({ fill, offers, releaseScheduled }: Props) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<'purchase' | 'release' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; checkoutUrl: string | null } | null>(null);
  /** Цена сдвинулась, пока человек думал: сервер прислал новую вместе с новой котировкой. */
  const [repriced, setRepriced] = useState<{
    packageId: string;
    quote: string;
    priceMinor: number;
    currency: string;
  } | null>(null);

  const purchasable = offers.packages.filter(isPurchasable);
  const current = offers.packages.find((row) => row.packageId === offers.currentPackageId) ?? null;
  const selected = purchasable.find((row) => row.packageId === selectedId) ?? null;
  const selectedPrice =
    selected === null
      ? null
      : repriced && repriced.packageId === selected.packageId
        ? { priceMinor: repriced.priceMinor, currency: repriced.currency, quote: repriced.quote }
        : { priceMinor: selected.priceMinor, currency: selected.currency, quote: selected.quote };

  const usedPercent =
    fill === null || fill.quota.limit <= 0
      ? null
      : Math.min(100, Math.round((fill.usage / fill.quota.limit) * 100));

  // Обходит общий `apiJson` (он отдаёт только строку ошибки) намеренно: отказ отключения обязан
  // назвать ЧИСЛО — сколько именно освободить, — а оно живёт в теле ответа.
  async function buy() {
    if (!selected || !selectedPrice) return;
    setPending('purchase');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          purchase: 'storage_package',
          storagePackageId: selected.packageId,
          // Наружу уходит только подпись, выписанная этим же сервером: ни суммы, ни валюты.
          quote: selectedPrice.quote,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; outcome: 'storage_opened'; amountMinor: number; currency: string; checkoutUrl?: string }
        | { ok: false; error: string; quote?: string; priceMinor?: number; currency?: string }
        | null;
      if (body?.ok) {
        setNotice({
          text: `Объём увеличен. Счёт на ${formatMinorAmount(body.amountMinor, body.currency)} выставлен и ждёт оплаты.`,
          checkoutUrl: body.checkoutUrl ?? null,
        });
        setChoosing(false);
        setSelectedId(null);
        setRepriced(null);
        router.refresh();
        return;
      }
      if (
        body?.ok === false &&
        body.error === 'storage_package_confirmation_required' &&
        typeof body.quote === 'string' &&
        typeof body.priceMinor === 'number' &&
        typeof body.currency === 'string'
      ) {
        setRepriced({
          packageId: selected.packageId,
          quote: body.quote,
          priceMinor: body.priceMinor,
          currency: body.currency,
        });
        setError('Цена изменилась, пока вы выбирали. Подтвердите новую цену.');
        return;
      }
      // Котировка просрочена — цены у этой двери больше нет. Молчаливый перевыпуск означал бы
      // списание по цене, которой человек не видел, поэтому экран идёт за свежей витриной.
      if (body?.ok === false && body.error === 'storage_package_quote_expired') {
        setRepriced(null);
        setError('Цена обновилась. Выберите пакет заново.');
        router.refresh();
        return;
      }
      setError(
        (body?.ok === false && PURCHASE_ERROR_MESSAGES[body.error]) ||
          'Не удалось докупить объём',
      );
    } catch {
      setError('Не удалось докупить объём');
    } finally {
      setPending(null);
    }
  }

  async function release() {
    setPending('release');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'release_storage_package' }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; outcome: 'released_at_period_end'; effectiveAt: string | null }
        | { ok: false; error: string; freeBytes?: number; limitWithoutPackage?: number }
        | null;
      if (body?.ok) {
        setNotice({
          text: body.effectiveAt
            ? `Пакет отключён и действует до конца оплаченного периода — ${formatDate(body.effectiveAt)}.`
            : 'Пакет отключён и действует до конца оплаченного периода.',
          checkoutUrl: null,
        });
        router.refresh();
        return;
      }
      // Владелец 10.09: «пока он места не освободит, этого не может произойти». Отказ без числа
      // был бы глухой стеной — человек видит «нельзя» и не знает, что именно сделать.
      if (
        body?.ok === false &&
        body.error === 'storage_package_occupied' &&
        typeof body.freeBytes === 'number' &&
        typeof body.limitWithoutPackage === 'number'
      ) {
        setError(
          `Без пакета останется ${formatQuotaValue(body.limitWithoutPackage, 'bytes')}. Освободите ${formatQuotaValue(body.freeBytes, 'bytes')}, чтобы отключить пакет.`,
        );
        return;
      }
      setError(
        (body?.ok === false && RELEASE_ERROR_MESSAGES[body.error]) ||
          'Не удалось отключить пакет',
      );
    } catch {
      setError('Не удалось отключить пакет');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">Объём файлов</p>
      {fill !== null && usedPercent !== null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Занято</span>
            <span className="tabular-nums text-foreground">
              {formatQuotaValue(fill.usage, fill.quota.unit)} из{' '}
              {formatQuotaValue(fill.quota.limit, fill.quota.unit)}
              {QUOTA_THRESHOLD_LABEL[fill.threshold] && (
                <Badge
                  variant={fill.threshold === 'reached' ? 'destructive' : 'outline'}
                  className="ml-2"
                >
                  {QUOTA_THRESHOLD_LABEL[fill.threshold]}
                </Badge>
              )}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Занято из доступного объёма файлов"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {current ? (
        <ul aria-label="Докупленный объём" className={doctorDnaFlatListClass}>
          <li className={`${doctorDnaFlatListRowClass} flex-wrap justify-between gap-2`}>
            <span className={doctorDnaFlatListPrimaryClass}>
              {current.name} · {formatQuotaValue(current.bytes, 'bytes')}
            </span>
            <span className={`${doctorDnaFlatListMetaClass} flex items-center gap-2`}>
              <Badge variant="secondary">Входит в тариф</Badge>
              {releaseScheduled ? (
                <Badge variant="outline">
                  {offers.currentPeriodEndsAt
                    ? `Отключён с ${formatDate(offers.currentPeriodEndsAt)}`
                    : 'Отключён с конца периода'}
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => void release()}
                >
                  Отключить
                </Button>
              )}
            </span>
          </li>
        </ul>
      ) : null}

      {choosing && purchasable.length > 0 ? (
        <div className="flex max-w-md flex-col gap-2">
          <Select
            value={selectedId ?? ''}
            onValueChange={(value) => {
              setSelectedId(value);
              setRepriced(null);
              setError(null);
            }}
          >
            <SelectTrigger
              disabled={pending !== null}
              displayLabel={
                selected
                  ? `${selected.name} · ${formatQuotaValue(selected.bytes, 'bytes')}`
                  : 'Выберите пакет'
              }
            />
            <SelectContent>
              {purchasable.map((row) => (
                <SelectItem key={row.packageId} value={row.packageId}>
                  {row.name} · {formatQuotaValue(row.bytes, 'bytes')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && selectedPrice ? (
            <p className="text-sm text-muted-foreground">
              {formatMinorAmount(selectedPrice.priceMinor, selectedPrice.currency)} за остаток
              оплаченного периода — до {formatDate(selected.servicePeriodEndsAt)}. Объём откроется
              сразу, счёт придёт в раздел оплаты.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending !== null || selected === null}
              onClick={() => void buy()}
            >
              {pending === 'purchase' ? 'Покупка…' : 'Купить'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => {
                setChoosing(false);
                setSelectedId(null);
                setRepriced(null);
                setError(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {!choosing && purchasable.length > 0 ? (
        <Button type="button" size="sm" onClick={() => setChoosing(true)}>
          Увеличить место
        </Button>
      ) : null}
      {purchasable.length === 0 && current === null ? (
        <p className="text-sm text-muted-foreground">Пакеты объёма сейчас не продаются.</p>
      ) : null}

      {notice ? (
        <div className="space-y-2 rounded-md border p-3 text-sm" role="status">
          <p>{notice.text}</p>
          {notice.checkoutUrl ? (
            <a className="underline" href={notice.checkoutUrl} rel="noreferrer" target="_blank">
              Оплатить счёт
            </a>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
