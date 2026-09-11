/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт). #1102, S-01/S-03/S-05.
 *
 * Оракул — слова владельца 11.09 из плана
 * `docs/_TODO/SERVICE_IS_ENABLED_ONLY_WHEN_SOMEBODY_DOES_IT_2026-09-11.md`, НЕ реализация:
 *  §1.1 «Если он добавил услугу, значит, она его… Ему вообще нигде себя выбирать не надо» —
 *       услуга обязана оказаться привязанной сама, во ВСЕХ активных филиалах;
 *  §2 «Услугу мы можем включить галочкой или выключить… не меняя её настроек и привязок» —
 *       автоматика не имеет права отменять то, что клиника сняла руками;
 *  §2.1 «пока она не назначена специалисту и не подключена к филиалу, в котором этот специалист
 *       работает» — выключенный специалист и выключенный филиал пересечения не дают.
 *
 * Почему именно живая база, а не unit с поддельным репозиторием: все три поломки выражаются
 * ПРЕДИКАТОМ SQL-запроса (какие строки попали в «уже есть», какие join-ы отбирают пересечение).
 * Подделка базы воспроизвела бы предикат из самой реализации и зеленела бы вместе с ней.
 *
 * Дорогие молчаливые отказы, ради которых это написано:
 *  1. клиника сняла услугу в филиале, а следующее действие подняло галку обратно — клиника об
 *     этом не узнаёт и продолжает принимать записи туда, где услугу не делает;
 *  2. услуга создана, но не привязана — кабинет показывает её включённой, а записаться нельзя;
 *  3. кабинет считает исполнителем выключенного специалиста или выключенный филиал — кабинет и
 *     мастер записи начинают говорить о одной услуге разное.
 *
 * Следов не оставляет: фикстура заведена под уникальным префиксом `AUDIT1102` и снимается в
 * `afterAll`; остаток проверяется отдельным утверждением.
 *
 * Запуск из `apps/webapp` с загруженным DEV-env:
 *   set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
 *   USE_REAL_DATABASE=1 RUN_SOLO_SERVICE_COVERAGE_DB=1 \
 *     pnpm exec vitest run --project unit src/infra/repos/soloServiceCoverage.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled =
  process.env.USE_REAL_DATABASE === '1' && process.env.RUN_SOLO_SERVICE_COVERAGE_DB === '1';
const DATABASE = process.env.SOLO_SERVICE_COVERAGE_DB ?? 'bcb_webapp_dev';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) throw new Error(`unsafe database '${DATABASE}'`);

/** Фикстура живёт в уже существующей организации DEV: RLS-принципал ставится её членом. */
const SERVICE_ID = 'a1102000-0000-4000-8000-000000000011';
const SPECIALIST_ID = 'a1102000-0000-4000-8000-000000000021';
const BRANCH_ON = 'a1102000-0000-4000-8000-000000000031';
const BRANCH_OFF = 'a1102000-0000-4000-8000-000000000041';

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
      WHERE member.status = 'active' LIMIT 1;`,
  );
  const [platformUserId, organizationId] = out.split('|');
  if (!platformUserId || !organizationId) throw new Error('DEV requires an active staff membership');
  return { platformUserId, organizationId };
}

/** Активные филиалы организации ГЛАЗАМИ базы — ожидание не строится из кода автоматики. */
function activeBranchIds(organizationId: string): string[] {
  return psql(
    `SELECT id FROM public.be_branches
      WHERE organization_id = '${organizationId}'::uuid AND is_active ORDER BY id;`,
  )
    .split('\n')
    .filter(Boolean);
}

function coverageRows(): { branchId: string; isActive: boolean }[] {
  const out = psql(
    `SELECT branch_id || '|' || is_active FROM public.be_specialist_service_availability
      WHERE service_id = '${SERVICE_ID}'::uuid ORDER BY branch_id;`,
  );
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [branchId, active] = line.split('|');
      return { branchId: branchId!, isActive: active === 't' };
    });
}

describe.skipIf(!enabled)('соло-автоматика и отбор «услугу кто-то делает» на живой DEV', () => {
  let staff: Staff;
  let port: ReturnType<typeof import('./pgBookingEngine').createPgBookingEnginePort>;
  let runWithDbStaffPrincipal: typeof import('@bersoncare/db-principal').runWithDbStaffPrincipal;

  beforeAll(async () => {
    // vitest.setup.ts возвращает герметичным наборам legacy-guc; живое доказательство обязано
    // загрузить настоящий Drizzle-порт уже после восстановления канонической границы DEV.
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbStaffPrincipal } = await import('@bersoncare/db-principal'));
    const { createPgBookingEnginePort } = await import('./pgBookingEngine');
    port = createPgBookingEnginePort();
    staff = devStaff();
    psql(`
      INSERT INTO public.be_specialists (id, organization_id, full_name, is_active, sort_order)
        VALUES ('${SPECIALIST_ID}'::uuid, '${staff.organizationId}'::uuid, 'AUDIT1102 специалист', true, 0);
      INSERT INTO public.be_branches (id, organization_id, title, city_code, is_active, sort_order)
        VALUES ('${BRANCH_ON}'::uuid,  '${staff.organizationId}'::uuid, 'AUDIT1102 открытый', 'audit1102on',  true,  0),
               ('${BRANCH_OFF}'::uuid, '${staff.organizationId}'::uuid, 'AUDIT1102 закрытый', 'audit1102off', false, 0);
      INSERT INTO public.be_clinic_services
        (id, organization_id, title, duration_minutes, price_minor, is_active, public_widget_visible, admin_manual_only, sort_order)
        VALUES ('${SERVICE_ID}'::uuid, '${staff.organizationId}'::uuid, 'AUDIT1102 услуга', 30, 100000, true, true, false, 0);
    `);
  });

  afterAll(() => {
    psql(`
      DELETE FROM public.be_specialist_service_availability
       WHERE service_id = '${SERVICE_ID}'::uuid OR specialist_id = '${SPECIALIST_ID}'::uuid;
      DELETE FROM public.be_clinic_services WHERE id = '${SERVICE_ID}'::uuid;
      DELETE FROM public.be_specialists WHERE id = '${SPECIALIST_ID}'::uuid;
      DELETE FROM public.be_branches WHERE id IN ('${BRANCH_ON}'::uuid, '${BRANCH_OFF}'::uuid);
    `);
    const residue = psql(`
      SELECT (SELECT count(*) FROM public.be_specialist_service_availability
               WHERE service_id = '${SERVICE_ID}'::uuid OR specialist_id = '${SPECIALIST_ID}'::uuid)
           + (SELECT count(*) FROM public.be_clinic_services WHERE id = '${SERVICE_ID}'::uuid)
           + (SELECT count(*) FROM public.be_specialists WHERE id = '${SPECIALIST_ID}'::uuid)
           + (SELECT count(*) FROM public.be_branches WHERE id IN ('${BRANCH_ON}'::uuid, '${BRANCH_OFF}'::uuid));
    `);
    expect(residue, 'фикстура AUDIT1102 обязана быть снята с DEV полностью').toBe('0');
  });

  it('созданная услуга привязывается сама во всех активных филиалах и ни в одном выключенном', async () => {
    await runWithDbStaffPrincipal(
      { organizationId: staff.organizationId, platformUserId: staff.platformUserId, source: 'audit-1102' },
      () =>
        port.ensureSoloServiceCoverage({
          organizationId: staff.organizationId,
          specialistId: SPECIALIST_ID,
          serviceId: SERVICE_ID,
        }),
    );

    const covered = coverageRows().map((row) => row.branchId).sort();
    // Ожидание взято из базы, а не из кода автоматики: «все его активные филиалы» (§1.1).
    expect(covered).toEqual(activeBranchIds(staff.organizationId));
    // Названо отдельно: филиал, который клиника закрыла, обещал бы запись туда, где не принимают.
    expect(covered, 'выключенный филиал не покрывается').not.toContain(BRANCH_OFF);
  });

  it('снятую руками галку повторный проход автоматики НЕ воскрешает и не дублирует строкой', async () => {
    psql(`UPDATE public.be_specialist_service_availability SET is_active = false
           WHERE service_id = '${SERVICE_ID}'::uuid AND branch_id = '${BRANCH_ON}'::uuid;`);
    const before = coverageRows();

    await runWithDbStaffPrincipal(
      { organizationId: staff.organizationId, platformUserId: staff.platformUserId, source: 'audit-1102' },
      () =>
        port.ensureSoloServiceCoverage({
          organizationId: staff.organizationId,
          specialistId: SPECIALIST_ID,
          serviceId: SERVICE_ID,
        }),
    );

    const after = coverageRows();
    // Воскресшая галка — самая дорогая поломка этапа: клиника снимает услугу в филиале, а
    // следующее её действие возвращает услугу обратно, и клиника об этом не узнаёт.
    expect(
      after.find((row) => row.branchId === BRANCH_ON)?.isActive,
      'снятая клиникой пара обязана остаться снятой',
    ).toBe(false);
    // Вторая форма того же воскрешения: не поднять старую строку, а положить рядом новую живую.
    expect(after.length, 'дубль пары вернул бы услугу в филиал мимо снятой галки').toBe(
      before.length,
    );
  });

  it('исполнителем считается только живая пара с активным специалистом и активным филиалом', async () => {
    const doersFor = async () => {
      const rows = await runWithDbStaffPrincipal(
        { organizationId: staff.organizationId, platformUserId: staff.platformUserId, source: 'audit-1102' },
        () => port.listServiceDoerIntersections(staff.organizationId),
      );
      return rows.filter((row) => row.serviceId === SERVICE_ID).map((row) => row.branchId).sort();
    };

    // Своя пара возвращается на место — дальше трогаем ТОЛЬКО фикстуру AUDIT1102: живые филиалы
    // DEV делятся с соседним клоном, и выключать их ради проверки нельзя.
    psql(`UPDATE public.be_specialist_service_availability SET is_active = true
           WHERE service_id = '${SERVICE_ID}'::uuid AND branch_id = '${BRANCH_ON}'::uuid;`);
    expect(await doersFor()).toContain(BRANCH_ON);

    // Выключенный специалист: услугу физически некому оказывать, кабинет обязан это увидеть —
    // иначе он покажет включаемую услугу, которой в мастере записи уже нет.
    psql(`UPDATE public.be_specialists SET is_active = false WHERE id = '${SPECIALIST_ID}'::uuid;`);
    expect(await doersFor(), 'выключенный специалист исполнителем не является').toEqual([]);
    psql(`UPDATE public.be_specialists SET is_active = true WHERE id = '${SPECIALIST_ID}'::uuid;`);

    // Закрытый филиал — тот же класс с другой стороны тройного «И» (§2.1).
    psql(`UPDATE public.be_branches SET is_active = false WHERE id = '${BRANCH_ON}'::uuid;`);
    expect(await doersFor(), 'закрытый филиал исполнителем не является').not.toContain(BRANCH_ON);
    psql(`UPDATE public.be_branches SET is_active = true WHERE id = '${BRANCH_ON}'::uuid;`);
  });
});
