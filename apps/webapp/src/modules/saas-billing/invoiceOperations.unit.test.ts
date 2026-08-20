/**
 * Поломки, которые ловит этот файл (по одной строке на каждую, §10a):
 *
 * 1. «Платформенный администратор нажимает „Отменить“ на автоматическом счёте за место — счёт
 *    уходит в `void`, оказанная услуга остаётся неоплаченной навсегда, а журнал платежей говорит
 *    „счёта не было“». Дорого (деньги + ложь в отчётности) и молча (внешне выглядит как обычная
 *    отмена).
 * 2. `reissueWithSuccessor` — общий помощник упорядочивания преемника, которым продление периода
 *    гасит старый счёт: гашение падает раньше создания нового — долг исчезает в промежутке.
 */
import { describe, expect, it, vi } from 'vitest';
import { reissueWithSuccessor, saasBillingInvoiceCancelVerdict } from './invoiceOperations';

describe('отмена счёта: вид счёта решает раньше статуса', () => {
  it('отказывает отменить неоплаченный счёт за место — его перевыставляют', () => {
    expect(saasBillingInvoiceCancelVerdict({ invoiceKind: 'seat_overage', status: 'draft' })).toEqual(
      { allowed: false, refusal: 'seat_invoice_not_cancellable' },
    );
    expect(
      saasBillingInvoiceCancelVerdict({ invoiceKind: 'seat_overage', status: 'pending' }),
    ).toEqual({ allowed: false, refusal: 'seat_invoice_not_cancellable' });
  });

  it('называет отказ по ВИДУ, а не по статусу, даже когда статус тоже не подходит', () => {
    // Оператор должен услышать «счёт за место не отменяют», а не «счёт не в том состоянии»:
    // второе подсказывает подождать, первое — перевыставить.
    expect(saasBillingInvoiceCancelVerdict({ invoiceKind: 'seat_overage', status: 'paid' })).toEqual(
      { allowed: false, refusal: 'seat_invoice_not_cancellable' },
    );
  });

  it('оставляет отмену там, где она и была задумана — на счёте за период тарифа', () => {
    expect(
      saasBillingInvoiceCancelVerdict({ invoiceKind: 'tariff_period', status: 'draft' }),
    ).toEqual({ allowed: true });
    expect(
      saasBillingInvoiceCancelVerdict({ invoiceKind: 'tariff_period', status: 'pending' }),
    ).toEqual({ allowed: true });
  });

  it('не даёт отменить счёт, исход которого уже наступил', () => {
    for (const status of ['paid', 'void', 'failed'] as const) {
      expect(
        saasBillingInvoiceCancelVerdict({ invoiceKind: 'tariff_period', status }),
      ).toEqual({ allowed: false, refusal: 'invoice_not_cancellable' });
    }
  });
});

describe('порядок перевыставления: преемник первым, гашение — только после него', () => {
  it('гасит старый счёт ТОЛЬКО тем счётом, который вернуло создание', async () => {
    const order: string[] = [];
    const retireSuperseded = vi.fn(async (successor: { id: string }) => {
      order.push(`retire:${successor.id}`);
      return 'retired' as const;
    });

    const result = await reissueWithSuccessor({
      issueSuccessor: async () => {
        order.push('issue');
        return { id: 'invoice-new' };
      },
      retireSuperseded,
    });

    expect(order).toEqual(['issue', 'retire:invoice-new']);
    expect(result).toEqual({ successor: { id: 'invoice-new' }, retired: 'retired' });
  });

  it('оставляет старый счёт нетронутым, когда создание нового упало', async () => {
    const retireSuperseded = vi.fn();

    await expect(
      reissueWithSuccessor({
        issueSuccessor: async () => {
          throw new Error('provider_temporarily_unavailable');
        },
        retireSuperseded,
      }),
    ).rejects.toThrow('provider_temporarily_unavailable');

    // Ни одного гашения: долг не исчезал ни на мгновение.
    expect(retireSuperseded).not.toHaveBeenCalled();
  });
});
