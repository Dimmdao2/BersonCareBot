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
export const OPERATOR_MEDIA_DELIVERY_BYTES_FLUSH_JOB_KEY = 'media.delivery_bytes.flush';

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
/**
 * PAY-APPT-11. Семейство — существующее `maintenance`: это периодическая уборка просроченных
 * ожиданий, и своей операции isolation-телеметрии она не заводит. Новое семейство потребовало бы
 * нового значения в CHECK-ограничении `saas_isolation_events` и в корне отчёта — отдельной
 * таксономии ради одной строки расписания не создаём.
 */
export const OPERATOR_BOOKING_PREPAYMENT_EXPIRY_JOB_KEY =
  'maintenance.booking_prepayment_expiry.tick';

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
  /**
   * Как общий transport (`run-internal-job.sh`) достаёт вебапп по loopback.
   *
   * `app_port` (по умолчанию) — прямиком в `PORT` из `envFile`: верно для одноэкземплярного хоста,
   * где этот порт не меняется никогда.
   *
   * `nginx_tls` — вместо этого идти в собственный TLS-vhost nginx на loopback (443), с `--resolve`
   * под реальный Host из `APP_BASE_URL`. Нужно блю/грин-хостам (therapysto prod, `deploy/host/prod/
   * therapysto-bluegreen-lib.sh`): какой цвет отвечает на СВОЙ фиксированный порт приложения, меняет
   * каждый деплой/rollback, а cron-строка ставится один раз и порт за переключениями не следит. nginx
   * — единственный адрес, который переключение всегда переписывает (`switch_nginx_to`), поэтому это
   * единственная стабильная точка для loopback-вызова на хосте, где цвет может смениться под тем же
   * портом сервиса. Найдено 12.09.2026: домен клиники завис в `pending`, потому что тик здоровья
   * домена был не установлен вовсе (см. ниже), а после установки статичный `PORT` бил бы мимо
   * активного цвета в лучшем случае через раз.
   */
  readonly loopbackMode?: 'app_port' | 'nginx_tls';
  /**
   * Имя боевой базы для бэкапа и учётка ОС, от которой он работает.
   *
   * Бэкап подключается по локальному unix-сокету, где систему опознаёт сама ОС, а не по строке
   * подключения из env-файла. Иначе пришлось бы выбирать между двумя плохими вариантами: дампить
   * одной из трёх УЗКИХ ролей рантайма — и получить под RLS дамп ЧАСТИ базы, который выглядит как
   * настоящий, — или завести ещё один пароль с правом читать всё. Здесь нет ни того, ни другого:
   * красть, отзывать и логировать просто нечего.
   */
  readonly backupDatabase?: string;
  readonly backupOsUser?: string;
  /**
   * Имя и адрес машины, на которой этой среде разрешено снимать бэкап.
   *
   * Бэкап — единственное задание, которое обязано отказаться работать «не там». Остальные ходят по
   * loopback и на чужой машине просто никуда не попадут; `pg_dump` же на чужой машине снимет чужую
   * базу в чужой каталог и запишет это в чужой журнал как успех. До 14.09.2026 ожидание было зашито
   * литералами в тело скрипта (`adelaide` / `135.106.162.170` — СТАРЫЙ прод), поэтому на новом
   * проде скрипт не запустился бы вовсе, даже если бы его туда положили.
   */
  readonly backupHostName?: string;
  readonly backupHostIpv4?: string;
};

export const BACKGROUND_JOB_ENVIRONMENTS = {
  prod: {
    id: 'prod',
    // therapysto prod (135.106.187.95, переименован 10.09.2026 — 8e5c2dc00 и далее). Старые пути
    // /opt/env/bersoncarebot и /opt/projects/bersoncarebot остались от прежнего bersoncare-прода и на
    // новом хосте не существуют вовсе — из-за этого с 10.09 по 12.09 ни одно host-cron задание,
    // включая суточный тик здоровья домена, на новом проде не стояло НИ ОДНО.
    envFile: '/etc/therapysto/env/webapp.prod',
    projectRoot: '/opt/therapysto/src',
    cronFilePrefix: 'therapysto-',
    loopbackMode: 'nginx_tls',
    backupDatabase: 'therapysto_prod',
    backupOsUser: 'postgres',
    backupHostName: 'therapysto-prod',
    backupHostIpv4: '135.106.187.95',
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

/**
 * Кто будит задание. `host_cron` — единственный вид, для которого репозиторий поставляет artifact.
 *
 * Третьего значения `host_backup` («расписание принадлежит скрипту хоста») здесь больше нет, и это
 * не переименование, а снятие целого класса потерь. Пока оно существовало, четыре задания бэкапа
 * были единственными в манифесте, чьё расписание никто не ставил и ни с чем не сверял. Итог замерен
 * 14.09.2026: на новом проде не было НИ ОДНОГО бэкапа боевой базы — скрипт не установлен, строк в
 * `/etc/cron.d` нет, артефактов ноль, — а панель здоровья показывала зелёные строки «Бэкап
 * PostgreSQL», приехавшие внутри восстановленного дампа и описывавшие чужую историю. «Принадлежит
 * скрипту хоста» на деле означало «не принадлежит никому».
 */
export type BackgroundJobScheduleOwner = 'host_cron' | 'resident_scheduler';

/** Чем задание доказывает право на вызов. */
export type BackgroundJobPrincipal = 'internal_job_bearer' | 'integrator_hmac' | 'host_shell';

/**
 * Какую surface identity должен предъявить вызов. `app_public_origin` — Host/Origin/X-Forwarded-Proto
 * строятся из `APP_BASE_URL` того же env-файла; голый loopback `Host` отсекается `proxy.ts` до
 * маршрута (находка B1).
 */
export type BackgroundJobSurfaceIdentity = 'app_public_origin' | 'none';

export type BackgroundJobKind = 'internal_http' | 'resident_scheduler' | 'backup_shell' | 'host_shell';

/** Режимы `deploy/postgres/postgres-backup.sh`, которые вызываются по расписанию. */
export type BackgroundJobBackupMode = 'hourly' | 'daily' | 'weekly' | 'prune';

/**
 * Куда deploy кладёт канонический `deploy/postgres/postgres-backup.sh` на хосте. Путь один для всех
 * сред: каталог заведён под бэкапы и ничего больше в нём не живёт.
 */
export const BACKUP_SCRIPT_PATH = '/opt/backups/scripts/postgres-backup.sh';

/**
 * Второй бэкап-скрипт хоста: хранилище сертификатов края. Отдельный файл, а не режим первого, по двум
 * причинам — он работает от `root` (хранилище закрыто 0700 на учётку `caddy`, до которой `postgres` не
 * дотягивается) и он не трогает базу вовсе.
 */
export const CADDY_STORE_BACKUP_SCRIPT_PATH = '/opt/backups/scripts/caddy-store-backup.sh';
export const OFFSITE_PUSH_SCRIPT_PATH = '/opt/backups/scripts/offsite-push.sh';

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
  /**
   * Режим `postgres-backup.sh`. Только для `kind: 'backup_shell'` — это не HTTP-тик, у него нет
   * маршрута, и общий transport вебаппа его не будит.
   */
  readonly backupMode?: BackgroundJobBackupMode;
  /**
   * Свой путь скрипта вместо `BACKUP_SCRIPT_PATH` + режим. Только для `kind: 'backup_shell'`: бэкапов
   * на хосте два, и второй — это другой файл, а не другой аргумент первого.
   */
  readonly backupScriptPath?: string;
  /** Прямая host-команда для `kind: 'host_shell'`; общий HTTP transport её не будит. */
  readonly hostCommand?: string;
  /** Учётка cron, если она не `environment.backupOsUser`. */
  readonly cronUser?: string;
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
    /*
     * Пять минут, а не минута (решение владельца 14.09.2026). Из библиотеки файл пропал в тот
     * момент, когда врач его удалил; здесь дочищается хвост в S3 и в БД, и этого хвоста никто не
     * ждёт. Минутный ритм давал 1440 запусков в сутки — треть всего шума крона на хосте.
     *
     * Порция поднята с 25 до 50 ОДНОВРЕМЕННО с разрежением, потому что пропускная способность равна
     * «порция × число запусков»: 25 в минуту — это 36 000 в сутки, 25 раз в пять минут было бы
     * 7 200, и удалённая папка на тысячу файлов уезжала бы часами. 50 раз в пять минут дают 14 400
     * в сутки — запас против любой реальной уборки.
     *
     * Больше пятидесяти просить бессмысленно: `purgePendingMediaDeleteBatch` сама режет порцию
     * пятьюдесятью, и эта граница держит длительность одного захода внутри `timeoutSec`, потому что
     * строки удаляются по одной, каждая со своими обращениями в S3.
     */
    scheduleHint: 'каждые пять минут',
    cron: '*/5 * * * *',
    artifactSlug: 'media-purge',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-pending-delete/purge', query: 'limit=50' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 50,
    staleAfterSec: 15 * 60,
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
    /*
     * М7 (10.09.2026, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): разбор картинок, HEIC и
     * постеров уехал из процесса вебаппа в `apps/media-worker`. Дверь `/api/internal/media-preview/
     * process` и её cron-шаблон сняты вместе с обработчиком — будить в вебаппе больше нечего.
     *
     * Строка осталась и стала честнее: отметку пишет тот, кто делает работу. Резидентный воркер
     * шлёт её через тот же контрольный шов (`preview_tick`) не реже раза в минуту, в том числе в
     * простое. Пустая строка теперь означает «воркер не работает», а не «cron не сработал».
     *
     * Своей двери у строки нет: `POST /api/internal/media-worker/control` — общий шов воркера, он
     * уже объявлен в `INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS`. Продублировать его здесь значило бы
     * стереть границу «manifest ⇄ не-manifest», по которой считается CSRF-исключение.
     */
    kind: 'resident_scheduler',
    scheduleOwner: 'resident_scheduler',
    scheduleHint: 'резидентный media-worker, отметка не реже раза в минуту',
    environments: ['prod', 'test'],
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    staleAfterSec: 3 * 60,
    required: true,
    why: 'Очередь превью ведёт media-worker: без его отметки превью не создаются вовсе.',
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
    id: 'container_restart_watchdog',
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: 'health.container_restart.watch',
    label: 'Перезапуски контейнеров',
    kind: 'host_shell',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 5 мин',
    cron: '*/5 * * * *',
    artifactSlug: 'container-restart-watchdog',
    environments: ['prod'],
    hostCommand: '/opt/therapysto/pipeline/therapysto-container-restart-watchdog',
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 12 * 60,
    required: true,
    optionalNoData: true,
    why: 'Наблюдатель обязан пережить смерть наблюдаемого контейнера, поэтому работает на хосте и пишет рост RestartCount в системный журнал.',
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
    label: 'Домен и сертификат организации',
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
    id: 'media_delivery_bytes_flush',
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_DELIVERY_BYTES_FLUSH_JOB_KEY,
    label: 'HLS delivery bytes flush',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 5 мин',
    cron: '*/5 * * * *',
    artifactSlug: 'media-delivery-bytes-flush',
    environments: ['prod', 'test'],
    route: { method: 'POST', path: '/api/internal/media-delivery-bytes/flush' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 50,
    staleAfterSec: 20 * 60,
    required: true,
    why: 'Единственный писатель media_playback_delivery_daily: сброс in-memory счётчика байт HLS-прокси ' +
      '(VIDEO_DELIVERY_COST_AND_METERING 11.09.2026). Без тика посчитанные в памяти байты копятся и никогда ' +
      'не попадают в таблицу.',
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
    label: 'Автопродление тарифа (счета организациям)',
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
    id: 'booking_prepayment_expiry',
    jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY,
    jobKey: OPERATOR_BOOKING_PREPAYMENT_EXPIRY_JOB_KEY,
    label: 'Истечение предоплаты записи',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждую минуту',
    cron: '* * * * *',
    artifactSlug: 'booking-prepayment-expiry',
    environments: ['prod', 'test'],
    route: {
      method: 'POST',
      path: '/api/internal/booking-prepayment/expire',
      query: 'limit=100',
    },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 50,
    staleAfterSec: 5 * 60,
    required: true,
    why: 'PAY-APPT-11: без тика неоплаченное ожидание держит слот вечно, и на это время к врачу ' +
      'не может записаться никто другой. Минутный ритм — потому что срок задаётся в минутах.',
  },
  {
    id: 'backup_hourly',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.hourly',
    label: 'Бэкап PostgreSQL (hourly)',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    /*
     * Не в ноль минут: в ноль на хосте уже сходятся все пятиминутные и десятиминутные задания, а
     * `pg_dump` — единственное из них, которое держит долгую транзакцию и заметную долю диска.
     * Смещение не «на всякий случай», а чтобы час не начинался с очереди.
     */
    scheduleHint: 'ежечасно, в 17 минут',
    cron: '17 * * * *',
    artifactSlug: 'backup-hourly',
    backupMode: 'hourly',
    environments: ['prod'],
    principal: 'host_shell',
    surfaceIdentity: 'none',
    // Три часа, а не час с небольшим: один пропущенный час — это ещё не потеря, а вот два подряд
    // означают, что бэкапы встали, и об этом надо знать.
    staleAfterSec: 3 * 60 * 60,
    required: true,
    why: 'Единственная защита боевой базы от потери. Отсутствие часового бэкапа — авария, а не шум.',
  },
  {
    id: 'backup_daily',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.daily',
    label: 'Бэкап PostgreSQL (daily)',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    scheduleHint: 'ежедневно в 03:40 UTC',
    cron: '40 3 * * *',
    artifactSlug: 'backup-daily',
    backupMode: 'daily',
    environments: ['prod'],
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 28 * 60 * 60,
    required: true,
    why: 'Суточный срез с хранением 35 дней: часовые живут двое суток и от ошибки недельной давности не спасают.',
  },
  {
    id: 'backup_weekly',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.weekly',
    label: 'Бэкап PostgreSQL (weekly)',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    scheduleHint: 'по воскресеньям в 04:10 UTC',
    cron: '10 4 * * 0',
    artifactSlug: 'backup-weekly',
    backupMode: 'weekly',
    environments: ['prod'],
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 8 * 24 * 60 * 60,
    required: true,
    why: 'Недельный срез с хранением 12 недель: дальняя точка возврата, если порча данных вскрылась поздно.',
  },
  {
    id: 'backup_prune',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.prune',
    label: 'Бэкап PostgreSQL (prune)',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    /*
     * После суточного и недельного срезов, а не до них: удаление считает поколения, и считать их
     * надо уже с учётом свежего. Иначе раз в неделю чистка видит на одно поколение меньше, чем есть.
     */
    scheduleHint: 'ежедневно в 04:50 UTC, после суточного и недельного срезов',
    cron: '50 4 * * *',
    artifactSlug: 'backup-prune',
    backupMode: 'prune',
    environments: ['prod'],
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 28 * 60 * 60,
    required: true,
    why: 'Без чистки диск забивается дампами и хост встаёт целиком — отказ уборки тоже авария.',
  },
  {
    id: 'backup_caddy_store',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.caddy_store',
    label: 'Бэкап хранилища сертификатов края',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    // Раньше суточного дампа базы: он короткий и не держит ни долгой транзакции, ни заметной доли диска.
    scheduleHint: 'ежедневно в 03:20 UTC',
    cron: '20 3 * * *',
    artifactSlug: 'backup-caddy-store',
    backupScriptPath: CADDY_STORE_BACKUP_SCRIPT_PATH,
    // Хранилище края закрыто 0700 на учётку `caddy`; `postgres`, от которого идут дампы базы, туда не
    // дотягивается. Отметку в журнале скрипт пишет через `runuser -u postgres`.
    cronUser: 'root',
    environments: ['prod'],
    principal: 'host_shell',
    surfaceIdentity: 'none',
    staleAfterSec: 28 * 60 * 60,
    required: true,
    why: 'Потеря хранилища — не потеря данных, но повторный выпуск упирается в лимит Let\'s Encrypt (50 новых сертификатов в неделю на домен). При десятках клиник это дни без TLS у части из них; копия снимает риск целиком.',
  },
  {
    id: 'backup_offsite_push',
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: 'backup.offsite_push',
    label: 'Отправка бэкапов на отдельный сервер',
    kind: 'backup_shell',
    scheduleOwner: 'host_cron',
    /*
     * Через десять минут после часового дампа: к этому времени артефакт и его контрольная сумма уже
     * опубликованы, и отправлять есть что. Раньше — уехал бы предыдущий набор, а свежий ждал бы час.
     */
    scheduleHint: 'ежечасно, в 27 минут — через десять минут после часового дампа',
    cron: '27 * * * *',
    artifactSlug: 'backup-offsite-push',
    backupScriptPath: OFFSITE_PUSH_SCRIPT_PATH,
    // Каталог дампов закрыт 0700 на `postgres`, копия хранилища края — на `root`. Отправлять надо и
    // то и другое, поэтому задание идёт от root, а отметку в журнале пишет через `runuser -u postgres`.
    cronUser: 'root',
    environments: ['prod'],
    // Три часа — как у часового дампа: один пропуск ещё не потеря, два подряд означают, что копии
    // вне машины нет, а на самой машине бэкапы при этом могут идти и выглядеть здоровыми.
    staleAfterSec: 3 * 60 * 60,
    principal: 'host_shell',
    surfaceIdentity: 'none',
    required: true,
    why: 'Бэкапы лежат на том же диске, что и база: пожар, потеря машины или ошибка раздела уносят ' +
      'базу и её копии одним движением. Отправка наружу — единственное, что это закрывает, и её ' +
      'молчание должно быть аварией, а не тишиной.',
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

/**
 * Чего тревога ОБЯЗАНА ждать от бэкапа: ключ строки и срок, после которого её отсутствие — авария.
 *
 * Тревога обязана идти от ОЖИДАНИЯ, а не от того, что нашлось в журнале. Пока она перебирала только
 * существующие строки `operator_job_status`, бэкап, который не запускался ни разу, не давал строки
 * вовсе — и молчание читалось как «всё хорошо». Ровно это и было на новом проде 14.09.2026.
 */
export function expectedBackupJobs(): readonly {
  jobKey: string;
  label: string;
  staleAfterSec: number;
}[] {
  return BACKGROUND_JOB_MANIFEST.filter(
    (entry) => entry.kind === 'backup_shell' && entry.required,
  ).map((entry) => ({
    jobKey: entry.jobKey,
    label: entry.label,
    staleAfterSec: entry.staleAfterSec,
  }));
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
  if (entry.kind === 'host_shell') {
    if (!entry.hostCommand) throw new Error(`background job ${entry.id} has no hostCommand`);
    return entry.hostCommand;
  }
  if (entry.kind === 'backup_shell') {
    if (entry.backupScriptPath) return entry.backupScriptPath;
    if (!entry.backupMode) throw new Error(`background job ${entry.id} has no backupMode`);
    return `${BACKUP_SCRIPT_PATH} ${entry.backupMode}`;
  }
  return `${internalJobRunnerPath(environment)} ${environment.id} ${entry.id}`;
}

/**
 * Присваивания окружения, которые cron-файл обязан нести ПЕРЕД строкой расписания.
 *
 * Только для бэкапа и только три вещи: на какой машине ему разрешено работать и где лежат два
 * env-файла, из которых он читает `DATABASE_URL`. Значения по умолчанию внутри скрипта указывают на
 * СТАРЫЙ прод (`adelaide`, `/opt/env/bersoncarebot/…`) и на новом хосте неверны все до одного,
 * поэтому среда задаётся здесь явно, а не берётся из умолчаний.
 *
 * Проверка «та ли машина» остаётся именно проверкой: файл сгенерирован для среды `prod`, и если он
 * окажется на любой другой машине, ожидание в нём не совпадёт и бэкап откажется работать — вместо
 * того чтобы молча снять чужую базу в чужой каталог и записать это как успех.
 */
export function renderCronEnvAssignments(
  entry: BackgroundJobManifestEntry,
  environment: BackgroundJobEnvironment,
): readonly string[] {
  if (entry.kind !== 'backup_shell') return [];
  return backupScriptEnvAssignments(environment);
}

/**
 * Те же присваивания отдельно от расписания — их нужен и тот, кто зовёт скрипт вне cron.
 *
 * Такой вызов один: срез ПЕРЕД миграциями внутри самого деплоя. У нового прода его не было вовсе
 * (у старого — был), то есть схема боевой базы менялась без точки возврата. Отдельной копии
 * значений здесь нет намеренно: копия и есть тот механизм, которым расписание разъезжается с кодом.
 */
export function backupScriptEnvAssignments(
  environment: BackgroundJobEnvironment,
): readonly string[] {
  const { backupHostName, backupHostIpv4, backupDatabase } = environment;
  if (!backupHostName || !backupHostIpv4 || !backupDatabase) {
    throw new Error(`environment ${environment.id} has no backup host expectation`);
  }
  return [
    `BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME=${backupHostName}`,
    `BERSONCAREBOT_BACKUP_EXPECT_IPV4=${backupHostIpv4}`,
    `BERSONCAREBOT_BACKUP_DATABASE=${backupDatabase}`,
  ];
}

/**
 * От чьего имени cron запускает задание. Всё, что ходит в вебапп по loopback, запускает `root`;
 * бэкап — `postgres`, потому что его право читать базу целиком даёт именно эта учётка ОС, и никакого
 * другого доказательства (пароля, сертификата) в этом режиме не существует.
 */
export function cronUserFor(
  entry: BackgroundJobManifestEntry,
  environment: BackgroundJobEnvironment,
): string {
  if (entry.kind !== 'backup_shell') return 'root';
  if (entry.cronUser) return entry.cronUser;
  if (!environment.backupOsUser) {
    throw new Error(`environment ${environment.id} has no backup OS user`);
  }
  return environment.backupOsUser;
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
  const transportLines =
    entry.kind === 'backup_shell'
      ? [
          `# Запускается напрямую ${entry.backupScriptPath ?? BACKUP_SCRIPT_PATH} — это не HTTP-тик вебаппа, общий transport`,
          '# run-internal-job.sh его не будит. Скрипт кладёт на хост тот же деплой, что и эту строку.',
        ]
      : entry.kind === 'host_shell'
        ? [
            `# Запускается напрямую ${entry.hostCommand} — это host-сторож, не HTTP-тик вебаппа.`,
            '# Состояние хранится вне контейнеров, чтобы их пересоздание или смерть не убивали наблюдателя.',
          ]
        : [
            `# Host/Origin/X-Forwarded-Proto и env-файл (${environment.envFile}) строит общий transport`,
            '# deploy/host/run-internal-job.sh — cron-строка их не копирует и не знает про branding proxy.',
          ];
  const lines = [
    `# СГЕНЕРИРОВАНО из ${CRON_ARTIFACT_GENERATED_BY}. Руками не править.`,
    '# Перегенерировать: node deploy/host/background-jobs-cli.mjs --write',
    '# Сверить (гейт deploy и CI): node deploy/host/background-jobs-cli.mjs --check',
    '#',
    `# ${entry.label} — среда ${environment.id}.`,
    `# ${entry.why}`,
    `# id=${entry.id} tick=${entry.jobFamily}/${entry.jobKey} ${route}`,
    `# principal=${entry.principal} surface=${entry.surfaceIdentity} timeout=${entry.timeoutSec ? `${entry.timeoutSec}s` : 'нет'} stale_after=${entry.staleAfterSec}s`,
    ...transportLines,
    ...renderCronEnvAssignments(entry, environment),
    `${entry.cron} ${cronUserFor(entry, environment)} ${renderCronCommand(entry, environment)}`,
  ];
  return `${lines.join('\n')}\n`;
}
