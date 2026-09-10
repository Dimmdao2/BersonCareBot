/**
 * ЧТО СЧИТАЕТСЯ ДОЛГОМ ЗА ПОКУПКУ ВНУТРИ ПЕРИОДА — одно правило, одна реализация, оба репозитория.
 *
 * Решение владельца 19.08, дословно: «Если до конца периода счет не оплачен — делать его
 * просроченным и включать долг в стоимость следующего периода: он либо автооплатится, либо весь
 * доступ закрыт по правилам тарифов (как настроил глоб-админ)».
 *
 * Почему правило вынесено сюда, а не написано дважды. До этого файла условие отбора жило в двух
 * местах: WHERE боевого PG-репозитория и `filter` двойника в памяти. Сегодня они совпадали, но
 * ничто не держало их совпадающими завтра, а расходятся такие копии молча и на деньгах: аудит
 * 19.08 снял из боевого WHERE условие `asOf` — и все 367 тестов остались зелёными, потому что
 * краснеть было нечему, двойник условие сохранил. Теперь копии нет: обе двери зовут ЭТУ функцию,
 * и снятое здесь условие немедленно краснеет на сценариях переноса долга.
 *
 * Оба условия по дате обязательны, и второе — не перестраховка:
 *
 * - `periodStartsAt` — долгом становится счёт за место, чей отрезок услуги кончился не позже начала
 *   нового периода. Место за уже прошедший период при этом не отбирается: услуга оказана.
 * - `asOf` — клиника вправе оплатить следующий период ДОСРОЧНО, посреди текущего. Тогда счёт за
 *   место ещё НЕ просрочен: владелец сказал «если ДО КОНЦА ПЕРИОДА счёт не оплачен», а конец
 *   периода ещё не наступил. Без этого условия досрочная оплата отбирала бы у клиники возможность
 *   закрыть место отдельным счётом и втягивала бы в долг живую, ещё не просроченную услугу.
 */

import {
  PRORATED_PURCHASE_INVOICE_KINDS,
  type SaasBillingInvoiceKind,
  type SaasBillingInvoiceStatus,
} from './ports';

/**
 * Правило написано один раз на ОБА вида покупок внутри оплаченного периода — место сверх тарифа и
 * пакет объёма (10.09.2026). Они устроены одинаково: пропорция остатка, срок до конца периода,
 * неоплаченный остаток переезжает в счёт продления. Вторая копия этого правила «для объёма» разошлась
 * бы с первой ровно так же молча и ровно на деньгах, как разошлись бы копии, из-за которых этот файл
 * и появился.
 */
function isProratedPurchase(kind: SaasBillingInvoiceKind): boolean {
  return (PRORATED_PURCHASE_INVOICE_KINDS as readonly string[]).includes(kind);
}

/** Ровно те поля счёта, по которым решается вопрос «долг или нет». Больше правилу знать нечего. */
export type SaasBillingSeatDebtCandidate = {
  organizationId: string;
  saasBillingSubscriptionId: string;
  invoiceKind: SaasBillingInvoiceKind;
  status: SaasBillingInvoiceStatus;
  servicePeriodEndsAt: string;
};

/** Куда едет долг: чей период, когда он начинается и какое «сейчас» у выставления. */
export type SaasBillingSeatDebtScope = {
  organizationId: string;
  saasBillingSubscriptionId: string;
  periodStartsAt: string;
  asOf: string;
};

/** Долгом может стать только НЕОПЛАЧЕННЫЙ счёт: оплаченный долгом не является, аннулированный — уже уехал. */
function isAwaitingPayment(status: SaasBillingInvoiceStatus): boolean {
  return status === 'draft' || status === 'pending';
}

/** Долг ли это за покупку внутри периода, начинающегося в `scope.periodStartsAt`. */
export function isSaasBillingSeatDebtForPeriod(
  invoice: SaasBillingSeatDebtCandidate,
  scope: SaasBillingSeatDebtScope,
): boolean {
  return (
    invoice.organizationId === scope.organizationId &&
    invoice.saasBillingSubscriptionId === scope.saasBillingSubscriptionId &&
    isProratedPurchase(invoice.invoiceKind) &&
    isAwaitingPayment(invoice.status) &&
    invoice.servicePeriodEndsAt <= scope.periodStartsAt &&
    invoice.servicePeriodEndsAt <= scope.asOf
  );
}

/**
 * Верхняя граница конца отрезка услуги для НАДМНОЖЕСТВА кандидатов.
 *
 * Нужна только затем, чтобы SQL-запрос сужался частичным индексом
 * `idx_saas_billing_invoices_prorated_debt` и брал под замок обозримое число строк, а не все покупки
 * внутри периода этой подписки. Решает по-прежнему {@link isSaasBillingSeatDebtForPeriod}: настоящее условие
 * — «не позже ОБЕИХ дат», то есть не позже меньшей из них, и любая строка, прошедшая эту границу,
 * но не прошедшая правило, отсеивается им. Поэтому ошибка здесь не может превратить не-долг в долг.
 */
export function saasBillingSeatDebtCandidateBound(scope: SaasBillingSeatDebtScope): string {
  return scope.periodStartsAt >= scope.asOf ? scope.periodStartsAt : scope.asOf;
}
