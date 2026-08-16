const ACQUIRING_REASON_MESSAGES: Readonly<Record<string, string>> = {
  payments_disabled: 'Приём платежей выключен в настройках клиники',
  payment_provider_unavailable: 'Провайдер оплаты не настроен',
  booking_payment_receipt_vat_code_missing:
    'В настройках платежей не выбрана ставка НДС для чека',
  booking_payment_receipt_customer_email_missing:
    'У пациента не указан email для отправки чека',
};

export function acquiringErrorMessage(reason: string | null | undefined): string {
  if (!reason) return 'Не удалось создать ссылку на оплату';
  return ACQUIRING_REASON_MESSAGES[reason] ?? 'Провайдер оплаты отклонил запрос';
}
