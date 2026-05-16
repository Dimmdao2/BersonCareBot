/**
 * Human-readable Russian copy for messenger phone-bind audit rows and operator relay (Telegram/Max).
 */

export type MessengerBindAuditCandidateSummary = {
  platformUserId: string;
  displayName: string | null;
  phoneNormalized: string | null;
  email: string | null;
};

export type MessengerBindAuditInitiatorSummary = {
  channelLabel: string;
  channelCode: string;
  externalId: string;
  platformUserId: string | null;
  /** Telegram: @username/ФИО из telegram_users; MAX: телефон канонического platform_users по привязке. */
  messengerDisplayHint?: string | null;
};

/** Localized messenger channel_code for audit UI / alerts. */
export function messengerChannelLabelRu(channelCode: string): string {
  const c = channelCode.trim().toLowerCase();
  if (c === "telegram") return "Телеграм";
  if (c === "max") return "MAX";
  if (c === "vk") return "ВКонтакте";
  return channelCode;
}

/**
 * Maps stable machine codes from phone bind / merge classification to operator-facing Russian text.
 */
export function messengerPhoneBindReasonHumanRu(reason: string): string {
  const map: Record<string, string> = {
    no_channel_binding: "Нет привязки канала к платформенному пользователю",
    phone_owned_by_other_user: "Телефон уже принадлежит другому пользователю",
    integrator_id_mismatch: "Несовпадение integrator user id с каноническим профилем",
    channel_already_bound_to_other_user: "Конфликт привязки канала (уникальный ключ)",
    merge_blocked_booking_overlap: "Merge заблокирован: пересечение записей на приём",
    merge_blocked_distinct_real_users: "Merge заблокирован: признаки разных реальных пациентов",
    merge_blocked_lfk_conflict: "Merge заблокирован: конфликт назначений ЛФК",
    merge_blocked_ambiguous_candidates:
      "Merge заблокирован: неоднозначные или уже смерженные кандидаты (промах выбора строки)",
    legacy_contacts_conflict: "Конфликт legacy-контактов integrator",
    merge_blocked_integrator_conflict: "Разные integrator user id без допустимого merge",
    db_transient_failure: "Временный сбой БД или инфраструктуры",
  };
  const hit = map[reason];
  return typeof hit === "string" && hit.length > 0 ? hit : `[${reason}]`;
}

function trimDisplayName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function candidateOneLine(c: MessengerBindAuditCandidateSummary): string {
  const name = trimDisplayName(c.displayName) ?? c.platformUserId;
  const bits: string[] = [name];
  if (c.phoneNormalized?.trim()) bits.push(`тел. ${c.phoneNormalized.trim()}`);
  if (c.email?.trim()) bits.push(`email ${c.email.trim()}`);
  return bits.join(", ");
}

function doctorClientUrl(appBaseUrl: string, platformUserId: string): string {
  const base = appBaseUrl.trim().replace(/\/$/, "");
  return `${base}/app/doctor/clients/${encodeURIComponent(platformUserId)}`;
}

export type BuildMessengerBindBlockedRelayLinesInput = {
  /** e.g. integrator path vs signed HTTP bind */
  variantLabel: string;
  machineReason: string;
  reasonHumanRu: string;
  appBaseUrl: string;
  candidates: MessengerBindAuditCandidateSummary[];
  initiator?: MessengerBindAuditInitiatorSummary | null;
  channelCode?: string;
  externalId?: string;
  phoneSuffix?: string;
  correlationId?: string;
  source?: string;
};

/**
 * Multi-line plaintext for Telegram/Max admin relay (Russian).
 */
export function buildMessengerBindBlockedRelayLines(input: BuildMessengerBindBlockedRelayLinesInput): string[] {
  const lines: string[] = [
    `Ошибка автопривязки телефона (${input.variantLabel})`,
    `Причина: ${input.reasonHumanRu}`,
    `Код: ${input.machineReason}`,
  ];

  if (input.source?.trim()) {
    lines.push(`Источник записи аудита: ${input.source.trim()}`);
  }

  if (input.channelCode?.trim() && input.externalId != null && String(input.externalId).trim() !== "") {
    const label = messengerChannelLabelRu(input.channelCode.trim());
    lines.push(`Канал инициатора: ${label}, external_id=${String(input.externalId).trim()}`);
  }

  const hintTrimmed = input.initiator?.messengerDisplayHint?.trim();
  if (hintTrimmed) {
    const ch =
      input.channelCode?.trim().toLowerCase() ??
      input.initiator?.channelCode?.trim().toLowerCase() ??
      "";
    const hintLabel = ch === "max" ? "Телефон в профиле (MAX)" : "Подпись в мессенджере";
    lines.push(`${hintLabel}: ${hintTrimmed}`);
  }

  if (input.phoneSuffix?.trim()) {
    lines.push(`Суффикс номера в событии: …${input.phoneSuffix.trim()}`);
  }

  if (input.correlationId?.trim()) {
    lines.push(`Correlation: ${input.correlationId.trim()}`);
  }

  if (input.initiator?.platformUserId) {
    lines.push(
      `Пользователь канала в приложении: ${input.initiator.platformUserId} (${input.initiator.channelLabel})`,
    );
    lines.push(`Карточка: ${doctorClientUrl(input.appBaseUrl, input.initiator.platformUserId)}`);
  }

  const sorted = [...input.candidates].sort((a, b) => a.platformUserId.localeCompare(b.platformUserId));
  sorted.forEach((c, i) => {
    lines.push(`Кандидат ${i + 1}: ${candidateOneLine(c)}`);
    lines.push(`  UUID: ${c.platformUserId}`);
    lines.push(`  Открыть: ${doctorClientUrl(input.appBaseUrl, c.platformUserId)}`);
  });

  if (sorted.length === 2) {
    const [a, b] = sorted;
    const base = input.appBaseUrl.trim().replace(/\/$/, "");
    const previewUrl = `${base}/api/doctor/clients/merge-preview?targetId=${encodeURIComponent(a.platformUserId)}&duplicateId=${encodeURIComponent(b.platformUserId)}`;
    lines.push(
      `Ручной merge (начните с карточки): ${doctorClientUrl(input.appBaseUrl, a.platformUserId)} ↔ ${doctorClientUrl(input.appBaseUrl, b.platformUserId)}`,
    );
    lines.push(`Предпросмотр merge (GET, нужна сессия админа): ${previewUrl}`);
  }

  return lines;
}
