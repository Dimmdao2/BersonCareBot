/**
 * Что оператор вправе сделать с уже выставленным счётом — ОДНО место на весь продукт.
 *
 * Решение владельца 19.08, дословно: «отмена неоплаченного счёта администратором — это с чего бы
 * его отменять? как делается у других — разве они дают админу просто отменить счет? Может
 * перевыставить его». Основание практикой — `docs/_TODO/SAAS_FOUNDATION/SEAT_UNPAID_PRACTICE_2026-08-19.md`
 * вопрос 2: аннулирование говорит миру «счёта не было», и для УЖЕ ОКАЗАННОЙ услуги это ложь;
 * инструмент исправления выставленного счёта — перевыставление, то есть новый счёт ПЛЮС гашение
 * старого, где гашение — техническая часть операции, у которой есть преемник.
 *
 * Почему правило живёт здесь, а не в маршруте и не в кнопке: до этого файла условие показа кнопки
 * («статус draft или pending») было единственной проверкой во всей цепочке, а маршрут отмены,
 * написанный под РУЧНОЙ счёт (`PAYMENTS_CABINET_PLAN.md` К4), принимал любой. Кнопка — не
 * единственный вход; проверку, которую надо не забыть позвать, забывают (AGENTS.md §5). Теперь
 * вердикт один, и его читают оба: экран, чтобы не рисовать кнопку, и репозиторий, чтобы отказать
 * прямому запросу.
 */

import type { SaasBillingInvoiceKind, SaasBillingInvoiceStatus } from './ports';

/** Всё, что нужно знать о счёте, чтобы решить его судьбу: вид услуги и текущее состояние. */
export type SaasBillingInvoiceOperationSubject = {
  invoiceKind: SaasBillingInvoiceKind;
  status: SaasBillingInvoiceStatus;
};

export type SaasBillingInvoiceCancelRefusal =
  /** Исход уже наступил: оплачен, аннулирован, отбит провайдером — отменять нечего. */
  | 'invoice_not_cancellable'
  /** Автоматический счёт за место: услуга продана, отмена сказала бы «не продавали». */
  | 'seat_invoice_not_cancellable';

export type SaasBillingInvoiceReissueRefusal =
  /** Перевыставляется только неоплаченный счёт: у оплаченного нет долга, который надо переносить. */
  | 'invoice_not_reissuable'
  /** Ручной счёт правится отменой и новым выставлением; перевыставление заведено под счёт за место. */
  | 'invoice_kind_not_reissuable';

export type SaasBillingInvoiceVerdict<TRefusal> =
  | { allowed: true }
  | { allowed: false; refusal: TRefusal };

/** Неоплаченный счёт — единственный, над которым вообще есть что делать. */
function isAwaitingPayment(status: SaasBillingInvoiceStatus): boolean {
  return status === 'draft' || status === 'pending';
}

/**
 * Можно ли ОТМЕНИТЬ этот счёт.
 *
 * Вид проверяется ПЕРВЫМ и отдельным отказом: «счёт за место отменить нельзя» — это не про статус,
 * и оператор должен услышать именно это, а не «счёт не в том состоянии». Для счёта за место есть
 * своё действие — {@link saasBillingInvoiceReissueVerdict}.
 */
export function saasBillingInvoiceCancelVerdict(
  invoice: SaasBillingInvoiceOperationSubject,
): SaasBillingInvoiceVerdict<SaasBillingInvoiceCancelRefusal> {
  if (invoice.invoiceKind === 'seat_overage') {
    return { allowed: false, refusal: 'seat_invoice_not_cancellable' };
  }
  if (!isAwaitingPayment(invoice.status)) {
    return { allowed: false, refusal: 'invoice_not_cancellable' };
  }
  return { allowed: true };
}

/** Можно ли ПЕРЕВЫСТАВИТЬ этот счёт: новый на тот же отрезок услуги, старый гасится преемником. */
export function saasBillingInvoiceReissueVerdict(
  invoice: SaasBillingInvoiceOperationSubject,
): SaasBillingInvoiceVerdict<SaasBillingInvoiceReissueRefusal> {
  if (invoice.invoiceKind !== 'seat_overage') {
    return { allowed: false, refusal: 'invoice_kind_not_reissuable' };
  }
  if (!isAwaitingPayment(invoice.status)) {
    return { allowed: false, refusal: 'invoice_not_reissuable' };
  }
  return { allowed: true };
}

/**
 * ПОРЯДОК перевыставления — здесь, и только здесь.
 *
 * Преемник создаётся ПЕРВЫМ, старый гасится ТОЛЬКО тем, что вернуло создание. Обратный порядок не
 * «запрещён правилом», а невыразим: `retireSuperseded` физически нечем позвать, пока
 * `issueSuccessor` не отдал преемника. Это разница между «аннулировали и, если повезёт, выставим
 * новый» (долг исчезает в промежутке) и «сумма переехала на новый счёт».
 *
 * Транзакция — забота вызывающего: обе операции обязаны идти в ОДНОЙ транзакции под замком
 * организации, иначе падение между шагами оставит счёт погашенным без преемника.
 */
export async function reissueWithSuccessor<TSuccessor, TRetired>(steps: {
  issueSuccessor: () => Promise<TSuccessor>;
  retireSuperseded: (successor: TSuccessor) => Promise<TRetired>;
}): Promise<{ successor: TSuccessor; retired: TRetired }> {
  const successor = await steps.issueSuccessor();
  const retired = await steps.retireSuperseded(successor);
  return { successor, retired };
}

/**
 * ОПЛАТА ПРИШЛА ПО СЧЁТУ, КОТОРЫЙ УЖЕ ПОГАШЕН ПРЕЕМНИКОМ — что это значит.
 *
 * Почему такой порядок событий вообще возможен. `pending` означает, что заказ отдан провайдеру и
 * плательщик держит в руках живую ссылку на оплату. Закрыть чужой чек-аут нам нечем: в порту
 * провайдера (`PaymentProviderPort`) такой операции нет вовсе. Значит между «долг переехал в счёт
 * следующего периода» и «клиника всё-таки нажала оплатить по старой ссылке» может пройти сколько
 * угодно времени, и деньги у провайдера спишутся.
 *
 * Что было до этого правила: захват платежа отвечал на такой счёт `duplicate: true` и 200, то есть
 * ВЫБРАСЫВАЛ оплату молча. Списание у провайдера произошло, а те же деньги стояли строкой внутри
 * счёта-преемника — одна услуга оплачена дважды, продукт знает про один раз, тревоги нет.
 *
 * Три исхода, и ни в одном деньги не пропадают:
 *
 * - `settle_superseded` — счёт погашен преемником. Сумму надо снять с преемника (шов
 *   `app.release_carried_seat_debt`) и погасить этот счёт как оплаченный: переезд отменяется ровно
 *   на ту сумму, которую эта оплата закрыла.
 * - `closed` — счёт аннулирован БЕЗ преемника или отбит провайдером: услуги за ним не стоит.
 * - `ordinary` — обычный живой счёт, обычный захват.
 */
export type SaasBillingPaidInvoiceSubject = {
  status: SaasBillingInvoiceStatus;
  supersededByInvoiceId: string | null;
};

export type SaasBillingPaidInvoiceRoute = 'ordinary' | 'settle_superseded' | 'closed';

export function saasBillingPaidInvoiceRoute(
  invoice: SaasBillingPaidInvoiceSubject,
): SaasBillingPaidInvoiceRoute {
  if (invoice.status === 'void') {
    return invoice.supersededByInvoiceId ? 'settle_superseded' : 'closed';
  }
  if (invoice.status === 'failed') return 'closed';
  return 'ordinary';
}
