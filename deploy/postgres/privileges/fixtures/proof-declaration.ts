/**
 * proof-declaration.ts — ПРУФ-ФИКСТУРА генератора (SCHEME §B, приёмка Ф2.3).
 *
 * Это НЕ производственная декларация. Это МИНИМАЛЬНАЯ декларация той же ФОРМЫ
 * (`PrivilegeDeclaration` из `../declaration.ts`), которая:
 *   1) воспроизводит ДВА РЕАЛЬНЫХ дефекта живой базы на одноразовом кластере:
 *      • `public.phone_challenges` — ОТП входа лежит открытым текстом (`code`), RLS выкл.,
 *        политик 0, а арендная роль `app_staff` держит ПРЯМОЙ табличный грант: терминал
 *        персонала любой клиники читает коды входа всех пользователей
 *        (FINDINGS_TABLES.md «часть 3, Н2»: `SET ROLE app_staff` без принципала → 4 строки;
 *        контракт кода нарушен явно — `pgPublicBookingOtp.ts:6-8` требует «EXECUTE на функцию
 *        и НИЧЕГО на public.phone_challenges»);
 *      • `public.be_organization_members` — org-таблица с `relrowsecurity=false`
 *        (FACTS §1.2-1.3, «живая 2-клеточная утечка»);
 *   2) НЕ имеет ни одного пробела — то есть генератор обязан на ней отработать
 *      (на производственной декларации он сегодня отказывает: 33 места, GAP G2/G3/G8).
 *
 * Цель декларации = «снятое состояние МИНУС дефекты» (SCHEME §H.1):
 *   • `phone_challenges`: у арендных ролей НОЛЬ табличных прав; путь — только definer-аксессор
 *     (`app.public_booking_otp_issue`), поэтому запрос без прав даёт ГРОМКИЙ 42501, а не тихий ноль.
 *     `rls: 'off'` — ЖИВАЯ правда, записанная явно (§A.4 «явно объявленное отсутствие, а не
 *     молчание»); нужен ли поверх RLS+FORCE как backstop — открытый вопрос владельца И1
 *     (FINDINGS_TABLES.md), и фикстура его НЕ решает за владельца.
 *   • `be_organization_members`: `rls: 'force'` + org-политика — цель FACTS §1.2.
 *
 * База называется `bcb_privproof` — одноразовая, создаётся `proof-setup.sql` на временном
 * кластере. Ни TEST, ни dev, ни прод этой фикстурой не затрагиваются.
 */

import type {
  DatabaseDecl,
  LoginRecord,
  PrivilegeDeclaration,
  RoleDecl,
} from '../types.ts';

const roles: Record<string, RoleDecl> = {
  app_staff: {
    kind: 'terminal', scope: 'ORG',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
  },
  app_patient: {
    kind: 'terminal', scope: 'OWN',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
  },
  app_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: false,
    inherit: false, createrole: false, rolconfig: null,
    members: [], // ноль членов в стационаре (SCHEME §C)
  },
  app_migration_phase: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
    members: [],
    why: 'маркер фазы миграций (SCHEME §E); в пруфе доказывает, что roles-install создаёт роль с нуля',
  },
  postgres: {
    kind: 'superuser', scope: 'GLOBAL',
    login: true, superuser: true, bypassrls: true, inherit: true, createrole: true,
    rolconfig: null,
    why: 'кластерный суперпользователь: объявлен для сверки §F, генератором НЕ управляется',
  },
};

const envMapping: Record<string, Record<string, LoginRecord>> = {
  proof: {
    bcb_proof_migrator: {
      canonicalRole: null,
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_PROOF_MIGRATOR',
      rolconfig: ['search_path=public, integrator'], // байт-в-байт как на TEST (пробел после запятой)
      connect: ['bcb_privproof'],
      why: 'мигратор-логин = datdba одноразовой базы',
    },
    bcb_proof_staff_login: {
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_PROOF_STAFF',
      rolconfig: null,
      connect: ['bcb_privproof'],
    },
  },
};

const db_bcb_privproof: DatabaseDecl = {
  database: {
    owner: 'bcb_proof_migrator',
    connect: ['bcb_proof_migrator', 'bcb_proof_staff_login'],
    publicConnectTempDefect: true, // PUBLIC=Tc — неявный дефолт, §D.1 его снимает
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: ['app_staff', 'app_patient'],
      create: ['app_owner'],
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: ['=PUBLIC', 'app_staff', 'app_patient', 'app_owner'],
      create: ['pg_database_owner'],
      publicDefect: true, // PUBLIC USAGE — цель §D.2 его снимает
    },
    app_control: {
      owner: 'postgres', present: false,
      usage: [], create: ['postgres'],
      why: 'схема стены — её строит шаг wall-install (§B шаг 3), генератор её ACL не трогает',
    },
  },

  tables: {
    // ── ДЕФЕКТ №1 (FINDINGS_TABLES.md, часть 3, Н2) ──
    'public.phone_challenges': {
      org: false, // организации у таблицы нет — это глобальная таблица входа
      rls: 'force',
      owner: 'migrator',
      grants: {
        // ЦЕЛЬ: у арендных ролей НИ ОДНОГО табличного права. Путь персонала — только
        // EXECUTE на definer-аксессор (см. definerExceptions ниже).
        app_owner: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], // владелец definer-аксессоров (0245:64)
      },
      policies: [{
        name: 'phone_challenges_context_gate', as: 'RESTRICTIVE', cmd: 'ALL', to: ['PUBLIC'],
        using: 'app.current_org_id() IS NOT NULL', withCheck: 'app.current_org_id() IS NOT NULL',
      }],
      drift: 'ЖИВОЕ: app_staff=arwd на таблице с ОТП открытым текстом. ЦЕЛЬ: ноль табличных прав '
        + 'арендным ролям — запрос без прав обязан дать громкий 42501, а не тихий ноль.',
    },
    // ── таблица с последовательностью: доказывает правило §A.4 (INSERT/UPDATE ⇒ USAGE на *_id_seq).
    //    Гранты подтверждены переписью (evidence/13 §2.5: `public.integrator_push_outbox_id_seq`
    //    → app_staff USAGE,SELECT — значит, INSERT на самой таблице у app_staff есть).
    'public.integrator_push_outbox': {
      org: false, // organization_id колонки нет (apps/webapp/db/schema/schema.ts:3197-3217)
      rls: 'force',
      owner: 'migrator',
      grants: {
        app_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        app_owner: ['SELECT'],
      },
      policies: [
        { name: 'integrator_push_outbox_context_gate', as: 'RESTRICTIVE', cmd: 'ALL', to: ['PUBLIC'],
          using: 'app.current_org_id() IS NOT NULL', withCheck: 'app.current_org_id() IS NOT NULL' },
        { name: 'integrator_push_outbox_staff', as: 'PERMISSIVE', cmd: 'ALL', to: ['app_staff'],
          using: 'true', withCheck: 'true' },
      ],
    },
    // ── ДЕФЕКТ №2 (FACTS §1.2-1.3) ──
    'public.be_organization_members': {
      org: true,
      rls: 'force', // ЖИВОЕ relrowsecurity=false — RLS-флаги суть статьи генерата (§B)
      owner: 'migrator',
      grants: {
        app_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        app_owner: ['SELECT', 'INSERT', 'UPDATE'],
      },
      policies: [{
        name: 'be_organization_members_context_gate', as: 'RESTRICTIVE', cmd: 'ALL', to: ['PUBLIC'],
        using: 'app.current_org_id() IS NOT NULL', withCheck: 'app.current_org_id() IS NOT NULL',
      }, {
        name: 'be_organization_members_staff_org',
        as: 'PERMISSIVE', cmd: 'ALL', to: ['app_staff'],
        using: 'organization_id = app.current_org_id()',
        withCheck: 'organization_id = app.current_org_id()',
      }],
      drift: 'ЖИВОЕ: RLS выключен → доктор чужой клиники видит чужие членства. ЦЕЛЬ: RLS+FORCE + org-политика.',
    },
  },

  sequences: {
    rule: 'Роль с INSERT/UPDATE на таблице получает USAGE,SELECT на её последовательностях (SCHEME §A.4).',
    examples: {},
  },

  functionsViews: {
    default: 'Дефолтного EXECUTE нет; представлений в пруф-базе нет.',
    views: {},
  },

  types: {},

  definerExceptions: {
    defaults: {
      schema: 'app',
      securityDefiner: true,
      owner: 'app_owner',
      searchPath: ['search_path=pg_catalog'],
      publicExecute: false,
      coveredCount: 0,
      rule: 'Каждая SECURITY DEFINER функция схемы app, не названная исключением, обязана иметь '
        + 'владельца app_owner и ноль PUBLIC EXECUTE (SCHEME §A.7/§D.5).',
    },
    // ⚠ Обе definer-функции пруфа перечислены здесь, потому что EXECUTE-гранты форма декларации
    //    умеет нести ТОЛЬКО в записи исключения (у блока `defaults` поля ACL нет) — см. отчёт Ф2.3.
    proconfigExceptions: {
      'app.current_org_id()': {
        owner: 'app_owner',
        searchPath: ['search_path=pg_catalog'],
        execute: ['app_staff', 'app_patient'],
        why: 'аксессор принципала: читает GUC контекста; нужен политикам org-таблиц',
      },
      'app.public_booking_otp_issue(text)': {
        owner: 'app_owner',
        searchPath: ['search_path=app, pg_catalog'],
        execute: ['app_staff'],
        why: 'ШТАТНЫЙ путь к phone_challenges: роль получает EXECUTE на функцию и НИЧЕГО на таблицу '
          + '(контракт pgPublicBookingOtp.ts:6-8)',
      },
    },
    ownershipExceptions: { intentional: {}, drift: {} },
  },

  creators: ['postgres', 'bcb_proof_migrator', 'app_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: ['public.be_organization_members'],
    fullCountLive: 1,
    todo: '',
  },

  dbSettings: {
    datdba: 'bcb_proof_migrator',
    perRoleInDatabase: {},
  },
};

export const declaration: PrivilegeDeclaration = {
  cluster: { envs: ['proof'], roles },
  envMapping,
  databases: { bcb_privproof: db_bcb_privproof },
};

export default declaration;
