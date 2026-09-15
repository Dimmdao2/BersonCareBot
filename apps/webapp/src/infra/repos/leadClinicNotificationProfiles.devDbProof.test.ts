/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт).
 *
 * Оракул — план заявок `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`:
 * §8.8 «уведомлять клинику надо через `relayOutbound`, а не через старый relay заявок: тот брал
 * глобальные `admin_*_ids` из `system_settings`, что в SaaS адресует не тому» и §9.2 «в клинике —
 * пока админ клиники». То есть получатели события «новая заявка» — администраторы ОДНОЙ клиники,
 * и никто за её пределами, а способ доставки берётся у них же.
 *
 * Почему живая база, а не unit с поддельным репозиторием. Здесь ровно два вопроса, и ни на один
 * подделка ответить не может:
 *   1. ПРАВА. Заявку создаёт единственная дверь — публичная, с принципалом ОРГАНИЗАЦИИ. У класса
 *      `tenant_service` реляционного пути к таблицам персонала нет вовсе (замер 15.09: пять чтений
 *      пути, четыре отбиты `Missing declared webapp port capability: tenant_service`). Поддельный
 *      репозиторий отказа прав не воспроизводит — он зеленеет всегда.
 *   2. СТЕНА АРЕНДАТОРА. Она выражена предикатом SQL и политикой RLS. Подделка повторила бы
 *      предикат из самой реализации и зеленела бы вместе с ней.
 *
 * Дорогой молчаливый отказ, ради которого это написано: заявка одной клиники уходит персоналу
 * другой (разглашение контактов обратившегося человека чужой организации) — либо не уходит никому,
 * потому что дверь отбита правами, а вызывающий этого не видит: `service.ts` гасит отказ в
 * `void … .catch(log)`.
 *
 * Следов не оставляет: фикстура заведена под уникальным префиксом `AUDITL4` и снимается в
 * `afterAll`; остаток проверяется отдельным утверждением.
 *
 * Запуск из `apps/webapp` с загруженным DEV-env:
 *   set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
 *   USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_AUDIENCE_DB=1 \
 *     pnpm exec vitest run --project fast src/infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled =
  process.env.USE_REAL_DATABASE === '1' && process.env.RUN_LEAD_CLINIC_AUDIENCE_DB === '1';
const DATABASE = process.env.LEAD_CLINIC_AUDIENCE_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);
if (enabled && !/_dev$|_test$/u.test(DATABASE)) throw new Error(`refusing non-dev database '${DATABASE}'`);

/** Чужая клиника заводится своя: на DEV организация ровно одна, и стену не на чем показать. */
const FOREIGN_ORG = 'a4000000-0000-4000-8000-00000000f0b0';
const OWN_ADMIN = 'a4000000-0000-4000-8000-00000000a001';
const OWN_DOCTOR = 'a4000000-0000-4000-8000-00000000a002';
const OWN_DISABLED_ADMIN = 'a4000000-0000-4000-8000-00000000a003';
const OWN_MERGED_ADMIN = 'a4000000-0000-4000-8000-00000000a004';
const FOREIGN_ADMIN = 'a4000000-0000-4000-8000-00000000b001';
/** Привязка своего админа: способ доставки обязан приехать тем же чтением, что и получатель. */
const OWN_ADMIN_TELEGRAM = 'AUDITL4-tg-own-admin';
const TOPIC_CODE = 'doctor_leads';

function psql(sqlText: string): string {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q', '-h', '/var/run/postgresql',
      '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sqlText, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

type Staff = { platformUserId: string; organizationId: string };

function devStaff(): Staff {
  const out = psql(
    `SELECT member.platform_user_id || '|' || member.organization_id
       FROM public.be_organization_members AS member
      WHERE member.status = 'active' AND member.platform_user_id NOT IN
            ('${OWN_ADMIN}'::uuid, '${OWN_DOCTOR}'::uuid, '${OWN_DISABLED_ADMIN}'::uuid, '${OWN_MERGED_ADMIN}'::uuid)
      LIMIT 1;`,
  );
  const [platformUserId, organizationId] = out.split('|');
  if (!platformUserId || !organizationId) throw new Error('DEV requires an active staff membership');
  return { platformUserId, organizationId };
}

describe.skipIf(!enabled)('профили уведомления о новой заявке на живом DEV', () => {
  let staff: Staff;
  let port: import('@/modules/leads/clinicNotificationProfilesPort').ClinicLeadNotificationProfilesPort;
  let runWithDbOrganizationPrincipal: typeof import('@bersoncare/db-principal').runWithDbOrganizationPrincipal;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbOrganizationPrincipal } = await import('@bersoncare/db-principal'));
    const { createPgClinicLeadNotificationProfilesPort } = await import(
      './pgClinicLeadNotificationProfiles'
    );
    port = createPgClinicLeadNotificationProfilesPort();
    staff = devStaff();
    psql(`
      INSERT INTO public.be_organizations (id, title) VALUES ('${FOREIGN_ORG}'::uuid, 'AUDITL4 чужая клиника');
      INSERT INTO public.platform_users (id, display_name, role) VALUES
        ('${OWN_ADMIN}'::uuid,          'AUDITL4 свой админ',      'admin'),
        ('${OWN_DOCTOR}'::uuid,         'AUDITL4 свой врач',       'doctor'),
        ('${OWN_DISABLED_ADMIN}'::uuid, 'AUDITL4 выключенный',     'admin'),
        ('${OWN_MERGED_ADMIN}'::uuid,   'AUDITL4 слитый',          'admin'),
        ('${FOREIGN_ADMIN}'::uuid,      'AUDITL4 чужой админ',     'admin');
      UPDATE public.platform_users SET merged_into_id = '${OWN_ADMIN}'::uuid WHERE id = '${OWN_MERGED_ADMIN}'::uuid;
      INSERT INTO public.be_organization_members (organization_id, platform_user_id, role, status) VALUES
        ('${staff.organizationId}'::uuid, '${OWN_ADMIN}'::uuid,          'admin',  'active'),
        ('${staff.organizationId}'::uuid, '${OWN_DOCTOR}'::uuid,         'doctor', 'active'),
        ('${staff.organizationId}'::uuid, '${OWN_DISABLED_ADMIN}'::uuid, 'admin',  'disabled'),
        ('${staff.organizationId}'::uuid, '${OWN_MERGED_ADMIN}'::uuid,   'admin',  'active'),
        ('${FOREIGN_ORG}'::uuid,          '${FOREIGN_ADMIN}'::uuid,      'owner',  'active');
      INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id) VALUES
        ('${OWN_ADMIN}'::uuid, 'telegram', '${OWN_ADMIN_TELEGRAM}');
    `);
  });

  afterAll(() => {
    psql(`
      DELETE FROM public.user_channel_bindings WHERE external_id = '${OWN_ADMIN_TELEGRAM}';
      DELETE FROM public.be_organization_members WHERE platform_user_id IN
        ('${OWN_ADMIN}'::uuid, '${OWN_DOCTOR}'::uuid, '${OWN_DISABLED_ADMIN}'::uuid,
         '${OWN_MERGED_ADMIN}'::uuid, '${FOREIGN_ADMIN}'::uuid);
      UPDATE public.platform_users SET merged_into_id = NULL WHERE id = '${OWN_MERGED_ADMIN}'::uuid;
      DELETE FROM public.platform_users WHERE id IN
        ('${OWN_ADMIN}'::uuid, '${OWN_DOCTOR}'::uuid, '${OWN_DISABLED_ADMIN}'::uuid,
         '${OWN_MERGED_ADMIN}'::uuid, '${FOREIGN_ADMIN}'::uuid);
      DELETE FROM public.be_organizations WHERE id = '${FOREIGN_ORG}'::uuid;
    `);
    const residue = psql(`
      SELECT (SELECT count(*) FROM public.be_organizations WHERE id = '${FOREIGN_ORG}'::uuid)
           + (SELECT count(*) FROM public.platform_users WHERE display_name LIKE 'AUDITL4 %')
           + (SELECT count(*) FROM public.be_organization_members WHERE organization_id = '${FOREIGN_ORG}'::uuid)
           + (SELECT count(*) FROM public.user_channel_bindings WHERE external_id = '${OWN_ADMIN_TELEGRAM}');
    `);
    expect(residue, 'фикстура AUDITL4 обязана быть снята с DEV полностью').toBe('0');
  });

  it('под принципалом двери заявки отдаёт получателей вместе со способом доставки', async () => {
    // Л3 создаёт заявку под принципалом ОРГАНИЗАЦИИ. Одним этим чтением обязаны приехать И
    // аудитория, И привязка мессенджера: остальные четыре чтения этому принципалу отбиты правами,
    // и уведомление, которому нечем выбрать канал, не отправляется никому.
    const profiles = await runWithDbOrganizationPrincipal(staff.organizationId, () =>
      port.listForLeadOrganization({ organizationId: staff.organizationId, topicCode: TOPIC_CODE }),
    );
    const ids = profiles.map((profile) => profile.userId);

    expect(ids, 'администратор своей клиники обязан попасть в аудиторию').toContain(OWN_ADMIN);
    // §9.2: врач — не администратор клиники.
    expect(ids, 'врач клиники администратором не является').not.toContain(OWN_DOCTOR);
    expect(ids, 'выключенное членство аудиторией не является').not.toContain(OWN_DISABLED_ADMIN);
    expect(ids, 'слитая учётная запись получателем не является').not.toContain(OWN_MERGED_ADMIN);
    // Стена арендатора: администратор чужой клиники о чужой заявке не узнаёт.
    expect(ids, 'персонал чужой клиники в аудиторию не попадает').not.toContain(FOREIGN_ADMIN);
    expect(
      profiles.find((profile) => profile.userId === OWN_ADMIN)?.telegramId,
      'способ доставки обязан приехать тем же чтением, иначе отправлять нечем',
    ).toBe(OWN_ADMIN_TELEGRAM);
  });

  it('спросить чужую клинику под своим принципалом нельзя', async () => {
    await expect(
      runWithDbOrganizationPrincipal(staff.organizationId, () =>
        port.listForLeadOrganization({ organizationId: FOREIGN_ORG, topicCode: TOPIC_CODE }),
      ),
      'чужая организация не отдаёт своих людей даже по прямому запросу',
    ).rejects.toThrow('lead_notification_organization_mismatch');
  });
});
