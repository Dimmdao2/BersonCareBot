/**
 * §5a item 2.6a — the ladder's notifications, as the owner modelled them on 31.07: a list of rows,
 * each with a deadline relative to the end of the paid period, a payment condition and a text
 * template with substituted variables.
 *
 * Everything here is MECHANISM. There is no text, no notification count and no list of template
 * variables in this file: the templates come from the tariff, the variables come from the caller's
 * data map, and adding a new variable never touches this code.
 */
import type { SaasBillingInvoiceReadRow } from '@/modules/saas-billing/ports';
import type {
  AccessNotificationCondition,
  AccessNotificationRule,
  MechanicAccessWarning,
  AccessPeriodSource,
} from './types';

const DAY_MS = 86_400_000;
type BillingInvoiceForAccessNotification = Pick<
  SaasBillingInvoiceReadRow,
  'amountMinor' | 'invoiceKind' | 'servicePeriodStartsAt' | 'status'
>;

/**
 * Supplies payment-specific variables from the already-raised renewal invoice.  The invoice is
 * the billing fact for the next period: unlike the live tariff it has the exact amount and dates
 * that this organization will be charged.  A missing invoice deliberately supplies nothing, so
 * the owner's placeholder remains visible instead of borrowing a current tariff price.
 */
export function accessNotificationBillingVariables(
  warning: Pick<MechanicAccessWarning, 'periodSource' | 'periodEndsAt'>,
  billing: { invoices: readonly BillingInvoiceForAccessNotification[] } | null,
): Readonly<Record<string, string>> {
  if (warning.periodSource !== 'paid_period' || !billing) return {};

  const renewalInvoice = billing.invoices.find(
    (invoice) =>
      invoice.invoiceKind === 'tariff_period' &&
      invoice.servicePeriodStartsAt === warning.periodEndsAt &&
      invoice.status !== 'void',
  );
  if (!renewalInvoice) return {};

  return {
    сумма: new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
      renewalInvoice.amountMinor / 100,
    ),
    дата_начала_периода_автооплаты: new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(renewalInvoice.servicePeriodStartsAt)),
  };
}

/**
 * §5a item 7.0 — the owner's notification conditions are «успешная оплата» and «ошибка оплаты», and
 * both are statements about MONEY. So the condition follows the real period the ladder is running
 * on, not the fact of degradation:
 *
 * - a lapsed PAID period IS the non-payment the owner means → `payment_failed` rows apply;
 * - an expired TRIAL is not a payment outcome at all → no payment-condition row applies to it.
 *
 * Until this function existed both doors passed `'payment_failed'` unconditionally with the comment
 * «the ladder only degrades after an unpaid period» — which was simply untrue: the only anchor was
 * the trial, so the owner's «ошибка оплаты» text was shown to clinics that had never been billed.
 */
export function accessNotificationConditionFor(
  periodSource: AccessPeriodSource,
): AccessNotificationCondition | null {
  return periodSource === 'paid_period' ? 'payment_failed' : null;
}

/**
 * `{{name}}` — the only thing this module knows about a template. The name is any word in any
 * script: the owner writes his templates in Russian («тариф», «сумма», «клиника»), so restricting
 * the placeholder to Latin letters would silently leave his variables unsubstituted.
 */
const PLACEHOLDER = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

/**
 * Fills an owner-authored template from a data map. The set of variables is open: a name the
 * caller did not supply is left visible as its placeholder rather than silently blanked, so an
 * unfilled variable is a visible defect instead of a hole in the sent text.
 */
export function renderAccessNotification(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name]! : placeholder,
  );
}

/** Every variable an owner referenced in a template — used to show what a text still needs. */
export function accessNotificationVariables(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!);
}

/**
 * The rows that have come due. `offsetDays` is signed and measured from the end of the paid
 * period, so a row is due once `periodEndsAt + offsetDays` is in the past; `condition` filters by
 * the payment outcome and is never a branch here — the owner put it in the row.
 *
 * Rows are returned in the order they became due (earliest first), which is the order the owner
 * wrote them into the ladder when he numbered "первое напоминание, второе предупреждение…".
 */
export function dueAccessNotifications(input: {
  notifications: readonly AccessNotificationRule[];
  periodEndsAt: string;
  now: Date;
  condition: AccessNotificationCondition;
}): AccessNotificationRule[] {
  const periodEnd = new Date(input.periodEndsAt).getTime();
  if (!Number.isFinite(periodEnd)) return [];
  const now = input.now.getTime();
  return input.notifications
    .filter((rule) => rule.condition === input.condition)
    .map((rule) => ({ rule, dueAt: periodEnd + rule.offsetDays * DAY_MS }))
    .filter((entry) => entry.dueAt <= now)
    .sort((left, right) => left.dueAt - right.dueAt)
    .map((entry) => entry.rule);
}
