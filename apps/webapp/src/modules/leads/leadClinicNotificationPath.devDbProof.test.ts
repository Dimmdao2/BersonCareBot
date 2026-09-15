/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт).
 *
 * Оракул — `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8: «уведомлять клинику
 * надо через `relayOutbound`». То есть после создания заявки уведомление обязано ДОЙТИ до отправки,
 * а не отбиться правами на полпути.
 *
 * Предмет здесь — ВСЁ, что `notifyClinicLeadCreated` делает после единственного чтения профилей.
 * Дверь заявки Л3 ставит принципал ОРГАНИЗАЦИИ (класс контекста `tenant_service`), и у этого класса
 * реляционного пути нет: замер 15.09 показал четыре чтения внутри `notifyDoctorPatientMessageToStaff`
 * (`topicChannelPrefs`, `channelPreferences`, `getChannelBindings`, `webPushSubscriptions`), и все
 * четыре отвечали `Missing declared webapp port capability: tenant_service`. Порты здесь НАСТОЯЩИЕ,
 * те же, что даёт `buildAppDeps`: если путь снова к ним пойдёт, отказ приедет живой, а не выдуманный.
 *
 * Сам корень профилей живой базой закрывает `infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts`;
 * здесь профиль подан готовым — ровно так, как его отдаёт корень.
 *
 * Дорогой молчаливый отказ, ради которого файл написан: заявка создана, человек получил «принято»,
 * уведомление упало — и с 15.09 падает МОЛЧА, потому что `service.ts` гасит его в `.catch(log)`.
 * Клиника не узнаёт о заявке никогда, и наружу это не видно ничем.
 *
 * Следов на DEV не оставляет: фикстур нет вовсе — получателем взят несуществующий uuid, у которого
 * заведомо нет ни привязок мессенджеров, ни подписок веб-пуша, поэтому никакая отправка невозможна.
 *
 * Запуск из `apps/webapp` с загруженным DEV-env:
 *   set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
 *   USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_NOTIFY_PATH_DB=1 \
 *     pnpm exec vitest run --project fast src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Lead } from './types';

const enabled =
  process.env.USE_REAL_DATABASE === '1' && process.env.RUN_LEAD_CLINIC_NOTIFY_PATH_DB === '1';
const DATABASE = process.env.LEAD_CLINIC_AUDIENCE_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);
if (enabled && !/_dev$|_test$/u.test(DATABASE)) {
  throw new Error(`refusing non-dev database '${DATABASE}'`);
}

/** Получатель, которого в базе нет: ни привязок, ни подписок — отправить ему физически нечем. */
const UNREACHABLE_RECIPIENT = 'a4000000-0000-4000-8000-00000000c001';

function psql(sqlText: string): string {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q', '-h', '/var/run/postgresql',
      '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sqlText, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

describe.skipIf(!enabled)('путь уведомления о заявке ПОСЛЕ профилей, живой DEV', () => {
  let organizationId: string;
  let runWithDbOrganizationPrincipal: typeof import('@bersoncare/db-principal').runWithDbOrganizationPrincipal;
  let notifyClinicLeadCreated: typeof import('./notifyClinicLeadCreated').notifyClinicLeadCreated;
  let deps: import('./notifyClinicLeadCreated').NotifyClinicLeadCreatedDeps;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbOrganizationPrincipal } = await import('@bersoncare/db-principal'));
    ({ notifyClinicLeadCreated } = await import('./notifyClinicLeadCreated'));
    const [{ createPgTopicChannelPrefsPort }, { pgChannelPreferencesPort },
      { createPgWebPushSubscriptionsPort }, { loadPlatformUserChannelBindings },
      { createPgPatientStaffNotificationProfilesPort }, { createPgStaffUsersPort }] =
      await Promise.all([
        import('@/infra/repos/pgTopicChannelPrefs'),
        import('@/infra/repos/pgChannelPreferences'),
        import('@/infra/repos/pgWebPushSubscriptions'),
        import('@/infra/repos/loadPlatformUserChannelBindings'),
        import('@/infra/repos/pgPatientStaffNotificationProfiles'),
        import('@/infra/repos/pgStaffUsers'),
      ]);
    // Ровно тот набор, что собирает `buildAppDeps` для `notifyClinicLeadCreated`
    // (`doctorPatientMessageStaffDeps`), включая `systemSettings`: его чтение в этом событии не
    // достижимо — `notificationText` задан, правая часть `??` не вычисляется.
    deps = {
      staffUsers: createPgStaffUsersPort(),
      topicChannelPrefs: createPgTopicChannelPrefsPort(),
      channelPreferences: pgChannelPreferencesPort,
      webPushSubscriptions: createPgWebPushSubscriptionsPort(),
      systemSettings: {
        getSetting: async () => {
          throw new Error('systemSettings недостижим для события заявки');
        },
      } as unknown as import('@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff').NotifyDoctorPatientMessageToStaffDeps['systemSettings'],
      getChannelBindings: loadPlatformUserChannelBindings,
      patientStaffNotificationProfiles: createPgPatientStaffNotificationProfilesPort(),
      clinicLeadNotificationProfiles: {
        listForLeadOrganization: async () => [
          {
            userId: UNREACHABLE_RECIPIENT,
            telegramId: null,
            maxId: null,
            hasWebPushSubscription: false,
            channelPreferences: [],
            topicChannelPreferences: [],
          },
        ],
      },
    };
    organizationId = psql(
      `SELECT member.organization_id FROM public.be_organization_members AS member
        WHERE member.status = 'active' LIMIT 1;`,
    );
    if (!organizationId) throw new Error('DEV requires an active organization membership');
  });

  it('уведомление о заявке доходит до отправки под принципалом двери заявки', async () => {
    // §8.8: клинику уведомляет `relayOutbound`. Под принципалом ОРГАНИЗАЦИИ, с профилем, поданным
    // корнем, вызов обязан дойти до решения по каналам и вернуться — получателю нечем отправлять,
    // поэтому отправки не происходит. Отказ здесь означает «заявка принята, клиника не узнала».
    const lead = {
      id: 'audit-l4-path',
      organizationId,
      platformUserId: UNREACHABLE_RECIPIENT,
      submittedEmail: 'audit-l4@example.test',
      messageText: 'живая проба пути уведомления',
      status: 'new',
      sourceSurface: 'public_page',
    } as unknown as Lead;

    await expect(
      runWithDbOrganizationPrincipal(organizationId, () => notifyClinicLeadCreated(lead, deps)),
    ).resolves.toBeUndefined();
  });
});
