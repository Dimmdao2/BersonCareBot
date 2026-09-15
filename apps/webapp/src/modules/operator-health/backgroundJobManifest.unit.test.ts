import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_JOB_ENVIRONMENTS,
  BACKGROUND_JOB_ENVIRONMENT_IDS,
  BACKGROUND_JOB_MANIFEST,
  cronArtifactName,
  cronUserFor,
  findBackgroundJob,
  hostCronJobsForEnvironment,
  internalJobBearerCsrfExemptPaths,
  INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS,
  renderCronArtifact,
  renderCronCommand,
} from '@/modules/operator-health/backgroundJobManifest';
import { CRON_JOB_REGISTRY } from '@/modules/operator-health/cronJobRegistry';
import {
  MANIFEST_CRON_ISOLATION_OPERATIONS,
  resolveCronIsolationOperation,
} from '@/modules/operator-health/cronIsolationOperations';
import { redactSaasIsolationEventInput } from '@/modules/operator-health/saasIsolationDiagnostics';

/**
 * Kill-set этапа 2 сводного аудита 27.08.2026 (B1–B3, E3). Каждый `it` называет поломку, которую
 * ловит: реестр здоровья разошёлся с manifest, задание объявлено без расписания, cron-строка снова
 * копирует Host/Origin по памяти, вывод отправлен в `/dev/null`, dead-man's-switch переехал внутрь
 * наблюдаемого scheduler, семейство заданий выпало из карты isolation telemetry.
 */
describe('background job manifest', () => {
  it('реестр «Здоровье системы» — проекция manifest, а не вторая рукописная копия', () => {
    expect(CRON_JOB_REGISTRY.map((entry) => `${entry.id}:${entry.jobFamily}/${entry.jobKey}`)).toEqual(
      BACKGROUND_JOB_MANIFEST.map((entry) => `${entry.id}:${entry.jobFamily}/${entry.jobKey}`),
    );
  });

  it('internalJobBearerCsrfExemptPaths() покрывает КАЖДЫЙ manifest-route с principal internal_job_bearer (W2)', () => {
    const exempt = new Set(internalJobBearerCsrfExemptPaths());
    const manifestBearerPaths = BACKGROUND_JOB_MANIFEST.filter(
      (entry) => entry.principal === 'internal_job_bearer' && entry.route,
    ).map((entry) => entry.route!.path);
    expect(manifestBearerPaths.length).toBeGreaterThan(0);
    for (const path of manifestBearerPaths) {
      expect(exempt.has(path), `${path}: manifest job route отсутствует в CSRF-исключении`).toBe(true);
    }
    for (const path of INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS) {
      expect(exempt.has(path)).toBe(true);
    }
    // Без дублей между двумя источниками — иначе граница «manifest ⇄ не-manifest» стёрта.
    expect(exempt.size).toBe(manifestBearerPaths.length + INTERNAL_JOB_BEARER_NON_MANIFEST_PATHS.length);
  });

  it('id, tick-ключи и имена artifacts уникальны', () => {
    const ids = BACKGROUND_JOB_MANIFEST.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    const ticks = BACKGROUND_JOB_MANIFEST.map((entry) => `${entry.jobFamily}/${entry.jobKey}`);
    expect(new Set(ticks).size).toBe(ticks.length);

    const artifacts = BACKGROUND_JOB_ENVIRONMENT_IDS.flatMap((envId) =>
      hostCronJobsForEnvironment(envId).map((entry) =>
        cronArtifactName(entry, BACKGROUND_JOB_ENVIRONMENTS[envId]),
      ),
    );
    expect(new Set(artifacts).size).toBe(artifacts.length);
  });

  it('каждое host-cron задание несёт полную запись: cadence, artifact, среда', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner !== 'host_cron') continue;
      expect(entry.cron, `${entry.id}: нет cadence`).toMatch(/^\S+( \S+){4}$/);
      expect(entry.artifactSlug, `${entry.id}: нет artifact`).toBeTruthy();
      expect(entry.environments?.length, `${entry.id}: не объявлена среда`).toBeGreaterThan(0);
    }
  });

  /*
   * Расписание хоста будит два РАЗНЫХ вида работы, и их полнота проверяется раздельно. Пока
   * бэкапы стояли вне манифеста, проверка выше знала только HTTP-тик; перенеся их внутрь, легко
   * было ослабить её до общего знаменателя — и тогда HTTP-задание без маршрута или без timeout
   * проехало бы молча. Поэтому здесь два набора требований, а не один смягчённый.
   */
  it('HTTP-тик несёт маршрут, timeout и принципала двери', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner !== 'host_cron' || entry.kind !== 'internal_http') continue;
      expect(entry.route?.path, `${entry.id}: нет маршрута`).toMatch(/^\/api\//);
      expect(entry.timeoutSec, `${entry.id}: нет timeout`).toBeGreaterThan(0);
      expect(entry.principal).toBe('internal_job_bearer');
      expect(entry.surfaceIdentity).toBe('app_public_origin');
      expect(entry.backupMode, `${entry.id}: HTTP-тик с режимом бэкапа`).toBeUndefined();
    }
  });

  it('бэкап несёт режим скрипта и НЕ несёт HTTP-двери', () => {
    const backups = BACKGROUND_JOB_MANIFEST.filter((entry) => entry.kind === 'backup_shell');
    expect(backups.length, 'задания бэкапа исчезли из манифеста').toBeGreaterThanOrEqual(4);

    for (const entry of backups) {
      expect(entry.scheduleOwner, `${entry.id}: расписание снова вне манифеста`).toBe('host_cron');
      /* Бэкап хоста — это либо режим канонического скрипта базы, либо свой скрипт целиком (бэкап
         хранилища сертификатов края). Одно из двух обязано быть названо: команда без того и другого
         не собирается вовсе. */
      if (entry.backupScriptPath === undefined) {
        expect(entry.backupMode, `${entry.id}: нет ни режима скрипта, ни своего скрипта`).toMatch(
          /^(hourly|daily|weekly|prune)$/,
        );
      }
      expect(entry.route, `${entry.id}: у бэкапа появилась HTTP-дверь`).toBeUndefined();
      expect(entry.principal).toBe('host_shell');
      expect(entry.surfaceIdentity).toBe('none');
    }
  });

  it('задание, которое не будит host cron, не притворяется поставляемым artifact', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner === 'host_cron') continue;
      expect(entry.cron, `${entry.id}: cadence без host cron`).toBeUndefined();
      expect(entry.artifactSlug, `${entry.id}: artifact без host cron`).toBeUndefined();
    }
  });

  it('dead-man’s-switch остаётся внешним host cron, а не тиком наблюдаемого scheduler', () => {
    const deadMen = BACKGROUND_JOB_MANIFEST.filter((entry) => entry.deadMansSwitch);
    expect(deadMen.length).toBeGreaterThan(0);
    for (const entry of deadMen) {
      expect(entry.scheduleOwner, `${entry.id} перенесён внутрь наблюдаемого процесса`).toBe(
        'host_cron',
      );
      expect(entry.kind).toBe('internal_http');
    }
    expect(findBackgroundJob('operator_health_critical')?.deadMansSwitch).toBe(true);
  });

  it('cron-строка не копирует Host/Origin/секрет и не глушит вывод в /dev/null', () => {
    for (const envId of BACKGROUND_JOB_ENVIRONMENT_IDS) {
      const environment = BACKGROUND_JOB_ENVIRONMENTS[envId];
      for (const entry of hostCronJobsForEnvironment(envId)) {
        const command = renderCronCommand(entry, environment);
        expect(command).not.toMatch(/Host:|Origin:|X-Forwarded-Proto|Authorization|curl|INTERNAL_JOB_SECRET/);
        expect(command).not.toContain('/dev/null');
        const expectedCommand =
          entry.kind === 'backup_shell'
            ? (entry.backupScriptPath ??
              `/opt/backups/scripts/postgres-backup.sh ${entry.backupMode}`)
            : entry.kind === 'host_shell'
              ? entry.hostCommand
              : `${environment.projectRoot}/deploy/host/run-internal-job.sh ${envId} ${entry.id}`;
        expect(command).toBe(expectedCommand);

        const artifact = renderCronArtifact(entry, environment);
        // `KEY=value` — не расписание: cron читает их как окружение, и разбор файла их пропускает.
        const scheduleLines = artifact
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#') && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line));
        expect(scheduleLines).toEqual([
          `${entry.cron} ${cronUserFor(entry, environment)} ${command}`,
        ]);
        // Учётка не косметика: право читать базу целиком в этом режиме даёт ИМЕННО она, и `root`
        // здесь означал бы дамп одной из узких ролей рантайма, то есть часть базы под видом бэкапа.
        expect(cronUserFor(entry, environment)).toBe(
          entry.kind === 'backup_shell' ? (entry.cronUser ?? 'postgres') : 'root',
        );
      }
    }
  });

  it('обязательное задание объявлено и на PROD, и на TEST — иначе среда остаётся без будильника', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner !== 'host_cron' || !entry.required) continue;
      // Прямые host-задачи относятся к инфраструктуре нового PROD: TEST не использует его Docker
      // blue/green-контейнеры. Исключение названо по виду задания, а не списком id.
      if (entry.kind === 'backup_shell' || entry.kind === 'host_shell') {
        expect(entry.environments, `${entry.id}: host-задача объявлена не только на PROD`).toEqual([
          'prod',
        ]);
        continue;
      }
      expect(entry.environments, `${entry.id}: обязательное задание без среды`).toEqual([
        'prod',
        'test',
      ]);
    }
  });

  it('реализованные retention-задания получили расписание (находка B2)', () => {
    const scheduled = new Set(hostCronJobsForEnvironment('prod').map((entry) => entry.id));
    for (const id of [
      'hls_proxy_retention',
      'product_analytics_retention',
      'playback_retention',
      'db_journal_retention',
      'media_purge',
      'media_multipart',
      'saas_billing_renewal_tick',
      'operator_health_critical',
    ]) {
      expect(scheduled.has(id), `${id}: объявлено в реестре, но без расписания`).toBe(true);
    }
  });

  /*
   * `media_preview` вышел из host cron (М7, 10.09.2026): очередь превью разбирает резидентный
   * media-worker, дверь и cron-шаблон сняты вместе с обработчиком в вебаппе. Находка B2 от этого
   * не отменяется — она лишь меняет будильник, поэтому проверяется ровно то же: строку кто-то
   * обязан будить в обеих средах и с порогом устаревания. Задание, у которого будильник пропал,
   * снова упадёт здесь.
   */
  it('превью медиа будит резидентный воркер, а не пустота (находка B2 после М7)', () => {
    const preview = findBackgroundJob('media_preview');
    expect(preview, 'media_preview исчез из реестра').toBeDefined();
    expect(preview!.scheduleOwner).toBe('resident_scheduler');
    expect(preview!.environments).toEqual(['prod', 'test']);
    expect(preview!.staleAfterSec).toBeGreaterThan(0);
    expect(preview!.required).toBe(true);
    const cronDelivered = new Set(hostCronJobsForEnvironment('prod').map((entry) => entry.id));
    expect(
      cronDelivered.has('media_preview'),
      'обработчика в вебаппе больше нет, а cron-артефакт всё ещё поставляется',
    ).toBe(false);
  });

  it('isolation telemetry понимает каждое семейство фоновых заданий вебаппа (E3)', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.kind !== 'internal_http') continue;
      const operation = resolveCronIsolationOperation(entry.jobFamily);
      expect(operation, `${entry.jobFamily}: нет операции isolation telemetry`).toBeDefined();
      expect(() =>
        redactSaasIsolationEventInput({
          eventClass: 'rls_denial',
          sourceService: 'cron',
          sourceOperation: operation!,
          explanationStatus: 'unexplained',
        }),
      ).not.toThrow();
    }
    expect(MANIFEST_CRON_ISOLATION_OPERATIONS.maintenance).toBe('cron_maintenance');
    expect(MANIFEST_CRON_ISOLATION_OPERATIONS.saas_billing).toBe('cron_saas_billing');
  });
});
