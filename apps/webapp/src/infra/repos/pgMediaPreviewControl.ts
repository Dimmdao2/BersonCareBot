import { and, asc, eq, isNotNull, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { logger } from '@/infra/logging/logger';
import { mediaFiles } from '../../../db/schema/schema';
import { parseStorageTarget, s3PreviewKey, s3StandardImageKey } from '@/infra/s3/client';
import type { StorageTarget } from '@/shared/types/storageTarget';
import {
  MAX_PREVIEW_ATTEMPTS,
  backoffMinutesAfterFailure,
  isPermanentPreviewError,
  missingPreviewTool,
  PREVIEW_TOOL_HEIC_DECODER,
  planMediaPreview,
  type MediaPreviewPlan,
  type PreviewTool,
} from '@/modules/media/mediaPreviewPlan';

/**
 * Очередь превью со стороны БАЗЫ. Байты здесь не разбираются: ни sharp, ни ImageMagick, ни ffmpeg
 * этот файл не зовёт и звать не может — их разбирает `apps/media-worker` (М7 плана
 * `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).
 *
 * Устройство ровно то же, что у очереди пересборки видео (`pgMediaWorkerControl.ts`): воркер
 * занимает работу, делает её у себя и отчитывается об исходе. Второго механизма не заводим.
 *
 * ЗАМОК — это сам статус строки. Занятая строка переходит в `preview_status = 'processing'`, и её
 * `preview_next_attempt_at` становится сроком аренды: пока он не истёк, строку не выдадут второму
 * воркеру, а после истечения она возвращается в оборот сама, без отдельного «reclaim»-задания.
 * Отдельной колонки `locked_by` намеренно НЕТ: исход наряда детерминирован (ключи выводятся из
 * `media_id`, повторная обработка даёт байт в байт тот же объект), поэтому от гонки защищает
 * условие `preview_status = 'processing'` в каждом отчёте, а лишняя колонка стоила бы миграции и
 * четырёх мест в декларации прав ради факта, который ничего не решает.
 */

/** Сколько строк подряд разрешено «пропустить» за один claim, прежде чем ответить «пусто». */
const MAX_SKIPS_PER_CLAIM = 25;

export type MediaPreviewOrder = {
  mediaId: string;
  /** Сколько неудачных попыток уже пережила строка; воркер кладёт это в лог, решение — за вебаппом. */
  attempts: number;
  storageTarget: StorageTarget;
  plan: MediaPreviewPlan;
  /** Ключи вывода считает ВЕБАПП: воркер их не выдумывает и не выводит из чужих данных. */
  standardKey: string;
  smKey: string;
  mdKey: string;
};

export type MediaPreviewClaimResult =
  | { kind: 'idle' }
  | { kind: 'claimed'; order: MediaPreviewOrder };

type PreviewRow = {
  id: string;
  s3_key: string | null;
  mime_type: string;
  size_bytes: unknown;
  preview_attempts: number | null;
  usage_purpose: string | null;
  hosted_video_source_url: string | null;
  storage_target: unknown;
};

type WebappTxSql = Parameters<typeof runWebappSql>[0];

/**
 * Строка, которую можно взять в работу: ждущая своей очереди, занятая воркером с истёкшей арендой
 * (упал, был убит, потерял связь со швом) — либо картинка, у которой нашего вывода нет вовсе.
 *
 * Третья ветка — это и есть бэкфилл рендишнов, которого требует М7
 * (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): у всего, загруженного ДО М7, `preview_status`
 * давно `ready`, а `standard_rendition_at` пуст — и по правилу «нет нашего вывода, наружу ничего не
 * идёт» такая картинка показывает вечную заглушку «готовится». Отдельного задания и своей очереди
 * для этого не заводим: очередь уже есть, её замок и повторные попытки уже разобраны, а признаком
 * работы служит сам недостающий факт. Отсюда идемпотентность: как только воркер проставит
 * `standard_rendition_at`, строка перестаёт подходить под условие и больше не выбирается.
 *
 * Только картинки: у документа и аудио нашего вывода не бывает (`encoderOutputFor`), а видео
 * пересобирает своя лестница — им пустой `standard_rendition_at` нормален навсегда.
 */
function claimableRowFilter() {
  return and(
    or(
      and(
        eq(mediaFiles.previewStatus, 'pending'),
        or(
          isNull(mediaFiles.previewNextAttemptAt),
          lte(mediaFiles.previewNextAttemptAt, new Date().toISOString()),
        ),
      ),
      and(
        eq(mediaFiles.previewStatus, 'processing'),
        lte(mediaFiles.previewNextAttemptAt, new Date().toISOString()),
      ),
      and(
        eq(mediaFiles.previewStatus, 'ready'),
        isNull(mediaFiles.standardRenditionAt),
        sql`lower(${mediaFiles.mimeType}) like 'image/%'`,
      ),
    ),
    or(
      and(isNotNull(mediaFiles.s3Key), sql`length(trim(${mediaFiles.s3Key})) > 0`),
      eq(mediaFiles.usagePurpose, 'hosted_video_preview'),
    ),
    or(
      isNull(mediaFiles.status),
      notInArray(mediaFiles.status, ['pending', 'deleting', 'pending_delete']),
    ),
  );
}

async function markSkipped(db: WebappTxSql, mediaId: string): Promise<void> {
  await runWebappSql(
    db,
    sql`UPDATE media_files SET preview_status = 'skipped', preview_next_attempt_at = NULL
        WHERE id = ${mediaId}::uuid`,
  );
}

/**
 * «Разобрать нечем» — состояние НАС, а не файла (владелец 14.09.2026). Попытка не планируется:
 * `preview_next_attempt_at` пуст, в очередь строка не возвращается и счётчик попыток не жжётся.
 * Выход отсюда один — `releaseStuckMediaPreviews` — воркер на старте сообщает, что инструмент появился.
 */
async function markBlocked(db: WebappTxSql, mediaId: string): Promise<void> {
  await runWebappSql(
    db,
    sql`UPDATE media_files SET preview_status = 'blocked', preview_next_attempt_at = NULL
        WHERE id = ${mediaId}::uuid`,
  );
}

/**
 * Одна попытка занять работу. Строку, которой превью не положено вовсе, закрываем прямо здесь:
 * это решение по mime и размеру, чужих байт оно не касается и воркеру не нужно.
 */
async function claimOnce(leaseMinutes: number): Promise<MediaPreviewClaimResult | 'skipped'> {
  const pool = getPool();
  return withPoolTransaction<MediaPreviewClaimResult | 'skipped'>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    const rows = (await db
      .select({
        id: mediaFiles.id,
        s3_key: mediaFiles.s3Key,
        mime_type: mediaFiles.mimeType,
        size_bytes: mediaFiles.sizeBytes,
        preview_attempts: mediaFiles.previewAttempts,
        usage_purpose: mediaFiles.usagePurpose,
        hosted_video_source_url: mediaFiles.hostedVideoSourceUrl,
        storage_target: mediaFiles.storageTarget,
      })
      .from(mediaFiles)
      .where(claimableRowFilter())
      .orderBy(asc(mediaFiles.createdAt))
      .limit(1)
      .for('update', { skipLocked: true })) as unknown as PreviewRow[];

    if (rows.length === 0) return { kind: 'idle' };
    const row = rows[0]!;

    const plan = planMediaPreview({
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes) || 0,
      s3Key: row.s3_key,
      usagePurpose: row.usage_purpose,
      hostedVideoSourceUrl: row.hosted_video_source_url,
    });

    if (plan.kind === 'skip') {
      await markSkipped(db, row.id);
      logger.info(
        { mediaId: row.id, reason: plan.reason },
        '[mediaPreviewControl] preview not applicable, skipped',
      );
      return 'skipped';
    }

    /* Хранилище берётся из строки и уезжает в наряд: воркер пишет и читает только в нём. */
    const storageTarget = parseStorageTarget(row.storage_target);
    await runWebappSql(
      db,
      sql`UPDATE media_files SET
             preview_status = 'processing',
             preview_next_attempt_at = now() + (${leaseMinutes}::numeric * interval '1 minute')
           WHERE id = ${row.id}::uuid`,
    );
    return {
      kind: 'claimed',
      order: {
        mediaId: row.id,
        attempts: row.preview_attempts ?? 0,
        storageTarget,
        plan,
        standardKey: s3StandardImageKey(row.id),
        smKey: s3PreviewKey(row.id, 'sm'),
        mdKey: s3PreviewKey(row.id, 'md'),
      },
    };
  });
}

export async function claimMediaPreviewOrder(leaseMinutes: number): Promise<MediaPreviewClaimResult> {
  for (let i = 0; i < MAX_SKIPS_PER_CLAIM; i++) {
    const result = await claimOnce(leaseMinutes);
    if (result !== 'skipped') return result;
  }
  return { kind: 'idle' };
}

export type MediaPreviewImageResult = {
  mediaId: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
};

/**
 * Ключи вывода вебапп СЧИТАЕТ САМ, а не берёт из отчёта: они детерминированы от `media_id` — те же
 * самые, что уехали в наряд. Отдай мы воркеру право назвать ключ, у процесса, разбирающего
 * враждебные байты, появился бы примитив «перенаправь строку на произвольный объект».
 *
 * М7 (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, SECURITY_CANON «Стандартный размер изображений»)
 * реверсировал решение 19.08.2026: рендишн ложится РЯДОМ с загрузкой, а не ВМЕСТО неё. Поэтому этот
 * UPDATE НЕ трогает `s3_key`, `mime_type` и `size_bytes` строки, а шага «удалить вытесненный
 * исходник» больше нет вовсе — оригинал остаётся в сыром бакете навсегда. Защита перенесена с
 * «оригинала не существует» на «оригинал существует, но недостижим и не исполняется»: из сырого
 * бакета выдача не умеет читать по построению. Удаление здесь ломало бы ещё и М6 — «исходник
 * скачивает только загрузивший его специалист» (`modules/media/rawOriginalDownloadRule.ts`) — и
 * счётчик объёма, который намеренно остаётся на размере ИСХОДНИКА, а не рендишна.
 *
 * `standard_rendition_at` ставит этот UPDATE и больше ничто: это единственный факт строки о том,
 * что по детерминированному ключу `s3StandardImageKey(mediaId)` в бакете выдачи лежит наш рендишн.
 * Каждая дверь выдачи (`resolveDeliverableMediaObject` в `s3MediaStorage.ts`) читает эту колонку
 * ПЕРВОЙ. Суффикс ключа или mime `image/webp` были бы соглашением об именовании и полем под
 * контролем загрузчика, а не фактом.
 */
export async function completeMediaPreviewImage(result: MediaPreviewImageResult): Promise<void> {
  const pool = getPool();
  const standardKey = s3StandardImageKey(result.mediaId);
  const claimed = await withPoolTransaction<boolean>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    const rows = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, result.mediaId), eq(mediaFiles.previewStatus, 'processing')))
      .limit(1)
      .for('update');
    if (rows.length === 0) return false;
    await runWebappSql(
      db,
      sql`UPDATE media_files SET
             mime_type = ${result.mimeType},
             preview_status = 'ready',
             preview_sm_key = ${s3PreviewKey(result.mediaId, 'sm')},
             preview_md_key = ${s3PreviewKey(result.mediaId, 'md')},
             preview_attempts = 0,
             preview_next_attempt_at = NULL,
             source_width = ${result.width},
             source_height = ${result.height},
             standard_rendition_at = now()
           WHERE id = ${result.mediaId}::uuid`,
    );
    return true;
  });
  if (!claimed) {
    logger.warn(
      { mediaId: result.mediaId },
      '[mediaPreviewControl] image outcome ignored: row is no longer claimed',
    );
    return;
  }
  logger.info(
    {
      mediaId: result.mediaId,
      standardKey,
      sizeBytes: result.sizeBytes,
      width: result.width,
      height: result.height,
    },
    '[mediaPreviewControl] standard rendition stored',
  );
}

export type MediaPreviewPosterResult = {
  mediaId: string;
  width: number | null;
  height: number | null;
};

/** Видео: исходник остаётся на месте, меняются только эскизы и измеренный размер кадра. */
export async function completeMediaPreviewPoster(result: MediaPreviewPosterResult): Promise<void> {
  const pool = getPool();
  await withPoolTransaction<void>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    await runWebappSql(
      db,
      sql`UPDATE media_files SET
             preview_status = 'ready',
             preview_sm_key = ${s3PreviewKey(result.mediaId, 'sm')},
             preview_md_key = ${s3PreviewKey(result.mediaId, 'md')},
             preview_attempts = 0,
             preview_next_attempt_at = NULL,
             source_width = ${result.width},
             source_height = ${result.height}
           WHERE id = ${result.mediaId}::uuid AND preview_status = 'processing'`,
    );
  });
}

/**
 * Отказ наряда. Классификация — здесь, а не у воркера: воркер присылает текст ошибки, а «это
 * навсегда» / «повторить через N минут» / «попытки кончились» решает вебапп по своим правилам.
 * Иначе процесс, разбирающий враждебные байты, сам решал бы, какую строку больше не трогать.
 */
export async function failMediaPreview(mediaId: string, error: string): Promise<void> {
  const pool = getPool();
  await withPoolTransaction<void>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    const rows = await db
      .select({ id: mediaFiles.id, attempts: mediaFiles.previewAttempts })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.previewStatus, 'processing')))
      .limit(1)
      .for('update');
    if (rows.length === 0) {
      logger.warn(
        { mediaId },
        '[mediaPreviewControl] failure ignored: row is no longer claimed',
      );
      return;
    }
    const missingTool = missingPreviewTool(error);
    if (missingTool) {
      await markBlocked(db, mediaId);
      logger.error(
        { mediaId, error, missingTool },
        '[mediaPreviewControl] no tool to decode this file, deferred until the environment is fixed',
      );
      return;
    }
    if (isPermanentPreviewError(error)) {
      await markSkipped(db, mediaId);
      logger.warn({ mediaId, error }, '[mediaPreviewControl] permanent error, skipped');
      return;
    }
    const nextAttempts = (rows[0]!.attempts ?? 0) + 1;
    if (nextAttempts >= MAX_PREVIEW_ATTEMPTS) {
      await runWebappSql(
        db,
        sql`UPDATE media_files SET
               preview_status = 'failed',
               preview_attempts = ${nextAttempts},
               preview_next_attempt_at = NULL
             WHERE id = ${mediaId}::uuid`,
      );
    } else {
      const minutes = backoffMinutesAfterFailure(nextAttempts);
      await runWebappSql(
        db,
        sql`UPDATE media_files SET
               preview_status = 'pending',
               preview_attempts = ${nextAttempts},
               preview_next_attempt_at = now() + (${minutes}::numeric * interval '1 minute')
             WHERE id = ${mediaId}::uuid`,
      );
    }
    logger.error({ mediaId, error }, '[mediaPreviewControl] preview failed');
  });
}

/** Адрес чужой обложки для строки, которую воркер уже занял. */
export async function readHostedPreviewSourceUrl(mediaId: string): Promise<string | null> {
  const pool = getPool();
  return withPoolTransaction<string | null>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    const rows = await db
      .select({ url: mediaFiles.hostedVideoSourceUrl })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.previewStatus, 'processing')))
      .limit(1);
    const url = rows[0]?.url?.trim();
    return url ? url : null;
  });
}

/**
 * Воркер поднялся — застрявшие строки возвращаются в очередь.
 *
 * Поручение владельца 14.09.2026, дословно: «надо сделать, чтобы deploy делал сброс. Любой deploy
 * делал сброс, потому что мы же не будем каждый раз разбираться, добавили мы декодер в этом деплое
 * или что-то ещё». Отдельного шага в скрипте деплоя нет и не будет: воркер перезапускается каждой
 * выкладкой и на старте сам говорит, чем умеет разбирать байты, — условие проверяется по факту
 * окружения, а не по намерению того, кто катил релиз. Забыть такой сброс нельзя.
 *
 * Две разные строки и два разных правила:
 *
 * 1. `blocked` — строка, которую НЕЧЕМ было разобрать. Выпускать её, пока инструмента нет, значит
 *    гонять её по кругу впустую, поэтому здесь условие на инструмент остаётся.
 * 2. `failed` — строка, которая исчерпала попытки. Выпускается ВСЕГДА. Причина прямая: до появления
 *    состояния `blocked` отсутствие инструмента считалось обычным отказом, и такие строки осели в
 *    `failed` навсегда — их не берёт ни одна ветка очереди. Ровно так 14.09 на новом проде застряли
 *    шесть картинок: декодер уже стоял, а строки лежали мёртвыми. Отличить «файл битый» от «среда
 *    была сломана» по самой строке невозможно, и гадать мы не будем — перезапуск воркера означает
 *    возможную новую среду, и дешевле попробовать снова.
 *
 * Чем это ограничено: воркер в цикле падений возвращал бы `failed` в очередь на каждом старте. Это
 * само по себе авария и видно отдельно; цена одного круга ограничена потолком попыток на строку.
 *
 * Счётчик попыток обнуляется: прошлые попытки считали среду, а не файл, и держать их против строки
 * нечестно — иначе файл, который ждал починки дольше других, получил бы меньше всего попыток.
 */
export async function releaseStuckMediaPreviews(tools: readonly PreviewTool[]): Promise<number> {
  // `sql.param` обязателен: без него drizzle разворачивает массив в СПИСОК параметров — получалось
  // `ANY(($1, $2)::text[])`, а это не массив, и запрос падал на каждом старте воркера. Снаружи это
  // выглядело как «превью не чинятся сами»: отчёт об инструментах не доходил, и строки, ждавшие
  // декодера, не выпускались никогда. Замерено 15.09.2026 на живом проде.
  const statuses = tools.includes(PREVIEW_TOOL_HEIC_DECODER)
    ? ['blocked', 'failed']
    : ['failed'];
  const pool = getPool();
  const released = await withPoolTransaction<number>(pool, async (client) => {
    const db = getWebappSqlFromPgClient(client);
    const res = await runWebappSql<{ id: string }>(
      db,
      sql`UPDATE media_files SET
             preview_status = 'pending',
             preview_attempts = 0,
             preview_next_attempt_at = NULL
           WHERE preview_status = ANY(${sql.param(statuses)}::text[])
           RETURNING id::text AS id`,
    );
    return res.rows.length;
  });
  if (released > 0) {
    logger.info(
      { released, tools, statuses },
      '[mediaPreviewControl] the worker is up, stuck rows are queued again',
    );
  }
  return released;
}

/*
 * Счёт `blocked`-строк жил здесь и был снят 14.09.2026. Это сигнал глобальному админу, а не работа
 * очереди: его читает сборщик здоровья, у которого в rev10-режиме порт-контекст выбирает роль
 * `app_worker` — без прав на `media_files` и правильно, что без них. Число теперь приезжает
 * курируемой дверью здоровья (`app.read_curated_system_health()`, поле `mediaPreview.blockedCount`),
 * см. `app-layer/media/blockedMediaPreviews.ts`.
 */
