import { NextResponse } from 'next/server';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { SaasBillingService } from '@/modules/saas-billing/service';
import type { SaasBillingStoragePackageOffers } from '@/modules/saas-billing/ports';
import {
  storagePackageQuoteBody,
  verifyStoragePackageQuote,
} from '@/modules/saas-billing/storagePackageQuote';

export type StoragePackagePurchase = {
  storagePackageId: string;
  /** Котировка, выписанная сервером. Денег в запросе нет — как и у покупки места. */
  quote: string;
};

type PurchaseStoragePackage = SaasBillingService['purchaseStoragePackage'];

/**
 * Витрина для экрана: каждый пакет каталога со своим состоянием, и цена — ТОЛЬКО вместе с
 * котировкой. Цены без котировки на проводе не существует: тем и держится равенство «что показали
 * — то и спишем» (владелец 19.08 про сумму из браузера: «это настолько бредово что даже смешно»).
 */
export function storagePackageOffersBody(
  organizationId: string,
  offers: SaasBillingStoragePackageOffers,
) {
  return {
    currentPackageId: offers.currentPackageId,
    currentPeriodEndsAt: offers.currentPeriodEndsAt,
    packages: offers.packages.map((row) => {
      const base = {
        packageId: row.packageId,
        name: row.name,
        bytes: row.bytes,
        isActive: row.isActive,
      };
      if (row.offer.outcome !== 'purchasable') {
        return { ...base, state: row.offer.outcome };
      }
      const quote = storagePackageQuoteBody({
        organizationId,
        storagePackageId: row.packageId,
        priceMinor: row.offer.amountMinor,
        currency: row.offer.currency,
        priceStableUntil: row.offer.priceStableUntil,
      });
      return {
        ...base,
        state: 'purchasable' as const,
        priceMinor: quote.priceMinor,
        currency: quote.currency,
        quote: quote.quote,
        quoteExpiresAt: quote.quoteExpiresAt,
        // Отрезок услуги, за который берётся эта сумма: она пропорциональна остатку периода, и без
        // этих дат число на экране необъяснимо («почему не полная цена пакета?»).
        servicePeriodStartsAt: row.offer.servicePeriodStartsAt,
        servicePeriodEndsAt: row.offer.servicePeriodEndsAt,
      };
    }),
  };
}

/**
 * Докупка объёма. Гейт возможности здесь НЕ ставится намеренно: механика `files` в этот момент как
 * раз исчерпана — покупка и есть способ это исправить, и запрет по исчерпанной механике закрыл бы
 * единственную дверь наружу. Право решает роль в биллинге, проверенная маршрутом выше.
 */
export async function handleStoragePackagePurchase(
  ctx: DoctorWorkspaceAccessContext,
  purchase: StoragePackagePurchase,
  purchaseStoragePackage: PurchaseStoragePackage,
): Promise<NextResponse> {
  const quote = verifyStoragePackageQuote(purchase.quote, {
    organizationId: ctx.organizationId,
    storagePackageId: purchase.storagePackageId,
  });
  // Просрочена, подделана, выписана другой клинике или на другой пакет — для покупателя это одно и
  // то же: «этой цены больше нет». Молчаливый перевыпуск здесь означал бы списание по цене,
  // которой человек не видел, поэтому экран идёт за свежей витриной.
  if (!quote) {
    return NextResponse.json({ ok: false, error: 'storage_package_quote_expired' }, { status: 402 });
  }

  const result = await purchaseStoragePackage({
    organizationId: ctx.organizationId,
    storagePackageId: purchase.storagePackageId,
    quote,
  });
  if (result.outcome === 'price_changed') {
    return NextResponse.json(
      {
        ok: false,
        ...storagePackageQuoteBody({
          organizationId: ctx.organizationId,
          storagePackageId: purchase.storagePackageId,
          priceMinor: result.priceMinor,
          currency: result.currency,
          priceStableUntil: result.priceStableUntil,
        }),
      },
      { status: 402 },
    );
  }
  if (result.outcome === 'storage_package_unavailable') {
    return NextResponse.json(
      { ok: false, error: 'saas_billing_storage_package_unavailable' },
      { status: 409 },
    );
  }
  // Р-15: пока клиника думала, оплаченный период кончился. Остатка нет — продавать не во что;
  // объём придёт вместе с оплатой следующего периода.
  if (result.outcome === 'paid_period_over') {
    return NextResponse.json(
      { ok: false, error: 'storage_package_paid_period_over' },
      { status: 409 },
    );
  }
  // Р-18: уже оплаченное назад не отбирается, поэтому меньший пакет вступает с начала следующего
  // периода — это не покупка, а другой маршрут (отказ/переход), и экран должен сказать именно так.
  if (result.outcome === 'downgrade_at_period_end') {
    return NextResponse.json(
      { ok: false, error: 'storage_package_downgrade_at_period_end' },
      { status: 409 },
    );
  }
  // outcome === 'storage_opened': объём уже поднят, счёт выставлен и ждёт оплаты. Отсутствие ссылки
  // на оплату — не ошибка запроса: доступ она не решает, клиника оплатит счёт из раздела оплаты.
  return NextResponse.json({
    ok: true,
    outcome: 'storage_opened',
    invoiceId: result.invoice.id,
    amountMinor: result.invoice.amountMinor,
    currency: result.invoice.currency,
    invoiceExpiresAt: result.invoice.expiresAt,
    ...(result.invoice.providerCheckoutUrl
      ? { checkoutUrl: result.invoice.providerCheckoutUrl }
      : {}),
  });
}
