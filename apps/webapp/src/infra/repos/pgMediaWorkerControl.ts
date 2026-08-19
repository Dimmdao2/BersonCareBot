import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export type MediaWorkerClaim = {
  id: string;
  mediaId: string;
  organizationId: string;
  attempts: number;
};
export type MediaWorkerLoadedMedia = {
  id: string;
  mimeType: string;
  s3Key: string | null;
  hlsMasterPlaylistS3Key: string | null;
  videoProcessingStatus: string | null;
  videoDurationSeconds: number | null;
  usagePurpose: string | null;
};
type JobRef = Pick<MediaWorkerClaim, 'id' | 'mediaId'>;

/**
 * Разбор очереди пересборки видео идёт ОБЪЯВЛЕННЫМИ КОРНЯМИ, а не отношением.
 *
 * Диспетчер очереди межарендный по построению: он спрашивает «какая работа готова», заранее не
 * зная, чьей клиники она окажется, поэтому своего `organization_id` у него нет и быть не может.
 * До миграции 0050 этот файл ходил в `public.media_transcode_jobs` напрямую под
 * `app_operational_media_worker` — и не мог пройти НИКОГДА: единственная разрешающая политика этой
 * роли на таблице собрана из арендаторских веток, обе зовут `app.current_org_id()` подзапросом
 * (InitPlan считается один раз независимо от порядка `AND`), а та роль воркера не принимает и
 * поднимает `42501 accepted organization context required`. Замер на TEST 19.08: воркер падал раз
 * в 5 секунд с 18.08 19:26, видео не пересобиралось больше суток — отсюда и «тишина» при загрузке
 * нового видео, и вечная заглушка «Видео готовится» на старом.
 *
 * Стена стоит на ПОСТАНОВКЕ в очередь (`app.enqueue_media_transcode_job_for_staff/_for_service`
 * того же шва) и в ТЕЛЕ каждого корня: работа отдаётся только вместе с проверкой «организация
 * работы совпадает с организацией файла», а завершать её может лишь тот, чей замок на ней стоит.
 */
/** Работа, которой не существует: пробник готовности спрашивает дверь, ничего при этом не заняв. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function controlConflict(): never {
  throw new Error('media_worker_control_conflict');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function readJobMedia(job: JobRef, lockedBy: string): Promise<unknown> {
  const result = await runWebappNamedRoot<{ media: unknown }>(
    getWebappSqlDb(),
    'app.read_media_transcode_job_media(uuid,uuid,text)',
    [job.id, job.mediaId, lockedBy],
    sql`SELECT app.read_media_transcode_job_media(
      ${job.id}::uuid, ${job.mediaId}::uuid, ${lockedBy}::text
    ) AS media`,
  );
  return result.rows[0]?.media ?? null;
}

/**
 * Готовность = дверь очереди на месте и открыта ЭТОМУ принципалу. Спрашиваем её о работе, которой
 * не бывает: ответ всегда «нет такой», но пройти до него можно только через EXECUTE, принятый
 * контекст и чтение очереди швом — то есть ровно тот путь, который был сломан больше суток.
 * Прежний пробник читал оба отношения напрямую и об этой поломке молчал.
 */
export async function assertMediaWorkerControlReady(): Promise<void> {
  const probe = await readJobMedia({ id: NIL_UUID, mediaId: NIL_UUID }, 'readiness-probe');
  if (probe !== null) throw new Error('media_worker_control_ready_probe_unexpected_row');
}

export async function reclaimAndClaimMediaWorkerJob(params: {
  enabled: boolean;
  lockedBy: string;
  staleLockMinutes: number;
}): Promise<{ kind: 'disabled' | 'idle' } | { kind: 'claimed'; job: MediaWorkerClaim }> {
  if (!params.enabled) return { kind: 'disabled' };
  const result = await runWebappNamedRoot<{ claim: unknown }>(
    getWebappSqlDb(),
    'app.claim_media_transcode_job(text,integer)',
    [params.lockedBy, params.staleLockMinutes],
    sql`SELECT app.claim_media_transcode_job(
      ${params.lockedBy}::text, ${params.staleLockMinutes}::integer
    ) AS claim`,
  );
  const claim = asRecord(result.rows[0]?.claim);
  if (!claim) throw new Error('media_worker_claim_invalid');
  if (claim.kind !== 'claimed') return { kind: 'idle' };
  const job = asRecord(claim.job);
  const id = requiredText(job?.id);
  const mediaId = requiredText(job?.mediaId);
  const organizationId = requiredText(job?.organizationId);
  const attempts = typeof job?.attempts === 'number' ? job.attempts : null;
  // Неполная строка занятой работы НЕ достраивается умолчанием: воркер по ней пойдёт качать и
  // перезаписывать файл, и «работа без организации» здесь означала бы работу неизвестно чью.
  if (!id || !mediaId || !organizationId || attempts === null) {
    throw new Error('media_worker_claim_invalid');
  }
  return { kind: 'claimed', job: { id, mediaId, organizationId, attempts } };
}

export async function loadMediaWorkerControlMedia(
  job: JobRef,
  lockedBy: string,
): Promise<MediaWorkerLoadedMedia | null> {
  const row = asRecord(await readJobMedia(job, lockedBy));
  if (!row) return null;
  const id = requiredText(row.id);
  const mimeType = requiredText(row.mimeType);
  if (!id || !mimeType) throw new Error('media_worker_job_media_invalid');
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;
  return {
    id,
    mimeType,
    s3Key: text(row.s3Key),
    hlsMasterPlaylistS3Key: text(row.hlsMasterPlaylistS3Key),
    videoProcessingStatus: text(row.videoProcessingStatus),
    videoDurationSeconds: typeof row.videoDurationSeconds === 'number'
      ? row.videoDurationSeconds
      : null,
    usagePurpose: text(row.usagePurpose),
  };
}

type MediaWorkerOutcome = 'processing' | 'retry' | 'failed' | 'done_hls' | 'done_program';

/** Исход оборота записывает корень; «не моя работа» приходит как `false` и остаётся конфликтом. */
async function recordMediaWorkerOutcome(
  job: JobRef,
  lockedBy: string,
  outcome: MediaWorkerOutcome,
  payload: Record<string, unknown>,
): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  const result = await runWebappNamedRoot<{ recorded: boolean | null }>(
    getWebappSqlDb(),
    'app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)',
    [job.id, job.mediaId, lockedBy, outcome, payloadJson],
    sql`SELECT app.record_media_transcode_job_outcome(
      ${job.id}::uuid, ${job.mediaId}::uuid, ${lockedBy}::text, ${outcome}::text,
      ${payloadJson}::text
    ) AS recorded`,
  );
  if (result.rows[0]?.recorded !== true) controlConflict();
}

export async function markMediaWorkerProcessing(job: JobRef, lockedBy: string): Promise<void> {
  await recordMediaWorkerOutcome(job, lockedBy, 'processing', {});
}

export async function retryMediaWorkerJob(
  job: JobRef,
  lockedBy: string,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  await recordMediaWorkerOutcome(job, lockedBy, 'retry', { nextAttemptAt, error });
}

export async function failMediaWorkerJob(
  job: JobRef,
  lockedBy: string,
  error: string,
): Promise<void> {
  await recordMediaWorkerOutcome(job, lockedBy, 'failed', { error });
}

export async function completeMediaWorkerHlsJob(
  job: JobRef,
  lockedBy: string,
  values: {
    masterKey?: string;
    artifactPrefix?: string;
    posterKey?: string;
    qualitiesJson?: string;
    durationSeconds?: number | null;
  },
): Promise<void> {
  await recordMediaWorkerOutcome(job, lockedBy, 'done_hls', {
    ...(values.masterKey === undefined ? {} : { masterKey: values.masterKey }),
    ...(values.artifactPrefix === undefined ? {} : { artifactPrefix: values.artifactPrefix }),
    ...(values.posterKey === undefined ? {} : { posterKey: values.posterKey }),
    ...(values.qualitiesJson === undefined ? {} : { qualitiesJson: values.qualitiesJson }),
    ...(values.durationSeconds === undefined || values.durationSeconds === null
      ? {}
      : { durationSeconds: values.durationSeconds }),
  });
}

export async function completeMediaWorkerProgramJob(
  job: JobRef,
  lockedBy: string,
  values: {
    outputKey: string;
    posterKey: string;
    qualitiesJson: string;
    durationSeconds: number | null;
  },
): Promise<void> {
  await recordMediaWorkerOutcome(job, lockedBy, 'done_program', {
    outputKey: values.outputKey,
    posterKey: values.posterKey,
    qualitiesJson: values.qualitiesJson,
    ...(values.durationSeconds === null ? {} : { durationSeconds: values.durationSeconds }),
  });
}
