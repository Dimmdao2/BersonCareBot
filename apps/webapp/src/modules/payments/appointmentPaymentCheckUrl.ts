/**
 * Единственное правило построения ссылки на проверку счёта, которую можно отдавать человеку.
 * Provider checkout URL остаётся внутренним и появляется только после живой проверки намерения.
 */
export function buildAppointmentPaymentCheckUrl(patientOrigin: string, intentId: string): string {
  return new URL(`/book/pay/${encodeURIComponent(intentId)}`, patientOrigin).toString();
}
