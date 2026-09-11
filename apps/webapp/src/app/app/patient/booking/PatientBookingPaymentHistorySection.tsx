'use client';

import { useEffect, useState } from 'react';
import { formatAmountMinor, timelineEventTitle } from '@/modules/client-history/labels';
import { formatBookingDateTimeMediumRu } from '@/shared/lib/formatBusinessDateTime';
import {
  patientListItemClass,
  patientActionTextClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

type HistoryRow = {
  id: string;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  occurredAt: string;
};

type Props = {
  appDisplayTimeZone: string;
};

/**
 * Выставленный счёт — не движение денег, и в «Оплатах» ему не место: на снимке владельца 12.09 два
 * ряда `intent_created` стояли над одним `payment_captured` и делали список нечитаемым. Неоплаченная
 * бронь показывается на самой карточке записи со сроком, а здесь — только то, что реально произошло
 * с деньгами.
 */
const NOT_A_MONEY_MOVEMENT = new Set([
  'intent_created',
  'package_intent_created',
  'payment_offer_created',
]);

export function PatientBookingPaymentHistorySection({ appDisplayTimeZone }: Props) {
  const [events, setEvents] = useState<HistoryRow[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/booking/payment-history');
      const json = (await res.json()) as { ok?: boolean; events?: HistoryRow[] };
      if (json.ok && json.events) setEvents(json.events);
    })();
  }, []);

  const rows = events.filter((e) => !NOT_A_MONEY_MOVEMENT.has(e.eventType));
  if (rows.length === 0) return null;

  return (
    <div className={patientSectionSurfaceClass}>
      <h3 className={patientSectionTitleClass}>Оплаты</h3>
      <ul className="flex flex-col gap-2">
        {rows.slice(0, 12).map((e) => {
          const amount = formatAmountMinor(e.amountMinor, e.currency);
          return (
            <li key={e.id} className={patientListItemClass}>
              {/* Тот же словарь, что и в истории клиента у врача: машинный токен пациенту не
                  показывается ни при каких условиях. */}
              <p className={patientActionTextClass}>{timelineEventTitle(e.eventType)}</p>
              <p className={patientMutedTextClass}>
                {amount ? `${amount} · ` : ''}
                {formatBookingDateTimeMediumRu(e.occurredAt, appDisplayTimeZone)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
