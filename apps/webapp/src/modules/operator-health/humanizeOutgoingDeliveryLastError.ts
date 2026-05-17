const REASON_UNKNOWN = "unknown_delivery_error" as const;

/** Маска телефона для архива / UI врача (без полного номера). */
export function maskPhoneForHealthArchive(phone: string | null | undefined): string | null {
  if (phone == null || String(phone).trim().length === 0) return null;
  const digits = String(phone).replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : "****";
  return String(phone).trim().startsWith("+") ? `+•••${last4}` : `•••${last4}`;
}

type HumanizeResult = { reason_code: string; reason_ru: string };

/**
 * Сжатое объяснение `last_error` исходящей очереди для архива и UI.
 * Коды выровнены с `outgoingDeliveryWorker` / произвольными сообщениями после truncate.
 */
export function humanizeOutgoingDeliveryLastError(lastError: string | null | undefined): HumanizeResult {
  const raw = (lastError ?? "").trim();
  if (!raw) {
    return { reason_code: REASON_UNKNOWN, reason_ru: "Причина не указана" };
  }
  const upper = raw.toUpperCase();

  if (upper === "BAD_PAYLOAD" || raw === "BAD_PAYLOAD") {
    return { reason_code: "BAD_PAYLOAD", reason_ru: "Некорректные данные задачи (payload)" };
  }
  if (upper.includes("MISSING_BROADCAST_AUDIT_ID") || upper === "MISSING_BROADCAST_AUDIT_ID") {
    return { reason_code: "MISSING_BROADCAST_AUDIT_ID", reason_ru: "В задаче нет идентификатора журнала рассылки" };
  }
  if (upper.includes("MISSING_INCIDENT_ID") || upper === "MISSING_INCIDENT_ID") {
    return { reason_code: "MISSING_INCIDENT_ID", reason_ru: "В задаче операторского алерта нет incident_id" };
  }
  if (upper.includes("MISSING_REMINDER_FIELDS") || upper === "MISSING_REMINDER_FIELDS") {
    return { reason_code: "MISSING_REMINDER_FIELDS", reason_ru: "Не хватает полей для доставки напоминания" };
  }
  if (upper.startsWith("UNKNOWN_KIND:")) {
    return { reason_code: "UNKNOWN_KIND", reason_ru: "Неизвестный тип задачи в очереди" };
  }
  if (raw.includes("broadcast_delivery_cap_exceeded")) {
    return {
      reason_code: "broadcast_delivery_cap_exceeded",
      reason_ru: "Превышен лимит строк доставки на одну рассылку",
    };
  }
  if (upper.includes("TIMEOUT") || upper.includes("ETIMEDOUT") || upper.includes("DEADLINE")) {
    return { reason_code: "timeout", reason_ru: "Таймаут при обращении к внешнему API" };
  }
  if (upper.includes("ECONNREFUSED") || upper.includes("ENOTFOUND") || upper.includes("EAI_AGAIN")) {
    return { reason_code: "network", reason_ru: "Сетевая ошибка / недоступен узел" };
  }
  if (upper.includes("HTTP") && /\b(4\d\d|5\d\d)\b/.test(raw)) {
    const m = raw.match(/\b(4\d\d|5\d\d)\b/);
    return {
      reason_code: m ? `http_${m[1]}` : "http_error",
      reason_ru: m ? `Ошибка HTTP ${m[1]} от интегратора` : "Ошибка HTTP от интегратора",
    };
  }

  return { reason_code: REASON_UNKNOWN, reason_ru: "Ошибка доставки (см. усечённый текст)" };
}

export function humanizeIntegratorPushOutboxLastError(lastError: string | null | undefined): HumanizeResult {
  const raw = (lastError ?? "").trim();
  if (!raw) {
    return { reason_code: REASON_UNKNOWN, reason_ru: "Причина не указана" };
  }
  const upper = raw.toUpperCase();
  if (upper.includes("TIMEOUT") || upper.includes("ETIMEDOUT")) {
    return { reason_code: "timeout", reason_ru: "Таймаут signed POST в integrator" };
  }
  if (upper.includes("ECONNREFUSED") || upper.includes("ENOTFOUND")) {
    return { reason_code: "network", reason_ru: "Сеть: integrator недоступен" };
  }
  if (upper.includes("HTTP") && /\b(4\d\d|5\d\d)\b/.test(raw)) {
    const m = raw.match(/\b(4\d\d|5\d\d)\b/);
    return {
      reason_code: m ? `http_${m[1]}` : "http_error",
      reason_ru: m ? `HTTP ${m[1]} при синке в integrator` : "HTTP-ошибка при синке в integrator",
    };
  }
  return { reason_code: REASON_UNKNOWN, reason_ru: "Сбой синка в integrator (см. усечённый текст)" };
}
