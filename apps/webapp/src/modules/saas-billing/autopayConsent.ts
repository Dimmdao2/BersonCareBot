/**
 * К6 — the ONE canonical copy of the autopay consent disclosure. Both the screen that renders it
 * (`AutopayToggleButton.tsx`) and the endpoint that stores it (`grantSaasBillingAutopayConsent`)
 * import this constant, so what gets stored as `autopayConsentText` is always exactly what the
 * payer saw before clicking — never a value the client could substitute.
 */
export const SAAS_BILLING_AUTOPAY_CONSENT_TEXT =
  'Я согласен(на) на автоматическое списание оплаты тарифа с сохранённого способа оплаты в дату очередного продления периода. Согласие можно отозвать в любой момент в этом разделе — после отзыва автосписание не выполняется.';
