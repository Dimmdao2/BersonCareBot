import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseWebappEnv,
  resolveWebappDbPrincipalContextMode,
  webappRuntimeDatabaseIsConfigured,
} from './env';

describe('webappRuntimeDatabaseIsConfigured', () => {
  it('uses APP_BASE_URL for the patient origin when PATIENT_APP_ORIGIN is absent', () => {
    expect(
      parseWebappEnv({
        APP_BASE_URL: 'https://staff.example.test',
      }).PATIENT_APP_ORIGIN,
    ).toBe('https://staff.example.test');
  });

  it('keeps an explicitly configured patient origin', () => {
    expect(
      parseWebappEnv({
        APP_BASE_URL: 'https://staff.example.test',
        PATIENT_APP_ORIGIN: 'https://patient.example.test',
      }).PATIENT_APP_ORIGIN,
    ).toBe('https://patient.example.test');
  });

  it('recognizes port-context without the removed aggregate DATABASE_URL', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'port-context',
        DATABASE_URL: '',
        DATABASE_URL_STAFF: 'postgresql://staff@db/app',
        DATABASE_URL_PATIENT: 'postgresql://patient@db/app',
        DATABASE_URL_GLOBAL_ADMIN: 'postgresql://global@db/app',
      }),
    ).toBe(true);
  });

  it('fails closed when any port-context pool is missing', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'port-context',
        DATABASE_URL: '',
        DATABASE_URL_STAFF: 'postgresql://staff@db/app',
        DATABASE_URL_PATIENT: 'postgresql://patient@db/app',
        DATABASE_URL_GLOBAL_ADMIN: '',
      }),
    ).toBe(false);
  });

  it('keeps the legacy aggregate URL contract outside port-context', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'locked',
        DATABASE_URL: 'postgresql://legacy@db/app',
        DATABASE_URL_STAFF: '',
        DATABASE_URL_PATIENT: '',
        DATABASE_URL_GLOBAL_ADMIN: '',
      }),
    ).toBe(true);
  });
});

describe('patient application origin from deploy config', () => {
  const INJECTED_ORIGIN = 'https://patient-deploy.example.test';

  /**
   * Прогоняет тело с подменённым окружением и БЕЗ каких-либо DB-переменных: если бы имя или origin
   * требовали строки в базе, здесь бы не хватало ни соединения, ни данных.
   */
  async function withDeployConfig<T>(fn: () => Promise<T>): Promise<T> {
    const saved = { ...process.env };
    const dbKeys = Object.keys(process.env).filter(
      (k) => k.startsWith('DATABASE_URL') || k.startsWith('DB_PRINCIPAL'),
    );
    for (const k of dbKeys) delete process.env[k];
    process.env.APP_BASE_URL = INJECTED_ORIGIN;
    delete process.env.PATIENT_APP_ORIGIN;
    vi.resetModules();
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(process.env)) delete process.env[k];
      Object.assign(process.env, saved);
      vi.resetModules();
    }
  }

  it('origin пациентской поверхности берётся только из APP_BASE_URL, без второй константы', async () => {
    await withDeployConfig(async () => {
      const { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } = await import('./productSurfaces');
      expect(PATIENT_DEFAULT_SURFACE.origin).toBe(INJECTED_ORIGIN);
      expect(STAFF_SURFACE.origin).toBe(INJECTED_ORIGIN);

      // Отдельный host для пациента — то же окружение, второго механизма нет.
      process.env.PATIENT_APP_ORIGIN = 'https://split-patient.example.test';
      vi.resetModules();
      const split = await import('./productSurfaces');
      expect(split.PATIENT_DEFAULT_SURFACE.origin).toBe('https://split-patient.example.test');
      expect(split.STAFF_SURFACE.origin).toBe(INJECTED_ORIGIN);
    });
  });
});

describe('resolveWebappDbPrincipalContextMode', () => {
  // Поломка: продуктовый рантайм webapp стартует без `DB_PRINCIPAL_CONTEXT_MODE=port-context` и молча
  // уходит на старую модель принципал→роль — организация и внутренний cron становятся `app_staff` с
  // очищенным контекстом клиники (A3 системного аудита 27.08). Отказ дорогой и молчаливый: узкие роли
  // обходятся не ошибкой конфигурации, а её отсутствием, и снаружи это выглядит рабочим приложением.
  const product = { isTestEnv: false, isBuildPhase: false };

  it('accepts the one runtime mode the product is allowed to start in', () => {
    expect(resolveWebappDbPrincipalContextMode({ mode: 'port-context', ...product })).toBe('port-context');
  });

  it('refuses to start the product runtime when the mode is absent', () => {
    expect(() => resolveWebappDbPrincipalContextMode({ mode: undefined, ...product }))
      .toThrow(/requires DB_PRINCIPAL_CONTEXT_MODE=port-context, got <unset>/);
  });

  it.each(['legacy-guc', 'shadow', 'locked', 'port_context', ' '])(
    'refuses to start the product runtime on the legacy mode %j',
    (mode) => {
      expect(() => resolveWebappDbPrincipalContextMode({ mode, ...product }))
        .toThrow(/requires DB_PRINCIPAL_CONTEXT_MODE=port-context/);
    },
  );

  it('lets a test harness name a legacy mode explicitly', () => {
    expect(
      resolveWebappDbPrincipalContextMode({ mode: 'legacy-guc', isTestEnv: true, isBuildPhase: false }),
    ).toBe('legacy-guc');
  });

  it('does not judge next build, which has no runtime environment at all', () => {
    expect(
      resolveWebappDbPrincipalContextMode({ mode: undefined, isTestEnv: false, isBuildPhase: true }),
    ).toBe('port-context');
  });
});

describe('webapp product runtime startup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const productionEnv = () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST_WORKER_ID', '');
    vi.stubEnv('SESSION_COOKIE_SECRET', 'production-session-secret-value');
    vi.stubEnv('INTEGRATOR_WEBAPP_ENTRY_SECRET', 'production-entry-secret-value');
    vi.stubEnv('INTEGRATOR_WEBHOOK_SECRET', 'production-webhook-secret-value');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
  };

  // Поломка: строку `DB_PRINCIPAL_CONTEXT_MODE` забыли или опечатали на проде — приложение стартует и
  // выбирает старый путь принципал→роль. Тест грузит НАСТОЯЩИЙ модуль окружения, а не свою копию
  // правила, поэтому он краснеет, если разрешающая ветка вернётся в продукт.
  it('refuses to load without an explicit port-context mode', async () => {
    productionEnv();
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', undefined);
    vi.resetModules();

    await expect(import('./env')).rejects.toThrow(/DB_PRINCIPAL_CONTEXT_MODE=port-context, got <unset>/);
  });

  it('refuses to load on the legacy principal-to-role mode', async () => {
    productionEnv();
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', 'legacy-guc');
    vi.resetModules();

    await expect(import('./env')).rejects.toThrow(/legacy principal-to-role mapping is not a runtime fallback/);
  });

  it('loads under the one declared runtime mode', async () => {
    productionEnv();
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', 'port-context');
    vi.resetModules();

    await expect(import('./env')).resolves.toBeDefined();
  });
});
