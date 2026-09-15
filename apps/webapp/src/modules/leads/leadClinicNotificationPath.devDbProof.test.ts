/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт).
 *
 * Оракул — `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8: «уведомлять клинику
 * надо через `relayOutbound`». То есть после создания заявки уведомление обязано ДОЙТИ до отправки,
 * а не отбиться правами на полпути.
 *
 * Предмет здесь НЕ аудитория (её закрывает `leadClinicAdminAudience.devDbProof.test.ts`), а ВСЁ
 * ОСТАЛЬНОЕ, что `notifyClinicLeadCreated` делает ПОСЛЕ аудитории. Дверь заявки Л3 ставит принципал
 * ОРГАНИЗАЦИИ (класс контекста `tenant_service`), и у этого класса реляционного пути нет: каждое
 * прямое чтение отношений внутри `notifyDoctorPatientMessageToStaff` отбивается тем же отказом, на
 * котором стоял Д1 аудита 15.09.
 *
 * Дорогой молчаливый отказ, ради которого файл написан: заявка создана, человек получил «принято»,
 * уведомление упало — и с 15.09 падает МОЛЧА, потому что `service.ts` гасит его в `.catch(log)`.
 * Клиника не узнаёт о заявке никогда, и наружу это не видно ничем.
 *
 * Следов на DEV не оставляет: фикстур нет вовсе — получателем взят несуществующий uuid, у которого
 * заведомо нет ни привязок мессенджеров, ни подписок веб-пуша, поэтому никакая отправка невозможна
 * даже если чтения пройдут.
 *
 * Запуск из `apps/webapp` с загруженным DEV-env:
 *   set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
 *   USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_NOTIFY_PATH_DB=1 \
 *     pnpm exec vitest run --project fast src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

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

describe.skipIf(!enabled)('путь уведомления о заявке ПОСЛЕ аудитории, живой DEV', () => {
  let organizationId: string;
  let runWithDbOrganizationPrincipal: typeof import('@bersoncare/db-principal').runWithDbOrganizationPrincipal;
  let notifyDoctorPatientMessageToStaff: typeof import('@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff').notifyDoctorPatientMessageToStaff;
  let deps: import('@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff').NotifyDoctorPatientMessageToStaffDeps;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbOrganizationPrincipal } = await import('@bersoncare/db-principal'));
    ({ notifyDoctorPatientMessageToStaff } = await import(
      '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff'
    ));
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
    };
    organizationId = psql(
      `SELECT member.organization_id FROM public.be_organization_members AS member
        WHERE member.status = 'active' LIMIT 1;`,
    );
    if (!organizationId) throw new Error('DEV requires an active organization membership');
  });

  it('уведомление о заявке доходит до отправки под принципалом двери заявки', async () => {
    // §8.8: клинику уведомляет `relayOutbound`. Под принципалом ОРГАНИЗАЦИИ, с уже разрешённой
    // аудиторией, вызов обязан дойти до решения по каналам и вернуть счётчики — получателю нечем
    // отправлять, поэтому все три нуля. Отказ здесь означает «заявка принята, клиника не узнала».
    const result = await runWithDbOrganizationPrincipal(organizationId, () =>
      notifyDoctorPatientMessageToStaff(
        {
          organizationId,
          staffUserIds: [UNREACHABLE_RECIPIENT],
          topicCode: 'doctor_patient_messages',
          messageId: 'lead.created:audit-l4-path',
          senderDisplayName: 'audit-l4@example.test',
          notificationText: 'Новая заявка',
          notificationTitle: 'Новая заявка',
          notificationUrl: 'https://example.test/app/doctor/communications?tab=leads',
          nativeRoute: '/app/doctor/communications',
        },
        deps,
      ),
    );

    expect(result).toEqual({ telegramDelivered: 0, maxDelivered: 0, pushDelivered: 0 });
  });
});
