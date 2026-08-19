import { describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { runWithInfraPrincipal } from '../../infra/principal/organizationPrincipal.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

/**
 * `app.read_integrator_google_calendar_setting` — арендная возможность: подключение календаря и
 * refresh-токен принадлежат клинике, и корень сверяет `organization_id` точно. Проба оператора
 * приходит к той же двери под инфраструктурным принципалом планировщика, где корень не исполним;
 * пустой `catch` в `readConfigFromDb` превращал этот отказ в «календарь у клиники не подключён».
 */
const seenPrincipals: Array<string | undefined> = [];

function recordPrincipal(): void {
  const principal = getCurrentDbPrincipal();
  seenPrincipals.push(
    principal?.kind === 'organization' ? `organization:${principal.organizationId}` : principal?.kind,
  );
}

vi.mock('../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: vi.fn(), tx: vi.fn() }),
}));
vi.mock('../../infra/db/publicSystemSettings.js', () => ({
  fetchIntegratorGoogleCalendarGlobalSettingString: async () => {
    recordPrincipal();
    return 'client-id';
  },
  fetchIntegratorGoogleCalendarOrganizationSettingString: async (
    _db: unknown,
    key: string,
  ): Promise<string> => {
    recordPrincipal();
    return key === 'google_calendar_enabled' ? 'true' : 'clinic-calendar';
  },
  listGoogleCalendarProbeOrganizationIdsViaCapability: async () => [ORGANIZATION_ID],
}));
vi.mock('../../infra/db/platformIntegrationAvailability.js', () => ({
  isPlatformIntegrationAvailable: async () => true,
}));

describe('google calendar clinic config principal', () => {
  it('дано: проба оператора под принципалом планировщика → тогда конфигурация клиники читается в контексте ЭТОЙ клиники, а не платформы', async () => {
    seenPrincipals.length = 0;
    const { getGoogleCalendarConfig } = await import('./runtimeConfig.js');

    const config = await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, () =>
      getGoogleCalendarConfig(ORGANIZATION_ID),
    );

    expect(config.calendarId).toBe('clinic-calendar');
    expect(config.enabled).toBe(true);
    expect(new Set(seenPrincipals)).toEqual(new Set([`organization:${ORGANIZATION_ID}`]));
  });
});
