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

export type PaymentKind = "cash" | "acquiring";
export type PaymentStatus = "paid" | "pending" | "refunded" | "failed";

export type PatientPayment = {
  id: string;
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
  /** Найти запись оплаты по внешнему ID провайдера (для webhook). */
  findByProviderPaymentId(providerPaymentId: string): Promise<PatientPayment | null>;
  /** Обновить статус acquiring-платежа по его ID. */
  updatePatientPaymentStatus(
    id: string,
    status: PatientPaymentStatus,
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
  patientUserId: string;
  amountMinor: number;
  currency: string;
  /** Описание платежа для отображения плательщику. */
  description?: string;
  /** Возможность передать произвольные метаданные провайдеру. */
  metadata?: Record<string, unknown>;
};

/**
 * Результат попытки инициации платежа через шлюз.
 * ok=true — платёж создан; ok=false — ошибка (в том числе 'not_implemented').
 */
export type AcquiringChargeResult =
  | { ok: true; providerPaymentId: string; redirectUrl?: string }
  | { ok: false; reason: "not_implemented" | "provider_error" | string };

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
   * Returns ok=true with providerPaymentId + redirectUrl on success,
   * or ok=false with reason on failure.
   */
  createCharge(input: AcquiringChargeInput): Promise<AcquiringChargeResult>;

  /**
   * Вернуть платёж (refund).
   * providerPaymentId — ref returned by createCharge.
   */
  refund(input: {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ ok: true; providerRefundRef: string } | { ok: false; reason: string }>;

  /**
   * Верифицировать входящий webhook от провайдера и извлечь событие.
   * Throws 'invalid_webhook_signature' if verification fails.
   */
  verifyWebhook(input: {
    headers: Headers;
    bodyText: string;
    webhookSecret: string;
  }): {
    idempotencyKey: string;
    eventType: string;
    payload: Record<string, unknown>;
    intentRef?: string;
    amountMinor?: number;
  };
}
