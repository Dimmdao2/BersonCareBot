/**
 * GET /api/admin/account-merge/preview?targetId=&duplicateId= — разбор пары перед слиянием, без записи.
 *
 * Дверь восстановлена 13.09 по решению владельца «мерж учёток — из журнала конфликтов» (#1110).
 * Предыдущая дверь `api/doctor/clients/merge-preview` отвечала `404 not_available` с 20.07
 * (`9d8fe1157`, «disable unsafe global and unscoped paths»): вместе с ней выключили глобальный поиск по
 * людям, и тогда это было правильно — вся поверхность была «найди кого угодно и слей».
 *
 * Здесь восстановлено ровно обратное по форме: дверь принимает ДВА конкретных идентификатора и ничего
 * не ищет. Пара приходит из строки журнала конфликтов, то есть повод существует до открытия карточки —
 * см. раздел «Норма» в `docs/_TODO/ACCOUNT_MERGE_TO_PLATFORM_CONSOLE_2026-09-13.md`. Глобальный поиск
 * (`merge-user-search`) не восстанавливается: прежнее решение «no global patient search» и решение
 * владельца 13.09 совпадают.
 *
 * Наружу отдаются ЧИСЛА по медицинским сущностям (`dependentCounts`) и коды блокировок — содержания
 * записей, дневников и программ здесь нет и быть не должно (канон Р-АДМИН: админ платформы читает
 * учётные данные, медицинские — никогда).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/app-layer/db/client';
import { buildMergePreview } from '@/app-layer/merge/platformUserMergePreview';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const uuid = z.string().uuid();

type PreviewModel = Extract<Awaited<ReturnType<typeof buildMergePreview>>, { ok: true }>;

function profile(u: PreviewModel['target']) {
  return {
    id: u.id,
    phoneNormalized: u.phone_normalized,
    displayName: u.display_name,
    firstName: u.first_name,
    lastName: u.last_name,
    // Отчество показывается, но не выбирается: оператору нужно видеть имя карточки целиком, чтобы
    // понять, из какой брать ФИО, — а арбитрировать отчество движок слияния не умеет.
    patronymic: u.patronymic,
    email: u.email,
    createdAt: u.created_at.toISOString(),
  };
}

function bindings(rows: PreviewModel['targetBindings']) {
  return rows.map((b) => ({
    channelCode: b.channel_code,
    externalId: b.external_id,
    createdAt: b.created_at.toISOString(),
  }));
}

/**
 * Поля, по которым оператор действительно может выбрать победителя.
 *
 * `ManualMergeResolution.fields` не содержит отчества — движок слияния его не арбитрирует. Если
 * отдать расхождение по отчеству как выбор, экран нарисует переключатель, который некуда записать.
 * Разбор с 13.09 такого расхождения и не строит (`scalarConflict`), а этот список остаётся вторым
 * рубежом: даже если разбор снова начнёт его отдавать, до экрана оно не дойдёт. Фактическое значение
 * отчества после слияния видно в `autoMergeScalars`, который отдаётся целиком.
 * Найдено проверкой на TEST 13.09 — `docs/_TODO/runs/KOSTYAKOV_MERGE_PROBE_2026-09-13.md`.
 */
const ARBITRABLE_SCALAR_FIELDS = new Set([
  'phone_normalized',
  'display_name',
  'first_name',
  'last_name',
  'email',
]);

function serializePreview(model: PreviewModel) {
  return {
    ok: true as const,
    targetId: model.targetId,
    duplicateId: model.duplicateId,
    target: profile(model.target),
    duplicate: profile(model.duplicate),
    targetBindings: bindings(model.targetBindings),
    duplicateBindings: bindings(model.duplicateBindings),
    dependentCounts: model.dependentCounts,
    hardBlockers: model.hardBlockers,
    scalarConflicts: model.scalarConflicts.filter((c) => ARBITRABLE_SCALAR_FIELDS.has(c.field)),
    channelConflicts: model.channelConflicts,
    oauthConflicts: model.oauthConflicts,
    autoMergeScalars: model.autoMergeScalars,
    recommendation: model.recommendation,
    mergeAllowed: model.mergeAllowed,
    v1MergeEngineCallable: model.v1MergeEngineCallable,
  };
}

export async function GET(request: Request) {
  const adminGate = await requirePlatformOperationsApiContext();
  if (!adminGate.ok) return adminGate.response;

  const url = new URL(request.url);
  const parsed = z.object({ targetId: uuid, duplicateId: uuid }).safeParse({
    targetId: url.searchParams.get('targetId') ?? '',
    duplicateId: url.searchParams.get('duplicateId') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const model = await buildMergePreview(getPool(), parsed.data.targetId, parsed.data.duplicateId);
  if (!model.ok) {
    const status = model.error === 'missing_user' ? 404 : 400;
    return NextResponse.json({ ok: false, error: model.error, message: model.message }, { status });
  }

  return NextResponse.json(serializePreview(model));
}
