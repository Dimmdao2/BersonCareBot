/**
 * Pure helpers for admin manual merge UI — aligned with merge-preview JSON and ManualMergeResolution.
 */
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";

export type MergePreviewApiProfile = {
  id: string;
  phoneNormalized: string | null;
  integratorUserId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string;
};

export type MergePreviewApiScalarConflict = {
  field: "phone_normalized" | "display_name" | "first_name" | "last_name" | "email";
  targetValue: string | null;
  duplicateValue: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewApiChannelConflict = {
  channelCode: string;
  targetExternalId: string | null;
  duplicateExternalId: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewApiOauthConflict = {
  provider: string;
  targetProviderUserId: string | null;
  duplicateProviderUserId: string | null;
  recommendedWinner: "target" | "duplicate";
  reason: string;
};

export type MergePreviewApiAutoScalar = {
  field: "phone_normalized" | "display_name" | "first_name" | "last_name" | "email";
  effectiveValue: string | null;
  note: string;
};

export type MergePreviewDependentCounts = {
  patientBookings: number;
  reminderRules: number;
  supportConversations: number;
  symptomTrackings: number;
  lfkComplexes: number;
  mediaFilesUploadedBy: number;
  onlineIntakeRequests: number;
};

export type MergePreviewApiBinding = {
  channelCode: string;
  externalId: string;
  createdAt: string;
};

export type MergePreviewApiOk = {
  ok: true;
  targetId: string;
  duplicateId: string;
  target: MergePreviewApiProfile;
  duplicate: MergePreviewApiProfile;
  targetBindings: MergePreviewApiBinding[];
  duplicateBindings: MergePreviewApiBinding[];
  dependentCounts: { target: MergePreviewDependentCounts; duplicate: MergePreviewDependentCounts };
  scalarConflicts: MergePreviewApiScalarConflict[];
  channelConflicts: MergePreviewApiChannelConflict[];
  oauthConflicts: MergePreviewApiOauthConflict[];
  autoMergeScalars: MergePreviewApiAutoScalar[];
  recommendation: {
    suggestedTargetId: string;
    suggestedDuplicateId: string;
    basis: string;
    defaultWinnerBias: string;
  };
  mergeAllowed: boolean;
  v1MergeEngineCallable: boolean;
  hardBlockers: { code: string; message: string; details?: Record<string, unknown> }[];
};

type ScalarKey = keyof ManualMergeResolution["fields"];

function norm(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function scalarFromProfile(p: MergePreviewApiProfile, field: ScalarKey): string | null {
  switch (field) {
    case "phone_normalized":
      return norm(p.phoneNormalized);
    case "display_name":
      return norm(p.displayName);
    case "first_name":
      return norm(p.firstName);
    case "last_name":
      return norm(p.lastName);
    case "email":
      return norm(p.email);
    default:
      return null;
  }
}

/**
 * If preview rows are not oriented as the merge heuristic recommends, refetch with returned ids.
 */
export function getAlignedMergePreviewRequest(
  anchorUserId: string,
  otherUserId: string,
  preview: MergePreviewApiOk,
): { targetId: string; duplicateId: string; shouldRefetch: boolean } {
  const { suggestedTargetId, suggestedDuplicateId } = preview.recommendation;
  const wrongOrder =
    preview.targetId !== suggestedTargetId || preview.duplicateId !== suggestedDuplicateId;
  const anchorSet = new Set([anchorUserId, otherUserId]);
  const idsMatchPair =
    anchorSet.has(preview.targetId) &&
    anchorSet.has(preview.duplicateId) &&
    preview.targetId !== preview.duplicateId;
  if (wrongOrder || !idsMatchPair) {
    return {
      targetId: suggestedTargetId,
      duplicateId: suggestedDuplicateId,
      shouldRefetch: true,
    };
  }
  return { targetId: preview.targetId, duplicateId: preview.duplicateId, shouldRefetch: false };
}

function defaultScalarWinner(preview: MergePreviewApiOk, field: ScalarKey): "target" | "duplicate" {
  const c = preview.scalarConflicts.find((x) => x.field === field);
  if (c) return c.recommendedWinner;
  const auto = preview.autoMergeScalars.find((a) => a.field === field);
  const tVal = scalarFromProfile(preview.target, field);
  const dVal = scalarFromProfile(preview.duplicate, field);
  const eff = norm(auto?.effectiveValue ?? null);
  if (eff != null && eff === dVal && eff !== tVal) return "duplicate";
  return "target";
}

function defaultChannelWinner(
  preview: MergePreviewApiOk,
  code: "telegram" | "max" | "vk",
): ManualMergeResolution["bindings"]["telegram"] {
  const c = preview.channelConflicts.find((x) => x.channelCode === code);
  if (c) return c.recommendedWinner;
  return "both";
}

/** Build operator-default resolution from preview (recommended winners, auto `both` for non-conflicting channels). */
export function buildDefaultManualMergeResolution(preview: MergePreviewApiOk): ManualMergeResolution {
  const oauth: Record<string, "target" | "duplicate"> = {};
  for (const o of preview.oauthConflicts) {
    oauth[o.provider] = o.recommendedWinner;
  }

  return {
    targetId: preview.targetId,
    duplicateId: preview.duplicateId,
    fields: {
      phone_normalized: defaultScalarWinner(preview, "phone_normalized"),
      display_name: defaultScalarWinner(preview, "display_name"),
      first_name: defaultScalarWinner(preview, "first_name"),
      last_name: defaultScalarWinner(preview, "last_name"),
      email: defaultScalarWinner(preview, "email"),
    },
    bindings: {
      telegram: defaultChannelWinner(preview, "telegram"),
      max: defaultChannelWinner(preview, "max"),
      vk: defaultChannelWinner(preview, "vk"),
    },
    oauth,
    channelPreferences: "keep_newer",
  };
}

/** Every oauth conflict must have a winner in `resolution.oauth`. */
export function isOauthResolutionComplete(preview: MergePreviewApiOk, resolution: ManualMergeResolution): boolean {
  for (const o of preview.oauthConflicts) {
    if (!resolution.oauth[o.provider]) return false;
  }
  return true;
}

/** Merge button: no hard blockers; resolution complete. */
export function canSubmitManualMerge(
  preview: MergePreviewApiOk,
  resolution: ManualMergeResolution,
): boolean {
  if (!preview.mergeAllowed || preview.hardBlockers.length > 0) return false;
  if (resolution.targetId !== preview.targetId || resolution.duplicateId !== preview.duplicateId) return false;
  for (const conflict of preview.channelConflicts) {
    if (
      (conflict.channelCode === "telegram" ||
        conflict.channelCode === "max" ||
        conflict.channelCode === "vk") &&
      resolution.bindings[conflict.channelCode] === "both"
    ) {
      return false;
    }
  }
  return isOauthResolutionComplete(preview, resolution);
}

const BLOCKER_RU: Record<
  string,
  { title: string; detail: string }
> = {
  target_is_alias: {
    title: "Целевая запись — уже алиас merge",
    detail:
      "У выбранной «канонической» стороны уже заполнен merged_into_id. Сначала разрешите цепочку merge или выберите другую пару.",
  },
  duplicate_is_alias: {
    title: "Вторая запись — уже алиас merge",
    detail:
      "У дубликата уже заполнен merged_into_id. Объединять можно только две канонические строки (merged_into_id IS NULL).",
  },
  different_non_null_integrator_user_id: {
    title: "Разные integrator user id (оба заданы)",
    detail:
      "Оба пользователя привязаны к разным записям в интеграторе. Объединение заблокировано (риск «фантомного» пользователя и рассинхрон проекций). Снятие ограничения — только во v2 (canonical merge в integrator).",
  },
  active_bookings_time_overlap: {
    title: "Пересечение активных записей по времени",
    detail:
      "У пары есть пересекающиеся по времени активные patient_bookings с тем же правилом cooperator snapshot, что и в merge guard. Разрулите записи вручную или снимите конфликт расписания.",
  },
  active_lfk_template_conflict: {
    title: "Конфликт активных назначений ЛФК",
    detail: "На обоих пользователях есть активные patient_lfk_assignments с одним и тем же template_id.",
  },
  shared_phone_both_have_meaningful_data: {
    title: "Один телефон, у обоих есть значимые данные",
    detail:
      "Одинаковый нормализованный телефон и на обоих счётчики meaningful data > 0 (как в assertSharedPhoneGuard). Merge заблокирован.",
  },
};

export function hardBlockerUi(code: string): { title: string; detail: string } {
  return BLOCKER_RU[code] ?? {
    title: code,
    detail: "Операция merge недоступна для этой пары до снятия блокировки.",
  };
}

/** Case-insensitive UUID equality (hex), trims whitespace. */
export function uuidEqualsNormalized(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
