const EVENT_TYPE_LABELS: Record<string, string> = {
  appointment_created: "Запись создана",
  appointment_status_changed: "Статус записи изменён",
  appointment_rescheduled: "Запись перенесена",
  appointment_cancelled: "Запись отменена",
  payment_captured: "Оплата",
  payment_succeeded: "Оплата",
  "payment.succeeded": "Оплата",
  payment_refunded: "Возврат",
  refund_succeeded: "Возврат",
  prepayment_captured: "Предоплата",
  prepayment_retained: "Предоплата удержана",
  prepayment_refunded: "Предоплата возвращена",
  prepayment_carried_on_reschedule: "Предоплата перенесена",
  package_intent_created: "Счёт на абонемент",
  package_assigned: "Абонемент назначен",
  package_purchased: "Абонемент куплен",
  package_activated: "Абонемент активирован",
  activated: "Активирован",
  manual_created: "Абонемент создан",
  catalog_offered: "Абонемент предложен",
  payment_offer_created: "Ссылка на оплату",
  reserved_for_appointment: "Резерв по абонементу",
  consumed: "Списание по абонементу",
  penalty_consumed: "Штрафное списание",
  manual_consume: "Ручное списание",
  manual_adjust: "Ручная корректировка",
  reserve_released: "Резерв снят",
  penalty_without_reserve: "Списание без резерва",
  expired: "Абонемент истёк",
  package_usage: "Списание по абонементу",
  package_expired: "Абонемент истёк",
  product_purchased: "Покупка продукта",
  purchase_started: "Покупка начата",
  visit_consumed: "Списан визит продукта",
  visit_released: "Визит продукта возвращён",
  doctor_note: "Заметка врача",
  staff_comment: "Комментарий к записи",
  reschedule: "Перенос",
  cancellation: "Отмена",
};

const PROVIDER_LABELS: Record<string, string> = {
  mock: "Тестовая оплата",
  yookassa: "ЮKassa",
  cloudpayments: "CloudPayments",
  tbank: "Т-Банк",
};

const PURPOSE_LABELS: Record<string, string> = {
  appointment_prepayment: "Предоплата записи",
  package_purchase: "Покупка абонемента",
  product_purchase: "Покупка продукта",
};

export function timelineEventTitle(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function paymentMethodLabel(providerId: string | null): string | null {
  if (!providerId) return null;
  return PROVIDER_LABELS[providerId] ?? providerId;
}

export function paymentPurposeLabel(purpose: string | null): string | null {
  if (!purpose) return null;
  return PURPOSE_LABELS[purpose] ?? purpose;
}

export function formatAmountMinor(amountMinor: number | null, currency: string | null): string | null {
  if (amountMinor == null || !currency) return null;
  return (amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency });
}

const CANCELLATION_DECISION_LABELS: Record<string, string> = {
  free: "Бесплатная",
  penalized: "Штрафная",
  package_charged: "Со списанием",
  no_package_charge: "Без списания",
  retain_prepayment: "Удержание предоплаты",
  refund_prepayment: "Возврат предоплаты",
  custom: "Индивидуально",
};

export function cancellationDecisionTypeLabel(decisionType: string): string {
  return CANCELLATION_DECISION_LABELS[decisionType] ?? decisionType;
}

export function paymentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Ожидает",
    captured: "Оплачено",
    refunded: "Возврат",
    failed: "Ошибка",
    succeeded: "Оплачено",
  };
  return map[status] ?? status;
}

export function appointmentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    created: "Создана",
    awaiting_payment: "Ожидает оплаты",
    paid: "Оплачена",
    confirmed: "Подтверждена",
    rescheduled: "Перенесена",
    cancelled_by_patient: "Отменена пациентом",
    cancelled_by_specialist: "Отменена специалистом",
    late_cancellation: "Поздняя отмена",
    no_show: "Неявка",
    completed: "Завершена",
    visit_confirmed: "Посещение подтверждено",
    charged_to_package: "Списано по абонементу",
    manual_review_required: "Требует решения",
  };
  return map[status] ?? status;
}
