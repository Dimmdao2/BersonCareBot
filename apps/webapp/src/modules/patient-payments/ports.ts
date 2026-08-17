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
  createdBy: string;
};

// -- Типы для операций эквайринга --------------------------------------------

/** Alias for PaymentStatus — used in port method signatures for clarity. */
export type PatientPaymentStatus = PaymentStatus;

export type InsertAcquiringPendingInput = {
  organizationId: string;
  patientUserId: string;
  amountMinor: number;
  currency: string;
  description?: string | null;
  provider: string;
  providerPaymentId: string;
  createdBy: string;
};

// -- Основной порт платежей ---------------------------------------------------

export interface PatientPaymentsPort {
  /** Список платежей пациента, новые первыми. */
  listPayments(patientUserId: string): Promise<PatientPayment[]>;
  /** Записать ручной платёж наличными (kind='cash', status='paid'). */
  addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment>;
  /**
   * Find exactly one acquiring ledger row by the provider-owned composite reference.
   * Returns null for no match and for duplicate same-provider references.
   */
  findByProviderPaymentReference(
    providerId: string,
    providerPaymentId: string,
  ): Promise<PatientPayment | null>;
  /**
   * Bootstrap-only webhook resolver. Returns only the owning organization for one exact
   * acquiring lifecycle row; it must not read or return the payment payload.
   */
  resolveAcquiringWebhookOrganization(
    providerId: string,
    providerPaymentId: string,
  ): Promise<string | null>;
  /** Обновить статус acquiring-платежа по его ID. */
  updatePatientPaymentStatus(
    id: string,
    status: PatientPaymentStatus,
    organizationId: string,
    providerPaymentId?: string,
  ): Promise<void>;
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
