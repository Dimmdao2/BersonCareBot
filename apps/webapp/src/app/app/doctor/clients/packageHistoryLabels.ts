const HISTORY_EVENT_LABELS: Record<string, string> = {
  manual_created: "Создан вручную",
  catalog_offered: "Назначен из каталога",
  payment_offer_created: "Выставлена оплата",
  activated: "Активирован",
  expired: "Истёк",
  reserved_for_appointment: "Резерв на запись",
  consumed: "Списан",
  penalty_consumed: "Списан (штраф)",
  reserve_released: "Резерв снят",
  refunded: "Возврат сеанса",
};

export function packageHistoryEventLabel(eventType: string): string {
  return HISTORY_EVENT_LABELS[eventType] ?? eventType;
}
