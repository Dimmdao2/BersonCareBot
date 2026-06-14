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

// -- Основной порт платежей ---------------------------------------------------

export interface PatientPaymentsPort {
  /** Список платежей пациента, новые первыми. */
  listPayments(patientUserId: string): Promise<PatientPayment[]>;
  /** Записать ручной платёж наличными (kind='cash', status='paid'). */
  addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment>;
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
 * Сейчас единственная реализация — NoopAcquiringGateway (infra/repos/noopAcquiringGateway.ts),
 * которая возвращает { ok:false, reason:'not_implemented' }.
 *
 * Когда придёт время подключить ЮКасса/ЮМани:
 *   1. Создать YooKassaAcquiringGateway (или YooMoneyAcquiringGateway) в infra/integrations/.
 *   2. Зарегистрировать в buildAppDeps вместо noopAcquiringGateway.
 *   3. Маршрут POST .../payments можно расширить полем kind='acquiring'.
 */
export interface AcquiringGatewayPort {
  /**
   * Инициировать платёж через шлюз.
   * Noop-реализация всегда возвращает { ok:false, reason:'not_implemented' }.
   */
  createCharge(input: AcquiringChargeInput): Promise<AcquiringChargeResult>;
}
