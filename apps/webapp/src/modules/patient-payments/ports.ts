/**
 * Patient Payments module — ports (interfaces only; no DB/infra imports).
 *
 * Источник правды для раздела «Учётка» кабинета врача.
 * Реализует ручной кассовый журнал (kind='cash') + чистый seam для эквайринга
 * (AcquiringGatewayPort) — провайдер (ЮКасса/ЮМани) подключается позже.
 *
 * Суммы хранятся в **копейках** (amountMinor: integer) — never float.
 */

// -- Доменный тип записи об оплате -------------------------------------------

export type PaymentKind = 'cash' | 'acquiring';
export type PaymentStatus = 'paid' | 'pending' | 'refunded' | 'failed';

export type PatientPayment = {
  id: string;
  organizationId: string | null;
  patientUserId: string;
  /** Сумма в копейках (всегда > 0). */
  amountMinor: number;
  currency: string;
  kind: PaymentKind;
  status: PaymentStatus;
  comment: string | null;
  service: string | null;
  visitId: string | null;
  appointmentId: string | null;
  /** Patient package (membership) this row settles; null for every other ledger row. */
  patientPackageId: string | null;
  idempotencyKey: string | null;
  /** Заполняется провайдером при acquiring. Null для cash. */
  provider: string | null;
  providerPaymentId: string | null;
  createdBy: string;
  createdAt: string;
};

// -- Входные параметры --------------------------------------------------------

export type AddCashPaymentInput = {
  organizationId: string;
  patientUserId: string;
  /** Сумма в копейках; должна быть > 0. */
  amountMinor: number;
  /** Валюта; по умолчанию 'RUB'. */
  currency?: string;
  comment?: string | null;
  service?: string | null;
  visitId?: string | null;
  appointmentId?: string | null;
  /**
   * Membership this cash settles. One cash door, two subjects: an appointment remainder and a
   * staff membership sale are variants of the same write, not two ledgers.
   */
  patientPackageId?: string | null;
  /** Stable identity for an idempotent cash write; required by appointment and package settlement. */
  idempotencyKey?: string | null;
  createdBy: string;
};

// -- Типы для операций эквайринга --------------------------------------------

/** Alias for PaymentStatus — used in port method signatures for clarity. */
export type PatientPaymentStatus = PaymentStatus;

/** The only two states an acquiring callback can drive a pending ledger row into. */
export type AcquiringSettlementStatus = Extract<PatientPaymentStatus, 'paid' | 'failed'>;

export type SettleAcquiringWebhookPaymentInput = {
  /** Verified route provider; together with providerPaymentId it identifies one lifecycle row. */
  providerId: string;
  /** The provider's own reference, stored on the row at charge initiation. */
  providerPaymentId: string;
  /** Terminal state derived from the verified provider event. */
  status: AcquiringSettlementStatus;
};

/**
 * What the ledger did with one verified callback.
 *
 * `not_found` — no row of the accepted organization carries this exact provider reference, or more
 * than one does (ambiguous references never pick a winner).
 * `already_processed` — the row is already terminal, so a repeated callback changes nothing.
 * `settled` — this callback is the one that moved the row out of `pending`.
 */
export type AcquiringWebhookSettlementOutcome = 'settled' | 'already_processed' | 'not_found';

export type InsertAcquiringPendingInput = {
  organizationId: string;
  patientUserId: string;
  amountMinor: number;
  currency: string;
  description?: string | null;
  provider: string;
  providerPaymentId: string;
  createdBy: string;
  appointmentId?: string | null;
};

// -- Основной порт платежей ---------------------------------------------------

export interface PatientPaymentsPort {
  /** Список платежей пациента, новые первыми. */
  listPayments(patientUserId: string): Promise<PatientPayment[]>;
  /** Paid/pending ledger rows for one exact appointment inside the installed tenant principal. */
  listAppointmentPayments(appointmentId: string, patientUserId: string): Promise<PatientPayment[]>;
  /** Записать ручной платёж наличными (kind='cash', status='paid'). */
  addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment>;
  /**
   * Bootstrap-only webhook resolver. Returns only the owning organization for one exact
   * acquiring lifecycle row; it must not read or return the payment payload.
   */
  resolveAcquiringWebhookOrganization(
    providerId: string,
    providerPaymentId: string,
  ): Promise<string | null>;
  /**
   * Settle one verified acquiring callback inside the organization principal the route installed.
   *
   * Match, idempotency check and write are ONE operation on purpose: the callback carries no row id,
   * the acquirer retries the same event, and a read-then-write pair would let two simultaneous
   * copies both see `pending`. The organization is never an argument — it comes from the installed
   * principal — so a callback verified for one clinic cannot name another's payment.
   */
  settleAcquiringWebhookPayment(
    input: SettleAcquiringWebhookPaymentInput,
  ): Promise<AcquiringWebhookSettlementOutcome>;
  /** Создать запись ожидающего acquiring-платежа (kind='acquiring', status='pending'). */
  insertAcquiringPending(input: InsertAcquiringPendingInput): Promise<PatientPayment>;
}

// -- Seam для эквайринга (заглушка до подключения провайдера) ----------------

/**
 * Входные данные для инициации платежа через шлюз.
 * Расширяется при подключении конкретного провайдера (ЮКасса/ЮМани/etc.).
 */
export type AcquiringChargeInput = {
  /** Server-derived clinic that owns both the patient ledger and provider settings. */
  organizationId: string;
  patientUserId: string;
  /** Server-derived payer email used only for the fiscal receipt. */
  customerEmail?: string | null;
  amountMinor: number;
  currency: string;
  /** Stable caller-owned key forwarded unchanged to the payment provider. */
  idempotencyKey: string;
  /** Описание платежа для отображения плательщику. */
  description?: string;
  /** B1.1 — адрес нашего экрана, куда вернётся плательщик; обязателен, дверь ниже больше не угадывает его. */
  returnUrl: string;
  /** Возможность передать произвольные метаданные провайдеру. */
  metadata?: Record<string, unknown>;
};

/**
 * Результат попытки инициации платежа через шлюз.
 * ok=true — платёж создан; ok=false — ошибка (в том числе 'not_implemented').
 */
export type AcquiringChargeResult =
  | { ok: true; providerId: string; providerPaymentId: string; redirectUrl?: string }
  | { ok: false; reason: 'not_implemented' | 'provider_error' | string };

/**
 * AcquiringGatewayPort — seam для подключения эквайрингового провайдера.
 *
 * Реализации живут в infra/payments/ (registry-backed adapter).
 * buildAppDeps заменяет noopAcquiringGateway на registryAcquiringGateway при наличии
 * реальных credentials в system_settings.booking_payment_providers.
 *
 * Унификация (2026-06): AcquiringGatewayPort расширен до полного provider contract —
 * теперь включает refund + verifyWebhook, что позволяет использовать один набор
 * адаптеров (PaymentProviderPort) для обоих потребителей:
 *   - modules/payments (booking prepayments)
 *   - modules/patient-payments (doctor «Учётка» acquiring)
 */
export interface AcquiringGatewayPort {
  /**
   * Инициировать платёж через шлюз.
   * Returns ok=true with the exact selected providerId, providerPaymentId + redirectUrl on success,
   * or ok=false with reason on failure.
   */
  createCharge(input: AcquiringChargeInput): Promise<AcquiringChargeResult>;

  /**
   * Вернуть платёж (refund).
   * providerId and providerPaymentId are server-derived from the original acquiring row.
   * Refunds must never reselect the clinic's current default provider.
   */
  refund(input: {
    organizationId: string;
    providerId: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ ok: true; providerRefundRef: string } | { ok: false; reason: string }>;

  /**
   * Верифицировать входящий webhook от провайдера и извлечь событие.
   * Throws 'invalid_webhook_signature' if verification fails.
   */
  verifyWebhook(input: { headers: Headers; bodyText: string; webhookSecret: string }): {
    idempotencyKey: string;
    eventType: string;
    payload: Record<string, unknown>;
    intentRef?: string;
    amountMinor?: number;
  };
}
