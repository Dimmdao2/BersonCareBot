/**
 * Закрытый перечень **кодовых путей**, которые выставляют доверенную активацию телефона
 * для tier **patient** (колонка `platform_users.patient_phone_trust_at`).
 *
 * Любой новый writer `phone_normalized` **обязан** либо:
 * - обновить `patient_phone_trust_at` согласно одному из зарегистрированных путей ниже, либо
 * - не рассчитывать на tier patient для этого пользователя до отдельного решения.
 *
 * Список в `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md` §8 синхронизируется с этим enum.
 *
 * **Read-side:** решение «телефон на каноне засчитан для patient» (`SPECIFICATION.md` §5) —
 * только через `isTrustedPatientPhoneActivation`; не дублировать условие в других модулях.
 */
export enum TrustedPatientPhoneSource {
  /** Успешный `createOrBind` после OTP (`pgUserByPhone`, confirm flow). */
  OtpCreateOrBind = "otp_create_or_bind",
  /** `upsertFromProjection` / merge projection в `pgUserProjection`. */
  IntegratorUpsertFromProjection = "integrator_upsert_from_projection",
  /** `ensureClientFromAppointmentProjection` (Rubitime / appointment projection). */
  IntegratorEnsureClientFromAppointment = "integrator_ensure_client_from_appointment",
  /** `UserProjectionPort.updatePhone` (интегратор). */
  IntegratorUpdatePhone = "integrator_update_phone",
  /** Новый пользователь с телефоном из Yandex OAuth (`oauthYandexResolve`). */
  OAuthYandexVerifiedPhone = "oauth_yandex_verified_phone",
  /** Новый пользователь с телефоном из Google / Apple web OAuth (`oauthWebLoginResolve`). */
  OAuthWebLoginVerifiedPhone = "oauth_web_login_verified_phone",
  /**
   * Слияние двух клиентов: доверие переносится с выбранной стороны телефона / max(timestamp).
   * Не создаёт нового доверия «из воздуха».
   */
  PlatformUserMerge = "platform_user_merge",
}

/** Имя колонки в БД; единственный признак trusted-активации на чтении tier. */
export const PATIENT_PHONE_TRUST_COLUMN = "patient_phone_trust_at" as const;

/** Строка канона из БД (или эквивалент), достаточная для read-side проверки §5. */
export type PatientPhoneCanonRow = {
  phone_normalized: string | null | undefined;
  patient_phone_trust_at: Date | string | null | undefined;
};

/**
 * Единственная read-side проверка: у канона есть телефон и он **доверен** для tier patient.
 * Не считать `phone_normalized` без `patient_phone_trust_at` активацией (§5).
 */
export function isTrustedPatientPhoneActivation(row: PatientPhoneCanonRow): boolean {
  const p = row.phone_normalized;
  const hasPhone = typeof p === "string" && p.trim() !== "";
  if (!hasPhone) return false;
  return row.patient_phone_trust_at != null;
}

/**
 * Якорь для ревью и навигации: связывает SQL-writer с `TrustedPatientPhoneSource`.
 * Не меняет runtime-tier (источник истины — `patient_phone_trust_at` в БД).
 */
export function trustedPatientPhoneWriteAnchor(source: TrustedPatientPhoneSource): void {
  void source;
}
