/**
 * ЕДИНСТВЕННЫЙ typed manifest обязательных фоновых заданий вебаппа.
 *
 * Сводный аудит 27.08.2026 (`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`,
 * находки B1–B3, этап 2): раньше одно и то же задание объявлялось трижды — в реестре здоровья, в
 * рукописном cron-шаблоне и в примере runbook, — и ни одна пара не сверялась. Отсюда 404 у трёх
 * шаблонов без публичного `Host`, полностью отсутствующее расписание у реализованных retention-задач
 * и «полностью готовая задача, которая никогда не запускалась».
 *
 * Теперь route, method, principal, cadence, timeout, staleness, surface identity и среда живут
 * ЗДЕСЬ, а всё остальное выводится:
 *   • `cronJobRegistry.ts` (реестр здоровья) — проекция этого файла;
 *   • `deploy/host/cron.d/*.cron.template` — генерируются `deploy/host/background-jobs-cli.mjs`;
 *   • `deploy/host/run-internal-job.sh` — единственный transport, читает описание задания отсюда;
 *   • deploy сверяет manifest ⇄ поставленные artifacts ⇄ реально установленное расписание.
 *
 * ⚠ ФАЙЛ ЧИТАЕТСЯ NODE НАПРЯМУЮ (type stripping) из `deploy/host/background-jobs-cli.mjs`.
 *   Поэтому у него НЕТ импортов и не должно появиться: любой `import './x'` без расширения уронит
 *   deploy-гейт. Константы job_family/job_key живут здесь, `reconcileJobKeys.ts` их только
 *   реэкспортирует.
 */

/* ─────────────────────────── job identity (канон ключей) ─────────────────────────── */

export const OPERATOR_MEDIA_JOB_FAMILY = 'media';
export const OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY = 'media_transcode.reconcile';
export const OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY = 'media.pending_delete.purge';
export const OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY = 'media.multipart.cleanup';
export const OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY = 'media.preview.process';
export const OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY = 'media.playback_stats.retention';
export const OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY = 'media.hls_proxy_errors.retention';

export const OPERATOR_ANALYTICS_JOB_FAMILY = 'analytics';
export const OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY = 'analytics.product_analytics.retention';

export const OPERATOR_HEALTH_JOB_FAMILY = 'health';
export const OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY = 'health.system_health_guard.tick';
export const OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY = 'health.operator_health_critical.tick';
export const OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY = 'health.operator_health_digest.tick';
export const OPERATOR_OUTBOUND_PROBE_JOB_KEY = 'health.outbound_probe.run';
export const OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY = 'health.domain_health.tick';

export const OPERATOR_BACKUP_JOB_FAMILY = 'backup';

export const OPERATOR_SAAS_BILLING_JOB_FAMILY = 'saas_billing';
export const OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY = 'saas_billing_renewal.tick';

export const OPERATOR_MAINTENANCE_JOB_FAMILY = 'maintenance';
export const OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY = 'maintenance.db_journal_retention.tick';

/* ───────────────────────────────── среда ───────────────────────────────── */

export type BackgroundJobEnvironmentId = 'prod' | 'test';

export type BackgroundJobEnvironment = {
  readonly id: BackgroundJobEnvironmentId;
  /** Канонический env-файл вебаппа (`SERVER CONVENTIONS.md`). Несёт APP_BASE_URL/HOST/PORT/секрет. */
  readonly envFile: string;
  /** Канонический checkout, который поставляет `deploy/host/run-internal-job.sh`. */
  readonly projectRoot: string;
  /** Префикс имени файла в `/etc/cron.d` и в `deploy/host/cron.d/`. */
  readonly cronFilePrefix: string;
};

export const BACKGROUND_JOB_ENVIRONMENTS = {
  prod: {
    id: 'prod',
    envFile: '/opt/env/bersoncarebot/webapp.prod',
    projectRoot: '/opt/projects/bersoncarebot',
    cronFilePrefix: 'bersoncarebot-',
  },
  test: {
    id: 'test',
    envFile: '/opt/env/bersoncarebot/webapp.test',
    projectRoot: '/opt/projects/bersoncarebot-test',
    cronFilePrefix: 'bersoncarebot-test-',
  },
} as const satisfies Readonly<Record<BackgroundJobEnvironmentId, BackgroundJobEnvironment>>;

export const BACKGROUND_JOB_ENVIRONMENT_IDS: readonly BackgroundJobEnvironmentId[] = [
  'prod',
  'test',
];

/* ──────────────────────────────── manifest ──────────────────────────────── */

/** Кто будит задание. `host_cron` — единственный вид, для которого репозиторий поставляет artifact. */
export type BackgroundJobScheduleOwner = 'host_cron' | 'resident_scheduler' | 'host_backup';

/** Чем задание доказывает право на вызов. */
export type BackgroundJobPrincipal = 'internal_job_bearer' | 'integrator_hmac' | 'host_shell';

/**
 * Какую surface identity должен предъявить вызов. `app_public_origin` — Host/Origin/X-Forwarded-Proto
 * строятся из `APP_BASE_URL` того же env-файла; голый loopback `Host` отсекается `proxy.ts` до
 * маршрута (находка B1).
 */
export type BackgroundJobSurfaceIdentity = 'app_public_origin' | 'none';

export type BackgroundJobKind = 'internal_http' | 'resident_scheduler' | 'backup_shell';

export type BackgroundJobRoute = {
  readonly method: 'POST';
  readonly path: string;
  /** Query-строка без ведущего `?`. */
  readonly query?: string;
  /** Тело запроса; задаётся только там, где маршрут его действительно читает. */
  readonly jsonBody?: string;
};

export type BackgroundJobManifestEntry = {
  /** Стабильный id задания: имя artifact, аргумент transport, id строки в «Здоровье системы». */
  readonly id: string;
  readonly jobFamily: string;
  readonly jobKey: string;
  /** Человеческая подпись строки в «Здоровье системы». */
  readonly label: string;
  readonly kind: BackgroundJobKind;
  readonly scheduleOwner: BackgroundJobScheduleOwner;
  /** Человеческое расписание для «Здоровье системы». */
  readonly scheduleHint: string;
  /** Пять полей crontab. Только для `scheduleOwner: 'host_cron'`. */
  readonly cron?: string;
  /** Имя без префикса среды: `deploy/host/cron.d/<prefix><slug>.cron.template`. */
  readonly artifactSlug?: string;
  /** Среды, в которых задание обязано существовать. */
  readonly environments?: readonly BackgroundJobEnvironmentId[];
  readonly route?: BackgroundJobRoute;
  readonly principal: BackgroundJobPrincipal;
  readonly surfaceIdentity: BackgroundJobSurfaceIdentity;
  /** `curl --max-time`; задание, не уложившееся в него, — громкий отказ, а не тихий висяк. */
  readonly timeoutSec?: number;
  /** HTTP-коды, которые НЕ являются отказом transport (feature-flag off и т.п.). */
  readonly acceptStatuses?: readonly number[];
  /** После этого интервала без успешного tick — degraded. */
  readonly staleAfterSec: number;
  /** Обязательное задание: отсутствие artifact или установленного расписания красит deploy. */
  readonly required: boolean;
  /**
   * Сторож, который обязан пережить смерть наблюдаемого scheduler. Никогда не переносится внутрь
   * резидентного процесса (Р-D30, `D30_SCHEDULER_REVERSAL_PLAN.md` вердикт B5a).
   */
  readonly deadMansSwitch?: boolean;
  /** Нет строки в `operator_job_status` — только «нет данных», без ухудшения сводного статуса. */
  readonly optionalNoData?: boolean;
  readonly why: string;
};

/**
 * Канонический перечень. Порядок = порядок строк в «Здоровье системы».
 *
 * `as const` держит литеральные типы: из них выводится `Record<InternalHttpJobFamily, …>` карты
 * isolation telemetry, поэтому новое семейство физически не может появиться без своей записи.
 */
const BACKGROUND_JOB_MANIFEST_SOURCE = [
  {
    id: 'media_purge',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
    label: 'Удаление медиа (purge)',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждую минуту',
    cron: '* * * * *',
    artifactSlug: 'media-purge',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-pending-delete/purge', query: 'limit=25' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 50,
    staleAfterSec: 3 * 60,
    required: true,
    why: 'Очередь удаления медиа: без тика строки остаются в S3 и в БД после удаления из библиотеки.',
  },
  {
    id: 'media_multipart',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
    label: 'Multipart cleanup',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 10 мин',
    cron: '*/10 * * * *',
    artifactSlug: 'media-multipart',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-multipart/cleanup', query: 'limit=25' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 300,
    staleAfterSec: 25 * 60,
    required: true,
    why: 'Истёкшие multipart-сессии: без тика S3 копит незавершённые загрузки, а media_files — orphan pending.',
  },
  {
    id: 'media_preview',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
    label: 'Превью медиа',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждую минуту',
    cron: '* * * * *',
    artifactSlug: 'media-preview',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-preview/process', query: 'limit=10' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 50,
    staleAfterSec: 3 * 60,
    required: true,
    why: 'Только HTTP-дверь пишет tick media.preview.process; `media-preview:tick` оставляет строку «нет данных».',
  },
  {
    id: 'media_transcode_reconcile',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
    label: 'HLS reconcile',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 10 мин',
    cron: '*/10 * * * *',
    artifactSlug: 'media-transcode-reconcile',
    environments: ['prod', 'test'],
    route: {
      method: 'POST',
      path: '/api/internal/media-transcode/reconcile',
      jsonBody: '{"limit":50}',
    },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 300,
    // Маршрут отвечает 503 `pipeline_disabled`/`reconcile_disabled`, когда админский флаг выключен.
    // Это решение оператора, а не отказ transport, поэтому 503 не красит cron-строку.
    acceptStatuses: [200, 503],
    staleAfterSec: 25 * 60,
    required: false,
    why: 'Догоняет legacy-видео без HLS. Управляется флагами video_hls_pipeline_enabled/reconcile_enabled.',
  },
  {
    id: 'system_health_guard',
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY,
    label: 'System health maintenance',
    kind: 'resident_scheduler',
    scheduleOwner: 'resident_scheduler',
    scheduleHint: 'каждые 15 мин',
    route: { method: 'POST', path: '/api/integrator/system-health/guard-wake' },
    principal: 'integrator_hmac',
    surfaceIdentity: 'app_public_origin',
    staleAfterSec: 35 * 60,
    required: true,
    why: 'D30: будит только резидентный scheduler подписанным wake; host-cron шаблон снят намеренно.',
  },
  {
    id: 'operator_health_critical',
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
    label: 'Critical health tick',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 5 мин',
    cron: '*/5 * * * *',
    artifactSlug: 'operator-health-critical',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/operator-health-critical/tick' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 120,
    staleAfterSec: 12 * 60,
    required: true,
    deadMansSwitch: true,
    why: 'Сторож наблюдаемого scheduler: должен пережить его смерть, поэтому остаётся внешним host-cron.',
  },
  {
    id: 'operator_health.digest.daily',
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
    label: 'Digest health tick',
    kind: 'resident_scheduler',
    scheduleOwner: 'resident_scheduler',
    scheduleHint: 'раз в сутки в настроенное время (проверка каждый час)',
    route: { method: 'POST', path: '/api/integrator/operator-health/digest-wake' },
    principal: 'integrator_hmac',
    surfaceIdentity: 'app_public_origin',
    staleAfterSec: 26 * 60 * 60,
    required: true,
    why: 'D30: сводку будит только резидентный scheduler; digestTime читает вебапп при постановке.',
  },
  {
    id: 'domain_health',
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_DOMAIN_HEALTH_TICK_JOB_KEY,
    label: 'Домен и сертификат клиники',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'ежедневно',
    cron: '50 3 * * *',
    artifactSlug: 'domain-health',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/domain-health/tick' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 180,
    staleAfterSec: 26 * 60 * 60,
    required: true,
    why: 'C5 (W5, IMPLEMENTATION_PLAN.md): резолвится ли домен клиники туда, куда должен, и сколько дней ' +
      'осталось до истечения сертификата — тот же класс молчаливого отказа, что и email/SMS.',
  },
  {
    id: 'playback_retention',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY,
    label: 'Retention playback stats',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'еженедельно',
    cron: '15 4 * * 1',
    artifactSlug: 'media-playback-stats-retention',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-playback-stats/retention' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 600,
    staleAfterSec: 8 * 24 * 60 * 60,
    required: true,
    why: 'Окно хранения media_playback_stats_hourly; до этого шаблона расписания не существовало (B2).',
  },
  {
    id: 'hls_proxy_retention',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
    label: 'Retention HLS proxy errors',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'еженедельно',
    cron: '20 4 * * 1',
    artifactSlug: 'media-hls-proxy-errors-retention',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-hls-proxy-errors/retention' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 600,
    staleAfterSec: 8 * 24 * 60 * 60,
    required: true,
    why: 'Окно хранения media_hls_proxy_error_events; реестр, права и API были, будильника не было (B2).',
  },
  {
    id: 'product_analytics_retention',
    jobFamily: OPERATOR_ANALYTICS_JOB_FAMILY,
    jobKey: OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
    label: 'Retention продуктовой аналитики',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'еженедельно',
    cron: '30 4 * * 1',
    artifactSlug: 'product-analytics-retention',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/product-analytics/retention' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 600,
    staleAfterSec: 8 * 24 * 60 * 60,
    required: true,
    why: 'На TEST 517 строк product_analytics_events_recent старше объявленного окна: не было расписания (B2).',
  },
  {
    id: 'db_journal_retention',
    jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
    jobKey: OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY,
    label: 'Retention служебных журналов БД',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'ежечасно',
    cron: '0 * * * *',
    artifactSlug: 'db-journal-retention',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/db-journal-retention/tick' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 600,
    staleAfterSec: 3 * 60 * 60,
    required: true,
    why: 'Nonce ledger и idempotency-таблицы нуждаются в почасовом ритме (Track D, evidence/16).',
  },
  {
    id: 'saas_billing_renewal_tick',
    jobFamily: OPERATOR_SAAS_BILLING_JOB_FAMILY,
    jobKey: OPERATOR_SAAS_BILLING_RENEWAL_TICK_JOB_KEY,
    label: 'Автопродление тарифа (счета клиникам)',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'ежечасно',
    cron: '0 * * * *',
    artifactSlug: 'saas-billing-renewal',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/saas-billing/renewal/tick', query: 'limit=50' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 300,
    staleAfterSec: 3 * 60 * 60,
    required: true,
    why: 'Счёт продления тарифа истёкшим подпискам; шаблон ходил без публичного Host и получал 404 (B1).',
  },
  {
    id: 'backup_hourly',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.hourly',
    label: 'Бэкап PostgreSQL (hourly)',
    kind: 'backup_shell',
    scheduleOwner: 'host_backup',
    environments: ['prod'],
    scheduleHint: 'ежечасно',
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 3 * 60 * 60,
    required: true,
    why: 'Расписание принадлежит /opt/backups/scripts/postgres-backup.sh, не cron.d вебаппа.',
  },
  {
    id: 'backup_daily',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.daily',
    label: 'Бэкап PostgreSQL (daily)',
    kind: 'backup_shell',
    scheduleOwner: 'host_backup',
    environments: ['prod'],
    scheduleHint: 'ежедневно',
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 28 * 60 * 60,
    required: false,
    optionalNoData: true,
    why: 'Расписание принадлежит backup-скрипту хоста.',
  },
  {
    id: 'backup_weekly',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.weekly',
    label: 'Бэкап PostgreSQL (weekly)',
    kind: 'backup_shell',
    scheduleOwner: 'host_backup',
    environments: ['prod'],
    scheduleHint: 'еженедельно',
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 8 * 24 * 60 * 60,
    required: false,
    optionalNoData: true,
    why: 'Расписание принадлежит backup-скрипту хоста.',
  },
  {
    id: 'backup_prune',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.prune',
    label: 'Бэкап PostgreSQL (prune)',
    kind: 'backup_shell',
    scheduleOwner: 'host_backup',
    environments: ['prod'],
    scheduleHint: 'по расписанию retention',
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 8 * 24 * 60 * 60,
    required: false,
    optionalNoData: true,
    why: 'Расписание принадлежит backup-скрипту хоста.',
  },
] as const satisfies readonly BackgroundJobManifestEntry[];

export type BackgroundJobId = (typeof BACKGROUND_JOB_MANIFEST_SOURCE)[number]['id'];

/**
 * Семейства заданий, тик которых пишет САМ вебапп (`recordOperatorCronJobTickBestEffort`).
 * Из этого union строится карта isolation telemetry: новое семейство не соберётся без своей записи.
 */
export type InternalHttpJobFamily = Extract<
  (typeof BACKGROUND_JOB_MANIFEST_SOURCE)[number],
  { kind: 'internal_http' }
>['jobFamily'];

/**
 * Читательское представление: литеральные типы нужны только для вывода union выше, а всем
 * потребителям нужен обычный список записей с необязательными полями.
 */
export const BACKGROUND_JOB_MANIFEST: readonly BackgroundJobManifestEntry[] =
  BACKGROUND_JOB_MANIFEST_SOURCE;

/* ─────────────────────────────── читатели ─────────────────────────────── */

export function findBackgroundJob(id: string): BackgroundJobManifestEntry | undefined {
  return BACKGROUND_JOB_MANIFEST.find((entry) => entry.id === id);
}

export function findBackgroundJobByTickKey(
  jobFamily: string,
  jobKey: string,
): BackgroundJobManifestEntry | undefined {
  return BACKGROUND_JOB_MANIFEST.find(
    (entry) => entry.jobFamily === jobFamily && entry.jobKey === jobKey,
  );
}

/** Задания, для которых репозиторий обязан поставить cron artifact в указанной среде. */
export function hostCronJobsForEnvironment(
  environmentId: BackgroundJobEnvironmentId,
): readonly BackgroundJobManifestEntry[] {
  return BACKGROUND_JOB_MANIFEST.filter(
    (entry) =>
      entry.scheduleOwner === 'host_cron' && (entry.environments ?? []).includes(environmentId),
  );
}

/** Имя файла artifact/установленного расписания для задания в среде. */
export function cronArtifactName(
  entry: BackgroundJobManifestEntry,
  environment: BackgroundJobEnvironment,
): string {
  if (!entry.artifactSlug) {
    throw new Error(`background job ${entry.id} has no artifactSlug`);
  }
  return `${environment.cronFilePrefix}${entry.artifactSlug}`;
}

/** Абсолютный путь общего transport в конкретной среде. */
export function internalJobRunnerPath(environment: BackgroundJobEnvironment): string {
  return `${environment.projectRoot}/deploy/host/run-internal-job.sh`;
}

/**
 * Единственная cron-строка задания. Ни Host, ни Origin, ни env-файл, ни секрет в ней не появляются:
 * их целиком знает transport, который читает это же описание. Строка НЕ отправляет вывод в
 * `/dev/null` — иначе отказ transport/HTTP исчезает вместе с телом ответа (находка B1).
 */
export function renderCronCommand(
  entry: BackgroundJobManifestEntry,
  environment: BackgroundJobEnvironment,
): string {
  return `${internalJobRunnerPath(environment)} ${environment.id} ${entry.id}`;
}

/**
 * Internal-Bearer-secured routes that are NOT scheduled background jobs, so they have no manifest
 * entry (no cadence, no `staleAfterSec`, no health-board row): `media-transcode/enqueue` is called
 * synchronously by other server code on upload, `media-worker/control` is polled continuously by the
 * external media-worker process, and the two `heartbeat/*` receivers accept dead-man's-switch pings
 * from the resident scheduler. Listed explicitly, not derived from a pattern, for the same
 * audit-readability reason the manifest itself gives for `id`/`route` fields — a wildcard here would
 * silently exempt a future unrelated `/api/internal/*` route from CSRF origin checks.
 */
export const INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS = [
  '/api/internal/heartbeat/digest',
  '/api/internal/heartbeat/pipeline_delivery',
  '/api/internal/media-transcode/enqueue',
  '/api/internal/media-worker/control',
] as const;

/**
 * Single source for the CSRF middleware's `internal_bearer` mutation class (W2, systemic residual
 * audit 27.08.2026): every manifest job route whose `principal` is `internal_job_bearer`, plus the
 * non-scheduled routes above. Before this, `middleware/csrfOrigin.ts` hand-copied the manifest job
 * paths into a second list that silently drifted — two active routes (`domain-health/tick`,
 * `db-journal-retention/tick`) were missing from it. A new manifest job with this principal is now
 * covered automatically; only the non-scheduled routes still need a manual add, right above.
 */
export function internalJobBearerCsrfExemptPaths(): readonly string[] {
  const manifestPaths = BACKGROUND_JOB_MANIFEST.filter(
    (entry) => entry.principal === 'internal_job_bearer' && entry.route,
  ).map((entry) => (entry.route as BackgroundJobRoute).path);
  return [...manifestPaths, ...INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS];
}

export const CRON_ARTIFACT_GENERATED_BY =
  'apps/webapp/src/modules/operator-health/backgroundJobManifest.ts';

/** Полный текст `deploy/host/cron.d/<name>.cron.template`. Один рендер для генератора и для гейта. */
export function renderCronArtifact(
  entry: BackgroundJobManifestEntry,
  environment: BackgroundJobEnvironment,
): string {
  if (!entry.cron) throw new Error(`background job ${entry.id} has no cron cadence`);
  const route = entry.route
    ? `${entry.route.method} ${entry.route.path}${entry.route.query ? `?${entry.route.query}` : ''}`
    : 'нет HTTP-маршрута';
  const lines = [
    `# СГЕНЕРИРОВАНО из ${CRON_ARTIFACT_GENERATED_BY}. Руками не править.`,
    '# Перегенерировать: node deploy/host/background-jobs-cli.mjs --write',
    '# Сверить (гейт deploy и CI): node deploy/host/background-jobs-cli.mjs --check',
    '#',
    `# ${entry.label} — среда ${environment.id}.`,
    `# ${entry.why}`,
    `# id=${entry.id} tick=${entry.jobFamily}/${entry.jobKey} ${route}`,
    `# principal=${entry.principal} surface=${entry.surfaceIdentity} timeout=${entry.timeoutSec ?? 0}s stale_after=${entry.staleAfterSec}s`,
    `# Host/Origin/X-Forwarded-Proto и env-файл (${environment.envFile}) строит общий transport`,
    '# deploy/host/run-internal-job.sh — cron-строка их не копирует и не знает про branding proxy.',
    `${entry.cron} root ${renderCronCommand(entry, environment)}`,
  ];
  return `${lines.join('\n')}\n`;
}
