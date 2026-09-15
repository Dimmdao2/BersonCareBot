/**
 * Чистые помощники экрана объединения учётных записей в консоли платформы: разбор ответа
 * `GET /api/admin/account-merge/preview` и сборка `ManualMergeResolution` для
 * `POST /api/admin/account-merge/apply`.
 *
 * Переехали 13.09 из `app/app/doctor/clients/adminMergeAccountsLogic.ts` (#1110). Здесь нет ни поиска
 * людей, ни терминологии кабинета врача — только разбор ОДНОЙ пары, которую назвал журнал конфликтов.
 */
import type { ManualMergeResolution } from '@/infra/repos/manualMergeResolution';

export type MergePreviewApiProfile = {
  id: string;
  phoneNormalized: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  email: string | null;
  createdAt: string;
};

export type MergePreviewApiScalarConflict = {
  field: 'phone_normalized' | 'display_name' | 'first_name' | 'last_name' | 'email';
  targetValue: string | null;
  duplicateValue: string | null;
  recommendedWinner: 'target' | 'duplicate';
  reason: string;
};

/**
 * Фамилия, имя и отображаемое имя — одно решение оператора, а не три.
 *
 * Правило владельца 13.09 выбирает КАРТОЧКУ, из которой берётся ФИО целиком; разрешить собрать
 * фамилию с одной стороны, а имя с другой — значит получить человека, которого не существует.
 */
export const FIO_SCALAR_FIELDS = ['display_name', 'first_name', 'last_name'] as const;

export type FioScalarField = (typeof FIO_SCALAR_FIELDS)[number];

export function isFioScalarField(field: string): field is FioScalarField {
  return (FIO_SCALAR_FIELDS as readonly string[]).includes(field);
}

/**
 * Почему ФИО предложено именно с этой стороны — человеческими словами.
 *
 * Порядок проверок задан владельцем 13.09 и реализован в `pickFioSourceSide`
 * (`infra/platformUserMergePreview.ts`). Незнакомую причину не печатаем как есть: оператор не должен
 * читать машинные слова — вместо неё общая фраза.
 */
const FIO_REASON_RU: Record<string, string> = {
  cyrillic_fio_preferred: 'Имя записано по-русски, а во второй карточке — нет.',
  treatment_program_card_preferred: 'В этой карточке назначена программа лечения.',
  fuller_fio_preferred: 'Здесь имя записано полнее.',
  more_contacts_preferred: 'В этой карточке больше контактов.',
  fresher_login_preferred: 'С этой карточки входили позже.',
  older_created_at_preferred:
    'Различить карточки по имени, программе, контактам и входам не вышло — предложена та, что заведена раньше.',
};

export function fioSuggestionReasonText(reason: string): string {
  return FIO_REASON_RU[reason] ?? 'Предложение выбрано по общему правилу; проверьте и решите сами.';
}

/** Имя карточки целиком: фамилия, имя, отчество — а если их нет, то отображаемое имя. */
export function fioSummary(p: MergePreviewApiProfile): string {
  const triple = [p.lastName, p.firstName, p.patronymic]
    .map((v) => norm(v))
    .filter((v): v is string => v != null)
    .join(' ');
  return triple !== '' ? triple : (norm(p.displayName) ?? '');
}

export type MergePreviewApiChannelConflict = {
  channelCode: string;
  targetExternalId: string | null;
  duplicateExternalId: string | null;
  recommendedWinner: 'target' | 'duplicate';
  reason: string;
};

export type MergePreviewApiOauthConflict = {
  provider: string;
  targetProviderUserId: string | null;
  duplicateProviderUserId: string | null;
  recommendedWinner: 'target' | 'duplicate';
  reason: string;
};

/**
 * Здесь, в отличие от `scalarConflicts`, есть и отчество: выбирать по нему нечего (движок слияния
 * его не арбитрирует), но показать, каким оно станет, нужно — иначе расхождение просто исчезнет с
 * глаз. Дверь предпросмотра отдаёт этот список целиком, а список выбора — без отчества.
 */
export type MergePreviewApiAutoScalar = {
  field: 'phone_normalized' | 'display_name' | 'first_name' | 'last_name' | 'patronymic' | 'email';
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
  materialRatings: number;
  patientContentRatingFeedback: number;
  patientPracticeCompletions: number;
  treatmentProgramInstances: number;
  programActionLog: number;
  beAppointments: number;
  platformUserContacts: number;
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

type ScalarKey = keyof ManualMergeResolution['fields'];

function norm(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function scalarFromProfile(p: MergePreviewApiProfile, field: ScalarKey): string | null {
  switch (field) {
    case 'phone_normalized':
      return norm(p.phoneNormalized);
    case 'display_name':
      return norm(p.displayName);
    case 'first_name':
      return norm(p.firstName);
    case 'last_name':
      return norm(p.lastName);
    case 'email':
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

/**
 * If `alignToRecommendation` is false, keeps the preview orientation from the admin’s chosen canonical side (no refetch to match heuristic).
 */
export function resolveMergePreviewAlignment(
  alignToRecommendation: boolean,
  anchorUserId: string,
  secondUserId: string,
  preview: MergePreviewApiOk,
): { targetId: string; duplicateId: string; shouldRefetch: boolean } {
  if (!alignToRecommendation) {
    return { targetId: preview.targetId, duplicateId: preview.duplicateId, shouldRefetch: false };
  }
  return getAlignedMergePreviewRequest(anchorUserId, secondUserId, preview);
}

function defaultScalarWinner(preview: MergePreviewApiOk, field: ScalarKey): 'target' | 'duplicate' {
  const c = preview.scalarConflicts.find((x) => x.field === field);
  if (c) return c.recommendedWinner;
  const auto = preview.autoMergeScalars.find((a) => a.field === field);
  const tVal = scalarFromProfile(preview.target, field);
  const dVal = scalarFromProfile(preview.duplicate, field);
  const eff = norm(auto?.effectiveValue ?? null);
  if (eff != null && eff === dVal && eff !== tVal) return 'duplicate';
  return 'target';
}

function defaultChannelWinner(
  preview: MergePreviewApiOk,
  code: 'telegram' | 'max' | 'vk',
): ManualMergeResolution['bindings']['telegram'] {
  const c = preview.channelConflicts.find((x) => x.channelCode === code);
  if (c) return c.recommendedWinner;
  return 'both';
}

/** Build operator-default resolution from preview (recommended winners, auto `both` for non-conflicting channels). */
export function buildDefaultManualMergeResolution(
  preview: MergePreviewApiOk,
): ManualMergeResolution {
  const oauth: Record<string, 'target' | 'duplicate'> = {};
  for (const o of preview.oauthConflicts) {
    oauth[o.provider] = o.recommendedWinner;
  }

  // ФИО — одно решение на три поля. Если разошлось хоть одно из них, все три встают на сторону,
  // которую предложило правило владельца; иначе каждое поле остаётся при своём автозначении.
  const fioConflict = preview.scalarConflicts.find((c) => isFioScalarField(c.field));

  return {
    targetId: preview.targetId,
    duplicateId: preview.duplicateId,
    fields: {
      phone_normalized: defaultScalarWinner(preview, 'phone_normalized'),
      display_name: fioConflict?.recommendedWinner ?? defaultScalarWinner(preview, 'display_name'),
      first_name: fioConflict?.recommendedWinner ?? defaultScalarWinner(preview, 'first_name'),
      last_name: fioConflict?.recommendedWinner ?? defaultScalarWinner(preview, 'last_name'),
      email: defaultScalarWinner(preview, 'email'),
    },
    bindings: {
      telegram: defaultChannelWinner(preview, 'telegram'),
      max: defaultChannelWinner(preview, 'max'),
      vk: defaultChannelWinner(preview, 'vk'),
    },
    oauth,
    channelPreferences: 'keep_newer',
  };
}

/** Every oauth conflict must have a winner in `resolution.oauth`. */
export function isOauthResolutionComplete(
  preview: MergePreviewApiOk,
  resolution: ManualMergeResolution,
): boolean {
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
  if (resolution.targetId !== preview.targetId || resolution.duplicateId !== preview.duplicateId)
    return false;
  for (const conflict of preview.channelConflicts) {
    if (
      (conflict.channelCode === 'telegram' ||
        conflict.channelCode === 'max' ||
        conflict.channelCode === 'vk') &&
      resolution.bindings[conflict.channelCode] === 'both'
    ) {
      return false;
    }
  }
  return isOauthResolutionComplete(preview, resolution);
}

/**
 * Причины, по которым пару нельзя объединить, человеческими словами.
 *
 * Переписано 13.09 при переезде в консоль платформы: прежние подписи печатали имена таблиц и функций
 * (`merged_into_id`). Человек, который это читает, устройства базы не знает; ему нужно понять,
 * что мешает и что с этим делать. Медицинские данные и записи на приём ручной путь не блокируют.
 */
const BLOCKER_RU: Record<string, { title: string; detail: string }> = {
  target_is_alias: {
    title: 'Основная карточка уже объединена с другой',
    detail:
      'Её данные уже перенесены в третью карточку. Сначала разберитесь с той цепочкой или выберите другую пару.',
  },
  duplicate_is_alias: {
    title: 'Вторая карточка уже объединена с другой',
    detail:
      'Её данные уже перенесены в третью карточку. Объединять можно только две самостоятельные карточки.',
  },
};

export function hardBlockerUi(code: string): { title: string; detail: string } {
  return (
    BLOCKER_RU[code] ?? {
      title: 'Объединение недоступно',
      detail: 'Для этой пары есть препятствие, которое нужно снять до объединения.',
    }
  );
}

/** Case-insensitive UUID equality (hex), trims whitespace. */
export function uuidEqualsNormalized(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Первые 4 hex-цифры UUID (дефисы игнорируются), нижний регистр. */
export function duplicateUuidFirstFourHex(duplicateId: string): string {
  return duplicateId
    .replace(/[^0-9a-f]/gi, '')
    .toLowerCase()
    .slice(0, 4);
}

/**
 * Подтверждение merge: пользователь вводит ровно те же 4 hex-символа в начале UUID дубликата
 * (без дефисов, регистр не важен).
 */
export function mergeDuplicatePrefixConfirmed(input: string, duplicateId: string): boolean {
  const want = duplicateUuidFirstFourHex(duplicateId);
  if (want.length < 4) return false;
  const got = input.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return got.length === 4 && got === want;
}
