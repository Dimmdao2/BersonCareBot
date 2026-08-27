import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_JOB_ENVIRONMENTS,
  BACKGROUND_JOB_ENVIRONMENT_IDS,
  BACKGROUND_JOB_MANIFEST,
  cronArtifactName,
  findBackgroundJob,
  hostCronJobsForEnvironment,
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

  it('каждое host-cron задание несёт полную запись: cadence, artifact, среда, route, timeout', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner !== 'host_cron') continue;
      expect(entry.cron, `${entry.id}: нет cadence`).toMatch(/^\S+( \S+){4}$/);
      expect(entry.artifactSlug, `${entry.id}: нет artifact`).toBeTruthy();
      expect(entry.environments?.length, `${entry.id}: не объявлена среда`).toBeGreaterThan(0);
      expect(entry.route?.path, `${entry.id}: нет маршрута`).toMatch(/^\/api\//);
      expect(entry.timeoutSec, `${entry.id}: нет timeout`).toBeGreaterThan(0);
      expect(entry.principal).toBe('internal_job_bearer');
      expect(entry.surfaceIdentity).toBe('app_public_origin');
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
        expect(command).toBe(
          `${environment.projectRoot}/deploy/host/run-internal-job.sh ${envId} ${entry.id}`,
        );

        const artifact = renderCronArtifact(entry, environment);
        const scheduleLines = artifact
          .split('\n')
          .filter((line) => line.trim() && !line.trim().startsWith('#'));
        expect(scheduleLines).toEqual([`${entry.cron} root ${command}`]);
      }
    }
  });

  it('обязательное задание объявлено и на PROD, и на TEST — иначе среда остаётся без будильника', () => {
    for (const entry of BACKGROUND_JOB_MANIFEST) {
      if (entry.scheduleOwner !== 'host_cron' || !entry.required) continue;
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
      'media_preview',
      'saas_billing_renewal_tick',
      'operator_health_critical',
    ]) {
      expect(scheduled.has(id), `${id}: объявлено в реестре, но без расписания`).toBe(true);
    }
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
