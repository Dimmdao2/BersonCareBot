/**
 * declaration.ts — DB privilege-layer DECLARATION («как должно быть»): единственный источник истины.
 *
 * ⚠ СТАТУС. Ни к одному деплою не подключено, ни одна DDL/DML не исполнялась. Файл несёт РЕШЁННУЮ
 *   МОДЕЛЬ (решения владельца 08.08 — §0), объявленный КЛАСС + требуемую СТЕНУ на каждой из 239
 *   классифицированных таблиц, модель двух портов, узкую роль резолвера, роль прунера и приёмочный
 *   инвариант. Где сегодняшний код делает то, что модель запрещает, объявлена МОДЕЛЬ, а код внесён в
 *   `CODE_MUST_CHANGE` — грант никогда не выдаётся «потому что код туда ходит».
 *
 * ФОРМА (компактная; полные правила — README §«Компактная форма»). Грамматика вынесена в `types.ts`.
 *   Строка таблицы несёт ТОЛЬКО решения: имя, класс, одну строку обоснования, отклонения от умолчаний
 *   класса и стены, гранты/отзывы с одной строкой причины, ссылки `defect`/`code`/`gate`. Всё, что
 *   выводится (стена по классу, RLS по стене, ACTIVE, владелец migrator, маркер GAP G2), НЕ пишется
 *   построчно — его достраивает `expandTables`, а отклонение без причины ОТКАЗЫВАЕТ при загрузке.
 *   Полные тексты дефектов — `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS_TABLES.md` (ссылка —
 *   массив `defect`), решения владельца — `docs/OWNER_DECISIONS.md` (см. OWNER_DECISIONS_CANON).
 *
 * Провенанс (FACTS §0): каждое значение прослеживается до переписи (`evidence/13 §N`), классификации
 *   (`evidence/14 часть N`, `FINDINGS_TABLES Дn/Иn/Оn`), документа диспозиции (`evidence/15|16|18`)
 *   либо до кода репозитория (`file:line`). Выдуманный литерал = побайтный ложный красный по §F.
 *
 * Скоупинг (SCHEME §A): `cluster` (роли + области) — УРОВЕНЬ КЛАСТЕРА; `databases.<db>` (схемы,
 *   таблицы, функции, типы, definer-исключения, creators, orgTableAllowlist, dbSettings) — на базу.
 *   Две управляемые базы РАЗЛИЧАЮТСЯ; dev-дельты объявлены явно.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * // ПРОБЕЛЫ — что файл разрешить НЕ смог (вход генератора Ф2.3 + триаж владельца).
 *   Точные места — по `TODO(census-gap)` / `TODO(owner?)` в файле.
 *   G1. Точный список 11 tenant-обходимых ролей (FACTS §1.5): свод SET ROLE × принципал (1892 клетки)
 *       не перегонялся (evidence/13 §6.1). Область есть у каждой роли, канонические 11 строк — нет.
 *   G2. Полная per-table матрица GRANT (~239 таблиц). Перепись перечислила ACL для нескольких
 *       представительных таблиц (evidence/13 §2.5); классификация назвала ОПАСНЫЕ гранты, но не весь
 *       `relacl`. Поэтому каждая ACTIVE-таблица несёт `grantMatrix: 'G2-pending'` (достраивается
 *       `expandTables`; снимается на строке через `acl: 'enumerated'`): класс, стена и
 *       обоснованные/запрещённые гранты объявлены, исчерпывающий набор строк ACL не выдуман.
 *   G3. Кто из 38 функций мигратора + 1 функции app_platform_settings НАМЕРЕННО не app_owner, а кто
 *       дрейф (evidence/13 §3.2, §6.3). Из 38 перепись назвала одну.
 *   G8. Имена и тела политик (9 на platform_users, 4 на admin_audit_log …) переписью не перечислены
 *       (evidence/13 §2.4). Требуемая СЕМАНТИКА объявлена (`pol` на строке), имена/тела — census-gap.
 *   G9. Имена env-секретов + CONNECT/VALID UNTIL/conn-limit на логин (живут в секрет-сторе деплоя, не
 *       в каталоге). Значения `passwordEnv` — конвенциональные заглушки.
 *   G10. Покрытие самой классификации: FACTS §1.6 считает 307 отношений, четыре среза покрыли 239
 *       таблиц (`relkind IN ('r','p')` в public/app/integrator/drizzle). Представления, matview,
 *       партиции и непокрытые схемы НЕ классифицированы (FINDINGS_TABLES §1.3 ⚠).
 *   G11. Счётчики строк из `pg_class.reltuples` в этой базе недостоверны (доказано дважды: FINDINGS
 *       Д14, К8/К9). Любое решение по объёму требует `count(*)`. Открыто: размер public.idempotency_keys.
 *
 *   ЗАКРЫТЫ, не переоткрывать:
 *   • G4 (дрейф NOINHERIT) — закрыт РЕШЕНИЕМ: каждый логин объявлен NOINHERIT (SCHEME §A.1), а три
 *     живых `rolinherit=t` объявлены дрейфом. При INHERIT логин несёт права терминальной роли ДО
 *     всякого SET ROLE — это и есть механизм FINDINGS И3; объявить дрейф нормой значило бы благословить дефект.
 *   • G5 (владелец app_ext различается по базам) — канонический владелец `postgres` на ОБЕИХ базах
 *     (SCHEME §C: шов расширений принадлежит суперпользователю; TEST уже так). dev — дрейф.
 *   • G6 (красная база Ф6 на platform_users) — не значение декларации: здесь `rls: 'force'` (§I Р3),
 *     а ГДЕ берётся красная база — выбор приёмочного прогона, он записан в PLAN Ф6.
 *   • G7 (reference_catalog_snapshot_receipts, dev patient_specialist_links) — обе ИСТИННО org-таблицы
 *     (расписка пишется на организацию; связь «пациент ↔ специалист» живёт внутри одной организации).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { WALL_TEMPLATES, expandTables } from './types.ts';
import { BUSINESS_SEAM_FUNCTIONS } from './function-census.ts';
import { REV10_CLINICAL_ACCESS } from './relation-access.ts';
// The canonical locked descriptor module is executable ESM; its public shape is narrowed below
// so this declaration remains strict without a second source-of-truth .d.ts file.
// @ts-expect-error no declaration file exists for the canonical executable descriptor module.
import { getPhase4LockedPolicyTargets, renderPhase4StrictPredicate } from '../../../docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs';
import type {
  AcceptanceInvariant, CodeChange, DatabaseDecl, DeclaredFunction, DefinerException, DefinerExceptionsSection, GrantDecl, LoginRecord,
  OwnerDecision, OwnerGate, PatientVisibility, PlatformRoleScope, Port, PortSpec, PrivilegeDeclaration,
  FunctionRelationSurface, NamedSeamAccess, PolicyDecl, Privilege, ReferenceModel, RelationAccess, RoleDecl, TableDecl, TableRow,
} from './types.ts';

/* ============================================================================================
 * SECTION 0 — РЕШЕНИЯ ВЛАДЕЛЬЦА 08.08 (нормативны; каждый раздел ниже их реализует)
 *   Здесь — машиночитаемый список: id, одна строка слов владельца, одна строка «что сделано».
 *   ПОЛНЫЙ текст решений и их обсуждение — в каноне (OWNER_DECISIONS_CANON), не здесь.
 *   Пометка «пока» = решение о ТЕКУЩЕМ состоянии; она несётся полем `provisional`, а не памятью.
 * ========================================================================================== */

export const OWNER_DECISIONS_CANON =
  'docs/OWNER_DECISIONS.md §«Права БД, роли и стены (владелец, 08.08)» — дословные формулировки, '
  + 'дата и контекст каждого решения D1-D9, а также приёмочный инвариант.';

export const OWNER_DECISIONS: OwnerDecision[] = [
  { id: 'D1-platform-scope', provisional: true,
    said: 'Глобал админ не лезет в медицину, пока так.',
    encodedAs: 'PLATFORM_ROLE_SCOPE: платформенной роли только коммерция, каркас и аудит; медицины — ноль (C1/C2)' },
  { id: 'D2-patient-visibility', provisional: false,
    said: 'Пациент видит ТОЛЬКО тесты, добавленные в его программу; он НЕ ВИДИТ внутренние комментарии и '
      + 'пометку проблемный и тд.',
    encodedAs: 'PATIENT_VISIBILITY + revoke/pol на staff-комментариях, booking-профилях, test_attempts (C14)' },
  { id: 'D3-reference-org-copy', provisional: false,
    said: 'Справочники: глобальный шаблон → копия на организацию при её создании; клиника владеет своей '
      + 'копией. Арендатор НЕ пишет в глобальный шаблон.',
    encodedAs: 'REFERENCE_MODEL + стены `reference-template` / `reference-org-copy` (C15)' },
  { id: 'D4-two-ports', provisional: false,
    said: 'Ровно ДВА порта доступа к БД: webapp и integrator. Воркеры, крон и прунер своих подключений НЕ '
      + 'открывают — ходят через один из двух.',
    encodedAs: 'PORTS + поле `port` на каждом логине; сегодняшний третий порт помечен `mustFold` (C5-C8)' },
  { id: 'D5-narrow-resolver', provisional: false,
    said: 'Узкая роль резолвера: предмаршрутный поиск интегратора (chat_id/внешний id → организация) получает '
      + 'СВОЮ узкую роль ровно на этот один поиск.',
    encodedAs: 'роль `app_integrator_resolver` + definer `app.resolve_organization_for_channel_identity` (C3/C4)' },
  { id: 'D6-acceptance-invariant', provisional: false,
    said: 'Любой запрос к базе данных без контекста и точного совпадения разрешений выдаёт 0 строк и пишет '
      + 'ошибку в журнал.',
    encodedAs: 'ACCEPTANCE_INVARIANT: контекст-аксессоры обязаны RAISE вместо NULL (C9-C11)' },
  { id: 'D7-wall-by-class', provisional: false,
    said: 'Стена — по объявленному КЛАССУ таблицы, а не по наличию organization_id.',
    encodedAs: '`cls` на каждой строке + CLASS_DEFAULT_WALL; отклонение обязано нести причину (проверяет expandTables)' },
  { id: 'D8-pruner', provisional: false,
    said: 'Прунер работает под своей сервисной ролью через порт webapp (внутренний эндпоинт), никогда под '
      + 'арендной ролью.',
    encodedAs: 'роль `app_operational_maintenance` + definer `app.prune_context_nonce_ledger` (C12)' },
  { id: 'D9-superuser', provisional: false,
    said: 'Суперпользователь сохраняет полный доступ (путь DBA); на проде защищён сильным паролем.',
    encodedAs: 'роль `postgres`: superuser, GLOBAL, `bypassrls: true` — объявлено, не дефект; §G.5 рендерит отсюда' },
];

/** SCHEME §I Р3/Р4 переспрашиваются у владельца на приёмке Ч1.3; записаны, чтобы не потерялись. */
export const OWNER_GATES_OPEN: OwnerGate[] = [
  { id: 'O3-empty-tenant-discriminator',
    question: 'organization_id IS NULL массово на живых таблицах (outgoing_delivery_queue 812/812, '
      + 'product_analytics_hourly 5300/5421, patient_bookings 219/263; FINDINGS Д27). Сперва backfill, потом '
      + 'стена — или включаем стену и списываем NULL-строки?',
    safeDefault: 'backfill первым: включение стены как есть отрезает 83-100% строк на трёх живых таблицах. '
      + 'Затронутые строки несут `gate: [\'O3\']`, их стена объявлена, но НЕ ставится до ответа.' },
  { id: 'O4-dead-tables',
    question: 'Судьба мёртвых/недостроенных таблиц с ПДн: booking_cities (2 строки, шов не вызывается), '
      + 'online_intake_answers/_status_history (4/8 строк, читателей нет) — дропать или закрывать стенами?',
    safeDefault: 'оставить + стена (на TEST обратимо); удаление данных — не инженерное решение. Объявлены '
      + 'ACTIVE с `gate: [\'O4\']`.' },
  { id: 'O5-user-identity-cutover',
    question: 'user_identity + user_contacts: 18 политик и 31 грант охраняют КОПИЮ (evidence/18 §1-2: 237/237 '
      + 'и 192/192 совпадений). Направление cutover — снести зеркало или снести колонки-источники в platform_users?',
    safeDefault: 'до ответа не двигать; обе объявлены ACTIVE со своими стенами (сегодня в них живые ПДн).' },
  { id: 'O6-webapp-session-logins',
    question: 'D4 говорит «свой env-секрет и свой пул» на порт. Порт webapp держит ДВА рантайм-логина (staff и '
      + 'nonstaff) — это два подключения ОДНОГО порта. Свести их в один логин с SET ROLE?',
    safeDefault: 'НЕТ — не сводить. Один логин, состоящий в app_staff, делает `app.is_staff()` истинным ДО '
      + 'всякого SET ROLE (механизм дефекта И3 на логине интегратора). Инженерное чтение D4: «свой секрет» — на '
      + 'ПОРТ, а не на логин. Записано явно, потому что расходится с буквальным прочтением.' },
];

/* ============================================================================================
 * SECTION 0b — ПРИЁМОЧНЫЙ ИНВАРИАНТ (критерий владельца на всю работу)
 * ========================================================================================== */

export const ACCEPTANCE_INVARIANT: AcceptanceInvariant = {
  owner: 'любой запрос к базе данных без контекста и точного совпадения разрешений выдает 0 строк и пишет '
    + 'ошибку в журнал.',
  date: '2026-08-08',
  zeroRows: 'механизм сегодняшний: RLS+FORCE на каждой объявленной таблице + deny-by-default (§D) + стена в '
    + 'точке рождения (§E). Без принципала любой предикат ложен, ответ — 0 строк.',
  andLogs: 'этой половины сегодня НЕТ, и она меняет поведение: отсутствие принципала даёт ТИХИЙ ноль '
    + '(app.current_org_id() возвращает NULL, в журнал не пишется ничего, приложение глотает — FACTS §1.1: 61 '
    + 'тыс. отказов в сутки нашли только чтением pg_stat). Под инвариантом контекст-аксессоры ОБЯЗАНЫ RAISE '
    + '(42501 с именованным условием). Это НЕ отвергнутое FACTS §9.2 «всегда бросать»: отказывает по-прежнему '
    + 'движок, меняются только три аксессора.',
  contextAccessorsMustRaise: [
    'app.current_org_id()',
    'app.current_patient_user_id()',
    'app.current_integrator_user_id()',
  ],
  appliedBy: 'ТЕЛО функции в её миграции (одна власть, dbt #6238) — генератор не пишет ни тел, ни proconfig; '
    + '§F только сравнивает.',
  acceptanceTest: 'по каждой объявленной таблице: сессия логином порта, принципал НЕ ставим, SELECT. Ожидание — '
    + '0 строк И запись отказа в журнале. Тихий ноль с пустым журналом = FAIL.',
};

/* ============================================================================================
 * SECTION 0c — КОД, КОТОРЫЙ ОБЯЗАН ИЗМЕНИТЬСЯ (рабочая очередь; модель запрещает то, что он делает)
 *   Дисциплина: грант никогда не объявляется «потому что код туда ходит» — объявляется МОДЕЛЬ, а код
 *   попадает сюда. Одна строка `what` + адреса; развёрнутый разбор — в FINDINGS/FACTS по ссылке.
 * ========================================================================================== */

export const CODE_MUST_CHANGE: CodeChange[] = [
  { id: 'C1', becauseOf: 'D1-platform-scope',
    what: 'политика `operator_health_failure_archive` стоит на `USING true` — платформа читает архив отказов всех '
      + 'клиник с doctor_user_id',
    where: ['deploy/postgres (политика на public.operator_health_failure_archive)', 'evidence/14 часть 3 В2'] },
  { id: 'C2', becauseOf: 'D1-platform-scope',
    what: 'политика `product_analytics_registration_platform_operations_select` даёт платформе кросс-арендные '
      + 'события регистрации с user_id',
    where: ['deploy/postgres (политика на public.product_analytics_events_recent)', 'evidence/14 часть 3 В2'] },
  { id: 'C3', becauseOf: 'D5-narrow-resolver',
    what: 'предмаршрутный резолв идёт сырым join по четырём таблицам (отсюда 4-стороннее членство логина) — обязан '
      + 'звать один definer-аксессор',
    where: ['apps/integrator/src/infra/db/repos/channelUsers.ts:65-95', 'apps/integrator/src/app/routes.ts:44-95'] },
  { id: 'C4', becauseOf: 'D5-narrow-resolver',
    what: 'снять членство логина интегратора в app_identity_bootstrap/app_patient/app_staff/app_worker; ⚠ побочный '
      + 'эффект: сегодня app.is_staff() для него истинно до SET ROLE (И3), на это молча опираются ветки RLS',
    where: ['deploy/postgres/integrator-login-public-identity-grants.sql', 'roles-install (env-маппинг)'] },
  { id: 'C5', becauseOf: 'D4-two-ports',
    what: 'интегратор открывает ЧЕТЫРЕ пула (request + DIAGNOSTIC + DELIVERY_WORKER + SCHEDULER); один порт = один '
      + 'пул, роль выбирается SET ROLE (setDbOperationalRuntimeRole уже есть)',
    where: ['apps/integrator/src/infra/db/integratorPoolProvider.ts:84-155',
      'apps/integrator/src/infra/db/withClient.ts:66-74'] },
  { id: 'C6', becauseOf: 'D4-two-ports',
    what: 'интегратор открывает ПЯТЫЙ пул без принципала — под телеметрию изоляции',
    where: ['apps/integrator/src/infra/db/integratorPoolProvider.ts:159-166'] },
  { id: 'C8', becauseOf: 'D4-two-ports',
    what: 'SAAS_ISOLATION_OPERATOR_DATABASE_URL / DATABASE_URL_CONFIG_READER — логины вне двух портов, обязаны '
      + 'ходить через webapp',
    where: ['apps/webapp/src/infra/db/client.ts:18-20,87-90', 'apps/webapp/src/infra/db/saasIsolationTelemetry.ts:5'] },
  { id: 'C9', becauseOf: 'D6-acceptance-invariant',
    what: 'контекст-аксессоры возвращают NULL при отсутствии контекста, обязаны RAISE; каждый вызывающий, трактующий '
      + 'NULL как «нет строк», перечитывается',
    where: ['deploy/postgres/p2-b-protected-principal-context.sql (тела app.current_org_id / '
      + 'app.current_patient_user_id / app.current_integrator_user_id)'] },
  { id: 'C10', becauseOf: 'D6-acceptance-invariant',
    what: 'отказы глотаются приложением (42501 → reason:\'user_not_found\', catch → false, catch → null) — поэтому '
      + '61 тыс. отказов в сутки прошли незамеченными',
    where: ['apps/webapp/src/infra/repos/playbackUserVideoFirstResolve.ts:29-35 (И7)',
      'apps/integrator/src/app/routes.ts:53-56,71-74'] },
  { id: 'C11', becauseOf: 'D6-acceptance-invariant',
    what: 'роль, под которой исполняется запрос, УГАДЫВАЕТСЯ в Node по строке `source`, а не объявляется',
    where: ['apps/integrator/src/infra/db/withClient.ts:14-64', 'FACTS §1.1'] },
  { id: 'C12', becauseOf: 'D8-pruner',
    what: 'закрытый инфра-крон-шов гоняет ретеншен под SET ROLE app_staff (арендная ORG-роль с DELETE на '
      + 'кросс-арендных журналах) — должно стать app_operational_maintenance',
    where: ['packages/db-principal/src/index.ts:1032-1037',
      'packages/db-principal/src/webappLockedInfraCronSources.ts', 'evidence/16 §«Роль прунера»'] },
  { id: 'C13', becauseOf: 'FINDINGS Д1',
    what: 'сырой SQL по таблицам аутентификации минует полный definer-шов; вызов ломается после снятия '
      + 'рантайм-грантов, пока не переедет на аксессор',
    where: ['apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:88'] },
  { id: 'C14', becauseOf: 'D2-patient-visibility',
    what: 'снять пациентские чтения служебного материала (staff-комментарии, booking-профиль) и перевести '
      + 'пациентскую ветку test_attempts/test_results на элемент программы',
    where: ['apps/webapp/src/infra/repos/pgClientHistory.ts',
      'deploy/postgres (пациентские ветки saas_org_dormant_* на трёх таблицах)'] },
  { id: 'C15', becauseOf: 'D3-reference-org-copy',
    what: 'ЗАКРЫТО 0394 для clinical_test_measure_kinds: отдельный глобальный пул удалён, значения живут в '
      + 'organization-scoped reference_items; оставшаяся часть C15 — запрет tenant CRUD глобального booking_cities',
    where: ['apps/webapp/src/modules/tests/measureKindCode.ts:1',
      'apps/webapp/src/app/api/api.md:100', 'FINDINGS Д21'] },
  { id: 'C16', becauseOf: 'D1-platform-scope',
    what: 'закрыть эскалацию: app_staff — член app_platform_settings и app_clinic_billing, один SET ROLE выводит '
      + 'арендную сессию в GLOBAL-роль на 14 таблицах; пока открыто, КАЖДАЯ org-политика на них рекомендательная',
    where: ['deploy/postgres (членства ролей)', 'FINDINGS Д4'] },
  { id: 'C17', becauseOf: 'D6-acceptance-invariant',
    what: 'app.is_staff() проверяет ЧЛЕНСТВО вместо USAGE — любой логин-член app_staff «персонал» для RLS до всякого '
      + 'SET ROLE (сегодня пять ролей)',
    where: ['deploy/postgres (тело app.is_staff)', 'FINDINGS И3, К6'] },
  { id: 'C18', becauseOf: 'D6-acceptance-invariant',
    what: 'два org-аксессора в одной базе: сырой current_setting(\'app.org\') в политиках c4_web_push_reminder_* '
      + 'против app.current_org_id() везде — сырая форма молча переживёт переход на RAISE',
    where: ['deploy/postgres (c4_web_push_reminder_catalog на content_pages/content_sections; та же форма на '
      + 'notification_delivery_attempts, product_push_notifications)', 'FINDINGS И5'] },
];

/* ============================================================================================
 * SECTION 0d — РЕШЕНИЕ D1: что платформенная роль трогает, а что нет
 * ========================================================================================== */

export const PLATFORM_ROLE_SCOPE: PlatformRoleScope = {
  role: 'app_platform_settings',
  owner: 'Глобал админ не лезет в медицину, пока так. (08.08)',
  provisional: true,
  mayTouch: [ // коммерция + каркас клиники + аудит платформы; всё остальное — вне области
    'public.be_organizations', 'public.be_branches', 'public.be_clinic_services',
    'public.saas_billing_accounts', 'public.saas_billing_invoices', 'public.saas_billing_subscriptions',
    'public.saas_billing_provider_events', 'public.saas_billing_refunds', 'public.saas_billing_periods',
    'public.saas_org_entitlement_overrides', 'public.saas_organization_trials', 'public.saas_tariffs',
    'public.saas_trial_policy', 'public.saas_registration_tariff_policy', 'public.saas_paid_period_policy',
    'public.admin_audit_log',
    'public.app_runtime_settings', // только строки organization_id IS NULL (u9a_platform_runtime_global_only)
    'public.app_runtime_settings_audit',
    'public.system_settings', // только глобальные строки и только через стену роли (Д3)
    'public.system_settings_audit',
  ],
  mustNotTouch: 'всё медицинское и клиническое: treatment_program_* (9), support_* (5), tests / test_sets / '
    + 'test_set_items / test_attempts / test_results, symptom_*, clinical_*, specialist_tasks, reminder_*, '
    + 'patient_*, be_appointment*, be_patient*, be_payment*, media_*, integrator.*. Ни гранта, ни политики, ни '
    + 'definer-аксессора. Два живых нарушения — C1/C2.',
  consequenceRecorded: 'платформа не может диагностировать и восстановить программу лечения клиники иначе как '
    + 'под ролью владельца базы (FINDINGS О1). Владелец принял это следствие «пока».',
};

/* ============================================================================================
 * SECTION 0e — РЕШЕНИЕ D2: что видит пациент
 * ========================================================================================== */

export const PATIENT_VISIBILITY: PatientVisibility = {
  role: 'app_patient',
  scope: 'OWN',
  owner: 'Пациент видит ТОЛЬКО тесты, добавленные в его программу … он НЕ ВИДИТ внутренние комментарии и '
    + 'пометку проблемный и тд. (08.08)',
  sees: [
    'свои записи, визиты, платежи, абонементы (be_appointment*, be_payment*, be_patient_packages …) — своя строка',
    'свою программу лечения и её задания (treatment_program_instance*) — через instance',
    'тесты, ДОБАВЛЕННЫЕ В ЕГО ПРОГРАММУ: test_attempts/test_results ТОЛЬКО через '
      + 'test_attempts.instance_stage_item_id → treatment_program_instance_stage_items → instance.patient_user_id',
    'свою переписку с поддержкой (support_*), свои напоминания, свой дневник симптомов',
  ],
  doesNotSee: [
    'public.be_appointment_staff_comments — внутренние комментарии персонала о нём (revoke SELECT)',
    'public.be_patient_booking_profiles — is_problematic / problematic_note / booking_blocked / no_show_count '
      + '(revoke SELECT)',
    'клинические тесты с приёма: public.clinical_test_regions и clinic-owned reference category '
      + '`clinical_test_measure_kind` — пациентского гранта нет и не будет; это КОНЕЧНОЕ состояние, а не пробел',
    'каталог тестов клиники: public.tests / test_sets / test_set_items (пациент видит только снимок задания в '
      + 'своей программе)',
    'служебные и платформенные таблицы любого рода',
  ],
};

/* ============================================================================================
 * SECTION 0f — РЕШЕНИЕ D3: справочники
 * ========================================================================================== */

export const REFERENCE_MODEL: ReferenceModel = {
  owner: 'Справочники: глобальный шаблон → копия на организацию при её создании. (08.08)',
  shape: 'при создании организации платформенный засев КОПИРУЕТСЯ в строки, принадлежащие организации. Клиника '
    + 'владеет копией: правит, переименовывает, удаляет ненужное. Права записи в глобальный шаблон у аренды нет.',
  alreadyImplemented: 'public.reference_categories + public.reference_items + '
    + 'public.reference_catalog_snapshot_receipts — стена персонала по org + чтение пациента через активный '
    + 'org_enrollments + засевочный шов `reference_catalog_seed_owner` (жив, пока для организации нет расписки). '
    + 'Расписка и делает справочник пер-организационным (отсюда G7 = org: true).',
  consequence: 'большинство справочных таблиц поэтому ORG-скоуплены, а не глобальны: класс остаётся R, стена — '
    + '`reference-org-copy`. `reference-template` остаётся только у платформенного хранилища шаблонов.',
};

/* ============================================================================================
 * SECTION 0g — РЕШЕНИЕ D4: ровно два порта
 * ========================================================================================== */

export const PORTS: Record<Port, PortSpec> = {
  webapp: {
    process: 'apps/webapp (сервер Next.js)',
    what: 'всё, что делает человек в кабинете, плюс каждая внутренняя работа: тики крона приходят на '
      + '/api/internal/**/tick ВНУТРЬ этого процесса и берут ЭТОТ пул. У воркеров и прунера своего подключения '
      + 'нет (D4, D8).',
    logins: ['<env>_webapp_staff', '<env>_webapp_patient', '<env>_webapp_global_admin'],
    reachedThrough: 'крон хоста → POST /api/internal/<job>/tick (Bearer INTERNAL_JOB_SECRET) → пул webapp с '
      + 'объявленной сервисной ролью.',
  },
  integrator: {
    process: 'apps/integrator (модуль доставки)',
    what: 'входящие вебхуки, исходящая доставка, тики планировщика и проекция. По формулировке владельца '
      + '(evidence/15) интегратор — модуль ДОСТАВКИ, а не хранилище пользовательских данных.',
    logins: ['<env>_integrator'],
    reachedThrough: 'один пул; операционная роль (delivery / scheduler / diagnostic) выбирается SET ROLE на '
      + 'соединении этого пула, а не открытием ещё одного пула (C5).',
  },
};

/* ============================================================================================
 * SECTION 1 — РОЛИ КЛАСТЕРА (SCHEME §A.1/§A.2)
 *   Атрибуты — evidence/13 §1.2. BYPASSRLS объявлен ровно у ТРЁХ (postgres, app_owner,
 *   saas_system_health_owner), каждый обоснован. Две роли НОВЫЕ (`isNew`) и приходят из решений
 *   владельца: `app_integrator_resolver` (D5) и `app_operational_maintenance` (D8).
 * ========================================================================================== */

const roles: Record<string, RoleDecl> = {
  // ── терминальные рантайм-роли ──
  app_staff: {
    kind: 'terminal', scope: 'ORG', // evidence/13 §4: своя организация
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    members: [], // ⚠ ЦЕЛЬ: app_staff НЕ член app_platform_settings/app_clinic_billing
    why: 'терминал персонала клиники. ⚠ Сегодня app_staff — ЧЛЕН app_platform_settings и app_clinic_billing: '
      + 'один SET ROLE выводит арендную сессию в GLOBAL-роль на 14 таблицах (Д4). Членство не объявлено — C16.',
  },
  app_patient: {
    kind: 'terminal', scope: 'OWN', // FACTS §1.5: стена своих данных; ошибочное ORG-правило даёт 65 тихих нулей
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    why: 'терминал пациента: только свои данные (PATIENT_VISIBILITY).',
  },
  app_platform_settings: {
    kind: 'terminal', scope: 'GLOBAL',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
    why: 'платформенная (глобал-админ) роль. Поверхность ограничена PLATFORM_ROLE_SCOPE (D1): коммерция + '
      + 'каркас клиник + аудит, НИКАКОЙ медицины. §I Р4 сузил её ещё и на be_organization_members.',
  },
  app_worker: {
    kind: 'terminal', scope: 'ORG',
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    why: 'инфра-роль воркеров вебаппа; фильтр — на ENQUEUE, не в RLS (канон владельца; И11 требует объявить '
      + 'обход на media_transcode_jobs ИМЕНОВАННЫМ исключением — сделано на её строке).',
  },

  // ── операционные роли: на уровне таблиц запрещено всё, доступ ТОЛЬКО через definer (FACTS §6) ──
  app_operational_delivery_worker: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'доставка исходящих; ходит на порт integrator через SET ROLE (D4), своего пула не открывает (C5).',
  },
  app_operational_diagnostic: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'health/projection-пробы интегратора; тот же порт, SET ROLE (C5).',
  },
  app_operational_media_worker: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'медиа-конвейер. ⚠ Сегодня media-worker — отдельный процесс со своим подключением = третий порт (C7); '
      + 'в целевой модели это роль внутри порта webapp.',
  },
  app_operational_scheduler: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'тики планировщика интегратора; тот же порт, SET ROLE (C5).',
  },
  app_operational_web_push_reminder: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'web-push напоминания; discovery — через app_web_push_reminder_discovery_definer. evidence/13 §1.1: '
      + 'держит прямой CONNECT на bersoncarebot_test (материал env-маппинга).',
  },
  app_operational_maintenance: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    isNew: true, // в живом каталоге её нет (evidence/13 §1.2 — 45 ролей, этой среди них нет)
    why: 'РЕШЕНИЕ D8: прунер/ретеншен журналов через ВНУТРЕННИЙ эндпоинт порта webapp, никогда арендной ролью '
      + '(сегодня тот же шов ставит SET ROLE app_staff — C12). DELETE выдаётся ровно на перечисленные журналы, '
      + 'а app.context_nonce_ledger чистится через definer app.prune_context_nonce_ledger.',
  },

  // ── capability-роли ──
  app_clinic_billing: {
    kind: 'capability', scope: 'ORG',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }], // evidence/13 §1.3
    why: 'биллинг в рамках своей организации. ⚠ Членство app_staff→сюда — часть Д4 (эскалация); оставлено '
      + 'объявленным, но переход ОБЯЗАН быть закрыт вместе с app_platform_settings (C16).',
  },
  app_identity_bootstrap: {
    kind: 'capability', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'предсессионный резолв идентичности при регистрации; гранты только на public.platform_users и '
      + 'public.user_identity, org-таблиц ноль → scope NONE. ⚠ Д5: её политики проверяют «кто ты» (pg_has_role … '
      + 'MEMBER), а членами являются четыре ЛОГИН-роли — под ними читаются все 278 platform_users, 444 контакта '
      + 'и 237 ФИО. Целевая форма (И15 «в»): весь bootstrap уезжает в definer-аксессор, политики фильтруют СТРОКУ.',
  },
  app_integrator_resolver: {
    kind: 'capability', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    isNew: true,
    why: 'РЕШЕНИЕ D5: узкая роль предмаршрутного резолва (chat_id/внешний id → организация) — ровно один поиск '
      + 'и только через definer app.resolve_organization_for_channel_identity. Заменяет живое состояние, где '
      + 'логин интегратора состоит СРАЗУ в четырёх терминалах (из-за чего app.is_staff() истинно до всякого SET '
      + 'ROLE — И3/К6). Четырёхстороннее членство НЕ объявлено (C3/C4).',
  },

  // ── роли-владельцы (NOLOGIN, владеют definer-швом; §C) ──
  app_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // 1 из ровно-3; деплой ЖЁСТКО ассертит rolbypassrls (deploy-test-saas.sh:907, deploy-test.sh:174)
    inherit: true, createrole: false, rolconfig: null,
    members: [], // ноль членов вне окна миграции (SCHEME §C)
    why: 'владелец definer-шва. Оставить-и-объявить — SCHEME §I Р5.',
  },
  saas_system_health_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // 2 из ровно-3; живая цепочка её ставит (saas-system-health-diagnostics.sql:166-173)
    inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'NOLOGIN-владелец health-агрегации. Оставить-и-объявить — SCHEME §I Р9.',
  },
  saas_telemetry_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'владеет saas_isolation_* и 7 definer-функциями телеметрии (evidence/13 §3.2; §C). Эталон формы: ACL '
      + 'только у владельца, доступ — через app.report_saas_isolation_event / app.read_saas_isolation_events.',
  },
  app_web_push_reminder_discovery_definer: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'владелец discovery-шва app.list_web_push_reminder_organization_ids; не рантайм-читатель таблиц.',
  },

  // ── роль оператора (NOLOGIN канон; операторские ЛОГИНЫ живут в envMapping) ──
  saas_telemetry_operator: {
    kind: 'operator', scope: 'GLOBAL',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'читает телеметрию изоляции кросс-орг (saas-isolation-telemetry.sql). Это диагностика ПЛАТФОРМЫ о '
      + 'самой себе, не медицинские данные — D1 не нарушается. ⚠ Ходить обязана через порт webapp (C8).',
  },

  // ── сервисная роль: маркер фазы миграций (SCHEME §A.1/§E) ──
  app_migration_phase: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    isNew: true,
    why: 'NOLOGIN-маркер фазы миграций, читается event trigger (SCHEME §E). Ноль членов в стационаре.',
  },

  // ── суперпользователь кластера (решение D9) ──
  postgres: {
    kind: 'superuser', scope: 'GLOBAL',
    login: true, superuser: true, bypassrls: true, inherit: true, createrole: true,
    rolconfig: null,
    why: 'РЕШЕНИЕ D9: полный доступ DBA сохраняется и ОБЪЯВЛЯЕТСЯ (не дефект); на проде — сильный пароль. '
      + 'Владеет app_ext и event trigger (§C); 3 из ровно-3 BYPASSRLS.',
  },
};

/* ============================================================================================
 * SECTION 2 — ENV-МАППИНГ (SCHEME §A.1) + ПРИВЯЗКА К ПОРТУ (решение D4)
 *   inherit объявлен FALSE везде (SCHEME §A.1). Где живое несёт rolinherit=t, расхождение названо в
 *   `inheritDrift`, и roles-install приводит его к NOINHERIT (см. закрытый G4 в шапке).
 * ========================================================================================== */

const SEARCH_PATH_PUBLIC_INTEGRATOR = 'search_path=public, integrator'; // побайтно, evidence/13 §3.4

const envMapping: Record<string, Record<string, LoginRecord>> = {
  test: {
    bersoncarebot_test: {
      port: null, // мигратор/datdba: канал деплоя, не порт приложения
      canonicalRole: null, // в стационаре; app_owner + BYPASSRLS получает только внутри окна миграции
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t (evidence/13 §1.2) — привести к NOINHERIT',
      passwordEnv: 'PGPASSWORD_BERSONCAREBOT_TEST', // TODO(census-gap G9)
      rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // evidence/13 §3.4 (setdatabase=0)
      connect: ['bersoncarebot_test'],
      why: 'TEST migrator-login = datdba базы bersoncarebot_test (evidence/13 §3.5). Не порт приложения.',
    },
    bcb_test_integrator_login: {
      port: 'integrator',
      canonicalRole: 'app_integrator_resolver', // ⬅ D5: узкая роль ВМЕСТО живого 4-стороннего членства
      membership: { role: 'app_integrator_resolver', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_INTEGRATOR', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'порт integrator. ⚠ ЖИВОЕ состояние — член ЧЕТЫРЁХ ролей сразу (app_identity_bootstrap, app_patient, '
        + 'app_staff, app_worker; evidence/13 §1.3). Объявлена ТОЛЬКО узкая роль резолвера (D5); остальные три '
        + 'пути обязаны уехать в definer-аксессоры (C3/C4).',
    },
    bcb_test_nonstaff_login: {
      port: 'webapp',
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_NONSTAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'пациентская сессия порта webapp (DATABASE_URL_NONSTAFF). ⚠ Живьём ещё и член app_identity_bootstrap '
        + '(Д5) — путь, которым читаются все 278 platform_users; членство не объявлено, bootstrap уезжает в definer (И15).',
    },
    bcb_test_staff_login: {
      port: 'webapp',
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true }, // ⬅ ЦЕЛЬ inherit=false
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t + inherit_option=t членства (evidence/13 §1.2/§1.3): логин несёт права '
        + 'app_staff до всякого SET ROLE — механизм FINDINGS И3',
      passwordEnv: 'PGPASSWORD_BCB_TEST_STAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'сессия персонала порта webapp (DATABASE_URL_STAFF).',
    },
    bcb_test_worker_login: {
      port: 'webapp',
      canonicalRole: 'app_worker',
      membership: { role: 'app_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t (evidence/13 §1.2/§1.3)',
      passwordEnv: 'PGPASSWORD_BCB_TEST_WORKER', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'воркер-сессия порта webapp. D4: воркер НЕ открывает своего подключения — это роль внутри порта.',
    },
    bcb_test_maintenance_login: {
      port: 'webapp',
      canonicalRole: 'app_operational_maintenance',
      membership: { role: 'app_operational_maintenance', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_MAINTENANCE', // TODO(census-gap G9)
      rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'НОВЫЙ (D8): прунер/ретеншен через внутренний эндпоинт порта webapp. Сегодня роли нет и ретеншен '
        + 'бежит под app_staff (C12).',
    },
    bcb_test_operational_delivery_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_DELIVERY_WORKER сегодня отдельный пул; роль обязана достигаться SET ROLE на '
        + 'пуле порта integrator',
      canonicalRole: 'app_operational_delivery_worker',
      membership: { role: 'app_operational_delivery_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DELIVERY',
      rolconfig: null, // evidence/13 §3.4: операционные логины НЕ несут role-level search_path
      connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_diagnostic_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_DIAGNOSTIC',
      canonicalRole: 'app_operational_diagnostic',
      membership: { role: 'app_operational_diagnostic', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DIAGNOSTIC', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_scheduler_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_SCHEDULER',
      canonicalRole: 'app_operational_scheduler',
      membership: { role: 'app_operational_scheduler', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_SCHEDULER', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_web_push_reminder_login: {
      port: 'webapp',
      canonicalRole: 'app_operational_web_push_reminder',
      membership: { role: 'app_operational_web_push_reminder', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_WEBPUSH', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_saas_operator_test: {
      port: 'webapp',
      mustFold: 'C8 — SAAS_ISOLATION_OPERATOR_DATABASE_URL сегодня открывается вне двух портов',
      canonicalRole: 'saas_telemetry_operator',
      membership: { role: 'saas_telemetry_operator', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t + inherit_option=t (evidence/13 §1.2/§1.3)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'], // evidence/13 §1.1 datacl
    },
    bcb_saas_diag_test: {
      port: null,
      mustFold: 'C8 — канонического членства в переписи нет (evidence/13 §1.3) и порт не объявлен: либо свернуть '
        + 'в порт webapp с объявленной ролью, либо удалить логин',
      canonicalRole: null,
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t (evidence/13 §1.2)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_DIAG_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'],
      why: 'TODO(owner?): логин без объявленной роли и без порта. Кандидат на удаление (та же категория, что '
        + 'stray-остатки evidence/13 §5).',
    },
  },

  dev: {
    bcb_webapp_dev_user: {
      port: null, // мигратор/datdba
      canonicalRole: null, // ⬅ ЦЕЛЬ: без членства в app_identity_bootstrap (Д5)
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t и живое членство в app_identity_bootstrap (evidence/13 §1.2/§1.3) — '
        + 'логин мигратора/datdba не должен нести рантайм-capability-роль (Д5)',
      passwordEnv: 'PGPASSWORD_BCB_WEBAPP_DEV_USER',
      rolconfig: null, // на уровне роли NULL; search_path на (логин,базу) — в dbSettings (§A.10)
      connect: ['bcb_webapp_dev'],
      why: 'dev migrator-login = datdba базы bcb_webapp_dev (evidence/13 §3.5); его search_path — НЕСУЩАЯ строка '
        + 'setdatabase≠0 (SCHEME §A.10), не дефект.',
    },
    bcb_dev_runtime_nonstaff_login: {
      port: 'webapp',
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_NONSTAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
      why: 'пациентская сессия порта webapp на dev. ⚠ Живьём ещё и член app_identity_bootstrap (Д5) — членство '
        + 'не объявлено.',
    },
    bcb_dev_runtime_staff_login: {
      port: 'webapp',
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_STAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
    },
    bcb_saas_operator_dev: {
      port: 'webapp',
      mustFold: 'C8 — как на TEST; канонического членства в переписи нет',
      canonicalRole: null,
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'живое rolinherit=t (evidence/13 §1.2)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_DEV', rolconfig: null,
      connect: ['bcb_webapp_dev'],
      why: 'TODO(owner?): роль не объявлена в переписи — либо saas_telemetry_operator, либо на удаление.',
    },
  },
};

// Retained legacy census input; revision 10 below is the executable exported role/login graph.
void roles;
void envMapping;

/* ============================================================================================
 * SECTION 3 — definer: умолчания + proconfig-исключения (evidence/13 §3.1/§3.2), общие для обеих баз
 * ========================================================================================== */

const DEFINER_DEFAULTS: DefinerExceptionsSection['defaults'] = {
  schema: 'app',
  securityDefiner: true,
  owner: 'app_owner',
  searchPath: ['search_path=pg_catalog'], // evidence/13 §3.1: 235 функций
  publicExecute: false,
  coveredCount: 235,
  rule: 'каждая SECURITY DEFINER функция схемы `app`, НЕ перечисленная в proconfigExceptions/ownershipExceptions, '
    + 'ожидается как owner=app_owner, proconfig=[\'search_path=pg_catalog\'], PUBLIC EXECUTE отозван (§D.5). Все '
    + '244 definer-функции живут в схеме `app` (public/integrator/app_ext = 0; evidence/13 §3.1).',
};

const PROCONFIG_EXCEPTIONS: Record<string, DefinerException> = {
  'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, app_ext, pg_catalog'], // тело зовёт app_ext.hmac (p2-b:231)
    execute: ['app_owner', 'app_staff', 'app_patient', 'app_clinic_billing'], // evidence/13 §3.3
    why: 'вход принципала: HMAC-подпись проверяется до установки GUC (evidence/13 §3.1; SCHEME §A.7)',
  },
  'app.current_integrator_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'принципал-аксессор. ⚠ РЕШЕНИЕ D6: обязан RAISE при отсутствии контекста, а не возвращать NULL '
      + '(ACCEPTANCE_INVARIANT; применяет тело функции в миграции, C9).',
  },
  'app.current_org_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [ // evidence/13 §3.3 ЖИВЫЕ грантополучатели + четыре недостающих (дефект ниже)
      'app_owner', 'app_staff', 'app_patient', 'app_worker', 'app_operational_media_worker',
      'app_platform_settings', 'app_clinic_billing', 'app_identity_bootstrap',
      'app_operational_scheduler', 'app_operational_delivery_worker', 'app_operational_diagnostic',
      'app_operational_web_push_reminder',
    ],
    why: 'org-аксессор. ⚠ ДЕФЕКТ (evidence/13 §3.3 / FACTS §1.1): EXECUTE НЕ выдан четырём operational-ролям → '
      + 'корень 61k/сутки 42501. Цель добавляет эти четыре гранта. ⚠ D6: обязан RAISE (C9).',
  },
  'app.current_patient_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'принципал-аксессор. ⚠ РЕШЕНИЕ D6: обязан RAISE при отсутствии контекста (C9).',
  },
  'app.release_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [
      'app_owner', 'app_staff', 'app_patient', 'app_clinic_billing',
      'app_operational_delivery_worker', 'app_operational_diagnostic',
      'app_operational_media_worker', 'app_operational_scheduler',
    ],
    why: 'снятие принципала; широкий EXECUTE (evidence/13 §3.3). TODO(census-gap): точные login-грантополучатели',
  },
  'app.reset_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'сброс принципала (evidence/13 §3.1)',
  },
  'app.close_active_user_phone_history(uuid)': {
    owner: 'app_owner', searchPath: ['search_path=app, public, pg_catalog'],
    why: 'обслуживание истории телефонов; тело достаёт public (evidence/13 §3.1)',
  },
  'app.list_web_push_reminder_organization_ids(timestamp with time zone)': {
    owner: 'app_web_push_reminder_discovery_definer',
    searchPath: ['search_path=pg_catalog, public'],
    execute: ['app_operational_web_push_reminder'],
    why: 'discovery-шов web-push; владелец — отдельная definer-роль (evidence/13 §3.1/§3.2)',
  },
  'app.read_outbound_provider_incident_health()': {
    owner: 'app_owner', // ⬅ ЦЕЛЬ: живой владелец — логин мигратора (дрейф, evidence/13 §3.2)
    searchPath: ['search_path=pg_catalog, public'],
    why: 'чтение здоровья исходящих инцидентов. ⚠ ДРЕЙФ владения: живьём владелец — мигратор-логин; цель — '
      + 'app_owner (§C). TODO(census-gap G3) для остальных 37.',
  },
  'app.read_tenant_isolation_canary()': {
    owner: 'saas_system_health_owner',
    searchPath: ['search_path=pg_catalog'],
    execute: ['saas_telemetry_operator'],
    isNew: true,
    why: 'ограниченный cross-tenant canary для критического health tick; runtime получает только active/member counts, '
      + 'а прямой SELECT по be_organizations и be_organization_members остаётся закрыт',
  },
  'app.resolve_organization_for_channel_identity(text,text)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, public, integrator, pg_catalog'],
    execute: ['app_integrator_resolver'],
    isNew: true,
    why: 'РЕШЕНИЕ D5: единственный вход узкой роли резолвера. Заменяет сырой join по четырём таблицам, из-за '
      + 'которого логин интегратора состоит в четырёх терминалах сразу (channelUsers.ts:65-95; C3).',
  },
  'app.prune_context_nonce_ledger(integer,integer)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, pg_catalog'],
    execute: ['app_operational_maintenance'],
    isNew: true,
    why: 'РЕШЕНИЕ D8: app.context_nonce_ledger закрыта от ВСЕХ ролей, поэтому прунер входит только через definer. '
      + 'EXECUTE — только сервисной роли: дать его app_staff означало бы DELETE по шву принципала из любой '
      + 'арендной сессии (evidence/16).',
  },
};

const OWNERSHIP_EXCEPTIONS: DefinerExceptionsSection['ownershipExceptions'] = {
  intentional: {
    saas_telemetry_owner: {
      count: 7, why: 'владеет definer-функциями телеметрии изоляции (§C; evidence/13 §3.2)',
      functions: { todo: 'TODO(census-gap G3): 7 имён не перечислены read-only переписью' },
    },
    saas_system_health_owner: {
      count: 5, why: 'владеет definer-функциями health-агрегации; BYPASSRLS-владелец (§I Р9)',
      functions: { todo: 'TODO(census-gap G3): 4 имени не перечислены' },
    },
    app_web_push_reminder_discovery_definer: {
      count: 1, why: 'владеет своим discovery-швом (§C; evidence/13 §3.2)',
      functions: ['app.list_web_push_reminder_organization_ids(timestamp with time zone)'],
    },
  },
  drift: {
    bersoncarebot_test: {
      count: 38, targetOwner: 'app_owner',
      why: 'мигратор-логин владеет 38 definer-функциями против канона §C (evidence/13 §3.2).',
      known: ['app.read_outbound_provider_incident_health()'],
      todo: 'TODO(census-gap G3): 37 оставшихся имён + какие (если такие есть) намеренно под мигратором',
    },
    app_platform_settings: {
      count: 1, targetOwner: 'app_owner',
      why: 'рантайм-роль не должна ВЛАДЕТЬ definer-функцией (evidence/13 §3.2) — дрейф',
      known: [],
      todo: 'TODO(census-gap G3): имя функции, которой владеет app_platform_settings',
    },
  },
};

/* ============================================================================================
 * SECTION 4 — ТАБЛИЦЫ: все 239 классифицированных (evidence/14 части 1-4 → FINDINGS_TABLES).
 *   Компактная форма: строка несёт РЕШЕНИЯ, `expandTables` достраивает выводимое (README).
 *   Умолчания: стена = CLASS_DEFAULT_WALL[cls] (или 'pending-removal', если есть `drop`);
 *   rls = WALL_TEMPLATES[стена].rls; disposition = ACTIVE (или PENDING_REMOVAL при `drop`);
 *   owner = 'migrator'; grantMatrix = 'G2-pending' на каждой ACTIVE (GAP G2 — полный relacl не снят).
 *   ОТКЛОНЕНИЕ ОБЯЗАНО НЕСТИ ПРИЧИНУ: `wall` без `wallWhy` и `rls` без `rlsWhy` = отказ при загрузке.
 *   Набор таблиц общий для двух баз (схема одна); per-db дельты объявлены в SECTION 6.
 * ========================================================================================== */

/** Повторяющиеся причины вынесены в константы — так видно, что решение ОДНО на группу таблиц. */
const REV_D1 = 'Д1: табличный грант арендной роли в обход definer-шва — персонал любой клиники читает и '
  + 'переписывает секреты входа всех пользователей';
const W_AUTH_DEFINER = 'таблица аутентификации: рантайм-ролям ноль грантов, путь только через '
  + 'definer-аксессоры app.*';
const W_REF_COPY = 'D3: клинике принадлежит КОПИЯ платформенного шаблона (org-стена), запись в шаблон запрещена';
const W_PLATFORM_OR_CLINIC = 'две ветки: строки organization_id IS NULL — только платформенная роль, остальные '
  + 'под стеной клиники';
const W_PLATFORM_TELEMETRY = 'телеметрия платформы о самой себе: стена своей роли, арендной роли грантов нет';
const RLS_OFF_MIGRATOR_LEDGER = 'ЯВНО объявленное отсутствие RLS (SCHEME §A.4: \'off\' — объявленное '
  + 'отсутствие, а не молчание). Журнал мигратора читает и пишет сам мигратор, в том числе ВНЕ окна элевации '
  + '(шаг 0 цепочки сверяет max(created_at) против watermark), а FORCE RLS без политики закрыл бы таблицу и от '
  + 'её владельца — цепочка деплоя перестала бы работать. Стена здесь — НУЛЕВОЙ грант рантайм-ролям.';

const TABLE_ROWS: TableRow[] = [
  { t: 'app.context_nonce_ledger', cls: 'T', owner: 'app_owner',
    why: 'закрытый технический остаток DEV-схемы; transaction-bound port context не использует nonce ledger' },
  { t: 'app.context_signing_secrets', cls: 'T', owner: 'app_owner',
    wall: 'definer-only', wallWhy: 'patient invite proof HMAC доступен только трём declared definer-функциям',
    why: 'HMAC-секрет короткоживущей авторизации start/verify/claim email-приглашения пациента' },
  { t: 'app.principal_context', cls: 'T', owner: 'app_owner',
    why: 'закрытый технический остаток DEV-схемы; новый контекст привязан к транзакции в accepted_port_contexts' },
  { t: 'drizzle.__drizzle_migrations', cls: 'T', rls: 'off', why: 'журнал применённых миграций webapp — миграции '
    + 'применяются повторно или не применяются', rlsWhy: RLS_OFF_MIGRATOR_LEDGER },
  { t: 'integrator.contacts', cls: 'P', why: 'контакты пользователя мессенджера — нельзя связать чат с телефоном '
    + 'пациента',
    drop: { verdict: 'DROP', source: 'evidence/15 §5 — 78/78 телефонов уже в public.platform_users.phone_normalized; '
      + 'легаси-фолбэк не даёт ничего' } },
  { t: 'integrator.content_access_grants', cls: 'P', why: 'временные ссылки-доступы к контенту пациента — по ссылке '
    + 'из напоминания не открывается материал',
    drop: { verdict: 'DROP', source: 'evidence/15 §2 — волна 0, 0 строк, писатель недостижим, читателя нет' } },
  { t: 'integrator.conversation_messages', cls: 'P', why: 'сообщения диалога — пропадает текст переписки с пациентом',
    defect: ['D25-foundation-identities'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §6-9 — волна 2', blockedBy: 'зеркало '
      + 'public.support_conversation_messages 34/34' } },
  { t: 'integrator.conversations', cls: 'P', why: 'диалоги поддержки — ломается переписка «пациент ↔ поддержка»',
    defect: ['D25-foundation-identities'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §6-9 — волна 2', blockedBy: 'зеркало '
      + 'public.support_conversations 21/21; писатель ещё жив (пишется на каждое сообщение поддержки)' } },
  { t: 'integrator.delivery_attempt_logs', cls: 'S', org: true, why: 'журнал попыток отправки — нельзя разобрать, '
    + 'почему письмо/СМС не ушло',
    revoke: { app_staff: 'D14/I16: payload_json содержит тело отправленного сообщения; tenant attribution '
      + 'не даёт app_staff прямого чтения, доступ остаётся только у узкой операционной capability' },
    pol: 'ЕДИНСТВЕННАЯ таблица схемы integrator, где стена реально нужна (evidence/15 §14).',
    defect: ['D14-integrator-no-wall', 'I16-integrator-queues'] },
  { t: 'integrator.idempotency_keys', cls: 'S', org: false, why: 'ключи идемпотентности API — повтор вебхука '
    + 'начинает дублировать записи и отправки',
    revoke: { app_staff: 'D14: очередь дедупа вебхуков — не место арендной роли.' },
    pol: 'приоритет низкий: ПДн нет вовсе — опровергнуто замером (~225 живых строк, response_body=\'{}\' в 261 из '
    + '261). Стены клиники/пациента не требуется', defect: ['D14-integrator-no-wall'] },
  { t: 'integrator.integration_data_quality_incidents', cls: 'S', org: false, why: 'инциденты качества внешней '
    + 'интеграции — не видно, что система прислала мусор',
    revoke: { app_staff: 'D14: raw_value может содержать исходное значение поля пациента или филиала.' },
    pol: 'по смыслу клиническая стена (инцидент принадлежит интеграции конкретной клиники), но organization_id нет; '
    + 'при 3 строках приоритет низкий (evidence/15 §19).', defect: ['D14-integrator-no-wall'] },
  { t: 'integrator.projection_outbox', cls: 'S', org: false, why: 'очередь проекций событий в webapp — события '
    + 'интегратора перестают доезжать в webapp',
    revoke: { app_staff: 'D14: payload несёт события по конкретным пациентам и записям.' },
    pol: 'приоритет понижен — ставить после переезда поддержки, когда ясен остаточный состав событий (evidence/15 '
    + '§15).', defect: ['D14-integrator-no-wall'] },
  { t: 'integrator.question_messages', cls: 'P', why: 'сообщения внутри вопроса — обрывается нитка ответа на вопрос',
    defect: ['D25-foundation-identities'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §6-9 — волна 2', blockedBy: 'зеркало '
      + 'public.support_question_messages 20/20; не читается ниоткуда' } },
  { t: 'integrator.schema_migrations', cls: 'T', rls: 'off', why: 'журнал миграций интегратора — миграции '
    + 'применяются повторно или не применяются', rlsWhy: RLS_OFF_MIGRATOR_LEDGER },
  { t: 'integrator.telegram_users', cls: 'P', why: 'легаси-хранилище Telegram-аккаунтов — ничего не ломается — '
    + 'таблица мёртвая', defect: ['D14-integrator-no-wall'],
    drop: { verdict: 'DROP', source: 'evidence/15 §1 — волна 0, 2 строки, единственная таблица, где обе оценки '
      + 'сошлись' } },
  { t: 'integrator.user_questions', cls: 'P', why: 'вопросы пациента врачу/поддержке — вопрос пациента не доходит до '
    + 'персонала', defect: ['D25-foundation-identities'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §6-9 — волна 2', blockedBy: 'зеркало public.support_questions '
      + '16/16' } },
  { t: 'integrator.user_reminder_delivery_logs', cls: 'P', org: true, why: 'журнал доставки напоминаний — не видно, '
    + 'почему напоминание не дошло', pol: '⚠ evidence/18 §6: полная проекция в public.reminder_delivery_events '
    + '(1735/1735 в обе стороны) — одна из двух таблиц уходит; какая, решает evidence/15' },
  { t: 'integrator.user_reminder_occurrences', cls: 'P', org: true, why: 'конкретные срабатывания напоминаний — '
    + 'напоминания не ставятся в очередь и дублируются', pol: 'опирается на reminder_rules; после волны 3 проверить, '
    + 'на что смотрит ветка' },
  { t: 'integrator.user_reminder_rules', cls: 'P', why: 'правила напоминаний пациента — пациент перестаёт получать '
    + 'напоминания',
    drop: { verdict: 'DROP', source: 'evidence/15 §4 — 27/27 уже в public.reminder_rules' } },
  { t: 'public.admin_audit_log', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'журнал административных '
    + 'действий — пропадает разбор «кто что сделал» и авто-мерджи конфликтов', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.app_runtime_settings', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'настройки рантайма — '
    + 'сервис теряет управляемые из кабинета настройки', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.app_runtime_settings_audit', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'кто и когда '
    + 'менял настройку — нельзя восстановить, кто сломал настройку', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.auth_rate_limit_events', cls: 'S', org: false, wall: 'definer-only', why: 'счётчик попыток '
    + 'входа/отправки кода — снимается защита от перебора OTP и OAuth-стартов', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables', 'I1-definer-plus-force'], code: ['C13'] },
  { t: 'public.be_appointment_cancellations', cls: 'P', why: 'отмены визитов — ломается политика отмен и возвратов '
    + 'предоплаты' },
  { t: 'public.be_appointment_events', cls: 'P', why: 'системные события записи — пропадает машинная история '
    + 'изменения брони',
    drop: { verdict: 'DUP-DROP', source: 'evidence/18 §3 — 434/434 совпадений с be_appointment_history_events, ноль '
      + 'SELECT во всём репозитории', blockedBy: 'убрать 6 INSERT-блоков: pgBookingEngine.ts:205,1760,1817 и '
      + 'pgBookingAppointmentLifecycle.ts:253,362,496; поправить TRUNCATE в нагрузочном скрипте' } },
  { t: 'public.be_appointment_history_events', cls: 'P', why: 'человекочитаемая история записи — врач перестаёт '
    + 'видеть «кто и когда менял запись»' },
  { t: 'public.be_appointment_no_shows', cls: 'P', why: 'неявки — не считается счётчик неявок пациента' },
  { t: 'public.be_appointment_reschedules', cls: 'P', why: 'переносы — ломается бесплатный/платный перенос и лимит '
    + 'переносов' },
  { t: 'public.be_appointment_staff_comments', cls: 'P', wall: 'clinic', why: 'внутренние комментарии персонала о '
    + 'пациенте — врач теряет заметки по визиту', wallWhy: 'РЕШЕНИЕ D2: пациентская ветка снимается — это внутренние '
    + 'комментарии персонала о нём',
    revoke: { app_patient: 'РЕШЕНИЕ D2 дословно: «он НЕ ВИДИТ внутренние комментарии»; body заполняет '
      + 'врач/администратор (pgClientHistory.ts)' },
    pol: 'РЕШЕНИЕ D2: пациентскую ветку политики (platform_user_id = app.current_patient_user_id()) снять. Закрывает '
    + 'О2 в сторону «пациент не видит»', code: ['C14'] },
  { t: 'public.be_appointments', cls: 'P', org: true, why: 'записи на приём — без них нет ни расписания врача, ни '
    + 'визита пациента' },
  { t: 'public.be_availability_rules', cls: 'C', org: true, why: 'правила доступности специалиста — не считаются '
    + 'свободные слоты' },
  { t: 'public.be_booking_form_fields', cls: 'C', org: true, why: 'конструктор полей формы записи — форма записи '
    + 'теряет настраиваемые поля' },
  { t: 'public.be_booking_form_submissions', cls: 'P', why: 'ответы пациента в форме записи — теряются данные, '
    + 'введённые пациентом при записи' },
  { t: 'public.be_branches', cls: 'C', org: true, why: 'филиалы клиники — расписание некуда привязать, ломаются '
    + 'часовые пояса' },
  { t: 'public.be_cancellation_policies', cls: 'C', org: true, why: 'политика отмен — отмены перестают штрафоваться '
    + 'по правилам клиники' },
  { t: 'public.be_clinic_services', cls: 'C', org: true, why: 'услуги клиники — не на что записываться и нечего '
    + 'считать в прайсе' },
  { t: 'public.be_organization_members', cls: 'C', org: true, why: 'членство человека в клинике — никто не '
    + 'определяется как врач/админ клиники — падает вся авторизация кабинета',
    revoke: { app_platform_settings: 'SCHEME §I Р4 + D1: платформенное чтение членств — через definer-исключение, а '
      + 'не табличный SELECT; одна из 2 живых ячеек утечки FACTS §1.2', bcb_test_integrator_login: 'I2: то же; '
      + 'резолвер получает организацию через definer (D5).', bcb_test_nonstaff_login: 'I2: грант выдан логин-роли '
      + 'напрямую.' },
    pol: 'D16: живьём relrowsecurity=false. На этой таблице стоит определение «кто врач/админ клиники», то есть '
    + 'авторизация кабинета целиком', defect: ['D16-org-members-leak', 'I2-grant-to-login'] },
  { t: 'public.be_organizations', cls: 'C', org: false, why: 'сама клиника — без неё нет арендатора вообще' },
  { t: 'public.be_package_history_events', cls: 'P', why: 'история абонемента пациента — не видно, кто '
    + 'продлил/заморозил абонемент' },
  { t: 'public.be_package_items', cls: 'C', org: false, wall: 'parent', why: 'состав абонемента-шаблона — нельзя '
    + 'описать, что входит в абонемент', wallWhy: 'organization_id нет ПО ЗАМЫСЛУ: org выводится EXISTS по родителю '
    + 'be_subscription_packages' },
  { t: 'public.be_package_usages', cls: 'P', why: 'списания сеансов абонемента — сеансы не списываются с абонемента' },
  { t: 'public.be_patient_booking_profiles', cls: 'P', wall: 'clinic', why: 'профиль пациента у клиники — нельзя '
    + 'заблокировать самозапись проблемному пациенту', wallWhy: 'РЕШЕНИЕ D2: пациентская ветка снимается — '
    + '«проблемный», блокировка, счётчик неявок',
    revoke: { app_patient: 'РЕШЕНИЕ D2: «пометка проблемный и тд» — служебная оценка клиники (is_problematic, '
      + 'booking_blocked, no_show_count); пациенту не показывается' },
    pol: 'РЕШЕНИЕ D2: снять пациентскую ветку политики. Закрывает FINDINGS О2', code: ['C14'] },
  { t: 'public.be_patient_package_items', cls: 'P', org: false, wall: 'parent+patient', why: 'состав купленного '
    + 'абонемента — не известно, сколько сеансов какой услуги куплено', wallWhy: 'organization_id нет ПО ЗАМЫСЛУ: '
    + 'org и пациент выводятся EXISTS по be_patient_packages' },
  { t: 'public.be_patient_packages', cls: 'P', why: 'купленные пациентом абонементы — абонементы перестают '
    + 'списываться и показываться' },
  { t: 'public.be_patient_timeline_events', cls: 'P', why: 'лента событий пациента — пропадает единая хронология по '
    + 'клиенту' },
  { t: 'public.be_payment_history_events', cls: 'P', why: 'история платежей пациента — пропадает платёжная '
    + 'хронология в карточке пациента' },
  { t: 'public.be_payment_intents', cls: 'P', why: 'намерения оплаты — не создаётся ссылка на оплату/предоплату' },
  { t: 'public.be_payment_provider_events', cls: 'C', org: true, why: 'сырые вебхуки платёжного провайдера — платёж '
    + 'не подтверждается автоматически' },
  { t: 'public.be_payments', cls: 'P', why: 'платежи пациента — нет учёта оплат визитов' },
  { t: 'public.be_prepayment_policies', cls: 'C', org: true, why: 'политика предоплаты по услуге — не берётся '
    + 'предоплата' },
  { t: 'public.be_refunds', cls: 'P', why: 'возвраты — нельзя вернуть предоплату' },
  { t: 'public.be_reschedule_policies', cls: 'C', org: true, why: 'политика переносов — пациент переносит визит без '
    + 'ограничений' },
  { t: 'public.be_rooms', cls: 'C', org: true, why: 'кабинеты филиала — нельзя развести приёмы по кабинетам' },
  { t: 'public.be_schedule_blocks', cls: 'C', org: true, why: 'блокировки времени (отпуск, перерыв) — врача '
    + 'записывают в занятое/нерабочее время' },
  { t: 'public.be_schedule_templates', cls: 'C', org: true, why: 'Шаблоны рабочего дня клиники — без неё нельзя '
    + 'быстро назначить типовой график' },
  { t: 'public.be_service_location_availability', cls: 'C', org: true, why: 'Где оказывается услуга — без неё запись '
    + 'не знает, в каком филиале доступна услуга' },
  { t: 'public.be_specialist_locations', cls: 'C', org: true, why: 'Специалист ↔ филиал — без неё специалист не '
    + 'привязан к филиалу — слоты не строятся' },
  { t: 'public.be_specialist_rooms', cls: 'C', org: true, why: 'Специалист ↔ кабинет — распределение по кабинетам '
    + 'при записи' },
  { t: 'public.be_specialist_service_availability', cls: 'C', org: true, why: 'Какой специалист какую услугу '
    + 'оказывает — ядро подбора слота: без неё публичная запись пуста',
    revoke: { bcb_test_nonstaff_login: 'I2: то же (ч.2 В5).' },
    defect: ['I2-grant-to-login'] },
  { t: 'public.be_specialists', cls: 'C', org: true, why: 'Карточка специалиста клиники — витрина записи и '
    + 'расписание без специалистов не существуют',
    revoke: { bcb_test_nonstaff_login: 'I2: табличный грант выдан логин-роли напрямую (ч.2 В5).' },
    defect: ['I2-grant-to-login'] },
  { t: 'public.be_subscription_packages', cls: 'C', org: true, why: 'Абонементы клиники — без неё нельзя '
    + 'продать/списать абонемент' },
  { t: 'public.be_working_days', cls: 'C', org: true, why: 'График на конкретную дату (перекрывает недельный) — '
    + 'разовые изменения графика (отпуск, дополнительный день)' },
  { t: 'public.be_working_hours', cls: 'C', org: true, why: 'Недельный график — базовое расписание — без него нет ни '
    + 'одного слота' },
  { t: 'public.booking_calendar_map', cls: 'S', org: false, wall: 'definer-only', why: 'Связь записи с событием '
    + 'Google Calendar — без неё запись пациента не отражается/не удаляется в календаре врача',
    wallWhy: 'шов Google Calendar: токенов и org-колонки нет, ходить только через definer (D22)',
    defect: ['D22-booking-calendar-map', 'I1-definer-plus-force'] },
  { t: 'public.booking_cities', cls: 'R', wall: 'reference-org-copy', why: 'города каталога записи (2 строки) — шов '
    + 'listActiveBookingCities мёртв, в коде остались только code-строки', wallWhy: W_REF_COPY,
    revoke: { app_staff: 'D3+D21: клиника A переименовывает/удаляет город, который видит клиника B; запись в '
      + 'глобальный шаблон запрещена' },
    defect: ['D21-reference-write'], gate: ['O4-dead-tables'], code: ['C15'] },
  { t: 'public.broadcast_audit', cls: 'C', org: true, why: 'Журнал рассылок клиники — без неё нет истории рассылок и '
    + 'счётчиков доставки', pol: 'I4: app_owner=r без политики — тот же класс тихого нуля.',
    defect: ['I4-dead-grant'] },
  { t: 'public.broadcast_audit_recipients', cls: 'P', org: true, why: 'Кому ушла рассылка — пациент видит '
    + 'адресованные ему рассылки; врач — охват' },
  { t: 'public.broadcast_drafts', cls: 'C', org: true, why: 'Черновики рассылок — врач теряет несохранённый текст '
    + 'рассылки' },
  { t: 'public.channel_link_secrets', cls: 'S', org: false, wall: 'definer-only', why: 'Одноразовые секреты привязки '
    + 'мессенджера — привязка Telegram/MAX к аккаунту', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.clinic_dedicated_bot_bindings', cls: 'C', org: true, why: 'Привязка собственного бота клиники — без '
    + 'неё вебхук собственного бота клиники не маршрутизируется', pol: 'I4 «мёртвый грант»: app_staff=arwd без '
    + 'staff-политики при FORCE RLS = тихий ноль. Либо отозвать грант (путь идёт через definer), либо дописать '
    + 'политику', defect: ['I4-dead-grant'] },
  { t: 'public.clinic_public_directory_entries', cls: 'C', org: true, why: 'Публичная витрина клиники — без неё '
    + 'клиника не находится по публичной ссылке записи' },
  { t: 'public.clinical_anamnesis_illness', cls: 'P', org: true, why: 'Анамнез: перенесённые болезни и стрессы — без '
    + 'неё врач теряет историю болезней пациента в карточке' },
  { t: 'public.clinical_anamnesis_lifestyle', cls: 'P', org: true, why: 'Анамнез: образ жизни — блок «Образ жизни» в '
    + 'карточке пациента' },
  { t: 'public.clinical_anamnesis_trauma', cls: 'P', org: true, why: 'Анамнез: травмы и операции — блок «Травмы и '
    + 'операции»' },
  { t: 'public.clinical_complaint', cls: 'P', org: true, why: 'Жалобы пациента — без неё нет списка жалоб и их '
    + 'закрытия' },
  { t: 'public.clinical_complaint_update', cls: 'P', org: true, why: 'Динамика жалобы по визитам — без неё жалоба '
    + 'статична, нет истории «стало лучше/хуже»' },
  { t: 'public.clinical_diagnosis', cls: 'P', org: true, why: 'Диагнозы пациента — основной клинический артефакт '
    + 'карточки' },
  { t: 'public.clinical_diagnosis_catalog', cls: 'C', org: true, why: 'Справочник диагнозов клиники — врач выбирает '
    + 'диагноз из своего справочника' },
  { t: 'public.clinical_diagnosis_status_history', cls: 'P', org: true, why: 'Журнал смены статуса диагноза — аудит: '
    + 'кто и когда снял/поставил диагноз' },
  { t: 'public.clinical_diagnosis_update', cls: 'P', org: true, why: 'Уточнения диагноза по визитам — без неё '
    + 'диагноз не уточняется от визита к визиту' },
  { t: 'public.clinical_test_measure_kinds', cls: 'R', org: false, wall: 'pending-removal', rls: 'n/a',
    disp: 'REMOVED', why: 'УДАЛЕНО миграцией 0394: виды измерений перенесены в organization-scoped '
      + 'reference_categories/reference_items; возможные legacy-строки скопированы каждой существующей клинике',
    wallWhy: 'Физически удалённая глобальная legacy-таблица остаётся именованной для двусторонней проверки каталога',
    defect: ['D21-reference-write'], code: ['C15'] },
  { t: 'public.clinical_test_regions', cls: 'C', org: true, why: 'Связка «клинический тест ↔ регион тела» — фильтр '
    + 'тестов по региону тела', pol: 'РЕШЕНИЕ D2: пациенту гранта НЕТ и не будет — клинические тесты с приёма ему не '
    + 'показываются. Объявленное КОНЕЧНОЕ состояние (закрывает О2), а не пробел' },
  { t: 'public.clinical_visit', cls: 'P', org: true, why: 'Клинический визит — приём как таковой: осмотр, '
    + 'манипуляции, рекомендации' },
  { t: 'public.comments', cls: 'P', org: true, why: 'Комментарии к сущностям — диалог врач↔пациент вокруг '
    + 'упражнений, тестов, программ', pol: 'D10 ЗАКРЫТ 19.08: дизъюнкт target_type = '
    + 'ANY(exercise,test,test_set,recommendation,lesson) стоял БЕЗ условия и в USING, и в WITH CHECK — сотрудник '
    + 'клиники A правил комментарии клиники B. Каталожный вырез теперь несёт свою организацию '
    + '(rls-sql-renderer.mjs sharedScopeSql): «общая» строка общая ВНУТРИ своей клиники' },
  { t: 'public.content_access_grants_webapp', cls: 'P', org: true, why: 'Выданные пациенту доступы к контенту — '
    + 'пациент теряет доступ к выданным ему материалам' },
  { t: 'public.content_pages', cls: 'C', org: true, wall: 'clinic+patient',
    wallWhy: 'Сотрудник управляет CMS своей клиники; пациент читает только опубликованные страницы своей клиники',
    why: 'Страницы CMS — контент, который читает пациент',
    pol: 'I5/C18: политика c4_web_push_reminder_catalog читает org сырым current_setting, остальные — '
    + 'app.current_org_id(). Свести к одному аксессору, иначе D6 обходится', defect: ['I5-two-org-accessors'],
    code: ['C18'] },
  { t: 'public.content_section_slug_history', cls: 'C', org: true, wall: 'clinic+patient',
    wallWhy: 'Сотрудник ведёт историю slug своей клиники; пациент использует её только для перехода внутри своей клиники',
    why: 'История переименований разделов — старые '
    + 'ссылки пациента не ломаются после переименования', pol: 'плюс пациентское чтение. I6: политика '
    + 'patient_current_org_select выдана роли public вместо app_patient — привести к app_patient',
    defect: ['I6-policy-to-public'] },
  { t: 'public.content_sections', cls: 'C', org: true, wall: 'clinic+patient',
    wallWhy: 'Сотрудник управляет разделами своей клиники; пациент читает только видимые разделы своей клиники',
    why: 'Разделы CMS — навигация пациентского контента',
    pol: 'то же, что content_pages (I5 / C18)', defect: ['I5-two-org-accessors'], code: ['C18'] },
  { t: 'public.courses', cls: 'C', org: true, why: 'Курсы клиники — платный/бесплатный курс как продукт клиники' },
  { t: 'public.doctor_notes', cls: 'P', org: true, why: 'Заметки врача о пациенте — личные пометки врача по клиенту' },
  { t: 'public.doctor_patient_support', cls: 'P', org: true, why: 'Флаги сопровождения пациента — определяет, ведёт '
    + 'ли врач клиента и открыты ли ему чат/медиа' },
  { t: 'public.email_challenges', cls: 'S', org: false, wall: 'definer-only', why: 'Коды подтверждения почты — вход '
    + 'и подтверждение почты', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.email_otp_locks', cls: 'S', org: false, wall: 'definer-only', why: 'Блокировка после неудачных '
    + 'попыток — защита входа от перебора кода', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.email_send_cooldowns', cls: 'S', org: false, wall: 'definer-only', why: 'Антиспам отправки писем — '
    + 'без неё письма уходят пачками', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.idempotency_keys', cls: 'S', org: false, why: 'кэш ответов межсервисного API (1 251 959 строк по '
    + 'reltuples) — повтор вебхука не выполняет операцию дважды',
    revoke: { app_staff: 'D19: response_body несёт тела ответов по обращениям пациентов и привязке телефонов — '
      + 'арендной роли на межсервисном кэше не место' },
    pol: '⚠ GAP G11: объём под вопросом (1 251 959 строк по reltuples против 0 строк на TEST) — нужен count(*). На '
    + 'сам дефект стены не влияет', defect: ['D19-operator-tables', 'I1-definer-plus-force'] },
  { t: 'public.integration_webhook_error_events', cls: 'S', org: false, why: 'Ошибки входящих вебхуков — диагностика '
    + 'молчащего вебхука',
    revoke: { app_staff: 'D19: арендная роль может писать и УДАЛЯТЬ записи об ошибках интеграций платформы.' },
    defect: ['D19-operator-tables'] },
  { t: 'public.integration_webhook_last_status', cls: 'S', org: false, why: 'Последний статус вебхука — панель '
    + 'здоровья интеграций',
    revoke: { app_staff: 'D19: платформенная телеметрия входящих вебхуков.' },
    defect: ['D19-operator-tables'] },
  { t: 'public.integrator_push_outbox', cls: 'S', org: false, why: 'Очередь исходящих push к integrator — без неё '
    + 'webapp не дотолкает событие до integrator при сбое',
    revoke: { app_staff: 'D19: межсервисная очередь событий — стена своей роли; арендной роли здесь не место.' },
    defect: ['D19-operator-tables'] },
  { t: 'public.lfk_complex_exercises', cls: 'P', org: true, why: 'Строки комплекса пациента — сам состав назначения '
    + '(что и сколько делать)' },
  { t: 'public.lfk_complex_template_exercises', cls: 'C', org: true, wall: 'reference-org-copy', why: 'Строки '
    + 'шаблона — состав шаблонного комплекса', wallWhy: W_REF_COPY },
  { t: 'public.lfk_complex_templates', cls: 'C', org: true, wall: 'reference-org-copy', why: 'Шаблоны комплексов — '
    + 'библиотека готовых комплексов клиники и платформы', wallWhy: W_REF_COPY },
  { t: 'public.lfk_complexes', cls: 'P', org: true, why: 'Назначенные пациенту комплексы ЛФК — без неё пациент не '
    + 'получает назначенных упражнений', pol: 'I12: пациентская ветка смотрит только на platform_user_id, а колонок '
    + 'две (есть legacy user_id text) — строка с NULL пациенту невидима (подкласс D27: стена прячет данные)',
    defect: ['I12-two-patient-keys'] },
  { t: 'public.lfk_exercise_media', cls: 'C', org: true, wall: 'reference-org-copy', why: 'Видео/картинки упражнения '
    + '— пациент не видит показ упражнения', wallWhy: W_REF_COPY },
  { t: 'public.lfk_exercise_regions', cls: 'C', org: true, wall: 'reference-org-copy', why: 'Упражнение ↔ регион '
    + 'тела — фильтр упражнений по региону', wallWhy: W_REF_COPY },
  { t: 'public.lfk_exercises', cls: 'C', org: true, wall: 'reference-org-copy', why: 'Каталог упражнений — без '
    + 'каталога упражнений нет назначений', wallWhy: W_REF_COPY },
  { t: 'public.lfk_sessions', cls: 'P', org: true, why: 'Дневник выполнения ЛФК — без неё нет дневника и статистики '
    + 'выполнения' },
  { t: 'public.login_tokens', cls: 'S', org: false, wall: 'definer-only', why: 'Одноразовые токены входа — вход по '
    + 'ссылке/коду', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.manual_patient_commands', cls: 'P', org: true, wall: 'clinic', why: 'Идемпотентность ручных команд по '
    + 'пациенту — защита от двойного выполнения ручной команды (приглашение и т.п.)', wallWhy: 'служебная '
    + 'идемпотентность действий персонала — пациентской ветки нет по построению' },
  { t: 'public.material_ratings', cls: 'P', org: true, why: 'Оценки материалов пациентом — обратная связь по '
    + 'материалам, отчёты врачу' },
  { t: 'public.media_files', cls: 'C', org: true, why: 'Файлы медиатеки — хранилище всех медиа: видео упражнений, '
    + 'логотипы, файлы пациента', pol: 'D9: в пациентской ветке saas_org_dormant_p0_8_3 нет проверки organization_id '
    + '— пациент клиники A читает s3_key любого файла клиники B', defect: ['D9-media-files'] },
  { t: 'public.media_folders', cls: 'P', org: true, why: 'Папки медиатеки, в т.ч. личные папки пациентов — файлы '
    + 'клиента и библиотека клиники раскладываются по папкам', pol: 'D11 ЗАКРЫТ 19.08: дизъюнкт без условий '
    + '(patient_user_id IS NULL) пропускал всю библиотеку клиники любой сессии с грантом — и в USING, и в WITH '
    + 'CHECK. Замер на bcb_webapp_dev: сотрудник клиники d0000000-…-0004 видел 11 строк клиники a0000000-…-0001, '
    + 'после правки — 0, своя библиотека по-прежнему 11. Вырез «строка без владельца» теперь несёт организацию '
    + '(rls-sql-renderer.mjs sharedScopeSql)' },
  { t: 'public.media_hls_proxy_error_events', cls: 'T', org: true, wall: 'platform-role', why: 'Отказы HLS-прокси — '
    + 'диагностика «видео не играет» у конкретного пациента', wallWhy: W_PLATFORM_TELEMETRY, pol: 'I7: у app_staff '
    + 'есть awd, но нет r, при этом код строит SELECT-агрегаты (playbackClientEvents.ts:113-127) — несогласованный '
    + 'набор привилегий.', defect: ['I7-privilege-mismatch'] },
  { t: 'public.media_playback_client_events', cls: 'T', org: true, wall: 'platform-role', why: 'Клиентские события '
    + 'плеера — понять, почему у пациента не грузится видео', wallWhy: W_PLATFORM_TELEMETRY, pol: 'I7: тот же '
    + 'несогласованный набор (awd без r).', defect: ['I7-privilege-mismatch'] },
  { t: 'public.media_playback_resolution_events', cls: 'T', org: true, wall: 'platform-role', why: 'Как отдавалось '
    + 'видео — оценка минут просмотра в отчётах', wallWhy: W_PLATFORM_TELEMETRY },
  { t: 'public.media_playback_stats_hourly', cls: 'T', org: true, wall: 'platform-role', why: 'Почасовой агрегат '
    + 'воспроизведений — дешёвый график вместо скана событий', wallWhy: W_PLATFORM_TELEMETRY,
    revoke: { app_staff: 'D21: прямое чтение/запись агрегата не выдаётся арендной роли; organization_id разделяет '
      + 'строки клиник, а выдача идёт через узкую curated capability' },
    defect: ['D21-reference-write'] },
  { t: 'public.media_playback_user_video_first_resolve', cls: 'P', org: true, why: 'отметка «впервые досмотрел '
    + 'видео» — без неё нет метрики первого просмотра', pol: 'I7: вставку делает ПАЦИЕНТСКАЯ сессия, гранта у '
    + 'app_patient нет, ошибка глотается — метрика молча пишется в ноль. Назвать роль пути и привести грант к ней',
    defect: ['I7-privilege-mismatch'], code: ['C10'] },
  { t: 'public.media_transcode_jobs', cls: 'T', org: true, wall: 'clinic', why: 'очередь перекодирования видео — без '
    + 'неё загруженное видео не превращается в проигрываемое', wallWhy: 'очередь принадлежит клинике; ветки воркеров '
    + 'мимо org-фильтра — ИМЕНОВАННОЕ исключение (I11)', pol: 'ИМЕНОВАННОЕ исключение: ветки '
    + 'pg_has_role(...,\'app_worker\'/\'app_operational_media_worker\') идут мимо org-фильтра НАМЕРЕННО — «фильтр '
    + 'воркера на ENQUEUE, не в RLS» (I11)', defect: ['I11-worker-bypass'] },
  { t: 'public.media_upload_sessions', cls: 'P', org: true, why: 'сессия многочастной загрузки файла — без неё '
    + 'нельзя загрузить файл/видео кусками (обрывы, докачка)' },
  { t: 'public.message_log', cls: 'P', org: true, why: 'журнал отправленных человеку сообщений — без неё врач не '
    + 'видит историю переписки с пациентом и не доказать факт отправки' },
  { t: 'public.motivational_quotes', cls: 'C', org: true, why: 'мотивационные цитаты клиники — без неё пропадает '
    + 'блок цитаты на главной пациента', pol: 'I13: контент пациентский, но у app_patient ни гранта, ни политики — '
    + 'под пациентской ролью 42501. Установить фактом, под какой ролью рендерится экран',
    defect: ['I13-patient-content-no-path'] },
  { t: 'public.notification_delivery_attempts', cls: 'P', org: true, why: 'попытки доставки уведомления — без неё не '
    + 'видно, дошло ли напоминание, и не работает диагностика доставки', pol: 'I5/C18: та же форма сырого '
    + 'current_setting в web-push-политике. D27: 8 строк из 12 626 с organization_id IS NULL.',
    defect: ['D27-empty-org-discriminator', 'I5-two-org-accessors'], gate: ['O3-empty-tenant-discriminator'],
    code: ['C18'] },
  { t: 'public.online_intake_answers', cls: 'P', org: true, why: 'ответы на анкету первичного обращения — без неё '
    + 'теряется содержимое онлайн-заявки пациента', gate: ['O4-dead-tables'] },
  { t: 'public.online_intake_attachments', cls: 'P', org: true, why: 'файлы к анкете — без неё не удалить файлы '
    + 'пациента из S3 при purge; без неё не приложить документы к заявке', gate: ['O4-dead-tables'] },
  { t: 'public.online_intake_requests', cls: 'P', org: true, why: 'сама заявка — без неё нет входящего потока '
    + 'онлайн-обращений', gate: ['O4-dead-tables'] },
  { t: 'public.online_intake_status_history', cls: 'P', org: true, why: 'смена статуса заявки — без неё нет аудита '
    + '«кто перевёл заявку в отказ»', gate: ['O4-dead-tables'] },
  { t: 'public.operator_health_alert_sent', cls: 'S', org: false, why: 'отметки «алерт с таким ключом уже отправлен» '
    + '— без неё оператор получает один и тот же алерт бесконечно',
    revoke: { app_staff: 'D19: SET ROLE app_staff даёт 56 строк с полным CRUD.' },
    defect: ['D19-operator-tables'] },
  { t: 'public.operator_health_failure_archive', cls: 'C', org: true, why: 'архив разобранных отказов здоровья — без '
    + 'неё админ не может «закрыть» разобранный инцидент и он висит вечно',
    revoke: { app_platform_settings: 'РЕШЕНИЕ D1: USING true отдаёт платформе архив отказов ВСЕХ клиник вместе с '
      + 'doctor_user_id — это медицина, вне коммерции и каркаса' },
    code: ['C1'] },
  { t: 'public.operator_incidents', cls: 'S', org: false, why: 'реестр инцидентов интеграций — без неё платформа не '
    + 'знает, что интеграция сломалась; на ней стоит вся панель здоровья',
    revoke: { app_staff: 'D19: SET ROLE app_staff даёт 9 строк реестра инцидентов платформы (включая '
      + 'alert_claim_token) с полным CRUD' },
    defect: ['D19-operator-tables'] },
  { t: 'public.operator_job_status', cls: 'S', org: false, why: 'состояние фоновых задач — без неё не видно, живы ли '
    + 'крон-задачи; это корень 61 050 отказов из FACTS §1.1',
    revoke: { app_staff: 'D12: политика saas_enforce_default_deny_p0_9_1 выдана PUBLIC с USING true; SET ROLE '
      + 'app_staff даёт 20 строк состояния планировщика платформы с полным CRUD' },
    pol: 'реальный предикат стены платформенной роли вместо USING true. Эта же таблица — корень 61 050 отказов FACTS '
    + '§1.1.', defect: ['D12-operator-job-status'] },
  { t: 'public.org_brand_revisions', cls: 'C', org: true, why: 'ревизии брендинга клиники — без неё клиника не может '
    + 'менять логотип/название с версионированием' },
  { t: 'public.org_enrollments', cls: 'P', org: true, why: 'прикрепление человека к клинике — на неё опирается вся '
    + 'стена арендатора' },
  { t: 'public.organization_member_invites', cls: 'C', org: true, why: 'приглашения сотрудников — без неё нельзя '
    + 'завести второго врача в клинику' },
  { t: 'public.organization_slug_claims', cls: 'C', org: true, why: 'занятые адреса клиник — без неё две клиники '
    + 'займут один публичный адрес', pol: 'ОБЪЯВЛЕННЫЙ definer-шов проверки занятости (I10): в реестре уникальности '
    + 'чужая занятая строка невидима, выглядит свободной, и UNIQUE падает на вставке',
    defect: ['I10-slug-uniqueness'] },
  { t: 'public.organization_slug_rename_events', cls: 'C', org: true, why: 'журнал переименований — без неё нет '
    + 'аудита смены публичного адреса' },
  { t: 'public.outgoing_delivery_queue', cls: 'S', org: true, why: 'очередь исходящих сообщений — без неё не уходит '
    + 'ни одно сообщение пациенту',
    revoke: { app_staff: 'D18: 812 строк с payload_json (тела сообщений пациентам) читает терминал персонала любой '
      + 'клиники без принципала' },
    pol: 'клиническая стена невозможна ДО backfill: 812 из 812 строк несут organization_id IS NULL (D27/O3) — '
    + 'включение org-стены в лоб отрежет всю доставку',
    defect: ['D18-outgoing-delivery-queue', 'D27-empty-org-discriminator'], gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.password_altcha_challenges', cls: 'S', org: false, wall: 'definer-only', why: 'одноразовые '
    + 'задачи-«капчи» при входе по паролю — без неё вход по паролю открыт для перебора', wallWhy: W_AUTH_DEFINER,
    defect: ['I1-definer-plus-force'] },
  { t: 'public.password_login_identifier_protection', cls: 'S', org: false, wall: 'definer-only', why: 'защита от '
    + 'перебора по идентификатору — без неё пароль подбирается без ограничений', wallWhy: W_AUTH_DEFINER,
    defect: ['I1-definer-plus-force'] },
  { t: 'public.patient_bookings', cls: 'P', org: true, why: 'старые записи на приём — легаси-таблица записей; без '
    + 'неё теряется история бронирований до перехода на `be_appointments`', pol: 'D17: сегодня off/off, и 263 строки '
    + 'контактов читает app_staff без принципала. ⚠ 219 из 263 строк с organization_id IS NULL — сперва гейт O3',
    defect: ['D17-patient-bookings', 'D27-empty-org-discriminator'], gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.patient_comorbidity', cls: 'P', org: true, why: 'сопутствующие заболевания — без неё врач не видит '
    + 'фон пациента' },
  { t: 'public.patient_content_rating_feedback', cls: 'P', org: true, why: 'оценка материала пациентом — без неё нет '
    + 'обратной связи по контенту' },
  { t: 'public.patient_daily_warmup_presentations', cls: 'P', org: true, why: 'какая «разминка дня» показана '
    + 'пациенту — без неё не ротируется ежедневный контент — пациент видит одно и то же' },
  { t: 'public.patient_daily_warmup_video_views', cls: 'P', org: true, why: 'просмотры видео-разминки — без неё нет '
    + 'отметки «сделал разминку» и админ-статистики', defect: ['D27-empty-org-discriminator'],
    gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.patient_diary_day_snapshots', cls: 'P', org: true, why: 'слепок дня пациента — без неё дневник и '
    + '«активность по дням» в карточке пациента пусты', defect: ['D27-empty-org-discriminator'],
    gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.patient_files', cls: 'P', org: true, why: 'файлы в карте пациента — без неё нет медицинских '
    + 'документов в карте и не считается квота хранилища клиники' },
  { t: 'public.patient_home_block_items', cls: 'C', org: true, why: 'элементы блоков — без неё блоки пустые' },
  { t: 'public.patient_home_blocks', cls: 'C', org: true, why: 'блоки главной пациента (настройка клиники) — без неё '
    + 'главная пациента пустая' },
  { t: 'public.patient_invites', cls: 'P', org: true, wall: 'clinic', why: 'приглашение пациента в портал — без неё '
    + 'врач не может пригласить пациента в личный кабинет', wallWhy: 'секрет приглашения выпускает клиника; пациент '
    + 'читает его не из таблицы, а по ссылке' },
  { t: 'public.patient_lfk_assignments', cls: 'P', org: true, why: 'назначенные пациенту комплексы ЛФК — без неё '
    + 'пациент не видит назначенных упражнений' },
  { t: 'public.patient_merge_candidates', cls: 'P', org: true, wall: 'clinic', why: 'кандидаты на слияние дублей '
    + 'пациента — без неё дубли пациентов не всплывают админу клиники', wallWhy: 'разбор дублей — работа админа '
    + 'клиники; пациенту эта очередь не показывается' },
  { t: 'public.patient_payment', cls: 'P', org: true, why: 'платежи пациента — без неё нет финансовой истории по '
    + 'пациенту' },
  { t: 'public.patient_practice_completions', cls: 'P', org: true, why: 'выполненные практики и самочувствие — без '
    + 'неё нет календаря упражнений и трекинга самочувствия', defect: ['D27-empty-org-discriminator'],
    gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.patient_specialist_links', cls: 'P', org: true, why: 'связь «пациент ↔ специалист» — без неё «свой '
    + 'пациент» невыразим (VISIBILITY_MODEL_GAP §1)', defect: ['D24-dev-force-off'] },
  { t: 'public.phone_challenges', cls: 'S', org: false, wall: 'definer-only', why: 'SMS-челленджи входа, код ОТП '
    + 'лежит открытым текстом — без неё нет входа по телефону и публичной записи', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.phone_messenger_bind_secrets', cls: 'S', org: false, wall: 'definer-only', why: 'секреты привязки '
    + 'мессенджера к телефону — без неё нельзя привязать Telegram/MAX к аккаунту', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.phone_otp_locks', cls: 'S', org: false, wall: 'definer-only', why: 'блокировки по телефону после '
    + 'неудачных ОТП — без неё ОТП перебирается', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.platform_user_contacts', cls: 'P', org: true, why: 'дополнительные контакты человека — без неё нет '
    + 'запасных телефонов/почт пациента для связи и дедупликации', pol: 'D7: нет ветки current_patient_user_id(), '
    + 'app_patient держит SELECT, первый дизъюнкт не требует is_staff() — пациент читает контакты всех людей '
    + 'клиники; второй открывает строки organization_id IS NULL без принципала',
    defect: ['D7-platform-user-contacts'] },
  { t: 'public.platform_users', cls: 'P', org: false, why: 'единственная таблица ПДн — без неё нет ни одного '
    + 'человека в системе',
    grants: {
      app_patient: {
        privs: [{"kind":"columns","priv":"UPDATE","columns":["calendar_timezone","reminder_muted_until"]}],
        why: 'пациент правит СВОИ настройки напоминаний; колоночный грант — живой механизм (FACTS §1.4, evidence/13 '
        + '§2.5). Табличная проверка без колоночной здесь врёт.' },
      app_web_push_reminder_discovery_definer: {
        privs: [{"kind":"columns","priv":"SELECT","columns":["reminder_muted_until"]}], why: 'discovery-шов web-push '
        + 'читает ровно одну колонку, чтобы не будить замьюченных (evidence/13 §2.5).' } },
    revoke: { app_identity_bootstrap: 'D5: bootstrap-политики проверяют «кто ты» (pg_has_role … member) и ничего про '
      + 'строку; весь путь регистрации уезжает в definer-аксессор (I15 вариант «в»)',
      bcb_test_integrator_login: 'D5/I2: то же; после D5 логин интегратора имеет ровно один вход — definer '
        + 'резолвера.',
      bcb_test_nonstaff_login: 'D5/I2: табличный SELECT выдан ЛОГИН-роли — под ним читаются все 278 строк ПДн; '
      + 'гранты живут на рантайм-ролях, логин получает права членством' },
    pol: 'RLS+FORCE (SCHEME §I Р3 — единственная стена на 278 строк ПДн). Предикат обязан фильтровать СТРОКУ, а не '
    + 'роль.', defect: ['D5-identity-bootstrap', 'I15-bootstrap-form', 'I2-grant-to-login'], code: ['C13'] },
  { t: 'public.product_analytics_events_recent', cls: 'P', org: true, why: 'сырые события продукта — без неё нет '
    + 'продуктовой аналитики и воронки регистрации',
    revoke: { app_platform_settings: 'РЕШЕНИЕ D1: политика product_analytics_registration_platform_operations_select '
      + 'даёт кросс-арендные события регистрации с user_id' },
    code: ['C2'] },
  { t: 'public.product_analytics_hourly', cls: 'C', org: true, why: 'агрегат событий по часам (без человека) — без '
    + 'неё нет агрегированных графиков продукта', pol: 'D23: relrowsecurity=false при pol=1 — политика написана и '
    + 'молча не работает. ⚠ 5300 из 5421 строк с organization_id IS NULL — сперва гейт O3',
    defect: ['D23-analytics-policy-inert', 'D27-empty-org-discriminator'], gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.product_analytics_user_hourly', cls: 'P', org: true, why: 'почасовая активность человека — без неё '
    + 'врач не видит, заходит ли пациент в приложение' },
  { t: 'public.product_push_notifications', cls: 'P', org: true, why: 'отправленные push’и — без неё нельзя связать '
    + 'открытие приложения с конкретным push’ем', pol: 'I5/C18: сырой current_setting в web-push-политике.',
    defect: ['I5-two-org-accessors'], code: ['C18'] },
  { t: 'public.program_action_log', cls: 'P', org: true, why: 'действия пациента по программе лечения — без неё врач '
    + 'не видит, что пациент делал по программе' },
  { t: 'public.program_item_discussion_messages', cls: 'P', org: true, why: 'переписка врач↔пациент по пункту '
    + 'программы — без неё нет комментариев к упражнению — ключевой канал общения' },
  { t: 'public.program_item_discussion_reads', cls: 'P', org: true, why: 'отметки прочтения обсуждения — без неё '
    + 'счётчики непрочитанного врут' },
  { t: 'public.recommendation_regions', cls: 'C', org: true, why: 'связь рекомендация↔область тела — без неё не '
    + 'работают фильтры каталога по области тела' },
  { t: 'public.recommendations', cls: 'C', org: true, why: 'справочник рекомендаций клиники — без неё врачу нечего '
    + 'назначать' },
  { t: 'public.reference_catalog_baselines', cls: 'R', org: false, wall: 'definer-only', why: 'версионированные '
    + 'глобальные шаблоны справочников — без них новая клиника создаётся пустой', wallWhy: 'платформенный '
    + 'шаблон-эталон: вход только через засевочный definer-шов, арендной роли грантов нет' },
  { t: 'public.reference_catalog_snapshot_receipts', cls: 'T', org: true, wall: 'reference-org-copy',
    why: 'расписка «этой клинике справочник уже засеян» — без неё справочник клиники будет пересеян поверх правок '
    + 'врача', wallWhy: 'расписка о засеве копии ДЛЯ ЭТОЙ организации — истинная org-таблица (G7 закрыт), а не '
    + 'глобальный справочник', pol: 'RLS+FORCE обязателен (D26), но включать осознанно: расписку читают ПОЛИТИКИ '
    + 'reference_categories/_items через EXISTS. Гранты — только app_owner', defect: ['D26-receipts-no-rls'] },
  { t: 'public.reference_categories', cls: 'C', org: true, wall: 'reference-org-copy', why: 'категории справочников '
    + 'клиники — без неё пусты все выпадающие списки каталогов', wallWhy: W_REF_COPY, pol: 'ЭТАЛОН D3: staff по org '
    + '+ reference_catalog_patient_select (org + активный org_enrollments) + reference_catalog_seed_owner для '
    + 'app_owner, живой пока нет расписки' },
  { t: 'public.reference_items', cls: 'C', org: true, wall: 'reference-org-copy', why: 'элементы справочников '
    + 'клиники — без них выпадающие списки каталогов пусты', wallWhy: W_REF_COPY, pol: 'та же эталонная форма D3, '
    + 'что у reference_categories' },
  { t: 'public.reminder_delivery_events', cls: 'P', org: true, why: 'события доставки напоминаний из интегратора — '
    + 'без неё не видно, дошло ли напоминание, и не считается здоровье конвейера', pol: '⚠ evidence/18 §6: дубль '
    + 'integrator.user_reminder_delivery_logs 1735/1735 — одна из двух уходит' },
  { t: 'public.reminder_journal', cls: 'P', org: true, why: 'действия пациента с напоминанием — без неё пациент не '
    + 'видит истории «отложил/пропустил»', defect: ['D27-empty-org-discriminator'],
    gate: ['O3-empty-tenant-discriminator'] },
  { t: 'public.reminder_occurrence_history', cls: 'P', org: true, why: 'история срабатываний напоминаний — без неё '
    + 'нет истории напоминаний и статистики соблюдения режима' },
  { t: 'public.reminder_rules', cls: 'P', org: true, why: 'правила напоминаний пациенту — без неё пациент перестаёт '
    + 'получать напоминания' },
  { t: 'public.saas_billing_accounts', cls: 'C', why: 'платёжный профиль клиники — без неё клиника не выставит счёт',
    defect: ['D4-role-escalation'] },
  { t: 'public.saas_billing_invoices', cls: 'C', why: 'счета — оплата подписки', defect: ['D4-role-escalation'] },
  { t: 'public.saas_billing_periods', cls: 'R', why: 'справочник периодов оплаты — выбор «месяц/год» при оплате',
    pol: 'I9: сегодня закрыто ГРАНТОМ (только app_platform_settings), а не политикой; у saas_tariffs — RLS+FORCE и '
    + 'четыре read-политики. Без read-политики экран выбора периода даст тихий ноль',
    defect: ['D4-role-escalation', 'I9-grant-instead-of-policy'] },
  { t: 'public.saas_billing_provider_events', cls: 'C', why: 'вебхуки провайдера — идемпотентность оплаты',
    defect: ['D4-role-escalation'] },
  { t: 'public.saas_billing_refunds', cls: 'C', why: 'возвраты — возврат денег клинике', pol: 'D13: у клиники ни '
    + 'гранта, ни политики — стены клиники на возвратах нет как объекта, а глобальная роль достижима из тенантного '
    + 'рантайма. Либо пара политик по образцу invoices, либо объявленное «возвраты — только платформа» + C16',
    defect: ['D13-billing-refunds', 'D4-role-escalation'] },
  { t: 'public.saas_billing_subscriptions', cls: 'C', why: 'подписка клиники — доступ клиники к продукту',
    defect: ['D4-role-escalation'] },
  { t: 'public.saas_isolation_coverage_runs', cls: 'S', owner: 'saas_telemetry_owner', why: 'прогоны покрытия — гейт '
    + 'деплоя TEST' },
  { t: 'public.saas_isolation_event_hourly', cls: 'S', owner: 'saas_telemetry_owner', why: 'почасовая агрегация — '
    + 'тренд изоляции на экране здоровья' },
  { t: 'public.saas_isolation_events', cls: 'S', owner: 'saas_telemetry_owner', why: 'события нарушения изоляции — '
    + 'без неё платформа не видит собственные утечки' },
  { t: 'public.saas_org_entitlement_overrides', cls: 'C', why: 'ручные включения механик клинике — точечная выдача '
    + 'функций клинике', defect: ['D4-role-escalation'] },
  { t: 'public.saas_organization_trials', cls: 'C', why: 'триал клиники — бесплатный период',
    defect: ['D4-role-escalation'] },
  { t: 'public.saas_paid_period_policy', cls: 'S', why: 'поведение после окончания оплаченного периода — что '
    + 'происходит с клиникой после неоплаты', pol: 'I8: у сестринских '
    + 'saas_trial_policy/saas_registration_tariff_policy RLS+FORCE и политика TO app_platform_settings, у этой '
    + 'ничего при 720 отказах staff-логина — либо GRANT SELECT + read-политика, либо убрать чтение из staff-пути',
    defect: ['D4-role-escalation', 'I8-paid-period-denials'] },
  { t: 'public.saas_registration_tariff_policy', cls: 'S', why: 'тариф по умолчанию при регистрации — на каком '
    + 'тарифе стартует новая клиника', defect: ['D4-role-escalation'] },
  { t: 'public.saas_tariffs', cls: 'R', why: 'тарифы платформы — без него клиника не понимает, что ей доступно',
    defect: ['D4-role-escalation'] },
  { t: 'public.saas_trial_policy', cls: 'S', why: 'глобальная политика триала — правило «сколько длится триал»',
    defect: ['D4-role-escalation'] },
  { t: 'public.schema_migrations', cls: 'T', why: 'журнал миграций integrator — без него мигратор перезальёт схему',
    drop: { verdict: 'DUP-DROP', source: 'evidence/18 §4 — 73/73 в public.webapp_schema_migrations, журнал замёрз '
      + '2026-04-13, единственный читатель недостижим', blockedBy: 'снять дамп 73 строк; удалить мёртвый '
      + 'drizzle-экспорт schema.ts:3420 и ветку backfillLedgerFromLegacyWebappTable в run-migrations.mjs. ⚠ FINDINGS '
      + 'К5: часть 4 описала эту таблицу как журнал интегратора — это РАЗНЫЕ объекты' } },
  { t: 'public.specialist_signup_intents', cls: 'S', wall: 'definer-only', why: 'заявка на создание клиники — '
    + 'самостоятельная регистрация специалиста', wallWhy: 'заявка на регистрацию живёт ДО организации — стены '
    + 'клиники нет, вход через definer-шов регистрации', defect: ['I1-definer-plus-force'] },
  { t: 'public.specialist_tasks', cls: 'P', why: 'задачи врача по пациенту — пропадёт список задач врача и '
    + 'напоминания по ним' },
  { t: 'public.staff_security_profiles', cls: 'S', wall: 'definer-only', why: 'второй фактор персонала — 2FA '
    + 'сотрудников', wallWhy: W_AUTH_DEFINER, defect: ['I1-definer-plus-force'] },
  { t: 'public.support_conversation_messages', cls: 'P', why: 'сообщения диалога — тело переписки' },
  { t: 'public.support_conversations', cls: 'P', why: 'диалоги поддержки — без неё нет переписки врач↔пациент' },
  { t: 'public.support_delivery_events', cls: 'P', why: 'журнал доставки сообщений — без него не видно, дошло ли '
    + 'сообщение' },
  { t: 'public.support_question_messages', cls: 'P', why: 'реплики внутри вопроса — тело вопроса' },
  { t: 'public.support_questions', cls: 'P', why: 'вопросы пациента из бота — очередь «вопрос из мессенджера → врач»' },
  { t: 'public.symptom_entries', cls: 'P', why: 'замеры — динамика самочувствия' },
  { t: 'public.symptom_trackings', cls: 'P', why: 'что пациент отслеживает — дневник симптомов' },
  { t: 'public.system_settings', cls: 'S', wall: 'platform-role+clinic', why: 'настройки платформы и клиники — без '
    + 'неё не работает ни один внешний канал', wallWhy: W_PLATFORM_OR_CLINIC,
    revoke: { app_staff: 'D3: 121 из 125 строк глобальные, среди них 17 секретов платформы (telegram_bot_token, '
      + 'smsc_api_key, google_client_secret …) — арендной роли там не место' },
    pol: 'ветка organization_id IS NULL ОБЯЗАНА проверять роль: saas_bootstrap_hybrid_p0_8_6 выдана TO public и её '
    + 'первая ветка безусловна — это и есть механизм дефекта', defect: ['D3-system-settings', 'D4-role-escalation'] },
  { t: 'public.system_settings_audit', cls: 'S', wall: 'platform-role+clinic', why: 'история изменений настроек — '
    + 'доказательство «кто менял секрет»', wallWhy: W_PLATFORM_OR_CLINIC,
    revoke: { app_staff: 'D3: значения секретов лежат в old_value_json/new_value_json (аудит 28.07 нашёл там '
      + 'vk_id_client_secret открытым), а у app_staff полный CRUD по журналу' },
    pol: 'та же безусловная ветка organization_id IS NULL, что и у system_settings — снять',
    defect: ['D3-system-settings', 'D4-role-escalation'] },
  { t: 'public.test_attempts', cls: 'P', org: true, why: 'попытки прохождения теста — пациент не сможет сдать тест',
    pol: 'РЕШЕНИЕ D2: пациентская ветка обязана резолвиться ЧЕРЕЗ ПРОГРАММУ (instance_stage_item_id → '
    + 'treatment_program_instance_stage_items → instances.patient_user_id), а не по плоской patient_user_id',
    code: ['C14'] },
  { t: 'public.test_results', cls: 'P', org: true, why: 'результат попытки — оценка теста', pol: 'РЕШЕНИЕ D2: пациентская ветка '
    + '— только через test_attempts, привязанную к элементу его программы (см. test_attempts).', code: ['C14'] },
  { t: 'public.test_set_items', cls: 'C', why: 'состав набора — наполнение набора' },
  { t: 'public.test_sets', cls: 'C', why: 'наборы тестов — пакетное назначение тестов' },
  { t: 'public.tests', cls: 'C', why: 'каталог клинических тестов клиники — без него врач не назначит тест' },
  { t: 'public.treatment_program_events', cls: 'P', org: true, why: 'журнал изменений программы — аудит «кто что менял в '
    + 'лечении»' },
  { t: 'public.treatment_program_instance_stage_groups', cls: 'P', org: true, why: 'группы внутри этапа — группировка заданий' },
  { t: 'public.treatment_program_instance_stage_items', cls: 'P', org: true, why: 'сами задания — что пациент делает каждый день' },
  { t: 'public.treatment_program_instance_stages', cls: 'P', org: true, why: 'этапы программы — шаги лечения' },
  { t: 'public.treatment_program_instances', cls: 'P', org: true, why: 'назначенная пациенту программа — ядро лечения — без неё '
    + 'нет программы' },
  { t: 'public.treatment_program_template_stage_groups', cls: 'C', why: 'группы в этапе шаблона — группировка в '
    + 'шаблоне' },
  { t: 'public.treatment_program_template_stage_items', cls: 'C', why: 'задания шаблона — содержимое шаблона' },
  { t: 'public.treatment_program_template_stages', cls: 'C', why: 'этапы шаблона — структура шаблона' },
  { t: 'public.treatment_program_templates', cls: 'C', why: 'шаблоны программ лечения — без них нечего назначать '
    + 'пациенту' },
  { t: 'public.user_channel_bindings', cls: 'P', org: false, why: 'привязка мессенджера — вход через Telegram/MAX и '
    + 'рассылки',
    revoke: { app_staff: 'D20: organization_id нет, RLS выключен, политик ноль — сотрудник любой клиники правит '
      + 'external_id мессенджеров всех 131 привязки платформы' },
    pol: 'ветка «свой пациент» по user_id. Сегодня app_patient=r без единой политики — любой пациент читает '
    + 'идентификаторы всех людей в Telegram/MAX', defect: ['D20-notification-tables'] },
  { t: 'public.user_channel_preferences', cls: 'P', why: 'согласия по каналам — по какому каналу писать пациенту',
    pol: 'D20: политика c4_web_push_reminder_user в каталоге ЕСТЬ, но relrowsecurity=false — перепись по pol=N '
    + 'показывает «стена есть», а её нет', defect: ['D20-notification-tables'] },
  { t: 'public.user_contacts', cls: 'P', org: false, why: 'сводный индекс контактов — вход по почте/телефону и поиск '
    + 'пациента',
    revoke: { app_identity_bootstrap: 'D5: предикат обязан фильтровать строку; bootstrap уезжает в definer (I15).' },
    pol: 'D2-user-contacts-write: staff-политики UPDATE/DELETE/INSERT несут ровно app.is_staff() БЕЗ '
    + 'organization_id, а PERMISSIVE объединяются по OR — подмена value_normalized уводит вход на чужой аккаунт. D5: '
    + 'bootstrap-политики фильтруют роль, а не строку', defect: ['D2-user-contacts-write', 'D5-identity-bootstrap'],
    gate: ['O5-user-identity-cutover'] },
  { t: 'public.user_email_setup_tokens', cls: 'S', wall: 'pending-removal', rls: 'n/a', disp: 'REMOVED',
    why: 'УДАЛЕНО миграцией 0388: старые ссылочные токены настройки email заменены живым password_setup OTP flow',
    wallWhy: 'Физически удалённая legacy-таблица остаётся именованной только для двусторонней проверки каталога' },
  { t: 'public.user_identity', cls: 'P', org: false, why: 'ФИО и дата рождения — имя пациента во всех экранах',
    revoke: { app_identity_bootstrap: 'D5: тот же дефект — «кто ты» вместо «какая строка».' },
    pol: 'D6: user_identity_staff_insert несёт WITH CHECK (app.is_staff()) без org — сотрудник любой клиники заводит '
    + 'идентичность на произвольный platform_user_id. D5: bootstrap-политики фильтруют роль, а не строку',
    defect: ['D5-identity-bootstrap', 'D6-user-identity-insert'], gate: ['O5-user-identity-cutover'] },
  { t: 'public.user_notification_topic_channels', cls: 'P', why: 'тема × канал — тонкая настройка уведомлений',
    pol: 'D20: инертная политика при выключенном RLS', defect: ['D20-notification-tables'] },
  { t: 'public.user_notification_topics', cls: 'P', why: 'подписки на темы — пациент перестанет управлять '
    + 'уведомлениями', pol: 'плюс ветка своего пациента. D20: app_patient=arw без единой политики — пациент правит '
    + 'чужие подписки на уведомления (349 строк)', defect: ['D20-notification-tables'] },
  { t: 'public.user_oauth_bindings', cls: 'S', wall: 'definer-only', why: 'привязки соцвходов — вход через '
    + 'Google/VK/Яндекс', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.user_passkey_accounts', cls: 'S', wall: 'definer-only', why: '`user_handle` для WebAuthn — вход по '
    + 'passkey', wallWhy: W_AUTH_DEFINER, defect: ['I1-definer-plus-force'] },
  { t: 'public.user_passkey_challenges', cls: 'S', wall: 'definer-only', why: 'вызовы WebAuthn — защита от повтора',
    wallWhy: W_AUTH_DEFINER, defect: ['I1-definer-plus-force'] },
  { t: 'public.user_passkey_credentials', cls: 'S', wall: 'definer-only', why: 'ключи — сам вход по passkey',
    wallWhy: W_AUTH_DEFINER, defect: ['I1-definer-plus-force'] },
  { t: 'public.user_password_credentials', cls: 'S', wall: 'definer-only', why: 'хэши паролей — вход по паролю',
    wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.user_phone_history', cls: 'P', why: 'история телефонов — смена номера и поиск по старому номеру',
    revoke: { bcb_test_nonstaff_login: 'I2: табличный грант arw выдан ЛОГИН-роли напрямую, минуя рантайм-роль.' },
    pol: 'D8: единственная политика несёт ТОЛЬКО org-ветку, а app_patient держит SELECT — пациент видит историю '
    + 'телефонов всех 92 записей организации. Нужна ветка «свой пациент»',
    defect: ['D8-user-phone-history', 'I2-grant-to-login'] },
  { t: 'public.user_pins', cls: 'S', wall: 'pending-removal', rls: 'n/a', disp: 'REMOVED',
    why: 'УДАЛЕНО миграцией 0387: legacy PIN-вход выведен из продукта, активных вызовов и причин хранения нет',
    wallWhy: 'Физически удалённая legacy-таблица остаётся именованной только для двусторонней проверки каталога' },
  { t: 'public.user_web_push_subscriptions', cls: 'P', why: 'push-подписки браузера — без неё нет web-push',
    pol: 'D20: у app_patient полный arwd (в том числе DELETE) при инертной политике — пациент удаляет чужие '
    + 'push-подписки', defect: ['D20-notification-tables'] },
  { t: 'public.webapp_schema_migrations', cls: 'T', wall: 'pending-removal', rls: 'n/a', disp: 'REMOVED',
    why: 'УДАЛЕНО B0: аварийный исторический ledger больше не участвует в применении миграций',
    wallWhy: 'Физически удалённый legacy-ledger остаётся именованным только для двусторонней проверки каталога' },
];

const APP_TABLES: Record<string, TableDecl> = expandTables(TABLE_ROWS);

/* ============================================================================================
 * SECTION 5 — БАЗА: bersoncarebot_test (управляемая)
 * ========================================================================================== */

const db_bersoncarebot_test: DatabaseDecl = {
  database: {
    owner: 'bersoncarebot_test', // datdba (evidence/13 §3.5)
    connect: [ // ЦЕЛЬ: явный CONNECT после отзыва у PUBLIC (§D.1); рендерится из envMapping
      'bersoncarebot_test', 'bcb_test_integrator_login', 'bcb_test_nonstaff_login',
      'bcb_test_staff_login', 'bcb_test_worker_login', 'bcb_test_maintenance_login',
      'bcb_test_operational_delivery_login', 'bcb_test_operational_diagnostic_login',
      'bcb_test_operational_scheduler_login',
      'bcb_test_operational_web_push_reminder_login', 'bcb_saas_operator_test', 'bcb_saas_diag_test',
      'app_operational_web_push_reminder', // evidence/13 §1.1: datacl даёт CONNECT этой РОЛИ напрямую
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc — §D.1 REVOKE не применён
    note: 'evidence/13 §1.1: живой datacl = PUBLIC=Tc, owner=CTc, app_operational_web_push_reminder=c, '
      + 'bcb_saas_operator_test=c. Цель: снять PUBLIC, оставить явных грантополучателей. Пока PUBLIC CONNECT '
      + 'стоит, юрисдикционная проверка §F/№8 неперечислима — любая роль кластера имеет путь доступа.',
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ evidence/13 §2.1 — PUBLIC USAGE на app; цель §D.2 REVOKE
        'app_staff', 'app_patient', 'bersoncarebot_test', 'app_platform_settings',
        'bcb_test_nonstaff_login', 'app_worker', 'bcb_test_integrator_login',
        'saas_telemetry_operator', 'saas_system_health_owner', 'app_clinic_billing',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_diagnostic',
        'app_operational_delivery_worker', 'app_operational_scheduler', 'app_operational_media_worker',
        'bcb_test_operational_diagnostic_login', 'bcb_test_operational_delivery_login',
        'bcb_test_operational_scheduler_login',
        'app_integrator_resolver', // НОВАЯ (D5): USAGE нужен ради одного definer-аксессора
        'app_operational_maintenance', // НОВАЯ (D8): USAGE ради app.prune_context_nonce_ledger
      ],
      create: ['app_owner'],
      publicDefect: true,
      why: 'схемный USAGE — первый рубеж 42501 (evidence/12 §1).',
    },
    app_ext: {
      owner: 'postgres', present: true, // G5 закрыт: канонический владелец = postgres на ОБЕИХ базах (§C)
      usage: ['app_owner'], create: ['postgres'],
      why: 'pgcrypto-шов (app_ext.hmac, p2-b:94). evidence/13 §2.1: postgres=UC, app_owner=U.',
    },
    drizzle: {
      owner: 'bersoncarebot_test', present: true,
      usage: ['bersoncarebot_test'], create: ['bersoncarebot_test'],
      why: 'журнал мигратора; рантайм-ролям закрыт.',
    },
    integrator: {
      owner: 'bersoncarebot_test', present: true,
      usage: [ // evidence/13 §2.1 — TEST даёт diagnostic/delivery/scheduler (отличие от dev)
        'bersoncarebot_test', 'app_staff', 'app_patient', 'bcb_test_integrator_login', 'app_owner',
        'app_operational_diagnostic', 'app_operational_delivery_worker', 'app_operational_scheduler',
      ],
      create: ['bersoncarebot_test'],
      why: '⚠ USAGE у app_staff/app_patient переживёт волны сноса evidence/15 только там, где останутся живые '
        + 'таблицы (9 из 20); после волн 0-3 список пересматривается.',
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ PUBLIC USAGE — цель §D.2 REVOKE (обе базы)
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'bcb_test_integrator_login',
        'bcb_test_nonstaff_login', 'app_clinic_billing', 'app_web_push_reminder_discovery_definer',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_delivery_worker',
        'app_operational_media_worker', 'app_operational_scheduler',
        'app_operational_maintenance', // НОВАЯ (D8): журналы под прунинг живут в public
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ evidence/13 §2.5: отсутствует на обеих — стена НЕ установлена
      usage: [], create: ['postgres'],
      why: 'схема стены (org_table_allowlist, privileges_watermark, ddl_wall_log). Строится wall-install каждым '
        + 'деплоем (SCHEME §B шаг 3); закрыта от рантайм-ролей.',
    },
  },

  tables: APP_TABLES,

  sequences: {
    rule: 'роль с INSERT/UPDATE на таблице получает USAGE(+SELECT) на её *_id_seq (serial DEFAULT требует USAGE; '
      + 'SCHEME §A.4). Исключения — явными записями. Следствие отзывов выше: USAGE на последовательность уходит '
      + 'вместе с табличным грантом — оставшийся грант на последовательность есть §F-красный.',
    examples: { // evidence/13 §2.5 (подтверждено)
      'public.integrator_push_outbox_id_seq': { app_staff: ['USAGE', 'SELECT'] },
      'public.be_patient_packages_display_number_seq': { app_staff: ['USAGE', 'SELECT'] },
    },
  },

  functionsViews: {
    default: 'дефолтного EXECUTE нет; wall-install §D.5 снимает материализованный PUBLIC EXECUTE. EXECUTE на '
      + 'не-definer функции/представления — только там, где перечислено. Представления ОБЯЗАНЫ нести '
      + 'security_invoker (§G.6) — definer-представление видит строки чужих арендаторов (FACTS §4).',
    views: { todo: 'TODO(census-gap): views/security_invoker not enumerated for this db' },
  },

  types: {
    'app.port_name': { usage: ['app_seam_context_owner'] },
    'app.port_context_class': { usage: ['app_seam_context_owner'] },
    'app.port_typed_arg': { usage: ['app_seam_context_owner'] },
    'app.port_context_claims': { usage: ['app_seam_context_owner'] },
  },

  definerExceptions: {
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  creators: ['postgres', 'bersoncarebot_test', 'app_owner', 'saas_telemetry_owner',
    'saas_system_health_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // org-таблицы, названные переписью ДЕФЕКТНЫМИ (нет RLS или FORCE) — evidence/13 §2.3
      'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts', // GAP G7 закрыт: истинная org-таблица
    ],
    fullCountLive: 172, // evidence/13 §2.3
    todo: 'Derived set: 116 of the 239 classified tables declare org: true (the classification stated the '
      + 'flag for those). The live count is 172 org tables, and 307 relations exist in total (FACTS §1.6) — '
      + 'the difference is GAP G2 (per-table ACL/flags not enumerated) + GAP G10 (coverage of the '
      + 'classification itself). ⚠ The wall does NOT depend on this list: decision D7 walls by declared '
      + 'CLASS, and every one of the 239 tables carries one. The allowlist only feeds the event trigger §E.',
  },

  dbSettings: {
    datdba: 'bersoncarebot_test', // evidence/13 §3.5
    perRoleInDatabase: {}, // evidence/13 §3.4: строки setdatabase≠0 для этой базы нет
  },
};

/* ============================================================================================
 * SECTION 6 — БАЗА: bcb_webapp_dev (управляемая). ОТЛИЧАЕТСЯ от TEST (evidence/13 §2.2).
 *   Набор таблиц тот же (схема одна) и переиспользуется; измеренные переписью дельты — явно.
 * ========================================================================================== */

/** dev-only дельты поверх APP_TABLES (evidence/13 §2.3, FINDINGS Д24). */
const DEV_TABLE_DELTAS: Record<string, TableDecl> = {
  'public.patient_specialist_links': {
    ...(APP_TABLES['public.patient_specialist_links'] as TableDecl),
    rls: 'force', // ЦЕЛЬ на обеих базах
    drift: 'DEV-ONLY ДЕФЕКТ (FINDINGS Д24, evidence/13 §2.3): на dev relrowsecurity=t, relforcerowsecurity=f — '
      + 'владелец таблицы обходит политику. На TEST t/t, чисто. Вывод, совпадающий со SCHEME §A: управляемые '
      + 'базы расходятся по набору дефектов, поэтому раздел на базу обязателен.',
  },
};

const db_bcb_webapp_dev: DatabaseDecl = {
  database: {
    owner: 'bcb_webapp_dev_user', // datdba (evidence/13 §3.5)
    connect: [
      'bcb_webapp_dev_user', 'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login',
      'bcb_saas_operator_dev',
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc
    note: 'evidence/13 §1.1: datacl = PUBLIC=Tc, owner=CTc, bcb_saas_operator_dev=c. Цель снимает PUBLIC.',
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [ // evidence/13 §2.2 — здесь PUBLIC USAGE НЕТ (отличие от TEST)
        'app_staff', 'app_patient', 'bcb_webapp_dev_user', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login', 'app_identity_bootstrap',
        'app_operational_delivery_worker', 'app_worker', 'saas_telemetry_operator',
        'saas_system_health_owner',
        'app_integrator_resolver', 'app_operational_maintenance', // НОВЫЕ роли (D5/D8)
      ],
      create: ['app_owner'],
    },
    app_ext: {
      owner: 'postgres', // ЦЕЛЬ (G5 закрыт: канонический владелец — postgres на обеих базах, §C)
      present: true,
      usage: ['app_owner'], create: ['postgres'],
      ownerDrift: 'ЖИВОЙ владелец на dev = bcb_webapp_dev_user (evidence/13 §2.2). Приводится к postgres: '
        + 'extension-шов принадлежит суперпользователю (§C), TEST уже так.',
    },
    drizzle: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: ['bcb_webapp_dev_user'], create: ['bcb_webapp_dev_user'],
      why: 'evidence/13 §2.2: nspacl null (owner-only)',
    },
    integrator: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: [ // evidence/13 §2.2 — dev даёт из операционных только delivery (на TEST ещё diag/scheduler)
        'bcb_webapp_dev_user', 'app_staff', 'app_patient', 'app_owner', 'app_operational_delivery_worker',
      ],
      create: ['bcb_webapp_dev_user'],
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [ // evidence/13 §2.2
        '=PUBLIC',
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'app_identity_bootstrap',
        'app_operational_maintenance',
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ отсутствует и на dev (evidence/13 §2.5)
      usage: [], create: ['postgres'],
      why: 'схема стены; строится цепочкой migrate-dev.sh (SCHEME §B, dev в контуре — §I Р1).',
    },
  },

  tables: { ...APP_TABLES, ...DEV_TABLE_DELTAS },

  sequences: {
    rule: 'то же правило, что на TEST (SCHEME §A.4). Per-db ACL последовательностей для dev отдельно не снимались.',
    examples: {},
  },

  functionsViews: {
    default: 'та же политика, что на TEST (§A.5): дефолтного EXECUTE нет; представлениям нужен security_invoker.',
    views: { todo: 'TODO(census-gap): views/security_invoker not enumerated for dev' },
  },

  types: {
    'app.port_name': { usage: ['app_seam_context_owner'] },
    'app.port_context_class': { usage: ['app_seam_context_owner'] },
    'app.port_typed_arg': { usage: ['app_seam_context_owner'] },
    'app.port_context_claims': { usage: ['app_seam_context_owner'] },
  },

  definerExceptions: {
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  creators: ['postgres', 'bcb_webapp_dev_user', 'app_owner', 'saas_telemetry_owner',
    'saas_system_health_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // дефектные org-таблицы dev (evidence/13 §2.3), минус та, что под снос
      'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts',
      'public.patient_specialist_links', // ⚠ dev-only: RLS on, FORCE off (D24-dev-force-off)
    ],
    fullCountLive: 172,
    todo: 'TODO(census-gap G2): the dev org-table total was not counted separately (the census counted '
      + 'defects only for dev); ≈TEST is an assumption, not a measurement.',
  },

  dbSettings: {
    datdba: 'bcb_webapp_dev_user', // evidence/13 §3.5
    perRoleInDatabase: {
      // ⚠ НЕСУЩАЯ строка (SCHEME §A.10), НЕ дефект: role-level rolconfig dev-мигратора обязан быть NULL
      //    (dev-c0-runtime-logins.sql:130-137), поэтому (логин,база) — структурно единственный дом для его
      //    search_path. Байтово, включая пробел после запятой (evidence/13 §3.4; §F сравнивает побайтно).
      bcb_webapp_dev_user: [SEARCH_PATH_PUBLIC_INTEGRATOR],
    },
  },
};

/* ============================================================================================
 * REVISION 10 — port/context declaration.  The older census above is retained only as the
 * object inventory; this adapter is the executable target and deliberately has no compatibility
 * identities, OpenPGP/challenge state, or diagnostic login.
 * ========================================================================================== */

const REV10_RUNTIME = [
  'app_pre_session', 'app_staff', 'app_patient', 'app_clinic_billing', 'app_platform_settings',
  'app_platform_admin', 'app_worker',
  'app_operational_media_worker', 'app_operational_maintenance', 'saas_telemetry_operator', 'app_integrator_request',
  'app_integrator_resolver', 'app_operational_delivery_worker', 'app_operational_scheduler',
  'app_tenant_service', 'app_service',
] as const;

const REV10_SEAM_OWNERS = [
  'app_seam_context_owner', 'app_seam_password_auth_owner', 'app_seam_email_otp_owner',
  'app_seam_passkey_owner', 'app_seam_phone_binding_owner', 'app_seam_self_security_owner',
  'app_seam_identity_lookup_owner', 'app_seam_patient_invite_owner', 'app_seam_org_invite_owner',
  'app_seam_specialist_provision_owner', 'app_seam_public_slug_owner', 'app_seam_public_booking_owner',
  'app_seam_dedicated_bot_owner', 'app_seam_payment_webhook_owner', 'app_seam_delivery_scope_owner',
  'app_seam_patient_program_resolver_owner', 'app_seam_settings_preauth_owner',
  'app_seam_settings_integrator_owner', 'app_seam_settings_runtime_owner', 'app_seam_org_commerce_owner',
  'app_seam_patient_org_projection_owner', 'app_seam_patient_booking_owner',
  'app_seam_patient_self_actions_owner', 'app_seam_reminder_patient_owner',
  'app_seam_reminder_materialization_owner', 'app_seam_reminder_specialist_owner',
  'app_seam_reminder_appointment_owner', 'app_seam_reminder_email_cooldown_owner',
  'app_seam_telemetry_patient_owner', 'app_seam_telemetry_media_owner',
  'app_seam_telemetry_operator_owner', 'app_seam_catalog_public_owner',
  'app_seam_catalog_admin_owner', 'app_seam_org_directory_owner',
  'app_seam_telemetry_exclusion_owner', 'saas_telemetry_owner', 'saas_system_health_owner',
  'app_seam_login_token_owner', 'app_seam_oauth_owner', 'app_seam_phone_otp_owner',
  'app_seam_staff_security_owner', 'app_seam_patient_lfk_media_owner',
  'app_seam_retention_sweep_owner', 'app_seam_platform_analytics_owner',
  // Снятие этой роли 19.08 (`cfa4e45df`) было выполнено только в декларации: в кластере TEST
  // роль осталась, её DROP держат 54 зависимости, и любая выкатка из дерева с тем коммитом
  // валилась на reconcile и останавливала службы теста. Карантин `legacyRoles` тоже не
  // подходит — карантинная роль обязана не иметь USAGE на `app`, а эта его держит. Роль
  // возвращена живой до тех пор, пока снятие не будет сделано целиком: перевод 54 объектов
  // на `app_seam_public_slug_owner` и DROP в том же приземлении.
  'app_seam_public_clinic_card_owner',
] as const;

function revision10Role(kind: RoleDecl['kind'], scope: RoleDecl['scope'], why: string): RoleDecl {
  return { kind, scope, login: false, superuser: false, bypassrls: false, inherit: false,
    createrole: false, rolconfig: null, members: [], why };
}

const REV10_ROLES: Record<string, RoleDecl> = Object.fromEntries([
  ...REV10_RUNTIME.map((name) => [name, revision10Role('terminal', 'NONE', 'revision-10 runtime role')]),
  ['app_platform_settings', revision10Role('terminal', 'GLOBAL', 'global settings and system-health surface')],
  ['app_platform_admin', revision10Role('terminal', 'GLOBAL', 'cross-organization directory/admin surface')],
  ...REV10_SEAM_OWNERS.map((name) => [name, revision10Role('owner', 'NONE', 'revision-10 narrow seam owner')]),
  ['app_object_owner', revision10Role('owner', 'NONE', 'ordinary application objects only; no definer functions')],
  ['bcb_dev_migrator', revision10Role('service', 'NONE', 'local postgres migration wrapper identity')],
  ['bcb_test_migrator', revision10Role('service', 'NONE', 'local postgres migration wrapper identity')],
  ['postgres', { kind: 'superuser', scope: 'GLOBAL', login: true, superuser: true, bypassrls: true,
    inherit: true, createrole: true, rolconfig: null, why: 'local administrative exception only' }],
]);

function rev10Membership(role: string) {
  return { role, admin: false, inherit: false, set: true } as const;
}

const REV10_ENV_MAPPING: Record<string, Record<string, LoginRecord>> = {
  dev: {
    bcb_dev_webapp_staff: { port: 'webapp', canonicalRole: 'app_staff', memberships: [
      ...['app_pre_session', 'app_staff', 'app_clinic_billing', 'app_worker', 'app_tenant_service',
        'app_operational_media_worker', 'app_operational_maintenance', 'saas_telemetry_operator'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_WEBAPP_STAFF_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
    bcb_dev_webapp_patient: { port: 'webapp', canonicalRole: 'app_patient', memberships: [
      rev10Membership('app_pre_session'), rev10Membership('app_patient'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_WEBAPP_PATIENT_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
    bcb_dev_webapp_global_admin: { port: 'webapp', canonicalRole: 'app_platform_settings', memberships: [
      rev10Membership('app_platform_settings'), rev10Membership('app_platform_admin'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_WEBAPP_GLOBAL_ADMIN_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
    bcb_dev_integrator: { port: 'integrator', canonicalRole: 'app_integrator_request', memberships: [
      ...['app_integrator_request', 'app_integrator_resolver', 'app_operational_delivery_worker',
        'app_operational_scheduler', 'app_tenant_service', 'app_service'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_INTEGRATOR_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
  },
  test: {
    bcb_test_webapp_staff: { port: 'webapp', canonicalRole: 'app_staff', memberships: [
      ...['app_pre_session', 'app_staff', 'app_clinic_billing', 'app_worker', 'app_tenant_service',
        'app_operational_media_worker', 'app_operational_maintenance', 'saas_telemetry_operator'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_WEBAPP_STAFF_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
    bcb_test_webapp_patient: { port: 'webapp', canonicalRole: 'app_patient', memberships: [
      rev10Membership('app_pre_session'), rev10Membership('app_patient'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_WEBAPP_PATIENT_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
    bcb_test_webapp_global_admin: { port: 'webapp', canonicalRole: 'app_platform_settings', memberships: [
      rev10Membership('app_platform_settings'), rev10Membership('app_platform_admin'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
    bcb_test_integrator: { port: 'integrator', canonicalRole: 'app_integrator_request', memberships: [
      ...['app_integrator_request', 'app_integrator_resolver', 'app_operational_delivery_worker',
        'app_operational_scheduler', 'app_tenant_service', 'app_service'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_INTEGRATOR_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
  },
};

const rev10Function = <T extends DeclaredFunction>(entry: T): T => entry;

function retainFunctionSurfaceOperationsWithTableRequirements(
  identity: string,
  requiredByRelation: Readonly<Record<string, readonly Privilege[]>>,
): readonly FunctionRelationSurface[] {
  return (BUSINESS_SEAM_FUNCTIONS[identity]?.relationSurfaces ?? []).map((surface) => {
    const required = requiredByRelation[surface.relation] ?? [];
    for (const operation of required) {
      if (!surface.operations.includes(operation)) {
        throw new Error(`${identity}:${surface.relation} table operation ${operation} is absent from the canonical function surface`);
      }
    }
    return { ...surface, ...(required.length > 0 ? { tableOperations: required } : {}) };
  });
}

const patientSelfCapability = (purpose: string, functionIdentity: string) => ({
  port: 'webapp' as const,
  sessionRole: 'app_patient',
  targetRole: 'app_patient',
  contextClass: 'patient' as const,
  purpose,
  functionIdentity,
});

const patientSelfFunction = (
  returns: string,
  returnsSet: boolean,
  typedArgs: readonly string[],
  purpose: string,
  relationSurfaces: readonly FunctionRelationSurface[],
): DeclaredFunction => rev10Function({
  owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns, returnsSet,
  execute: ['app_patient'], purpose, typedArgs, volatility: 'VOLATILE', parallel: 'UNSAFE',
  proconfig: ['search_path=pg_catalog'], relationSurfaces,
});

const patientSurface = (
  relation: string,
  columns: readonly string[],
  operations: readonly Privilege[],
): FunctionRelationSurface => ({
  relation, columns, operations, evidence: 'pg16-function-body-lexical-upper-bound',
});

const exactPatientSurfaces = (
  available: readonly FunctionRelationSurface[],
  operationsByRelation: Readonly<Record<string, readonly Privilege[]>>,
): readonly FunctionRelationSurface[] => Object.entries(operationsByRelation).map(([relation, operations]) => {
  const surface = available.find((candidate) => candidate.relation === relation);
  if (!surface) throw new Error(`exact patient relation surface is unavailable: ${relation}`);
  return { ...surface, operations,
    ...(surface.operationColumns?.SELECT && !operations.includes('SELECT') ? { operationColumns: undefined } : {}) };
});

const PATIENT_ORG_ENROLLMENT_SURFACE = patientSurface('public.org_enrollments', [
  'organization_id', 'platform_user_id', 'status',
], ['SELECT']);

const PATIENT_REMINDER_CORE_SURFACES = [
  patientSurface('public.reminder_rules', [
    'id', 'organization_id', 'integrator_rule_id', 'platform_user_id', 'integrator_user_id', 'category',
    'is_enabled', 'schedule_type', 'timezone', 'interval_minutes', 'window_start_minute',
    'window_end_minute', 'days_mask', 'content_mode', 'updated_at', 'created_at', 'linked_object_type',
    'linked_object_id', 'custom_title', 'custom_text', 'reminder_intent', 'schedule_data', 'display_title',
    'display_description', 'quiet_hours_start_minute', 'quiet_hours_end_minute', 'notification_topic_code',
  ], ['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  patientSurface('public.reminder_journal', [
    'id', 'organization_id', 'rule_id', 'occurrence_id', 'action', 'snooze_until', 'skip_reason', 'created_at',
  ], ['INSERT']),
  patientSurface('public.reminder_occurrence_history', [
    'integrator_occurrence_id', 'organization_id', 'platform_user_id', 'seen_at',
  ], ['SELECT', 'UPDATE']),
  patientSurface('public.platform_users', [
    'id', 'role', 'merged_into_id', 'reminder_muted_until', 'updated_at',
  ], ['UPDATE']),
] as const;

const PATIENT_SUPPORT_CORE_SURFACES = [
  patientSurface('public.support_conversations', [
    'id', 'organization_id', 'integrator_conversation_id', 'platform_user_id', 'integrator_user_id', 'source',
    'admin_scope', 'status', 'opened_at', 'last_message_at', 'closed_at', 'close_reason', 'channel_code',
    'channel_external_id', 'pending_message_drafts', 'created_at', 'updated_at',
  ], ['SELECT', 'INSERT', 'UPDATE']),
  patientSurface('public.support_conversation_messages', [
    'id', 'organization_id', 'integrator_message_id', 'conversation_id', 'sender_role', 'message_type', 'text',
    'source', 'external_chat_id', 'external_message_id', 'delivery_status', 'created_at', 'media_url',
    'media_type', 'read_at', 'delivered_at',
  ], ['SELECT', 'INSERT', 'UPDATE']),
] as const;

const PATIENT_SYMPTOM_CORE_SURFACES = [
  patientSurface('public.reference_categories', ['id', 'code'], ['SELECT']),
  patientSurface('public.reference_items', ['id', 'category_id', 'organization_id', 'is_active'], ['SELECT']),
  patientSurface('public.symptom_trackings', [
    'id', 'organization_id', 'user_id', 'platform_user_id', 'symptom_key', 'symptom_title', 'is_active',
    'created_at', 'updated_at', 'symptom_type_ref_id', 'region_ref_id', 'side', 'diagnosis_text',
    'diagnosis_ref_id', 'stage_ref_id', 'deleted_at',
  ], ['SELECT', 'INSERT', 'UPDATE']),
  patientSurface('public.symptom_entries', [
    'id', 'organization_id', 'user_id', 'platform_user_id', 'tracking_id', 'value_0_10', 'entry_type',
    'recorded_at', 'source', 'notes', 'created_at', 'patient_practice_completion_id',
  ], ['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  patientSurface('public.patient_practice_completions', [
    'id', 'organization_id', 'user_id', 'source', 'completed_at', 'feeling',
  ], ['SELECT', 'UPDATE']),
] as const;

const PATIENT_CHANNEL_CORE_SURFACES = [
  patientSurface('public.user_channel_preferences', [
    'id', 'user_id', 'platform_user_id', 'channel_code', 'is_enabled_for_messages',
    'is_enabled_for_notifications', 'is_preferred_for_auth', 'created_at', 'updated_at',
  ], ['SELECT', 'INSERT', 'UPDATE']),
  patientSurface('public.user_channel_bindings', ['user_id', 'channel_code'], ['SELECT']),
  patientSurface('public.platform_users', ['id', 'email_verified_at'], ['SELECT']),
  patientSurface('public.user_phone_history', ['platform_user_id', 'valid_to'], ['SELECT']),
  patientSurface('public.user_web_push_subscriptions', [
    'id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'created_at', 'updated_at',
  ], ['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
] as const;

const PATIENT_PROGRAM_CORE_SURFACES = [
  patientSurface('public.treatment_program_instances', [
    'id', 'organization_id', 'patient_user_id', 'status', 'assignment_source', 'updated_at',
    'patient_plan_last_opened_at',
  ], ['SELECT', 'UPDATE']),
  patientSurface('public.treatment_program_instance_stages', [
    'id', 'organization_id', 'instance_id', 'sort_order', 'status', 'started_at',
  ], ['SELECT', 'UPDATE']),
  patientSurface('public.treatment_program_instance_stage_items', [
    'id', 'organization_id', 'stage_id', 'item_type', 'item_ref_id', 'status', 'is_actionable', 'snapshot',
    'completed_at', 'last_viewed_at',
  ], ['SELECT', 'UPDATE']),
  patientSurface('public.treatment_program_events', [
    'id', 'organization_id', 'instance_id', 'actor_id', 'event_type', 'target_type', 'target_id', 'payload',
    'reason', 'created_at',
  ], ['INSERT']),
  patientSurface('public.program_action_log', [
    'id', 'organization_id', 'instance_id', 'instance_stage_item_id', 'patient_user_id', 'session_id',
    'action_type', 'payload', 'note', 'created_at',
  ], ['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  patientSurface('public.media_files', [
    'id', 'organization_id', 'uploaded_by', 'usage_purpose',
  ], ['SELECT']),
  patientSurface('public.program_item_discussion_messages', [
    'id', 'organization_id', 'instance_stage_item_id', 'patient_user_id', 'sender_role', 'origin', 'body',
    'media_file_id', 'support_message_id', 'created_at',
  ], ['INSERT']),
  patientSurface('public.program_item_discussion_reads', [
    'organization_id', 'patient_user_id', 'instance_stage_item_id', 'last_read_at',
  ], ['INSERT', 'UPDATE']),
  patientSurface('public.test_attempts', [
    'id', 'organization_id', 'instance_stage_item_id', 'patient_user_id', 'started_at', 'submitted_at',
    'accepted_at', 'accepted_by',
  ], ['SELECT', 'INSERT', 'UPDATE']),
  patientSurface('public.test_results', [
    'id', 'organization_id', 'attempt_id', 'test_id', 'raw_value', 'normalized_decision', 'decided_by',
    'created_at',
  ], ['SELECT', 'INSERT', 'UPDATE']),
] as const;

const PATIENT_ROOT_OPERATIONS = {
  create_current_patient_reminder_rule: {
    'public.org_enrollments': ['SELECT'], 'public.platform_users': ['SELECT'],
    'public.reminder_rules': ['SELECT', 'INSERT'],
  },
  update_current_patient_reminder_rule: { 'public.reminder_rules': ['SELECT', 'UPDATE'] },
  delete_current_patient_reminder_rule: {
    'public.reminder_occurrence_history': ['SELECT', 'DELETE'],
    'public.reminder_rules': ['SELECT', 'DELETE'],
  },
  record_current_patient_reminder_journal_action: {
    'public.reminder_journal': ['SELECT', 'INSERT'], 'public.reminder_rules': ['SELECT'],
  },
  mark_current_patient_reminder_history_seen: {
    'public.reminder_occurrence_history': ['SELECT', 'UPDATE'],
  },
  mark_all_current_patient_reminder_history_seen: {
    'public.reminder_occurrence_history': ['SELECT', 'UPDATE'],
  },
  set_current_patient_reminder_muted_until: { 'public.platform_users': ['SELECT', 'UPDATE'] },
  ensure_current_patient_support_conversation: {
    'public.org_enrollments': ['SELECT'], 'public.support_conversations': ['SELECT', 'INSERT', 'UPDATE'],
  },
  append_current_patient_support_message: {
    'public.support_conversation_messages': ['SELECT', 'INSERT'],
    'public.support_conversations': ['SELECT', 'UPDATE'],
  },
  mark_current_patient_support_conversation_read: {
    'public.support_conversation_messages': ['SELECT', 'UPDATE'],
    'public.support_conversations': ['SELECT'],
  },
  mark_current_patient_support_messages_read: {
    'public.support_conversation_messages': ['SELECT', 'UPDATE'],
    'public.support_conversations': ['SELECT'],
  },
  mark_current_patient_support_notifications_read: {
    'public.support_conversation_messages': ['SELECT', 'UPDATE'],
    'public.support_conversations': ['SELECT'],
  },
  ensure_current_patient_system_symptom_tracking: {
    'public.reference_categories': ['SELECT'], 'public.reference_items': ['SELECT'],
    'public.symptom_trackings': ['SELECT', 'INSERT', 'UPDATE'],
  },
  record_current_patient_symptom_entry: {
    'public.symptom_entries': ['SELECT', 'INSERT'], 'public.symptom_trackings': ['SELECT'],
  },
  update_current_patient_symptom_entry: {
    'public.symptom_entries': ['SELECT', 'UPDATE'], 'public.symptom_trackings': ['SELECT'],
  },
  delete_current_patient_symptom_entry: {
    'public.symptom_entries': ['SELECT', 'DELETE'], 'public.symptom_trackings': ['SELECT'],
  },
  configure_current_patient_assigned_symptom_tracking: {
    'public.symptom_trackings': ['SELECT', 'UPDATE'],
  },
  apply_current_patient_warmup_feeling: {
    'public.patient_practice_completions': ['SELECT', 'UPDATE'],
    'public.reference_categories': ['SELECT'], 'public.reference_items': ['SELECT'],
    'public.symptom_entries': ['SELECT', 'INSERT'],
    'public.symptom_trackings': ['SELECT', 'INSERT', 'UPDATE'],
  },
  save_current_patient_channel_preference: {
    'public.user_channel_preferences': ['SELECT', 'INSERT', 'UPDATE'],
  },
  set_current_patient_preferred_auth_channel: {
    'public.platform_users': ['SELECT'], 'public.user_channel_bindings': ['SELECT'],
    'public.user_channel_preferences': ['SELECT', 'INSERT', 'UPDATE'],
    'public.user_phone_history': ['SELECT'],
  },
  save_current_patient_web_push_subscription: {
    'public.user_web_push_subscriptions': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  remove_current_patient_web_push_subscription: {
    'public.user_web_push_subscriptions': ['SELECT', 'DELETE'],
  },
  remove_all_current_patient_web_push_subscriptions: {
    'public.user_web_push_subscriptions': ['SELECT', 'DELETE'],
  },
  touch_current_patient_program_item: {
    'public.treatment_program_events': ['INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT', 'UPDATE'],
    'public.treatment_program_instances': ['SELECT'],
  },
  complete_current_patient_program_item: {
    'public.program_action_log': ['SELECT', 'INSERT'], 'public.treatment_program_events': ['INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT', 'UPDATE'],
    'public.treatment_program_instance_stages': ['SELECT', 'UPDATE'],
    'public.treatment_program_instances': ['SELECT', 'UPDATE'],
  },
  enrich_current_patient_program_completion: {
    'public.program_action_log': ['SELECT', 'UPDATE'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  record_current_patient_program_action: {
    'public.media_files': ['SELECT'], 'public.program_action_log': ['SELECT', 'INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  delete_current_patient_program_actions_in_window: {
    'public.program_action_log': ['SELECT', 'DELETE'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  append_current_patient_program_event: {
    'public.treatment_program_events': ['SELECT', 'INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  mark_current_patient_program_item_viewed: {
    'public.treatment_program_instance_stage_items': ['SELECT', 'UPDATE'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  append_current_patient_program_discussion: {
    'public.media_files': ['SELECT'], 'public.program_item_discussion_messages': ['SELECT', 'INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  mark_current_patient_program_discussion_read: {
    'public.program_item_discussion_reads': ['SELECT', 'INSERT', 'UPDATE'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  ensure_current_patient_test_attempt: {
    'public.test_attempts': ['SELECT', 'INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  start_current_patient_test_attempt: {
    'public.test_attempts': ['SELECT', 'INSERT'],
    'public.treatment_program_instance_stage_items': ['SELECT', 'UPDATE'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  save_current_patient_test_result: {
    'public.test_attempts': ['SELECT'], 'public.test_results': ['SELECT', 'INSERT', 'UPDATE'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
  submit_current_patient_test_attempt: {
    'public.test_attempts': ['SELECT', 'UPDATE'], 'public.test_results': ['SELECT'],
    'public.treatment_program_instance_stage_items': ['SELECT'],
    'public.treatment_program_instance_stages': ['SELECT'],
    'public.treatment_program_instances': ['SELECT'],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, readonly Privilege[]>>>>;

const INTEGRATOR_DELIVERY_SOURCES = [
  'delivery-handler',
  'max-webhook:record-outcome',
  'telegram-webhook:record-outcome',
  'worker:job-queue-drain',
  'worker:outgoing-delivery-tick',
  'worker:projection-outbox-tick',
] as const;
const INTEGRATOR_SCHEDULER_SOURCES = [
  'scheduler:acquire-lock',
  'scheduler:claim-due-jobs',
  'scheduler:handle-tick-event',
] as const;
const INTEGRATOR_SERVICE_SOURCES = [
  'integrator-health-check',
] as const;
const INTEGRATOR_MIGRATION_LEDGER_SOURCES = ['integrator-startup-migration-ledger'] as const;
const WEBAPP_MEDIA_SOURCES = [
  'api/internal/media-worker/control:POST',
  'api/internal/media-pending-delete/purge:POST',
  'api/internal/media-multipart/cleanup:POST',
  'api/internal/media-preview/process:POST',
  'api/internal/media-transcode/enqueue:POST',
  'api/internal/media-transcode/reconcile:POST',
] as const;
const WEBAPP_MAINTENANCE_SOURCES = [
  'api/internal/media-hls-proxy-errors/retention:POST',
  'api/internal/media-playback-stats/retention:POST',
  'api/internal/product-analytics/retention:POST',
] as const;
const WEBAPP_WORKER_SOURCES = [
  'api/auth/channel-link/start:POST:authenticated',
  'api/integrator/channel-link/complete:POST:verified',
  'api/payments/saas-webhook:POST:verified-resolver',
  'api/payments/saas-webhook:POST:capture',
  'api/integrator/operator-health/digest-wake:POST',
  'api/integrator/system-health/guard-wake:POST',
  'api/internal/operator-health-digest/tick:POST',
  'api/internal/operator-health-critical/tick:POST',
  'api/internal/system-health-guard/tick:POST',
  // Часовой тик продления подписок: до 19.08 он входил платформенным принципалом с выдуманным
  // актором и падал на установке контекста — здесь его не было, потому что и класс был не тот.
  'api/internal/saas-billing/renewal/tick:POST',
  'api/internal/specialist-task-reminders/tick:POST',
  'api/internal/heartbeat/pipeline_delivery:POST',
  'api/internal/heartbeat/pipeline_delivery:GET',
  'api/internal/heartbeat/digest:POST',
  'api/internal/heartbeat/digest:GET',
  'operator-cron-job-status:write',
  'webapp-health-check',
  'api/health:GET',
] as const;
const WEBAPP_TELEMETRY_SOURCES = ['webapp-saas-isolation-telemetry'] as const;

const REV10_CONTEXT = {
  classes: ['pre_session', 'staff', 'patient', 'platform', 'integrator', 'tenant_service', 'service'],
  privateRelations: {
    'app_control.org_table_allowlist': { owner: 'postgres', columns: [
      'schema_name', 'table_name',
    ] },
    'app_control.relation_wall_registry': { owner: 'postgres', columns: [
      'schema_name', 'table_name', 'data_class', 'wall', 'expected_owner',
    ] },
    'app_ext.port_context_capabilities': { owner: 'app_seam_context_owner', columns: [
      'capability_id', 'port', 'session_login', 'target_role', 'context_class', 'purpose', 'function_identity',
      'active_from', 'active_until',
    ] },
    'app_ext.accepted_port_contexts': { owner: 'app_seam_context_owner', columns: [
      'database_oid', 'backend_pid', 'transaction_id', 'capability_id', 'session_login', 'port', 'target_role',
      'context_class', 'purpose', 'function_identity', 'typed_args_hash', 'actor_ref', 'subject_ref',
      'organization_id', 'integrator_user_id', 'request_id', 'installed_at', 'cleared_at',
    ] },
    'app_ext.variant_a_identity_refs': { owner: 'app_seam_identity_lookup_owner', columns: [
      'physical_user_id', 'opaque_ref', 'created_at',
    ] },
  },
  capabilities: {
    integrator_request_relation: { port: 'integrator', runtimeName: 'request',
      sessionRole: 'app_integrator_request', targetRole: 'app_integrator_request',
      contextClass: 'integrator', purpose: 'relation' },
    integrator_resolver_relation: { port: 'integrator', runtimeName: 'resolver',
      sessionRole: 'app_integrator_request', targetRole: 'app_integrator_resolver',
      contextClass: 'integrator', purpose: 'relation' },
    integrator_delivery_relation: { port: 'integrator', runtimeName: 'delivery',
      sessionRole: 'app_integrator_request', targetRole: 'app_operational_delivery_worker',
      contextClass: 'service', purpose: 'relation', runtimeSources: INTEGRATOR_DELIVERY_SOURCES },
    integrator_scheduler_relation: { port: 'integrator', runtimeName: 'scheduler',
      sessionRole: 'app_integrator_request', targetRole: 'app_operational_scheduler',
      contextClass: 'service', purpose: 'relation', runtimeSources: INTEGRATOR_SCHEDULER_SOURCES },
    integrator_tenant_service_relation: { port: 'integrator', runtimeName: 'tenant_service',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service',
      contextClass: 'tenant_service', purpose: 'relation' },
    integrator_service_relation: { port: 'integrator', runtimeName: 'service',
      sessionRole: 'app_integrator_request', targetRole: 'app_service',
      contextClass: 'service', purpose: 'relation', runtimeSources: INTEGRATOR_SERVICE_SOURCES },
    integrator_migration_ledger_read: { port: 'integrator', runtimeName: 'migration_ledger',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'migration.ledger.read', functionIdentity: 'app.read_integrator_migration_ledger()',
      runtimeSources: INTEGRATOR_MIGRATION_LEDGER_SOURCES },
    integrator_projection_health_read: { port: 'integrator', runtimeName: 'projection_health',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'integrator.projection-health.read',
      functionIdentity: 'app.read_integrator_projection_health(integer)' },
    integrator_provider_runtime_setting_read: { port: 'integrator', runtimeName: 'provider_runtime_setting',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'config.integrator-provider.read',
      functionIdentity: 'app.read_integrator_provider_runtime_setting(text)' },
    integrator_delivery_attempt_audit: { port: 'integrator',
      runtimeName: 'delivery_attempt_audit', sessionRole: 'app_integrator_request',
      targetRole: 'app_operational_delivery_worker', contextClass: 'service',
      purpose: 'delivery.attempt-audit',
      functionIdentity: 'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)' },
    integrator_inbound_reply_enqueue: { port: 'integrator', runtimeName: 'inbound_reply_enqueue',
      sessionRole: 'app_integrator_request', targetRole: 'app_operational_delivery_worker',
      contextClass: 'service', purpose: 'delivery.inbound-reply.enqueue',
      functionIdentity: 'app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)' },
    integrator_webhook_outcome_record: { port: 'integrator', runtimeName: 'webhook_outcome_record',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'integrator.webhook-outcome.record',
      functionIdentity: 'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)' },
    integrator_dedicated_bot_organization_resolve: { port: 'integrator',
      runtimeName: 'dedicated_bot_organization_resolve', sessionRole: 'app_integrator_request',
      targetRole: 'app_integrator_resolver', contextClass: 'integrator',
      purpose: 'integrator.dedicated-bot.resolve',
      functionIdentity: 'app.resolve_clinic_dedicated_bot_organization(text,text)' },
    integrator_user_organization_resolve: { port: 'integrator',
      runtimeName: 'integrator_user_organization_resolve', sessionRole: 'app_integrator_request',
      targetRole: 'app_integrator_resolver', contextClass: 'integrator',
      purpose: 'integrator.user-organization.resolve',
      functionIdentity: 'app.resolve_active_organization_for_integrator_user_id(bigint)' },
    integrator_channel_identity_upsert: { port: 'integrator',
      runtimeName: 'integrator_channel_identity_upsert', sessionRole: 'app_integrator_request',
      targetRole: 'app_integrator_resolver', contextClass: 'integrator',
      purpose: 'integrator.channel-identity.upsert',
      functionIdentity: 'app.integrator_upsert_channel_identity(text,text,text)' },
    integrator_bootstrap_phone_bind: { port: 'integrator',
      runtimeName: 'integrator_bootstrap_phone_bind', sessionRole: 'app_integrator_request',
      targetRole: 'app_integrator_resolver', contextClass: 'integrator',
      purpose: 'integrator.bootstrap-phone-bind',
      functionIdentity: 'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)' },
    integrator_auth_channel_setting_read: { port: 'integrator', runtimeName: 'auth_channel_setting',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'config.integrator-auth-channel.read',
      functionIdentity: 'app.read_integrator_auth_channel_setting(text)' },
    integrator_runtime_setting_read: { port: 'integrator', runtimeName: 'runtime_setting',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'config.integrator-runtime.read',
      functionIdentity: 'app.read_integrator_runtime_setting(text)' },
    integrator_smtp_outbound_setting_read: { port: 'integrator', runtimeName: 'smtp_outbound_setting',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'config.integrator-smtp.read',
      functionIdentity: 'app.read_integrator_smtp_outbound_setting()' },
    integrator_idempotency_acquire: { port: 'integrator', runtimeName: 'idempotency_acquire',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'integrator.idempotency.acquire', functionIdentity: 'app.try_acquire_integrator_idempotency(text,integer)' },
    integrator_idempotency_release: { port: 'integrator', runtimeName: 'idempotency_release',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'integrator.idempotency.release', functionIdentity: 'app.release_integrator_idempotency(text)' },
    integrator_data_quality_upsert: { port: 'integrator', runtimeName: 'data_quality_upsert',
      sessionRole: 'app_integrator_request', targetRole: 'app_service', contextClass: 'service',
      purpose: 'integrator.data-quality.upsert',
      functionIdentity: 'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)' },
    count_active_canonical_appointments: { port: 'integrator',
      runtimeName: 'count_active_canonical_appointments', sessionRole: 'app_integrator_request',
      targetRole: 'app_service', contextClass: 'service', purpose: 'booking.admin-active.count',
      functionIdentity: 'app.count_active_canonical_appointments()' },
    read_patient_telegram_display_handle: { port: 'webapp', runtimeName: 'read_patient_telegram_display_handle',
      sessionRole: 'app_staff', targetRole: 'app_staff', contextClass: 'staff',
      purpose: 'messaging.patient-telegram-handle.read',
      functionIdentity: 'app.read_patient_telegram_display_handle(uuid)' },
    read_canonical_appointment_by_external_id: { port: 'webapp',
      runtimeName: 'read_canonical_appointment_by_external_id', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service', purpose: 'booking.integrator-record.read',
      functionIdentity: 'app.read_canonical_appointment_by_external_id(text)' },
    // Дашборд глобального админа читал девятнадцать таблиц ОТНОШЕНИЕМ под `app_platform_settings`.
    // Замер 19.08: 42501 на СЕМНАДЦАТИ из них, весь дашборд отдавал 500, админ не видел ни одной
    // цифры. Грант не годится дважды: `deploy-test-saas.sh` ассертит точный набор прав роли, и
    // решение владельца D1 (08.08) — «глобал админ не лезет в медицину», а среди семнадцати
    // `clinical_visit`, `symptom_entries`, `program_action_log`. Дверь отдаёт СЧЁТ, не строки:
    // цифры появляются, медицинские данные роли по-прежнему не видны (миграция 0043).
    webapp_platform_analytics_dashboard: { port: 'webapp',
      runtimeName: 'platform_analytics_dashboard', sessionRole: 'app_platform_settings',
      targetRole: 'app_platform_settings', contextClass: 'platform',
      purpose: 'analytics.platform-dashboard.read',
      functionIdentity: 'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)' },
    list_platform_registration_analytics_events: { port: 'webapp',
      runtimeName: 'list_platform_registration_analytics_events', sessionRole: 'app_platform_settings',
      targetRole: 'app_platform_settings', contextClass: 'platform',
      purpose: 'analytics.registration-events.read',
      functionIdentity: 'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)' },
    list_active_canonical_appointments_by_phone: { port: 'webapp',
      runtimeName: 'list_active_canonical_appointments_by_phone', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service', purpose: 'booking.integrator-active.read',
      functionIdentity: 'app.list_active_canonical_appointments_by_phone(text)' },
    webapp_staff_identity_resolve: { port: 'webapp', runtimeName: 'staff_identity_resolve',
      sessionRole: 'app_staff', targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'identity.variant-a.resolve', functionIdentity: 'app.pre_session_resolve_identity(uuid)' },
    webapp_patient_identity_resolve: { port: 'webapp', runtimeName: 'patient_identity_resolve',
      sessionRole: 'app_patient', targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'identity.variant-a.resolve', functionIdentity: 'app.pre_session_resolve_identity(uuid)' },
    webapp_global_admin_identity_resolve: { port: 'webapp', runtimeName: 'globalAdmin_identity_resolve',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'pre_session',
      purpose: 'identity.variant-a.resolve', functionIdentity: 'app.pre_session_resolve_identity(uuid)' },
    auth_channel_binding_session: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.channel-binding.session',
      functionIdentity: 'app.auth_channel_binding_session(text,text)' },
    resolve_staff_workspace_memberships: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.staff-workspace.resolve',
      functionIdentity: 'app.resolve_staff_workspace_memberships(uuid)' },
    resolve_staff_workspace_memberships_in_context: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_staff', contextClass: 'staff', purpose: 'auth.staff-workspace.resolve',
      functionIdentity: 'app.resolve_staff_workspace_memberships(uuid)' },
    webapp_staff_relation: { port: 'webapp', runtimeName: 'staff', sessionRole: 'app_staff',
      targetRole: 'app_staff', contextClass: 'staff', purpose: 'relation' },
    webapp_patient_relation: { port: 'webapp', runtimeName: 'patient', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'relation' },
    patient_active_organizations_resolve: { port: 'webapp', runtimeName: 'patient_active_organizations_resolve',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.organization.resolve',
      functionIdentity: 'app.read_current_patient_active_organizations()' },
    patient_material_rating_snapshot: { port: 'webapp', runtimeName: 'patient_material_rating_snapshot',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.material-rating.snapshot.read',
      functionIdentity: 'app.read_current_patient_material_rating_snapshot(text,uuid)' },
    patient_practice_completion_record: { port: 'webapp', runtimeName: 'patient_practice_completion_record',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.practice-completion.record',
      functionIdentity: 'app.record_current_patient_practice_completion(uuid,text,integer)' },
    patient_material_rating_upsert: { port: 'webapp', runtimeName: 'patient_material_rating_upsert',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.material-rating.upsert',
      functionIdentity: 'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)' },
    patient_practice_completion_feeling_update: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.practice-completion.feeling.update',
      functionIdentity: 'app.update_current_patient_practice_completion_feeling(uuid,integer)' },
    patient_daily_warmup_presentation_save: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.daily-warmup.presentation.save',
      functionIdentity: 'app.save_current_patient_daily_warmup_presentation(uuid,timestamp with time zone,boolean)' },
    patient_daily_warmup_video_view_record: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.daily-warmup.video-view.record',
      functionIdentity: 'app.record_current_patient_daily_warmup_video_view(uuid)' },
    patient_content_rating_feedback_record: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.material-rating.feedback.record',
      functionIdentity: 'app.record_current_patient_content_rating_feedback(uuid,integer,text,text)' },
    patient_playback_client_event_record: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.media.playback-client-event.record',
      functionIdentity: 'app.record_current_patient_playback_client_event(uuid,text,text,text,text)' },
    patient_playback_first_resolve_record: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.media.playback-first-resolve.record',
      functionIdentity: 'app.record_current_patient_playback_first_resolve(uuid)' },
    patient_diary_day_snapshot_capture: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.diary-day.snapshot.capture',
      functionIdentity: 'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)' },
    patient_notification_topic_set: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.notification-topic.set',
      functionIdentity: 'app.set_current_patient_notification_topic(text,boolean)' },
    patient_notification_topic_channel_set: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.notification-topic-channel.set',
      functionIdentity: 'app.set_current_patient_notification_topic_channel(text,text,boolean)' },
    patient_reminder_rule_create: patientSelfCapability('patient.reminder-rule.create',
      'app.create_current_patient_reminder_rule(text,text)'),
    patient_reminder_rule_update: patientSelfCapability('patient.reminder-rule.update',
      'app.update_current_patient_reminder_rule(text,text)'),
    patient_reminder_rule_delete: patientSelfCapability('patient.reminder-rule.delete',
      'app.delete_current_patient_reminder_rule(text)'),
    patient_reminder_journal_record: patientSelfCapability('patient.reminder-journal.record',
      'app.record_current_patient_reminder_journal_action(text,text,text,timestamp with time zone,text)'),
    patient_reminder_history_seen: patientSelfCapability('patient.reminder-history.seen',
      'app.mark_current_patient_reminder_history_seen(text)'),
    patient_reminder_history_seen_all: patientSelfCapability('patient.reminder-history.seen-all',
      'app.mark_all_current_patient_reminder_history_seen()'),
    patient_reminder_mute: patientSelfCapability('patient.reminder.mute',
      'app.set_current_patient_reminder_muted_until(timestamp with time zone)'),
    patient_support_conversation_ensure: patientSelfCapability('patient.support-conversation.ensure',
      'app.ensure_current_patient_support_conversation()'),
    patient_support_message_append: patientSelfCapability('patient.support-message.append',
      'app.append_current_patient_support_message(uuid,text,text,text,timestamp with time zone,text,text)'),
    patient_support_conversation_read: patientSelfCapability('patient.support-conversation.read',
      'app.mark_current_patient_support_conversation_read(uuid)'),
    patient_support_messages_read: patientSelfCapability('patient.support-messages.read',
      'app.mark_current_patient_support_messages_read(text)'),
    patient_support_notifications_read: patientSelfCapability('patient.support-notifications.read',
      'app.mark_current_patient_support_notifications_read()'),
    patient_symptom_system_tracking_ensure: patientSelfCapability('patient.symptom-system-tracking.ensure',
      'app.ensure_current_patient_system_symptom_tracking(text,text,uuid)'),
    patient_symptom_entry_record: patientSelfCapability('patient.symptom-entry.record',
      'app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)'),
    patient_symptom_entry_update: patientSelfCapability('patient.symptom-entry.update',
      'app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)'),
    patient_symptom_entry_delete: patientSelfCapability('patient.symptom-entry.delete',
      'app.delete_current_patient_symptom_entry(uuid)'),
    patient_symptom_tracking_configure: patientSelfCapability('patient.symptom-tracking.configure',
      'app.configure_current_patient_assigned_symptom_tracking(uuid,text,boolean)'),
    patient_warmup_feeling_apply: patientSelfCapability('patient.warmup-feeling.apply',
      'app.apply_current_patient_warmup_feeling(uuid,integer,uuid,text,uuid,text)'),
    patient_channel_preference_save: patientSelfCapability('patient.channel-preference.save',
      'app.save_current_patient_channel_preference(text,boolean,boolean)'),
    patient_preferred_auth_channel_set: patientSelfCapability('patient.preferred-auth-channel.set',
      'app.set_current_patient_preferred_auth_channel(text)'),
    patient_web_push_subscription_save: patientSelfCapability('patient.web-push-subscription.save',
      'app.save_current_patient_web_push_subscription(text,text,text,text)'),
    patient_web_push_subscription_remove: patientSelfCapability('patient.web-push-subscription.remove',
      'app.remove_current_patient_web_push_subscription(text)'),
    patient_web_push_subscriptions_remove_all: patientSelfCapability('patient.web-push-subscriptions.remove-all',
      'app.remove_all_current_patient_web_push_subscriptions()'),
    patient_plan_touch: patientSelfCapability('patient.program.touch',
      'app.touch_current_patient_plan_last_opened(uuid)'),
    patient_program_item_touch: patientSelfCapability('patient.program-item.touch',
      'app.touch_current_patient_program_item(uuid,uuid)'),
    patient_program_item_complete: patientSelfCapability('patient.program-item.complete',
      'app.complete_current_patient_program_item(uuid,uuid,integer,text)'),
    patient_program_completion_enrich: patientSelfCapability('patient.program-completion.enrich',
      'app.enrich_current_patient_program_completion(uuid,uuid,uuid,text)'),
    patient_program_action_record: patientSelfCapability('patient.program-action.record',
      'app.record_current_patient_program_action(uuid,uuid,text,uuid,text,text)'),
    patient_program_actions_delete_window: patientSelfCapability('patient.program-actions.delete-window',
      'app.delete_current_patient_program_actions_in_window(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)'),
    patient_program_event_append: patientSelfCapability('patient.program-event.append',
      'app.append_current_patient_program_event(uuid,text,text,uuid,text,text)'),
    patient_program_item_viewed: patientSelfCapability('patient.program-item.viewed',
      'app.mark_current_patient_program_item_viewed(uuid,uuid)'),
    patient_program_discussion_append: patientSelfCapability('patient.program-discussion.append',
      'app.append_current_patient_program_discussion(uuid,text,uuid)'),
    patient_program_discussion_read: patientSelfCapability('patient.program-discussion.read',
      'app.mark_current_patient_program_discussion_read(uuid,timestamp with time zone)'),
    patient_test_attempt_ensure: patientSelfCapability('patient.test-attempt.ensure',
      'app.ensure_current_patient_test_attempt(uuid)'),
    patient_test_attempt_start: patientSelfCapability('patient.test-attempt.start',
      'app.start_current_patient_test_attempt(uuid,uuid)'),
    patient_test_result_save: patientSelfCapability('patient.test-result.save',
      'app.save_current_patient_test_result(uuid,uuid,text,text)'),
    patient_test_attempt_submit: patientSelfCapability('patient.test-attempt.submit',
      'app.submit_current_patient_test_attempt(uuid)'),
    patient_self_fio_read: { port: 'webapp', runtimeName: 'patient_self_fio_read',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.identity.self.read',
      functionIdentity: 'app.read_current_patient_fio()' },
    patient_self_fio_update: { port: 'webapp', runtimeName: 'patient_self_fio_update',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.identity.self.update',
      functionIdentity: 'app.update_current_patient_fio(text,text,text)' },
    patient_program_description_read: { port: 'webapp', runtimeName: 'patient_program_description_read',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.program.description.read',
      functionIdentity: 'app.read_current_patient_treatment_program_description(uuid)' },
    patient_program_submission_media_create: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.media.program-submission.create',
      functionIdentity: 'app.create_patient_program_submission_media(uuid,text,text,text,bigint)' },
    patient_program_submission_media_confirm: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.media.program-submission.confirm',
      functionIdentity: 'app.confirm_patient_program_submission_media(uuid)' },
    patient_program_submission_media_abort: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'patient.media.program-submission.abort',
      functionIdentity: 'app.abort_patient_program_submission_media(uuid)' },
    staff_media_transcode_enqueue: { port: 'webapp',
      sessionRole: 'app_staff', targetRole: 'app_staff', contextClass: 'staff',
      purpose: 'media.transcode.enqueue',
      functionIdentity: 'app.enqueue_media_transcode_job_for_staff(uuid)' },
    service_media_transcode_enqueue: { port: 'webapp',
      sessionRole: 'app_staff', targetRole: 'app_operational_media_worker', contextClass: 'service',
      purpose: 'media.transcode.enqueue',
      functionIdentity: 'app.enqueue_media_transcode_job_for_service(uuid)' },
    // Разбор той же очереди. До 0050 он шёл отношением и отбивался `42501 accepted organization
    // context required` на КАЖДОМ обороте петли: диспетчер межарендный, `organization_id` у него
    // нет, а политика роли на `public.media_transcode_jobs` требует именно его.
    media_transcode_claim: { port: 'webapp', runtimeName: 'media_transcode_claim',
      sessionRole: 'app_staff', targetRole: 'app_operational_media_worker', contextClass: 'service',
      purpose: 'media.transcode.claim',
      functionIdentity: 'app.claim_media_transcode_job(text,integer)' },
    media_transcode_job_media_read: { port: 'webapp', runtimeName: 'media_transcode_job_media_read',
      sessionRole: 'app_staff', targetRole: 'app_operational_media_worker', contextClass: 'service',
      purpose: 'media.transcode.job-media.read',
      functionIdentity: 'app.read_media_transcode_job_media(uuid,uuid,text)' },
    media_transcode_outcome_record: { port: 'webapp', runtimeName: 'media_transcode_outcome_record',
      sessionRole: 'app_staff', targetRole: 'app_operational_media_worker', contextClass: 'service',
      purpose: 'media.transcode.outcome.record',
      functionIdentity: 'app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)' },
    // Both context classes reach the SAME root: the message context, not the caller class, decides
    // what gets sent. A patient booking and a staff-initiated notice are one mechanism.
    patient_outbound_message_enqueue: { port: 'webapp',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'outbound.message.enqueue',
      functionIdentity: 'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)' },
    staff_outbound_message_enqueue: { port: 'webapp',
      sessionRole: 'app_staff', targetRole: 'app_staff', contextClass: 'staff',
      purpose: 'outbound.message.enqueue',
      functionIdentity: 'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)' },
    webapp_clinic_billing_relation: { port: 'webapp', runtimeName: 'clinicBilling', sessionRole: 'app_staff',
      targetRole: 'app_clinic_billing', contextClass: 'staff', purpose: 'relation' },
    webapp_platform_relation: { port: 'webapp', runtimeName: 'platform', sessionRole: 'app_platform_settings',
      targetRole: 'app_platform_settings', contextClass: 'platform', purpose: 'relation' },
    webapp_platform_admin_relation: { port: 'webapp', runtimeName: 'platform_admin',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin',
      contextClass: 'platform', purpose: 'relation' },
    webapp_platform_audit_conflict_resolve: { port: 'webapp', runtimeName: 'platform_audit_conflict_resolve',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.audit-conflict.resolve', functionIdentity: 'app.resolve_platform_audit_conflict(uuid)' },
    webapp_platform_audit_event_append: { port: 'webapp', runtimeName: 'platform_audit_event_append',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.audit-event.append', functionIdentity: 'app.append_platform_audit_event(text,text,text)' },
    webapp_pre_session_audit_event_append: { port: 'webapp', runtimeName: 'pre_session_audit_event_append',
      sessionRole: 'app_patient', targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'platform.audit-event.append', functionIdentity: 'app.append_platform_audit_event(text,text,text)' },
    webapp_platform_incidents_acknowledge: { port: 'webapp', runtimeName: 'platform_incidents_acknowledge',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.operator-incidents.acknowledge',
      functionIdentity: 'app.acknowledge_open_outbound_provider_incidents()' },
    webapp_platform_incidents_resolve: { port: 'webapp', runtimeName: 'platform_incidents_resolve',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.operator-incidents.resolve', functionIdentity: 'app.resolve_all_open_operator_incidents()' },
    webapp_platform_health_archive_list: { port: 'webapp', runtimeName: 'platform_health_archive_list',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.health-archive.list',
      functionIdentity: 'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)' },
    webapp_platform_health_archive_clear: { port: 'webapp', runtimeName: 'platform_health_archive_clear',
      sessionRole: 'app_platform_settings', targetRole: 'app_platform_admin', contextClass: 'platform',
      purpose: 'platform.health-archive.clear',
      functionIdentity: 'app.archive_operator_health_failures(text,integer,uuid)' },
    webapp_worker_relation: { port: 'webapp', runtimeName: 'worker', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service', purpose: 'relation',
      runtimeSources: WEBAPP_WORKER_SOURCES },
    webapp_webhook_burst_signals_list: { port: 'webapp', runtimeName: 'webhook_burst_signals_list',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.webhook-errors.aggregate',
      functionIdentity: 'app.list_integration_webhook_burst_signals(integer,integer)' },
    webapp_webhook_error_events_prune: { port: 'webapp', runtimeName: 'webhook_error_events_prune',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.webhook-errors.prune',
      functionIdentity: 'app.prune_integration_webhook_error_events(integer)' },
    webapp_health_archive_prune: { port: 'webapp', runtimeName: 'health_archive_prune',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.failure-archive.prune',
      functionIdentity: 'app.prune_operator_health_failure_archive(integer)' },
    // Начало окна суточной сводки здоровья — время ПОДТВЕРЖДЁННОЙ отправки прошлой сводки. До
    // миграции 0038 вебапп читал `public.outgoing_delivery_queue` отношением под `app_staff`, у
    // которого на очереди нет ни одной привилегии и по решению не должно быть; тик сводки падал
    // 42501 на первом же шаге и сводка не уходила ни разу. Дверь — та же, что у соседних
    // операторских чтений: шов телеметрии, рабочая роль `app_worker`, только EXECUTE.
    webapp_health_digest_last_sent_read: { port: 'webapp', runtimeName: 'health_digest_last_sent_read',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.digest.last-sent.read',
      functionIdentity: 'app.read_operator_health_digest_last_sent_at()' },
    // Двенадцать запросов отношением под `app_staff` (`getOutgoingDeliveryQueueHealth`) стояли в
    // ГОЛОМ `Promise.all` критического тика — падал весь пятиминутный тик и баннер врача, а не
    // одна панель. Одна дверь вместо двенадцати запросов, тот же шов операторской телеметрии.
    webapp_delivery_queue_health_read: { port: 'webapp', runtimeName: 'delivery_queue_health_read',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.delivery-queue.aggregate',
      functionIdentity: 'app.read_operator_delivery_queue_health()' },
    // Постановка суточной сводки в очередь: INSERT на очередь не выдан ни одной рабочей роли,
    // поэтому строк `operator_health_digest` не появлялось вовсе. Свой корень, а не универсальный
    // корень исходящего: у сводки собственный вид строки и собственный операторский класс.
    webapp_health_digest_enqueue: { port: 'webapp', runtimeName: 'health_digest_enqueue',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.digest.enqueue',
      functionIdentity: 'app.enqueue_operator_health_digest_delivery(text,text,text,integer)' },
    // Аудитория staff-веб-пуша операторского алерта: до 0040 читалась отношением под `app_worker`
    // и отбивалась 42501 на `be_organization_members` — канал не работал, а тик писал успех.
    webapp_operator_alert_staff_push_audience_read: { port: 'webapp',
      runtimeName: 'operator_alert_staff_push_audience_read', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service',
      purpose: 'notifications.staff-push-audience.read',
      functionIdentity: 'app.list_operator_alert_staff_push_recipients()' },
    // Открытие критического инцидента: до 0041 писалось отношением под `app_worker` и отбивалось
    // 42501 на `operator_incidents` — сторож замечал сбой и не мог записать ни строки.
    webapp_critical_incident_open: { port: 'webapp',
      runtimeName: 'critical_incident_open', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service',
      purpose: 'health.critical-incident.open-or-touch',
      functionIdentity: 'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)' },
    // Часовой тик продления подписок: межарендное перечисление «у кого кончился оплаченный период».
    // До 0040 тик входил платформенным принципалом с выдуманным нулевым UUID вместо актора и падал
    // ещё на установке контекста — строки `billing.saas_renewal.tick` не появилось ни разу.
    webapp_saas_renewal_due_list: { port: 'webapp', runtimeName: 'saas_renewal_due_list',
      sessionRole: 'app_staff', targetRole: 'app_worker', contextClass: 'service',
      purpose: 'billing.saas-renewal.due-list',
      functionIdentity: 'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)' },
    // Одна уборка по сроку хранения на все запертые арендаторские таблицы: цель выбирается
    // параметром из ЗАКРЫТОГО списка внутри тела, окно приходит константой вызывающего тика.
    // Каждый тик сохраняет свою личность — общей у них только эта дверь.
    webapp_retention_sweep: { port: 'webapp', runtimeName: 'retention_sweep',
      sessionRole: 'app_staff', targetRole: 'app_operational_maintenance', contextClass: 'service',
      purpose: 'retention.locked-tenant-table.sweep',
      functionIdentity: 'app.prune_retention_target(text,integer,boolean)' },
    webapp_media_relation: { port: 'webapp', runtimeName: 'media_worker', sessionRole: 'app_staff',
      targetRole: 'app_operational_media_worker', contextClass: 'service', purpose: 'relation',
      runtimeSources: WEBAPP_MEDIA_SOURCES },
    webapp_maintenance_relation: { port: 'webapp', runtimeName: 'maintenance', sessionRole: 'app_staff',
      targetRole: 'app_operational_maintenance', contextClass: 'service', purpose: 'relation',
      runtimeSources: WEBAPP_MAINTENANCE_SOURCES },
    webapp_telemetry_relation: { port: 'webapp', runtimeName: 'telemetry', sessionRole: 'app_staff',
      targetRole: 'saas_telemetry_operator', contextClass: 'service', purpose: 'relation',
      runtimeSources: WEBAPP_TELEMETRY_SOURCES },
    saas_billing_invoice_webhook_resolve: { port: 'webapp',
      runtimeName: 'saas_billing_invoice_webhook_resolve', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service', purpose: 'billing.webhook.invoice.resolve',
      functionIdentity: 'app.resolve_saas_billing_invoice_for_webhook(text,text)' },
    saas_billing_refund_webhook_resolve: { port: 'webapp',
      runtimeName: 'saas_billing_refund_webhook_resolve', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service', purpose: 'billing.webhook.refund.resolve',
      functionIdentity: 'app.resolve_saas_billing_refund_for_webhook(text,text)' },
    patient_acquiring_webhook_resolve: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'patient-payment.webhook.resolve',
      functionIdentity: 'app.resolve_patient_acquiring_webhook_organization(text,text)' },
    saas_billing_provider_preauth_read: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'billing.webhook.provider.read',
      functionIdentity: 'app.read_saas_billing_payment_provider_preauth()' },
    saas_billing_provider_clinic_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_clinic_billing', contextClass: 'staff', purpose: 'billing.clinic.provider.read',
      functionIdentity: 'app.read_saas_billing_payment_provider_clinic()' },
    saas_billing_period_catalog_clinic_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_clinic_billing', contextClass: 'staff', purpose: 'billing.clinic.period-catalog.read',
      functionIdentity: 'app.list_saas_billing_period_catalog()' },
    saas_billing_period_catalog_platform_read: { port: 'webapp', sessionRole: 'app_platform_settings',
      targetRole: 'app_platform_settings', contextClass: 'platform', purpose: 'billing.platform.period-catalog.read',
      functionIdentity: 'app.list_saas_billing_period_catalog_platform()' },
    saas_billing_provider_platform_read: { port: 'webapp', sessionRole: 'app_platform_settings',
      targetRole: 'app_platform_settings', contextClass: 'platform', purpose: 'billing.platform.provider.read',
      functionIdentity: 'app.read_saas_billing_payment_provider_platform()' },
    password_login_acquire: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.password.acquire',
      functionIdentity: 'app.password_login_acquire(text,text,uuid,text)' },
    password_login_complete: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.password.complete',
      functionIdentity: 'app.password_login_complete(uuid,boolean)' },
    password_login_read_altcha_secret: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.password.altcha-secret',
      functionIdentity: 'app.password_login_read_altcha_secret()' },
    password_login_issue_altcha_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.password.altcha-issue',
      functionIdentity: 'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)' },
    email_password_find_login_candidate: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.password.reset-candidate',
      functionIdentity: 'app.email_password_find_reset_candidate(text)' },
    email_auth_start_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.email-otp.challenge.start',
      functionIdentity: 'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)' },
    email_otp_public_find_or_create_user: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.email-otp.user.find-or-create',
      functionIdentity: 'app.email_otp_public_find_or_create_user(text)' },
    email_otp_public_find_user: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.email-otp.user.find',
      functionIdentity: 'app.email_otp_public_find_user_by_email(text)' },
    email_otp_public_register_patient: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.email-otp.registration.create',
      functionIdentity: 'app.email_otp_public_register_patient(text,text,text,text)' },
    email_otp_public_consume_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.email-otp.challenge.consume',
      functionIdentity: 'app.email_otp_public_consume_latest_challenge(text,text)' },
    email_otp_public_read_cooldown: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.email-otp.cooldown.read',
      functionIdentity: 'app.email_otp_public_find_email_send_cooldown_by_email(text)' },
    auth_login_token_create: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.login-token.create',
      functionIdentity: 'app.auth_login_token_create(text,uuid,text,timestamp with time zone)' },
    auth_login_token_read: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.login-token.read',
      functionIdentity: 'app.auth_login_token_read(text)' },
    auth_login_token_expire_past: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.login-token.expire',
      functionIdentity: 'app.auth_login_token_expire_past()' },
    auth_login_token_confirm: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.login-token.confirm',
      functionIdentity: 'app.auth_login_token_confirm(text)' },
    auth_login_token_mark_session_issued: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.login-token.session-issued',
      functionIdentity: 'app.auth_login_token_mark_session_issued(text)' },
    integrator_event_idempotency_read: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'integrator.event-idempotency.read',
      functionIdentity: 'app.integrator_event_idempotency_read(text)' },
    integrator_event_idempotency_store: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'integrator.event-idempotency.store',
      functionIdentity: 'app.integrator_event_idempotency_store(text,text,integer,text,integer)' },
    integrator_reminder_occurrence_finalized_record: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'integrator.reminder-occurrence-finalized.record',
      functionIdentity: 'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)' },
    patient_reminder_materialization_snapshot_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'reminder.materialization.snapshot.read',
      functionIdentity: 'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)' },
    patient_reminder_materialization_targets_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'reminder.materialization.targets.read',
      functionIdentity: 'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)' },
    patient_reminder_materialization_commit: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'reminder.materialization.commit',
      functionIdentity: 'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)' },
    appointment_reminder_generation_replace: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'reminder.appointment-generation.replace',
      functionIdentity: 'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)' },
    integrator_delivery_targets_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'integrator.delivery-targets.read',
      functionIdentity: 'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)' },
    webapp_pre_session_admin_notification_targets_read: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'notifications.admin-targets.read',
      functionIdentity: 'app.read_admin_notification_targets(text)' },
    webapp_admin_notification_targets_read: { port: 'webapp',
      runtimeName: 'admin_notification_targets_read', sessionRole: 'app_staff',
      targetRole: 'app_worker', contextClass: 'service',
      purpose: 'notifications.admin-targets.read',
      functionIdentity: 'app.read_admin_notification_targets(text)' },
    integrator_web_push_subscriptions_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'integrator.web-push-subscriptions.read',
      functionIdentity: 'app.read_integrator_web_push_subscriptions(uuid,uuid)' },
    integrator_web_push_delivery_settings_read: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'integrator.web-push-delivery-settings.read',
      functionIdentity: 'app.read_integrator_web_push_delivery_settings(uuid)' },
    integrator_support_delivery_attempt_record: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'integrator.support-delivery-attempt.record',
      functionIdentity: 'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)' },
    auth_oauth_find_user: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.oauth.callback.find-binding',
      functionIdentity: 'app.auth_oauth_find_user(text,text)' },
    auth_oauth_upsert_binding: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.oauth.callback.upsert-binding',
      functionIdentity: 'app.auth_oauth_upsert_binding(uuid,text,text,text)' },
    auth_rate_limit_check_and_record: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.rate-limit.check-record',
      functionIdentity: 'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)' },
    email_auth_find_email_otp_lock: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.email-otp.lock.read',
      functionIdentity: 'app.email_auth_find_email_otp_lock(uuid)' },
    email_auth_register_email_otp_lockout: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.email-otp.lock.register',
      functionIdentity: 'app.email_auth_register_email_otp_lockout(uuid)' },
    email_auth_reset_email_otp_lockout: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.email-otp.lock.reset',
      functionIdentity: 'app.email_auth_reset_email_otp_lockout(uuid)' },
    phone_auth_find_latest_challenge_created_at: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-otp.cooldown.read',
      functionIdentity: 'app.phone_auth_find_latest_challenge_created_at(text)' },
    phone_auth_find_otp_lock: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-otp.lock.read',
      functionIdentity: 'app.phone_auth_find_otp_lock(text)' },
    phone_messenger_bind_secret: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.phone-messenger-bind.secret',
      functionIdentity: 'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)' },
    phone_messenger_bind_completion_state: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.phone-messenger-bind.completion-state',
      functionIdentity: 'app.phone_messenger_bind_completion_state(text,text,text,text)' },
    phone_auth_register_otp_lockout: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-otp.lock.register',
      functionIdentity: 'app.phone_auth_register_otp_lockout(text,bigint)' },
    phone_auth_reset_otp_lockout: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-otp.lock.reset',
      functionIdentity: 'app.phone_auth_reset_otp_lockout(text)' },
    phone_challenge_store_upsert: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-challenge.upsert',
      functionIdentity: 'app.phone_challenge_store_upsert(text,text,bigint,text,text,integer)' },
    phone_challenge_store_read: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-challenge.read',
      functionIdentity: 'app.phone_challenge_store_read(text)' },
    phone_challenge_store_delete: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-challenge.delete',
      functionIdentity: 'app.phone_challenge_store_delete(text)' },
    phone_challenge_store_delete_by_phone: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-challenge.delete-by-phone',
      functionIdentity: 'app.phone_challenge_store_delete_by_phone(text)' },
    phone_challenge_store_increment_attempts: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.phone-challenge.attempt.increment',
      functionIdentity: 'app.phone_challenge_store_increment_attempts(text,bigint)' },
    phone_otp_public_booking_issue_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-phone-otp.issue',
      functionIdentity: 'app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)' },
    phone_otp_public_booking_consume_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-phone-otp.consume',
      functionIdentity: 'app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)' },
    read_public_runtime_setting: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'config.runtime.public.read',
      functionIdentity: 'app.read_public_runtime_setting(text,text)' },
    read_webapp_server_runtime_setting: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'config.runtime.server.read',
      functionIdentity: 'app.read_webapp_server_runtime_setting(text,text)' },
    is_smtp_outbound_configured: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.channel.smtp.configured',
      functionIdentity: 'app.is_smtp_outbound_configured()' },
    is_sms_provider_configured: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.channel.sms.configured',
      functionIdentity: 'app.is_sms_provider_configured()' },
    is_telegram_login_configured: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.channel.telegram.configured',
      functionIdentity: 'app.is_telegram_login_configured()' },
    is_max_bot_configured: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.channel.max.configured',
      functionIdentity: 'app.is_max_bot_configured()' },
    passkey_issue_authentication_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.passkey.challenge.issue',
      functionIdentity: 'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)' },
    passkey_issue_registration_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'auth.passkey.registration-challenge.issue',
      functionIdentity: 'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)' },
    passkey_read_authentication_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'auth.passkey.challenge.read',
      functionIdentity: 'app.passkey_read_challenge(uuid,text)' },
    passkey_read_registration_challenge: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'auth.passkey.registration-challenge.read',
      functionIdentity: 'app.passkey_read_challenge(uuid,text)' },
    passkey_read_credential: { port: 'webapp', sessionRole: 'app_patient', targetRole: 'app_pre_session',
      contextClass: 'pre_session', purpose: 'auth.passkey.credential.read',
      functionIdentity: 'app.passkey_read_credential(text)' },
    passkey_complete_authentication: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.passkey.authentication.complete',
      functionIdentity: 'app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)' },
    get_public_reference_baseline: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'catalog.public-reference.read',
      functionIdentity: 'app.get_public_reference_baseline(text)' },
    is_organization_slug_available: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session',
      purpose: 'auth.specialist-signup.slug-availability',
      functionIdentity: 'app.is_organization_slug_available(text)' },
    read_webapp_preauth_provider_setting: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'config.preauth-provider.read',
      functionIdentity: 'app.read_webapp_preauth_provider_setting(text)' },
    resolve_public_organization_by_slug: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-organization.resolve',
      functionIdentity: 'app.resolve_public_organization_by_slug(text)' },
    resolve_public_organization_slug: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-slug.resolve',
      functionIdentity: 'app.resolve_public_organization_slug(text)' },
    // Четыре двери публичной записи (миграция 0043). Арендаторский класс `tenant_service` у порта
    // `webapp` ходит ИМЕНОВАННЫМИ КОРНЯМИ от `app_seam_public_booking_owner`, а не сквозным
    // `purpose: 'relation'`: сквозной двери этому классу не выдают (SCHEME §3). Резолвер арендатора
    // стоит ДО выбора арендатора, поэтому он один в классе `pre_session`.
    resolve_public_booking_organization: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-tenant.resolve',
      functionIdentity: 'app.resolve_public_booking_organization(uuid,uuid)' },
    // Две двери ЗАПИСИ (миграция 0048). Личность резолвится до выбора арендатора, поэтому её
    // класс — `pre_session`; отношение с клиникой заводится уже под ПАЦИЕНТСКИМ принципалом, чтобы
    // человек мог записать в клиенты только себя.
    resolve_public_booking_client_by_phone: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'booking.public-client.resolve',
      functionIdentity: 'app.resolve_public_booking_client_by_phone(text,text,boolean)' },
    enroll_current_patient_in_public_booking_clinic: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.public-client.enroll',
      functionIdentity: 'app.enroll_current_patient_in_public_booking_clinic(uuid,text)' },
    // Компенсация неудавшейся записи (миграция 0052). Зачисление коммитится раньше приёма и вместе
    // с ним откатиться не может, поэтому провалившаяся запись убирает за собой отдельной дверью.
    revoke_public_booking_enrollment: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.public-client.revoke',
      functionIdentity: 'app.revoke_public_booking_enrollment(uuid)' },
    read_public_booking_catalog: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'booking.public-catalog.read',
      functionIdentity: 'app.read_public_booking_catalog(uuid,uuid)' },
    read_public_booking_slot_snapshot: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'booking.public-slot-snapshot.read',
      functionIdentity: 'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)' },
    list_public_booking_form_fields: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'booking.public-form-fields.read',
      functionIdentity: 'app.list_public_booking_form_fields()' },
    // Публичная визитка клиники `/{clinic}` (владелец 19.08). Анонимный посетитель читает ОДНУ
    // строку публичной проекции через дверь: прямой SELECT ему отозван целиком (42501).
    read_public_clinic_card: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_pre_session', contextClass: 'pre_session', purpose: 'clinic.public-card.read',
      functionIdentity: 'app.read_public_clinic_card(text)' },
    // Настройка визитки в кабинете админа клиники. У `app_staff` на проекции поколоночный
    // UPDATE ровно на `slug, updated_at` — выдать ему новые колонки значило бы расширить гранты
    // рабочей роли, поэтому запись идёт объявленным корнем.
    save_public_clinic_card: { port: 'webapp', sessionRole: 'app_staff',
      targetRole: 'app_staff', contextClass: 'staff', purpose: 'clinic.public-card.save',
      functionIdentity: 'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)' },
    get_web_push_vapid_public_key: { port: 'webapp', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'patient.web-push.vapid-public-key.read',
      functionIdentity: 'app.get_web_push_vapid_public_key()' },
    resolve_outgoing_delivery_scope: { port: 'integrator', sessionRole: 'app_integrator_request',
      targetRole: 'app_operational_delivery_worker', contextClass: 'service', purpose: 'delivery.resolve-scope',
      functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)' },
    operator_incident_alert_already_sent: { port: 'integrator', sessionRole: 'app_integrator_request',
      targetRole: 'app_operational_delivery_worker', contextClass: 'service',
      purpose: 'delivery.incident-alert-status',
      functionIdentity: 'app.operator_incident_alert_already_sent(uuid)' },
    mark_operator_incident_alert_sent: { port: 'integrator', sessionRole: 'app_integrator_request',
      targetRole: 'app_operational_delivery_worker', contextClass: 'service',
      purpose: 'delivery.incident-alert-mark', functionIdentity: 'app.mark_operator_incident_alert_sent(uuid)' },
    list_scheduler_reminder_organization_ids: { port: 'integrator', sessionRole: 'app_integrator_request',
      targetRole: 'app_operational_scheduler', contextClass: 'service',
      purpose: 'scheduler.reminder-organizations',
      functionIdentity: 'app.list_scheduler_reminder_organization_ids()' },
    revalidate_appointment_reminder_materialization: { port: 'integrator',
      sessionRole: 'app_integrator_request', targetRole: 'app_operational_delivery_worker',
      contextClass: 'service', purpose: 'delivery.appointment-reminder-revalidate',
      functionIdentity: 'app.revalidate_appointment_reminder_materialization(uuid)' },
    advance_appointment_reminder_messenger_ladder: { port: 'integrator',
      sessionRole: 'app_integrator_request', targetRole: 'app_operational_delivery_worker',
      contextClass: 'service', purpose: 'delivery.appointment-reminder-advance',
      functionIdentity: 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)' },
    get_google_calendar_event_id: { port: 'integrator', runtimeName: 'get_google_calendar_event_id',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'calendar.map.get', functionIdentity: 'app.get_google_calendar_event_id(uuid)' },
    upsert_google_calendar_event_id: { port: 'integrator', runtimeName: 'upsert_google_calendar_event_id',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'calendar.map.upsert', functionIdentity: 'app.upsert_google_calendar_event_id(uuid,text)' },
    delete_google_calendar_event_id: { port: 'integrator', runtimeName: 'delete_google_calendar_event_id',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'calendar.map.delete', functionIdentity: 'app.delete_google_calendar_event_id(uuid)' },
    read_booking_calendar_patient_profile: { port: 'integrator', runtimeName: 'read_booking_calendar_patient_profile',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'calendar.patient-profile.read', functionIdentity: 'app.read_booking_calendar_patient_profile(uuid)' },
    read_booking_calendar_latest_staff_comment: { port: 'integrator', runtimeName: 'read_booking_calendar_latest_staff_comment',
      sessionRole: 'app_integrator_request', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
      purpose: 'calendar.staff-comment.read', functionIdentity: 'app.read_booking_calendar_latest_staff_comment(uuid)' },
    is_current_patient_self_booking_allowed: { port: 'webapp', runtimeName: 'is_current_patient_self_booking_allowed',
      sessionRole: 'app_patient', targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'booking.self.allowed', functionIdentity: 'app.is_current_patient_self_booking_allowed()' },
    read_current_patient_booking_runtime_integer: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_runtime_integer', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-runtime-integer.read',
      functionIdentity: 'app.read_current_patient_booking_runtime_integer(text)' },
    read_current_patient_booking_creation_snapshot: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_creation_snapshot', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-creation-snapshot.read',
      functionIdentity: 'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)' },
    read_current_patient_booking_payment_setting: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_payment_setting', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-payment-config.read',
      functionIdentity: 'app.read_current_patient_booking_payment_setting(text)' },
    read_current_patient_booking_prepayment_policy: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_prepayment_policy', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-prepayment-policy.read',
      functionIdentity: 'app.read_current_patient_booking_prepayment_policy(uuid,text)' },
    read_current_patient_booking_busy_intervals: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_busy_intervals', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-busy-intervals.read',
      functionIdentity: 'app.read_current_patient_booking_busy_intervals(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid)' },
    read_current_patient_booking_form_fields: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_form_fields', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-form-fields.read',
      functionIdentity: 'app.read_current_patient_booking_form_fields()' },
    save_current_patient_booking_form_answers: { port: 'webapp',
      runtimeName: 'save_current_patient_booking_form_answers', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-form-answers.save',
      functionIdentity: 'app.save_current_patient_booking_form_answers(uuid,text)' },
    read_current_patient_identity_contacts: { port: 'webapp',
      runtimeName: 'read_current_patient_identity_contacts', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'booking.patient-identity-contacts.read',
      functionIdentity: 'app.read_current_patient_identity_contacts()' },
    record_current_patient_booking_contact: { port: 'webapp',
      runtimeName: 'record_current_patient_booking_contact', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient',
      purpose: 'booking.patient-contact.record',
      functionIdentity: 'app.record_current_patient_booking_contact(text,text,text)' },
    read_current_patient_booking_packages: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_packages', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-packages.read',
      functionIdentity: 'app.read_current_patient_booking_packages(uuid)' },
    create_current_patient_booking_pending: { port: 'webapp',
      runtimeName: 'create_current_patient_booking_pending', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-pending.create',
      functionIdentity: 'app.create_current_patient_booking_pending(text)' },
    mutate_current_patient_booking: { port: 'webapp',
      runtimeName: 'mutate_current_patient_booking', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-row.mutate',
      functionIdentity: 'app.mutate_current_patient_booking(uuid,text,text)' },
    create_current_patient_booking_appointments: { port: 'webapp',
      runtimeName: 'create_current_patient_booking_appointments', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-appointments.create',
      functionIdentity: 'app.create_current_patient_booking_appointments(text)' },
    read_current_patient_booking_appointment: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_appointment', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-appointment.read',
      functionIdentity: 'app.read_current_patient_booking_appointment(uuid)' },
    set_current_patient_booking_reminder_preset: { port: 'webapp',
      runtimeName: 'set_current_patient_booking_reminder_preset', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-reminder-preset.set',
      functionIdentity: 'app.set_current_patient_booking_reminder_preset(uuid,text)' },
    current_patient_lfk_sessions: { port: 'webapp',
      runtimeName: 'current_patient_lfk_sessions', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'diary.patient-lfk-sessions',
      functionIdentity: 'app.current_patient_lfk_sessions(text,text)' },
    read_current_patient_staff_notification_profiles: { port: 'webapp',
      runtimeName: 'read_current_patient_staff_notification_profiles', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'notification.current-patient-staff-profiles',
      functionIdentity: 'app.read_current_patient_staff_notification_profiles(uuid,text)' },
    read_current_patient_booking_row: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_row', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-row.read',
      functionIdentity: 'app.read_current_patient_booking_row(uuid,text)' },
    read_current_patient_booking_policies: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_policies', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-policies.read',
      functionIdentity: 'app.read_current_patient_booking_policies(text)' },
    read_current_patient_booking_reschedules: { port: 'webapp',
      runtimeName: 'read_current_patient_booking_reschedules', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-reschedules.read',
      functionIdentity: 'app.read_current_patient_booking_reschedules(uuid)' },
    apply_current_patient_booking_reschedule: { port: 'webapp',
      runtimeName: 'apply_current_patient_booking_reschedule', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-reschedule.apply',
      functionIdentity: 'app.apply_current_patient_booking_reschedule(text)' },
    apply_current_patient_booking_cancellation: { port: 'webapp',
      runtimeName: 'apply_current_patient_booking_cancellation', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-cancellation.apply',
      functionIdentity: 'app.apply_current_patient_booking_cancellation(text)' },
    patch_current_patient_booking_notifications: { port: 'webapp',
      runtimeName: 'patch_current_patient_booking_notifications', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-notifications.patch',
      functionIdentity: 'app.patch_current_patient_booking_notifications(uuid,text,text)' },
    reserve_current_patient_booking_package: { port: 'webapp',
      runtimeName: 'reserve_current_patient_booking_package', sessionRole: 'app_patient',
      targetRole: 'app_patient', contextClass: 'patient', purpose: 'booking.patient-package.reserve',
      functionIdentity: 'app.reserve_current_patient_booking_package(text)' },
  },
  functions: {
    ...BUSINESS_SEAM_FUNCTIONS,
    'app.patient_cancel_pending_reminder_occurrences(text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.patient_cancel_pending_reminder_occurrences(text)'],
      relationSurfaces: [
        ...(BUSINESS_SEAM_FUNCTIONS['app.patient_cancel_pending_reminder_occurrences(text)'].relationSurfaces ?? []),
        { relation: 'public.reminder_rules',
          columns: ['integrator_rule_id', 'organization_id', 'platform_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    },
    'app.read_current_patient_organization_entitlements()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.read_current_patient_organization_entitlements()'],
      relationSurfaces: [
        ...(BUSINESS_SEAM_FUNCTIONS['app.read_current_patient_organization_entitlements()'].relationSurfaces ?? []),
        { relation: 'public.saas_paid_period_policy',
          columns: ['key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    },
    'app.email_auth_find_email_owner_conflict(uuid,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.email_auth_find_email_owner_conflict(uuid,text)'],
      relationSurfaces: [],
      delegatesTo: ['app.find_platform_user_ids_by_any_confirmed_email(text)'],
    },
    'app.password_login_acquire(text,text,uuid,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_acquire(text,text,uuid,text)'],
      relationSurfaces: [],
      delegatesTo: ['app.password_login_acquire_impl(text,text,uuid,text)'],
    },
    'app.password_login_complete(uuid,boolean)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_complete(uuid,boolean)'],
      relationSurfaces: [],
      delegatesTo: ['app.password_login_complete_impl(uuid,boolean)'],
    },
    'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)': {
      ...BUSINESS_SEAM_FUNCTIONS[
        'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'
      ],
      relationSurfaces: [],
      delegatesTo: ['app.password_login_issue_altcha_challenge_impl(text,uuid,text,timestamp with time zone)'],
    },
    'app.password_login_read_altcha_secret()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_read_altcha_secret()'],
      relationSurfaces: [],
      delegatesTo: ['app.password_login_read_altcha_secret_impl()'],
    },
    'app.require_attested_target_role(name,name[])': rev10Function({
      owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'name', returnsSet: false,
      execute: ['app_seam_reminder_patient_owner'],
      purpose: 'return the exact active patient or staff role to the reminder seam',
      typedArgs: ['name', 'name[]'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], invocation: 'internal' as const,
      relationSurfaces: [
        { relation: 'app_ext.accepted_port_contexts', columns: [
          'database_oid', 'backend_pid', 'transaction_id', 'capability_id', 'session_login', 'port',
          'target_role', 'context_class', 'purpose', 'function_identity', 'cleared_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'app_ext.port_context_capabilities', columns: [
          'capability_id', 'port', 'session_login', 'target_role', 'context_class', 'purpose',
          'function_identity', 'active_from', 'active_until',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.enqueue_current_reminder_rule_push(text)': rev10Function({
      owner: 'app_seam_reminder_patient_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient', 'app_staff'], purpose: 'enqueue only the current patient or staff-org reminder retry',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.reminder_rules', columns: [
          'integrator_rule_id', 'organization_id', 'platform_user_id', 'integrator_user_id', 'category',
          'is_enabled', 'interval_minutes', 'window_start_minute', 'window_end_minute', 'days_mask',
          'timezone', 'linked_object_type', 'linked_object_id', 'custom_title', 'custom_text', 'schedule_type',
          'schedule_data', 'reminder_intent', 'display_title', 'display_description', 'quiet_hours_start_minute',
          'quiet_hours_end_minute', 'notification_topic_code', 'updated_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.integrator_push_outbox', columns: [
          'kind', 'idempotency_key', 'payload', 'status', 'attempts_done', 'next_try_at', 'last_error', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app_ext.digest(text,text)': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'bytea', returnsSet: false,
      execute: ['app_seam_dedicated_bot_owner', 'app_seam_password_auth_owner'],
      purpose: 'private pgcrypto digest dependency of the dedicated-bot and password-auth seams',
      typedArgs: ['text', 'text'], volatility: 'IMMUTABLE', parallel: 'SAFE', proconfig: [],
      invocation: 'internal' as const,
    }),
    'app_ext.hmac(text,text,text)': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'bytea', returnsSet: false,
      execute: ['app_seam_patient_invite_owner'],
      purpose: 'private pgcrypto HMAC dependency of the patient-invite seam',
      typedArgs: ['text', 'text', 'text'], volatility: 'IMMUTABLE', parallel: 'SAFE', proconfig: [],
      invocation: 'internal' as const,
    }),
    // Единственная дверь платформенного дашборда: девятнадцать отношений сведены в ОДИН снимок.
    // Собственный владелец шва — занять соседнего нельзя, ни один существующий не достаёт дальше
    // своей заботы: аналитика, клиника, упражнения, медиа и телеметрия воспроизведения лежат у
    // четырёх РАЗНЫХ владельцев, и растянуть любого из них на остальные три значило бы расширить
    // его шов ровно так, как именованные корни и существуют, чтобы не расширять.
    // Роль страницы получает EXECUTE и ничего больше: ни одного прямого гранта на эти таблицы
    // `app_platform_settings` не получает (миграция 0043).
    'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)': rev10Function({
      owner: 'app_seam_platform_analytics_owner', security: 'DEFINER', returns: 'jsonb',
      returnsSet: false, execute: ['app_platform_settings'],
      purpose: 'return only the aggregated platform analytics dashboard snapshot',
      typedArgs: ['timestamp with time zone', 'timestamp with time zone', 'text', 'text'],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_organizations', columns: ['created_at', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['created_at', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.platform_users', columns: ['id', 'role', 'phone_normalized', 'merged_into_id', 'is_archived', 'created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.product_analytics_user_hourly', columns: ['bucket_hour', 'user_id', 'entry_channel', 'page_key', 'page_views'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: ['created_at', 'updated_at', 'status', 'deleted_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instances', columns: ['id', 'created_at', 'status', 'patient_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinical_visit', columns: ['created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: ['created_at', 'deleted_at', 'section', 'video_url'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_sections', columns: ['slug', 'system_parent_code'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.lfk_exercises', columns: ['id', 'created_at', 'owner_kind', 'catalog_scope', 'created_by'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.lfk_exercise_media', columns: ['exercise_id', 'media_url', 'media_type'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files', columns: ['id', 'size_bytes', 'video_duration_seconds'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.program_action_log', columns: ['created_at', 'action_type', 'payload', 'patient_user_id', 'instance_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.symptom_entries', columns: ['recorded_at', 'tracking_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.symptom_trackings', columns: ['id', 'symptom_key'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_playback_resolution_events', columns: ['resolved_at', 'user_id', 'media_id', 'delivery'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_playback_client_events', columns: ['created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_hls_proxy_error_events', columns: ['created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)': rev10Function({
      owner: 'app_seam_telemetry_exclusion_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_platform_settings'], purpose: 'return only sanitized registration-funnel events to platform operations',
      typedArgs: ['timestamp with time zone', 'timestamp with time zone', 'text', 'text', 'text',
        'integer', 'integer'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.product_analytics_events_recent',
        columns: ['id', 'occurred_at', 'event_type', 'entry_channel', 'user_id', 'metadata'],
        operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.resolve_organization_mechanic_access(uuid,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_organization_mechanic_access(uuid,text)'],
      execute: [
        ...BUSINESS_SEAM_FUNCTIONS['app.resolve_organization_mechanic_access(uuid,text)'].execute,
        'app_tenant_service',
      ],
    },
    'app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_operational_delivery_worker'], purpose: 'enqueue one failed accepted-event messenger reply',
      typedArgs: ['text', 'text', 'text', 'integer', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.outgoing_delivery_queue',
        columns: ['event_id', 'kind', 'channel', 'payload_json', 'status', 'attempt_count', 'max_attempts',
          'next_retry_at', 'organization_id'], operations: ['SELECT' as const, 'INSERT' as const],
        evidence: 'exact INSERT ON CONFLICT(event_id) in migration 0410' as const }],
    }),
    // The single declared enqueue root for outbound messages (owner ruling 19.08: one universal
    // mechanism taking a context, not one function per message kind). Runtime roles get EXECUTE
    // only -- no table grant on public.outgoing_delivery_queue is added for app_patient/app_staff.
    // p_content is text, not jsonb (migration 0036): the typed-argument transcript is reproduced
    // byte for byte by the caller, and jsonb_send's canonical form makes that impossible -- the
    // original jsonb declaration in migration 0033 made every call throw before reaching the
    // database. Same fix shape as the neighbouring app.replace_appointment_reminder_generation.
    'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient', 'app_staff'], purpose: 'outbound.message.enqueue',
      typedArgs: ['uuid', 'text', 'text', 'text', 'text', 'text', 'integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.outgoing_delivery_queue',
        columns: ['organization_id', 'event_id', 'kind', 'channel', 'payload_json', 'status',
          'attempt_count', 'max_attempts', 'next_retry_at', 'priority'],
        operations: ['SELECT' as const, 'INSERT' as const],
        evidence: 'exact INSERT ON CONFLICT(event_id) in migration 0033, retyped in migration 0036' as const }],
    }),
    // The single declared root that replaces one appointment's reminder generation. Before it the
    // webapp wrote public.outgoing_delivery_queue directly, and no runtime role holds INSERT there,
    // so appointment_reminder rows never appeared at all. app_tenant_service gains EXECUTE only.
    // p_deliveries is text, not jsonb: the typed-argument transcript is reproduced byte for byte by
    // the caller, which jsonb_send's canonical form makes impossible.
    'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)': rev10Function({
      owner: 'app_seam_reminder_materialization_owner', security: 'DEFINER', returns: 'jsonb',
      returnsSet: false, execute: ['app_tenant_service'],
      purpose: 'reminder.appointment-generation.replace',
      typedArgs: ['uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'start_at', 'status', 'deleted_at'],
          operations: ['SELECT' as const],
          evidence: 'exact currency EXISTS in migration 0034' as const },
        { relation: 'public.outgoing_delivery_queue',
          columns: ['organization_id', 'event_id', 'kind', 'channel', 'payload_json', 'status',
            'attempt_count', 'max_attempts', 'next_retry_at', 'last_error', 'dead_at', 'priority',
            'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'exact terminalize UPDATE + INSERT ON CONFLICT(event_id) in migration 0034' as const },
      ],
    }),
    // Google-календарь клиники читается ТОЛЬКО под арендной ролью. До 19.08 EXECUTE держал
    // `app_integrator_request` — принципала этого класса на пути календаря не бывает вовсе: и шаг
    // записи (`bookingLifecycleRoute` → `sync.ts`), и проба оператора приходят сюда с
    // организацией в руках. Корень был недостижим для КАЖДОГО живого вызывающего, и пустой
    // `catch` в `readConfigFromDb` превращал 42501 в «календарь у клиники не подключён».
    // Форма — как у близнеца `app.read_integrator_clinic_delivery_credential(text,uuid)`: тот же
    // точный org-скоуп в теле, тот же `app_tenant_service`. Прав на таблицу никому не добавлено.
    'app.read_integrator_google_calendar_setting(text,uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.read_integrator_google_calendar_setting(text,uuid)'],
      execute: ['app_tenant_service'],
    },
    'app.saas_billing_effective_tariff(uuid,uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.saas_billing_effective_tariff(uuid,uuid)'],
      execute: [
        ...BUSINESS_SEAM_FUNCTIONS['app.saas_billing_effective_tariff(uuid,uuid)'].execute,
        'app_tenant_service',
      ],
    },
    'app.choose_organization_first_tariff(uuid,uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.choose_organization_first_tariff(uuid,uuid)'],
      execute: [
        ...BUSINESS_SEAM_FUNCTIONS['app.choose_organization_first_tariff(uuid,uuid)'].execute,
        'app_clinic_billing',
      ],
    },
    // L-10 (миграция 0023). `amount_minor` — колонка, которую арендная роль не переписывает никогда,
    // поэтому у `app_clinic_billing` нет и не появляется UPDATE на неё: сумму счёта выводит этот шов,
    // из строки тарифа ЭТОЙ подписки, и не принимает от вызывающего. Аргумент `p_tariff_id` выбирает
    // только между текущим и запланированным тарифом той же подписки — всё прочее шов отклоняет.
    'app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid)': rev10Function({
      owner: 'app_seam_org_commerce_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_clinic_billing'],
      purpose: 'refresh one unclaimed period draft onto the purchased tariff with a derived amount',
      typedArgs: ['uuid', 'uuid', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.saas_billing_invoices',
          columns: ['id', 'organization_id', 'saas_billing_subscription_id', 'invoice_kind', 'description',
            'expires_at', 'status', 'provider_invoice_ref', 'carried_debt_minor', 'tariff_id', 'tariff_name',
            'amount_minor', 'currency', 'tariff_billing_period', 'additional_seat_quantity', 'tariff_snapshot',
            'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          operationColumns: {
            // `carried_debt_minor` ЧИТАЕТСЯ (миграция 0050): пересчитанная сумма периода складывается
            // из цены тарифа, мест и уже переехавшего долга. Без этого чтения смена тарифа под
            // черновиком тихо прощала бы долг прошлого периода. Писать эту колонку шов не вправе:
            // долг назначает только та дверь, которая гасит счёт-предшественник.
            SELECT: ['id', 'organization_id', 'saas_billing_subscription_id', 'invoice_kind', 'description',
              'expires_at', 'status', 'provider_invoice_ref', 'carried_debt_minor'],
            UPDATE: ['tariff_id', 'tariff_name', 'amount_minor', 'currency', 'tariff_billing_period',
              'additional_seat_quantity', 'tariff_snapshot', 'updated_at'],
          },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.saas_billing_subscriptions',
          columns: ['id', 'organization_id', 'tariff_id', 'pending_tariff_id', 'paid_additional_seats'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        // `SELECT *` — снимок тарифа в счёте есть копия живой строки целиком (`to_jsonb`), поэтому
        // верхняя граница чтения здесь вся таблица; ровно её этот владелец шва уже читает сегодня.
        { relation: 'public.saas_tariffs',
          columns: ['additional_seat_price_minor', 'billing_period', 'created_at', 'currency', 'description',
            'discounted_price_minor', 'downgrade_policies', 'id', 'included_seats', 'is_active',
            'mailing_templates', 'mechanic_access_policies', 'mechanics', 'name', 'price_minor', 'quotas',
            'system_access_policy', 'updated_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Миграция 0050. Снять переехавший долг со счёта-преемника, когда оплата за место всё-таки
    // пришла по старой живой ссылке провайдера. Сумму шов НЕ принимает — выводит её из строки
    // погашенного счёта, а организацию сверяет на каждой строке цепочки. Писать `amount_minor` и
    // `carried_debt_minor` арендной роли по-прежнему нельзя: денежная стена ровно за тем и стоит,
    // чтобы сумму счёта менял один узкий шов, а не любой путь под ролью клиники.
    'app.release_carried_seat_debt(uuid,uuid)': rev10Function({
      owner: 'app_seam_org_commerce_owner', security: 'DEFINER', returns: 'text', returnsSet: false,
      execute: ['app_clinic_billing'],
      purpose: 'release a carried seat debt from its successor invoice when the superseded invoice is paid after all',
      typedArgs: ['uuid', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.saas_billing_invoices',
          columns: ['id', 'organization_id', 'invoice_kind', 'status', 'currency', 'amount_minor',
            'carried_debt_minor', 'superseded_by_invoice_id', 'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          operationColumns: {
            SELECT: ['id', 'organization_id', 'invoice_kind', 'status', 'currency', 'amount_minor',
              'carried_debt_minor', 'superseded_by_invoice_id'],
            // Обе денежные колонки меняются ОДНИМ вычитанием и только вниз: снимается ровно та
            // сумма, что переехала. `carried_debt_minor <= amount_minor` держит ограничение таблицы.
            UPDATE: ['amount_minor', 'carried_debt_minor', 'updated_at'],
          },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.touch_current_patient_support_conversation_activity(uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.touch_current_patient_support_conversation_activity(uuid)'],
      relationSurfaces: BUSINESS_SEAM_FUNCTIONS[
        'app.touch_current_patient_support_conversation_activity(uuid)'
      ].relationSurfaces?.map((surface) => ({
        ...surface,
        ...(surface.relation === 'public.support_conversation_messages'
          ? { tableOperations: ['SELECT' as const] }
          : {}),
      })) ?? [],
    },
    'app.read_curated_playback_health_pre_0196()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.read_curated_playback_health_pre_0196()'],
      relationSurfaces: BUSINESS_SEAM_FUNCTIONS[
        'app.read_curated_playback_health_pre_0196()'
      ].relationSurfaces?.map((surface) => ({
        ...surface,
        ...(surface.relation === 'public.media_playback_resolution_events'
          || surface.relation === 'public.media_playback_user_video_first_resolve'
          ? { tableOperations: ['SELECT' as const] }
          : {}),
      })) ?? [],
    },
    'app.resolve_organization_cabinet_access(uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_organization_cabinet_access(uuid)'],
      delegatesTo: ['app.saas_billing_effective_tariff(uuid,uuid)'],
    },
    'app.read_current_org_tariff_transition_usage()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.read_current_org_tariff_transition_usage()'],
      delegatesTo: ['app.read_org_enforced_quota_usage(uuid)'],
    },
    'app.bump_platform_user_session_epoch_self()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.bump_platform_user_session_epoch_self()'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.create_specialist_signup_intent(uuid,text,text,text,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.create_specialist_signup_intent(uuid,text,text,text,text)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.get_latest_specialist_signup_intent_for_user()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.get_latest_specialist_signup_intent_for_user()'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.password_credentials_replace_self(text,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_credentials_replace_self(text,text)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.password_credentials_upsert_self(text,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_credentials_upsert_self(text,text)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.provision_specialist_owner(uuid)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.provision_specialist_owner(uuid)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
      relationSurfaces: BUSINESS_SEAM_FUNCTIONS['app.provision_specialist_owner(uuid)'].relationSurfaces
        ?.map((surface) => surface.relation === 'public.be_organizations'
          ? { ...surface, operations: ['INSERT' as const] }
          : surface) ?? [],
    },
    'app.replace_pending_specialist_signup_challenge(uuid,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.replace_pending_specialist_signup_challenge(uuid,text)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.set_staff_security_self_password_hash(text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.set_staff_security_self_password_hash(text)'],
      delegatesTo: ['app.require_staff_security_self_user_id()'],
    },
    'app.require_staff_security_self_user_id()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.require_staff_security_self_user_id()'],
      execute: [
        ...BUSINESS_SEAM_FUNCTIONS['app.require_staff_security_self_user_id()'].execute,
        'app_seam_password_auth_owner',
        'app_seam_self_security_owner',
        'app_seam_specialist_provision_owner',
      ],
    },
    'app.email_password_find_reset_candidate(text)': rev10Function({
      owner: 'app_seam_password_auth_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false,
      execute: ['app_pre_session'], purpose: 'auth.password.reset-candidate', typedArgs: ['text'],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'merged_into_id', 'email_normalized',
          'email_verified_at'], operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.user_password_credentials', columns: ['user_id'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.challenge.start',
      typedArgs: ['uuid', 'text', 'text', 'bigint', 'text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.email_challenges', columns: [
          'id', 'user_id', 'email', 'code_hash', 'expires_at', 'attempts', 'purpose',
          'pending_delivery_code', 'delivery_token', 'delivery_claimed_at',
        ], operations: ['SELECT', 'INSERT', 'DELETE'],
        evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.email_send_cooldowns', columns: [
          'user_id', 'email_normalized', 'last_sent_at',
        ], operations: ['SELECT', 'INSERT', 'UPDATE'],
        evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.outgoing_delivery_queue', columns: [
          'organization_id', 'event_id', 'kind', 'channel', 'payload_json', 'status',
          'attempt_count', 'max_attempts', 'next_retry_at', 'priority',
        ], operations: ['INSERT'], evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.email_otp_public_find_or_create_user(text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.user.find-or-create', typedArgs: ['text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.platform_users', columns: [
        'id', 'email', 'email_normalized', 'display_name', 'role', 'created_at', 'merged_into_id',
      ], operations: ['SELECT', 'INSERT'], evidence: 'pg16-function-body-lexical-upper-bound' }],
    }),
    'app.email_otp_public_find_user_by_email(text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'uuid', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.user.find', typedArgs: ['text'],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.platform_users',
        columns: ['id', 'email_normalized', 'merged_into_id'], operations: ['SELECT'],
        evidence: 'pg16-function-body-lexical-upper-bound' }],
    }),
    'app.email_otp_public_register_patient(text,text,text,text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.registration.create',
      typedArgs: ['text', 'text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.platform_users', columns: [
        'id', 'phone_normalized', 'display_name', 'role', 'created_at', 'updated_at', 'integrator_user_id',
        'first_name', 'last_name', 'email', 'email_verified_at', 'is_blocked', 'blocked_at',
        'blocked_reason', 'blocked_by', 'is_archived', 'merged_into_id', 'patient_phone_trust_at',
        'calendar_timezone', 'reminder_muted_until', 'merged_at', 'email_normalized', 'birth_date',
        'gender', 'patronymic', 'height_cm', 'weight_kg', 'session_epoch',
      ], operations: ['SELECT', 'INSERT'], evidence: 'pg16-function-body-lexical-upper-bound' }],
    }),
    'app.email_otp_public_consume_latest_challenge(text,text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.challenge.consume', typedArgs: ['text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.email_challenges', columns: [
          'id', 'user_id', 'email', 'code_hash', 'expires_at', 'attempts', 'created_at', 'purpose',
          'pending_delivery_code', 'delivery_token', 'delivery_claimed_at',
        ], operations: ['SELECT', 'UPDATE', 'DELETE'],
        evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.platform_users', columns: [
          'id', 'phone_normalized', 'display_name', 'role', 'created_at', 'updated_at', 'integrator_user_id',
          'first_name', 'last_name', 'email', 'email_verified_at', 'is_blocked', 'blocked_at',
          'blocked_reason', 'blocked_by', 'is_archived', 'merged_into_id', 'patient_phone_trust_at',
          'calendar_timezone', 'reminder_muted_until', 'merged_at', 'email_normalized', 'birth_date',
          'gender', 'patronymic', 'height_cm', 'weight_kg', 'session_epoch',
        ], operations: ['SELECT', 'UPDATE'], evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.email_otp_public_find_email_send_cooldown_by_email(text)': rev10Function({
      owner: 'app_seam_email_otp_owner', security: 'DEFINER', returns: 'timestamp with time zone', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.email-otp.cooldown.read', typedArgs: ['text'],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.email_send_cooldowns',
        columns: ['email_normalized', 'last_sent_at'], operations: ['SELECT'],
        evidence: 'pg16-function-body-lexical-upper-bound' }],
    }),
    'app.password_login_acquire_impl(text,text,uuid,text)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_acquire(text,text,uuid,text)'],
      execute: [], invocation: 'internal' as const,
      purpose: 'private implementation behind exact-gated app.password_login_acquire',
      relationSurfaces: BUSINESS_SEAM_FUNCTIONS[
        'app.password_login_acquire(text,text,uuid,text)'
      ].relationSurfaces?.map((surface) => ({
        ...surface,
        ...(surface.relation === 'public.password_altcha_challenges'
          || surface.relation === 'public.password_login_identifier_protection'
          || surface.relation === 'public.user_password_credentials'
          ? { tableOperations: ['SELECT' as const] }
          : {}),
      })),
    },
    'app.password_login_complete_impl(uuid,boolean)': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_complete(uuid,boolean)'],
      execute: [], invocation: 'internal' as const,
      purpose: 'private implementation behind exact-gated app.password_login_complete',
    },
    'app.password_login_issue_altcha_challenge_impl(text,uuid,text,timestamp with time zone)': {
      ...BUSINESS_SEAM_FUNCTIONS[
        'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'
      ],
      execute: [], invocation: 'internal' as const,
      purpose: 'private implementation behind exact-gated app.password_login_issue_altcha_challenge',
    },
    'app.password_login_read_altcha_secret_impl()': {
      ...BUSINESS_SEAM_FUNCTIONS['app.password_login_read_altcha_secret()'],
      execute: [], invocation: 'internal' as const,
      purpose: 'private implementation behind exact-gated app.password_login_read_altcha_secret',
    },
    'app_control.enforce_relation_birth_wall()': rev10Function({
      owner: 'postgres', security: 'DEFINER', returns: 'event_trigger', returnsSet: false, execute: [],
      purpose: 'reject unknown managed table DDL and force a closed RLS baseline before commit',
      typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app_control, pg_temp'],
      invocation: 'trigger' as const,
      bodyRelationSurfaceContract: 'relation-birth-wall' as const,
    }),
    // Both slug guards are CONSTRAINT TRIGGERs declared DEFERRABLE INITIALLY DEFERRED, so their
    // bodies execute at COMMIT — after withPortContextTransaction has already run RESET ROLE and
    // app.clear_port_context(). As SECURITY INVOKER they therefore ran as the bare login role
    // (bcb_dev_webapp_staff), which holds no USAGE on schema public, and every clinic slug rename
    // died with 42501 "permission denied for schema public". Owning them by the existing public-slug
    // seam makes the deferred check independent of whichever role is in effect at COMMIT; the
    // surfaces below are exactly the columns the two bodies read and nothing else.
    'app.assert_organization_slug_alias_complete()': rev10Function({
      owner: 'app_seam_public_slug_owner', security: 'DEFINER', returns: 'trigger', returnsSet: false,
      execute: [],
      purpose: 'deferred organization slug alias completeness constraint trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
      relationSurfaces: [
        { relation: 'public.organization_slug_claims',
          columns: ['kind', 'organization_id', 'slug'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.organization_slug_rename_events',
          columns: ['next_slug', 'organization_id', 'previous_slug'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.assert_organization_slug_rename_complete()': rev10Function({
      owner: 'app_seam_public_slug_owner', security: 'DEFINER', returns: 'trigger', returnsSet: false,
      execute: [],
      purpose: 'deferred organization slug rename completeness constraint trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
      relationSurfaces: [
        { relation: 'public.organization_slug_claims',
          columns: ['kind', 'organization_id', 'slug'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.clinic_public_directory_entries',
          columns: ['organization_id', 'slug'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.organization_slug_rename_events',
          columns: ['next_slug', 'organization_id', 'previous_slug'], operations: ['SELECT'],
          evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.enforce_lfk_child_owner()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'LFK child ownership integrity trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'app.guard_clinic_directory_current_slug()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'clinic directory current-slug integrity trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'app.guard_org_brand_revision()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'organization brand revision monotonicity trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'app.guard_organization_slug_claim_mutation()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'organization slug claim mutation guard trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'app.guard_organization_slug_rename_event_mutation()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'organization slug rename audit mutation guard trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'app.reject_staff_commercial_organization_update()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'staff commercial-organization update rejection trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      invocation: 'trigger' as const,
    }),
    'public.audit_app_runtime_settings_change()': rev10Function({
      owner: 'app_object_owner', security: 'DEFINER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'application runtime-settings audit trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, public, pg_temp'], invocation: 'trigger' as const,
      relationSurfaces: [{ relation: 'public.app_runtime_settings_audit',
        columns: ['audience', 'key', 'new_value_json', 'old_value_json', 'organization_id', 'scope', 'source',
          'updated_by'], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'public.media_folders_enforce_depth()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'media-folder maximum-depth integrity trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: [], invocation: 'trigger' as const,
    }),
    'public.media_folders_prevent_cycle()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'media-folder cycle prevention trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: [], invocation: 'trigger' as const,
    }),
    'public.sync_registered_app_runtime_setting()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'registered runtime-setting projection trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: [], invocation: 'trigger' as const,
    }),
    'public.system_settings_test_lock_guard()': rev10Function({
      owner: 'app_object_owner', security: 'INVOKER', returns: 'trigger', returnsSet: false, execute: [],
      purpose: 'system-setting protected-key lock trigger', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: [], invocation: 'trigger' as const,
    }),
    'app.auth_login_token_create(text,uuid,text,timestamp with time zone)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_login_token_create(text,uuid,text,timestamp with time zone)'],
      owner: 'app_seam_login_token_owner', execute: ['app_pre_session'], purpose: 'auth.login-token.create',
      typedArgs: ['text', 'uuid', 'text', 'timestamp with time zone'], volatility: 'VOLATILE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_login_token_read(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_login_token_read(text)'],
      owner: 'app_seam_login_token_owner', execute: ['app_pre_session'], purpose: 'auth.login-token.read',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_login_token_expire_past()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_login_token_expire_past()'],
      owner: 'app_seam_login_token_owner', execute: ['app_pre_session'], purpose: 'auth.login-token.expire',
      typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_login_token_confirm(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_login_token_confirm(text)'],
      owner: 'app_seam_login_token_owner', execute: ['app_pre_session'], purpose: 'auth.login-token.confirm',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_login_token_mark_session_issued(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_login_token_mark_session_issued(text)'],
      owner: 'app_seam_login_token_owner', execute: ['app_pre_session'],
      purpose: 'auth.login-token.session-issued', typedArgs: ['text'], volatility: 'VOLATILE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)': rev10Function({
      owner: 'app_seam_phone_binding_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.phone-messenger-bind.secret',
      typedArgs: ['text', 'text', 'uuid', 'text', 'text', 'text', 'uuid', 'text', 'text',
        'timestamp with time zone'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.phone_messenger_bind_secrets',
        columns: ['id', 'token_hash', 'phone_normalized', 'channel_code', 'purpose', 'user_id', 'status',
          'challenge_id', 'failure_code', 'expires_at', 'consumed_at'],
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        evidence: 'pg16-function-body-lexical-upper-bound' }],
    }),
    'app.phone_messenger_bind_completion_state(text,text,text,text)': rev10Function({
      owner: 'app_seam_phone_binding_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'auth.phone-messenger-bind.completion-state',
      typedArgs: ['text', 'text', 'text', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.phone_messenger_bind_secrets',
          columns: ['token_hash', 'phone_normalized', 'channel_code', 'purpose', 'user_id', 'created_at'],
          operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id'],
          operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
        { relation: 'public.platform_users', columns: ['id', 'merged_into_id', 'phone_normalized', 'created_at'],
          operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
      ],
    }),
    'app.auth_oauth_find_user(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_oauth_find_user(text,text)'],
      owner: 'app_seam_oauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.oauth.callback.find-binding', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_oauth_upsert_binding(uuid,text,text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.auth_oauth_upsert_binding(uuid,text,text,text)'],
      owner: 'app_seam_oauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.oauth.callback.upsert-binding', typedArgs: ['uuid', 'text', 'text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS[
        'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)'
      ],
      owner: 'app_seam_password_auth_owner', execute: ['app_pre_session'],
      purpose: 'auth.rate-limit.check-record',
      typedArgs: ['text', 'text', 'integer', 'integer', 'text', 'integer', 'integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: retainFunctionSurfaceOperationsWithTableRequirements(
        'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)',
        { 'public.auth_rate_limit_events': ['SELECT', 'DELETE'] },
      ),
    }),
    'app.read_public_runtime_setting(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_public_runtime_setting(text,text)'],
      owner: 'app_seam_settings_runtime_owner', execute: ['app_pre_session'],
      purpose: 'config.runtime.public.read', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.read_webapp_server_runtime_setting(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_webapp_server_runtime_setting(text,text)'],
      owner: 'app_seam_settings_runtime_owner', execute: ['app_pre_session'],
      purpose: 'config.runtime.server.read', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.is_smtp_outbound_configured()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.is_smtp_outbound_configured()'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.channel.smtp.configured', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.is_sms_provider_configured()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.is_sms_provider_configured()'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.channel.sms.configured', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.is_telegram_login_configured()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.is_telegram_login_configured()'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.channel.telegram.configured', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.is_max_bot_configured()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.is_max_bot_configured()'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_pre_session'],
      purpose: 'auth.channel.max.configured', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)'],
      owner: 'app_seam_passkey_owner', execute: ['app_pre_session', 'app_patient'],
      purpose: 'exact authentication or patient-registration challenge issue',
      typedArgs: ['uuid', 'text', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.passkey_read_challenge(uuid,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.passkey_read_challenge(uuid,text)'],
      owner: 'app_seam_passkey_owner', execute: ['app_pre_session', 'app_patient'],
      purpose: 'exact authentication or patient-registration challenge read', typedArgs: ['uuid', 'text'],
      volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.passkey_read_credential(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.passkey_read_credential(text)'],
      owner: 'app_seam_passkey_owner', execute: ['app_pre_session'],
      purpose: 'auth.passkey.credential.read', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)'],
      owner: 'app_seam_passkey_owner', execute: ['app_pre_session'],
      purpose: 'auth.passkey.authentication.complete',
      typedArgs: ['uuid', 'text', 'bigint', 'bigint', 'text', 'boolean'], volatility: 'VOLATILE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.get_public_reference_baseline(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.get_public_reference_baseline(text)'],
      owner: 'app_seam_catalog_public_owner', execute: ['app_pre_session'],
      purpose: 'catalog.public-reference.read', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.is_organization_slug_available(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.is_organization_slug_available(text)'],
      owner: 'app_seam_public_slug_owner', execute: ['app_pre_session'],
      purpose: 'auth.specialist-signup.slug-availability', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.read_webapp_preauth_provider_setting(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_webapp_preauth_provider_setting(text)'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_pre_session'],
      purpose: 'config.preauth-provider.read', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.resolve_public_organization_by_slug(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_public_organization_by_slug(text)'],
      owner: 'app_seam_public_slug_owner', execute: ['app_pre_session'],
      purpose: 'booking.public-organization.resolve', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.resolve_public_organization_slug(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_public_organization_slug(text)'],
      owner: 'app_seam_public_slug_owner', execute: ['app_pre_session'],
      purpose: 'booking.public-slug.resolve', typedArgs: ['text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    // ── Четыре двери публичной записи (миграция 0043). Владелец шва — уже существующий
    // `app_seam_public_booking_owner`; ни одной новой роли и ни одного расширения табличных грантов
    // рантайм-ролям. Арендаторский класс `tenant_service` порта `webapp` ходит только этими
    // ИМЕНОВАННЫМИ КОРНЯМИ: сквозной `purpose: 'relation'` этому классу не выдают (SCHEME §3).
    //
    // Резолвер арендатора существовал с миграции 0042, но не был объявлен НИ ОДНОЙ возможностью,
    // поэтому вызов падал ещё до statement'а, а его рукописный гейт
    // `app.require_attested_context_for_roles` не сверял ни класс контекста, ни аргументы, ни
    // идентичность корня. 0043 переводит его на общий `app.require_accepted_context` в классе
    // `pre_session` (он стоит ДО выбора арендатора) и добавляет проверку публикации клиники —
    // отсюда две новые поверхности: каталог публикации и активность специалиста.
    'app.resolve_public_booking_organization(uuid,uuid)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_public_booking_organization(uuid,uuid)'],
      owner: 'app_seam_public_booking_owner', execute: ['app_pre_session'],
      purpose: 'booking.public-tenant.resolve', typedArgs: ['uuid', 'uuid'], volatility: 'STABLE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_branches', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services', columns: ['id', 'organization_id', 'is_active',
          'public_widget_visible', 'admin_manual_only'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialist_service_availability', columns: ['organization_id', 'branch_id',
          'service_id', 'specialist_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries', columns: ['organization_id', 'is_published'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Одна дверь на четыре формы одного вопроса «что из каталога ЭТОЙ опубликованной клиники видно
    // снаружи»: организация берётся не из аргумента, а из принятого контекста.
    'app.read_public_booking_catalog(uuid,uuid)': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'return only the publicly bookable catalog of the published accepted organization',
      typedArgs: ['uuid', 'uuid'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_branches', columns: ['id', 'organization_id', 'title', 'short_title', 'color',
          'city_code', 'address', 'timezone', 'is_active', 'sort_order'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services', columns: ['id', 'organization_id', 'title', 'description',
          'duration_minutes', 'buffer_after_minutes', 'price_minor', 'prepayment_applicable',
          'usable_in_packages', 'online_payment_applicable', 'sort_order', 'is_active',
          'public_widget_visible', 'admin_manual_only'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialist_service_availability', columns: ['organization_id', 'service_id',
          'branch_id', 'specialist_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries', columns: ['organization_id', 'is_published'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Публичный близнец `app.read_current_patient_booking_slot_snapshot(...)`: тот же ОДИН снимок
    // шага выбора времени, но «активная запись пациента» заменена на «клиника опубликована».
    'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'return one anonymous slot snapshot of the published accepted organization',
      typedArgs: ['uuid', 'uuid', 'text', 'text'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.app_runtime_settings', columns: ['key', 'scope', 'audience', 'organization_id',
          'value_json'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: ['organization_id', 'specialist_id', 'service_id',
          'status', 'start_at', 'end_at', 'deleted_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_availability_rules', columns: ['organization_id', 'specialist_id', 'rule_type',
          'config', 'is_active', 'updated_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_branches', columns: ['id', 'organization_id', 'timezone', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services', columns: ['id', 'organization_id', 'duration_minutes',
          'buffer_after_minutes', 'is_active', 'public_widget_visible', 'admin_manual_only'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_schedule_blocks', columns: ['organization_id', 'specialist_id', 'start_at',
          'end_at'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialist_service_availability', columns: ['id', 'organization_id',
          'branch_id', 'specialist_id', 'service_id', 'room_id', 'is_active', 'created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_working_days', columns: ['id', 'organization_id', 'specialist_id', 'branch_id',
          'room_id', 'work_date', 'start_minute', 'end_minute', 'breaks', 'is_closed'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_working_hours', columns: ['organization_id', 'specialist_id', 'branch_id',
          'room_id', 'weekday', 'start_minute', 'end_minute', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries', columns: ['organization_id', 'is_published'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Публичный близнец `app.read_current_patient_booking_form_fields()`: только поля, помеченные
    // видимыми пациенту, потому что заполняет их посетитель, а не персонал.
    'app.list_public_booking_form_fields()': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'return only patient-visible booking form fields of the published accepted organization',
      typedArgs: [], volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_booking_form_fields', columns: ['id', 'organization_id', 'field_key',
          'field_type', 'label', 'placeholder', 'is_required', 'visible_to_patient', 'visible_to_staff',
          'sort_order', 'is_active'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries', columns: ['organization_id', 'is_published'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Личность посетителя. Организации в аргументах нет: телефон принадлежит человеку, а не клинике,
    // и класс `pre_session` стоит до выбора арендатора.
    'app.resolve_public_booking_client_by_phone(text,text,boolean)': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false,
      execute: ['app_pre_session'],
      purpose: 'resolve or create the canonical person for a proven public-booking phone',
      typedArgs: ['text', 'text', 'boolean'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'phone_normalized', 'display_name', 'role',
          'patient_phone_trust_at', 'merged_into_id', 'first_name', 'last_name', 'patronymic', 'birth_date'],
          operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts', columns: ['platform_user_id', 'contact_kind', 'value_normalized',
          'is_primary', 'confirmed_at', 'source_origin', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity', columns: ['platform_user_id', 'first_name', 'last_name',
          'patronymic', 'display_name', 'birth_date', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Отношение с клиникой. Человек берётся из принятого пациентского контекста, а не из аргумента,
    // поэтому записать в клиенты можно только себя. Канал подтверждения — АРГУМЕНТ (миграция 0052):
    // почта такой же полноправный канал, что и телефон (`AUTH_AND_IDENTITY_CANON.md` §15), а состав
    // обязательных полей публичной формы задаёт клиника (`OWNER_PRODUCT_RULES.md` §33).
    //
    // Оплаченное число клиентов эта дверь НЕ проверяет и не расходует (миграция 0053, владелец 19.08,
    // `OWNER_PRODUCT_RULES.md` §33.2: «запись на приём сама по себе лимита не расходует»). 0052 звала
    // сюда `app.assert_org_patient_count_quota_available` делегированием — 0053 убрала вызов, поэтому
    // делегирования здесь больше нет.
    'app.enroll_current_patient_in_public_booking_clinic(uuid,text)': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_patient'],
      purpose: 'make the identified public-booking visitor a client of a published clinic',
      typedArgs: ['uuid', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.clinic_public_directory_entries', columns: ['organization_id', 'is_published'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status',
          'portal_activated_at', 'portal_activated_via'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Компенсация: провалившаяся запись не оставляет человека в списке клиентов клиники. Дверь не
    // принимает от вызывающего ничего, кроме организации, и решает по самой строке — провенанс,
    // возраст в окне одной попытки и отсутствие живого приёма.
    'app.revoke_public_booking_enrollment(uuid)': rev10Function({
      owner: 'app_seam_public_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_patient'],
      purpose: 'undo a public-booking client relationship whose booking failed',
      typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['organization_id', 'platform_user_id', 'deleted_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status',
          'created_at', 'portal_activated_at', 'portal_activated_via'],
          operations: ['SELECT' as const, 'UPDATE' as const, 'DELETE' as const],
          // Возраст строки дверь только ЧИТАЕТ — он и есть признак «эту строку завела воронка».
          operationColumns: { UPDATE: ['status', 'portal_activated_at', 'portal_activated_via'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // ЕДИНСТВЕННЫЙ потолок оплаченного числа клиентов. Владелец — коммерческий шов: ровно у него уже
    // есть все чтения правила. Прямой EXECUTE — только у персонала клиники: её писатель карточек
    // зовёт функцию из своей реляционной транзакции. Публичная дверь (миграция 0053, владелец 19.08,
    // `OWNER_PRODUCT_RULES.md` §33.2) больше НЕ вызывающий — запись на приём не тратит оплаченное
    // место, и у этой функции снова ровно один вызывающий, как до 0052.
    'app.assert_org_patient_count_quota_available(uuid)': rev10Function({
      owner: 'app_seam_org_commerce_owner', security: 'DEFINER', returns: 'void', returnsSet: false,
      execute: ['app_staff'],
      purpose: 'the only patient_count ceiling, spent by the staff card writer alone',
      typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      delegatesTo: ['app.saas_billing_effective_tariff(uuid,uuid)'],
      relationSurfaces: [
        { relation: 'public.be_organizations', columns: ['id', 'tariff_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.saas_org_entitlement_overrides',
          columns: ['organization_id', 'mechanic', 'expires_at', 'quota'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Две двери визитки клиники (миграция 0049). Перевод обеих на `app_seam_public_slug_owner`
    // (`cfa4e45df`, по OWNER_PRODUCT_RULES §33.3/§33.5) откачен: он снимал роль из декларации,
    // не снимая её из кластера, и ронял выкатку TEST. Возврат к снятию — вместе с переводом
    // оставшихся в TEST 54 объектов, одним приземлением.
    'app.read_public_clinic_card(text)': rev10Function({
      owner: 'app_seam_public_clinic_card_owner', security: 'DEFINER', returns: 'jsonb',
      returnsSet: false, execute: ['app_pre_session'],
      purpose: 'return one published clinic card, media ids included, or nothing',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.organization_slug_claims', columns: ['organization_id', 'kind', 'slug'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries',
          columns: ['organization_id', 'is_published', 'card_is_published', 'display_name',
            'description', 'public_contact_phone', 'public_contact_email', 'public_website_url',
            'locations_json', 'logo_media_id', 'photo_media_ids'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organizations', columns: ['id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files',
          columns: ['id', 'owner_kind', 'organization_id', 'status', 'mime_type', 's3_key',
            'stored_path'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
      databases: ['bersoncarebot_test', 'bcb_webapp_dev'],
    }),
    'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)': rev10Function({
      owner: 'app_seam_public_clinic_card_owner', security: 'DEFINER', returns: 'jsonb',
      returnsSet: false, execute: ['app_staff'],
      purpose: 'write the clinic card of the principal organization and snapshot its branches',
      typedArgs: ['uuid', 'text', 'text', 'text', 'text', 'uuid', 'text', 'boolean'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_files', columns: ['id', 'owner_kind', 'organization_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_branches',
          columns: ['organization_id', 'is_active', 'title', 'city_code', 'address', 'sort_order'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.clinic_public_directory_entries',
          columns: ['organization_id', 'description', 'public_contact_phone',
            'public_contact_email', 'public_website_url', 'logo_media_id', 'photo_media_ids',
            'locations_json', 'card_is_published', 'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
      databases: ['bersoncarebot_test', 'bcb_webapp_dev'],
    }),
    'app.get_web_push_vapid_public_key()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.get_web_push_vapid_public_key()'],
      owner: 'app_seam_settings_preauth_owner', execute: ['app_patient'],
      purpose: 'patient.web-push.vapid-public-key.read', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.resolve_saas_billing_invoice_for_webhook(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_saas_billing_invoice_for_webhook(text,text)'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_worker'],
      purpose: 'billing.webhook.invoice.resolve', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.resolve_saas_billing_refund_for_webhook(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_saas_billing_refund_for_webhook(text,text)'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_worker'],
      purpose: 'billing.webhook.refund.resolve', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.resolve_patient_acquiring_webhook_organization(text,text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.resolve_patient_acquiring_webhook_organization(text,text)'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_pre_session'],
      purpose: 'patient-payment.webhook.resolve', typedArgs: ['text', 'text'], volatility: 'STABLE',
      parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
    }),
    'app.read_saas_billing_payment_provider_preauth()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_saas_billing_payment_provider_preauth()'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_pre_session'],
      purpose: 'billing.webhook.provider.read', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.read_saas_billing_payment_provider_clinic()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_saas_billing_payment_provider_clinic()'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_clinic_billing'],
      purpose: 'billing.clinic.provider.read', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.list_saas_billing_period_catalog()': rev10Function({
      owner: 'app_seam_payment_webhook_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_clinic_billing'], purpose: 'return the fixed billing-period arithmetic catalog',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.saas_billing_periods',
        columns: ['code', 'label', 'months', 'is_selectable', 'sort_order'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.list_saas_billing_period_catalog_platform()': rev10Function({
      owner: 'app_seam_payment_webhook_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_platform_settings'], purpose: 'return the fixed billing-period arithmetic catalog',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.saas_billing_periods',
        columns: ['code', 'label', 'months', 'is_selectable', 'sort_order'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.read_saas_billing_payment_provider_platform()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_saas_billing_payment_provider_platform()'],
      owner: 'app_seam_payment_webhook_owner', execute: ['app_platform_settings'],
      purpose: 'billing.platform.provider.read', typedArgs: [], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
    }),
    'app.read_integrator_migration_ledger()': rev10Function({
      owner: 'app_seam_catalog_admin_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_service'],
      purpose: 'read the exact integrator startup migration ledger without relation ACL', typedArgs: [],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, integrator, pg_temp'],
      relationSurfaces: [{ relation: 'integrator.schema_migrations', columns: ['version', 'applied_at'],
        operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.read_integrator_projection_health(integer)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_service'],
      purpose: 'return only aggregate projection-delivery health without exposing event payloads',
      typedArgs: ['integer'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, integrator, pg_temp'],
      relationSurfaces: [{ relation: 'integrator.projection_outbox',
        columns: ['status', 'next_try_at', 'attempts_done', 'updated_at'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.list_integration_webhook_burst_signals(integer,integer)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_worker'],
      purpose: 'return only aggregated webhook error bursts for operator health', typedArgs: ['integer', 'integer'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.integration_webhook_error_events',
        columns: ['source', 'error_class', 'occurred_at'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.prune_integration_webhook_error_events(integer)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false, execute: ['app_worker'],
      purpose: 'delete only webhook error events older than the attested retention window', typedArgs: ['integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.integration_webhook_error_events', columns: ['occurred_at'],
        operations: ['SELECT' as const, 'DELETE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.prune_operator_health_failure_archive(integer)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false, execute: ['app_worker'],
      purpose: 'delete only archived health failures older than the attested retention window', typedArgs: ['integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.operator_health_failure_archive', columns: ['archived_at'],
        operations: ['SELECT' as const, 'DELETE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    // Единственное чтение очереди доставки, разрешённое порту webapp: время последней
    // ПОДТВЕРЖДЁННОЙ отправки суточной сводки здоровья, из которого тик берёт начало окна.
    // Рабочая роль получает EXECUTE и ничего больше — прямого гранта на очередь у `app_staff`
    // и `app_worker` нет и не появляется (миграция 0038).
    'app.read_operator_health_digest_last_sent_at()': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'timestamp with time zone',
      returnsSet: false, execute: ['app_worker'],
      purpose: 'return only the last confirmed operator health digest send time', typedArgs: [],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.outgoing_delivery_queue', columns: ['kind', 'sent_at'],
        operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    // Единственное АГРЕГАТНОЕ чтение очереди, разрешённое порту webapp: снимок здоровья очереди
    // для критического тика и суточной сводки. Двенадцать запросов отношением сведены в один
    // корень. Рабочая роль получает EXECUTE и ничего больше; шву добавляются ровно две колонки,
    // которых у него не было — `next_retry_at` и `updated_at` (миграция 0039).
    'app.read_operator_delivery_queue_health()': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'jsonb',
      returnsSet: false, execute: ['app_worker'],
      purpose: 'return only the aggregated operator delivery-queue health snapshot', typedArgs: [],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.outgoing_delivery_queue',
        columns: ['status', 'next_retry_at', 'failure_class', 'created_at', 'channel', 'kind',
          'sent_at', 'updated_at'],
        operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    // Единственная дверь постановки суточной сводки здоровья. До неё вебапп писал очередь прямым
    // INSERT под `app_staff`, у которого на ней нет ни одной привилегии, — сводка не уходила ни
    // разу. `app_worker` получает EXECUTE; все десять колонок вставки у шва уже были (0039).
    'app.enqueue_operator_health_digest_delivery(text,text,text,integer)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'boolean',
      returnsSet: false, execute: ['app_worker'],
      purpose: 'enqueue only one operator health digest delivery row',
      typedArgs: ['text', 'text', 'text', 'integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.outgoing_delivery_queue',
        columns: ['organization_id', 'event_id', 'kind', 'channel', 'payload_json', 'status',
          'attempt_count', 'max_attempts', 'next_retry_at', 'priority'],
        operations: ['SELECT' as const, 'INSERT' as const],
        evidence: 'exact INSERT ON CONFLICT(event_id) in migration 0039' as const }],
    }),
    // Аудитория staff-веб-пуша операторского алерта. Соседний канал того же диспетчера
    // (`telegram`/`max`/`sms`/`email`) переехал на объявленный корень ещё миграцией 0030
    // (`app.read_admin_notification_targets(text)`), а веб-пуш остался сырым чтением отношения:
    // `pgStaffUsers.listActiveStaffOrganizationRecipients` под `app_worker` получал
    // `42501 permission denied for table be_organization_members`, отказ глотался `.catch`
    // диспетчера, и критический тик рапортовал успех поверх канала, который не отработал.
    // Тот же владелец шва, что у соседа; `app_worker` получает EXECUTE и ничего больше
    // (миграция 0040).
    'app.list_operator_alert_staff_push_recipients()': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_worker'],
      purpose: 'return only the tenant-paired staff audience of an operator alert web push',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'role', 'merged_into_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Перечисление подписок, у которых оплаченный период кончился, — работа МЕЖАРЕНДНАЯ: одна
    // строка на клинику, и заранее неизвестно, на какую. Арендная дверь для неё не годится
    // (`app_worker` видит по RLS только `current_org_id()`), а платформенная требует живого
    // администратора-человека, которого у машинного тика нет. Отсюда собственный корень у шва
    // коммерции — того же, что уже читает подписку и тариф в
    // `app.refresh_saas_billing_invoice_purchased_tariff` (миграция 0040).
    'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)': rev10Function({
      owner: 'app_seam_org_commerce_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_worker'],
      purpose: 'return only the bounded set of paid subscriptions whose paid period has ended',
      typedArgs: ['timestamp with time zone', 'integer'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.saas_billing_subscriptions',
          columns: ['id', 'organization_id', 'tariff_id', 'pending_tariff_id', 'source', 'status',
            'current_period_ends_at', 'saved_payment_method_id', 'autopay_consented_at',
            'autopay_revoked_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.saas_tariffs', columns: ['id', 'billing_period'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'resolve one integrator delivery audience by phone or channel id without exposing relations',
      typedArgs: ['uuid', 'text', 'text', 'text', 'uuid', 'bigint', 'text', 'timestamp with time zone'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'merged_into_id', 'integrator_user_id', 'email',
          'email_verified_at', 'is_blocked', 'is_archived', 'reminder_muted_until'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts', columns: ['platform_user_id', 'contact_kind', 'value_normalized'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id', 'bot_blocked_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_preferences', columns: ['platform_user_id', 'channel_code',
          'is_enabled_for_messages', 'is_enabled_for_notifications', 'is_preferred_for_auth'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_notification_topic_channels', columns: ['user_id', 'topic_code', 'channel_code', 'is_enabled'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_notification_topics', columns: ['user_id', 'topic_code', 'is_enabled'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_web_push_subscriptions', columns: ['user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.system_settings', columns: ['key', 'scope', 'organization_id', 'value_json'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_admin_notification_targets(text)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_pre_session', 'app_worker'],
      purpose: 'return only the messenger and contact audience of live platform admins',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'role', 'merged_into_id', 'is_archived'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts', columns: ['platform_user_id', 'contact_kind', 'value_normalized', 'is_primary'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // ОДИН корень уборки по сроку хранения на четыре запертые арендаторские таблицы. Цель —
    // не имя таблицы: это метка из ЗАКРЫТОГО списка, развёрнутого ветками внутри тела, где
    // каждая ветка — статический DELETE по одной названной таблице. Динамического SQL в теле
    // нет и быть не может: definer с подстановкой идентификатора от вызывающего был бы
    // отмычкой ко всей базе. Незнакомая метка не выполняется, а отказывает (22023).
    // Владелец 19.08: «уборка — это одинаковое действие, и не хочется плодить дубли»,
    // «закрытый список — супер».
    'app.prune_retention_target(text,integer,boolean)': rev10Function({
      owner: 'app_seam_retention_sweep_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false,
      execute: ['app_operational_maintenance'],
      purpose: 'delete only rows of one closed-list retention target older than the attested window',
      typedArgs: ['text', 'integer', 'boolean'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_hls_proxy_error_events', columns: ['created_at'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.product_analytics_events_recent', columns: ['occurred_at'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.product_analytics_user_hourly', columns: ['bucket_hour'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.product_push_notifications', columns: ['created_at'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_integrator_provider_runtime_setting(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_integrator_provider_runtime_setting(text)'],
      execute: ['app_service'], purpose: 'return one fixed-allowlist provider setting to the integrator service',
    }),
    'app.read_integrator_runtime_setting(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_integrator_runtime_setting(text)'],
      execute: ['app_service'], purpose: 'return one fixed-allowlist non-secret setting to the integrator service',
    }),
    'app.read_integrator_auth_channel_setting(text)': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_integrator_auth_channel_setting(text)'],
      execute: ['app_service'], purpose: 'return one fixed-allowlist auth-channel flag to the integrator service',
    }),
    'app.read_integrator_smtp_outbound_setting()': rev10Function({
      ...BUSINESS_SEAM_FUNCTIONS['app.read_integrator_smtp_outbound_setting()'],
      execute: ['app_service'], purpose: 'return only the global SMTP envelope to the integrator service',
    }),
    'app.try_acquire_integrator_idempotency(text,integer)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false, execute: ['app_service'],
      purpose: 'atomically acquire exactly one attested integrator idempotency key', typedArgs: ['text', 'integer'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, integrator, pg_temp'],
      relationSurfaces: [{ relation: 'integrator.idempotency_keys',
        columns: ['key', 'request_hash', 'status', 'response_body', 'expires_at'],
        operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.release_integrator_idempotency(text)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'void', returnsSet: false, execute: ['app_service'],
      purpose: 'release exactly one attested integrator idempotency key', typedArgs: ['text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, integrator, pg_temp'],
      relationSurfaces: [{ relation: 'integrator.idempotency_keys', columns: ['key'],
        operations: ['SELECT' as const, 'DELETE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'integer', returnsSet: false, execute: ['app_service'],
      purpose: 'upsert only the exact attested data-quality incident tuple',
      typedArgs: ['text', 'text', 'text', 'text', 'text', 'text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, integrator, pg_temp'],
      relationSurfaces: [{ relation: 'integrator.integration_data_quality_incidents',
        columns: ['integration', 'entity', 'external_id', 'field', 'raw_value', 'timezone_used', 'error_reason',
          'status', 'first_seen_at', 'last_seen_at', 'occurrences'],
        operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.read_patient_telegram_display_handle(uuid)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'text', returnsSet: false, execute: ['app_staff'],
      purpose: 'return one Telegram display handle only for an active patient of the current organization',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_organization_members',
          columns: ['platform_user_id', 'organization_id', 'status'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings',
          columns: ['user_id', 'channel_code', 'display_handle'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_canonical_appointment_by_external_id(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_worker'],
      purpose: 'return one canonical appointment for an HMAC-authenticated integrator external id',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'phone_normalized', 'start_at', 'status', 'attribution_json',
            'branch_id', 'created_at', 'updated_at', 'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.list_active_canonical_appointments_by_phone(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_worker'],
      purpose: 'return only active canonical appointments for an HMAC-authenticated integrator phone lookup',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.be_appointments',
        columns: ['id', 'organization_id', 'phone_normalized', 'start_at', 'status', 'attribution_json',
          'branch_id', 'created_at', 'updated_at', 'deleted_at'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.count_active_canonical_appointments()': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false, execute: ['app_service'],
      purpose: 'return only the global active appointment count for the integrator admin dashboard',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.be_appointments',
        columns: ['status', 'deleted_at', 'start_at'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.get_google_calendar_event_id(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'text', returnsSet: false, execute: ['app_tenant_service'],
      purpose: 'read one Google event id after proving appointment organization', typedArgs: ['uuid'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['id', 'organization_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.booking_calendar_map', columns: ['appointment_key', 'gcal_event_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.upsert_google_calendar_event_id(uuid,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'void', returnsSet: false, execute: ['app_tenant_service'],
      purpose: 'atomically upsert calendar mapping and patient-booking mirror after organization proof', typedArgs: ['uuid', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['id', 'organization_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.booking_calendar_map', columns: ['appointment_key', 'gcal_event_id', 'updated_at'], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_bookings', columns: ['canonical_appointment_id', 'gcal_event_id', 'updated_at'], operations: ['SELECT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.delete_google_calendar_event_id(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'void', returnsSet: false, execute: ['app_tenant_service'],
      purpose: 'atomically delete calendar mapping and clear patient-booking mirror after organization proof', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['id', 'organization_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.booking_calendar_map', columns: ['appointment_key'], operations: ['SELECT' as const, 'DELETE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_bookings', columns: ['canonical_appointment_id', 'gcal_event_id', 'updated_at'], operations: ['SELECT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_booking_calendar_patient_profile(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_tenant_service'],
      purpose: 'calendar enrichment returns only the problem flag and note for the appointment patient', typedArgs: ['uuid'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['id', 'organization_id', 'platform_user_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_booking_profiles', columns: ['organization_id', 'platform_user_id', 'is_problematic', 'problematic_note'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_booking_calendar_latest_staff_comment(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'text', returnsSet: false, execute: ['app_tenant_service'],
      purpose: 'calendar enrichment returns only the latest staff comment body for one appointment', typedArgs: ['uuid'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: ['id', 'organization_id'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_staff_comments', columns: ['organization_id', 'appointment_id', 'body', 'created_at'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.is_current_patient_self_booking_allowed()': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false, execute: ['app_patient'],
      purpose: 'return only whether the current patient may self-book, never sensitive profile fields', typedArgs: [],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.be_patient_booking_profiles',
        columns: ['organization_id', 'platform_user_id', 'booking_blocked'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.read_current_patient_booking_runtime_integer(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'integer', returnsSet: false, execute: ['app_patient'],
      purpose: 'return one allowlisted booking integer for the current enrolled patient organization',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments',
          columns: ['organization_id', 'platform_user_id', 'status'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings',
          columns: ['key', 'scope', 'organization_id', 'audience', 'value_json'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_slot_snapshot(uuid,uuid,text,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_seam_patient_booking_owner'],
      purpose: 'return only the current enrolled patient booking context, schedule and busy intervals',
      typedArgs: ['uuid', 'uuid', 'text', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'], invocation: 'internal' as const,
      relationSurfaces: [
        { relation: 'public.org_enrollments',
          columns: ['organization_id', 'platform_user_id', 'status'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialist_service_availability',
          columns: ['id', 'organization_id', 'branch_id', 'specialist_id', 'service_id', 'room_id',
            'is_active', 'created_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_branches', columns: ['id', 'organization_id', 'is_active', 'timezone'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services',
          columns: ['id', 'organization_id', 'duration_minutes', 'buffer_after_minutes', 'is_active',
            'public_widget_visible', 'admin_manual_only'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_working_hours',
          columns: ['organization_id', 'specialist_id', 'branch_id', 'room_id', 'weekday', 'start_minute',
            'end_minute', 'is_active'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_working_days',
          columns: ['id', 'organization_id', 'specialist_id', 'branch_id', 'room_id', 'work_date',
            'start_minute', 'end_minute', 'breaks', 'is_closed'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments',
          columns: ['organization_id', 'specialist_id', 'service_id', 'start_at', 'end_at', 'status',
            'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_schedule_blocks', columns: ['organization_id', 'specialist_id', 'start_at', 'end_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_availability_rules',
          columns: ['organization_id', 'specialist_id', 'rule_type', 'config', 'is_active', 'updated_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings',
          columns: ['key', 'scope', 'organization_id', 'audience', 'value_json'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return the patient slot snapshot with the exact public catalog fields needed for creation',
      typedArgs: ['uuid', 'uuid', 'text', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'],
      delegatesTo: ['app.read_current_patient_booking_slot_snapshot(uuid,uuid,text,text)'],
      relationSurfaces: [
        { relation: 'public.be_branches',
          columns: ['id', 'organization_id', 'title', 'short_title', 'color', 'city_code', 'address',
            'sort_order', 'is_active'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services',
          columns: ['id', 'organization_id', 'title', 'description', 'price_minor',
            'prepayment_applicable', 'usable_in_packages', 'online_payment_applicable',
            'public_widget_visible', 'admin_manual_only', 'sort_order', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists',
          columns: ['id', 'organization_id', 'is_active', 'appointment_reminder_allowed_preset_ids',
            'appointment_reminder_default_preset_id'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_payment_setting(text)': rev10Function({
      owner: 'app_seam_settings_runtime_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return only booking payment config for a current enrolled patient server command',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.system_settings', columns: ['key', 'scope', 'organization_id', 'value_json'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_prepayment_policy(uuid,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_patient'],
      purpose: 'return one prepayment policy for a current enrolled patient booking selection',
      typedArgs: ['uuid', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_prepayment_policies',
          columns: ['id', 'organization_id', 'service_id', 'online_category', 'mode', 'amount_minor',
            'percent_bps', 'currency', 'is_active'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_busy_intervals(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_patient'],
      purpose: 'return only busy intervals for the current enrolled patient organization',
      typedArgs: ['uuid', 'uuid', 'timestamp with time zone', 'timestamp with time zone', 'uuid'],
      volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'specialist_id', 'service_id', 'start_at', 'end_at', 'status',
            'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services',
          columns: ['id', 'organization_id', 'buffer_after_minutes'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_schedule_blocks',
          columns: ['organization_id', 'specialist_id', 'room_id', 'start_at', 'end_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_identity_contacts()': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: false,
      execute: ['app_patient'],
      purpose: 'return only the caller own identity phone and e-mail, never the staff client projection',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'email', 'merged_into_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts',
          columns: ['platform_user_id', 'contact_kind', 'is_primary', 'value_normalized'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_current_patient_booking_contact(text,text,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: false,
      execute: ['app_patient'],
      purpose: 'store the phone or e-mail the caller typed into the booking form on the caller own row',
      typedArgs: ['text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.platform_user_contacts',
          columns: ['id', 'platform_user_id', 'organization_id', 'contact_type', 'value',
            'value_normalized', 'source', 'created_at', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_form_fields()': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'record', returnsSet: true, execute: ['app_patient'],
      purpose: 'return only active patient-visible booking form fields for the current enrolled organization',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_booking_form_fields',
          columns: ['id', 'organization_id', 'field_key', 'field_type', 'label', 'placeholder', 'is_required',
            'visible_to_patient', 'visible_to_staff', 'sort_order', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.save_current_patient_booking_form_answers(uuid,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'void', returnsSet: false, execute: ['app_patient'],
      purpose: 'upsert only patient-visible form answers on the current patient own appointment',
      typedArgs: ['uuid', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'platform_user_id', 'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_booking_form_fields',
          columns: ['id', 'organization_id', 'field_key', 'is_active', 'visible_to_patient'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_booking_form_submissions',
          columns: ['organization_id', 'appointment_id', 'field_id', 'value_text'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_packages(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return active current-patient packages with a remaining balance for the selected service',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services',
          columns: ['id', 'organization_id', 'title', 'is_active'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_packages', columns: [
          'id', 'organization_id', 'platform_user_id', 'subscription_package_id', 'status', 'display_number',
          'title', 'price_minor', 'currency', 'validity_days', 'valid_from', 'valid_until', 'deduction_mode',
          'payment_intent_id', 'payment_ref', 'sold_at', 'paid_amount_minor', 'paid_currency', 'created_at', 'notes',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_package_items',
          columns: ['id', 'patient_package_id', 'service_id', 'quantity_initial', 'sort_order'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_package_usages',
          columns: ['organization_id', 'patient_package_id', 'patient_package_item_id', 'usage_kind', 'quantity'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.create_current_patient_booking_pending(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'create only an enrolled current patient own in-person booking projection placeholder',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_bookings', columns: [
          'id', 'organization_id', 'platform_user_id', 'booking_type', 'city', 'category', 'slot_start', 'slot_end',
          'status', 'canonical_appointment_id', 'contact_phone', 'contact_email', 'contact_name', 'branch_id',
          'service_id', 'branch_service_id', 'city_code_snapshot', 'branch_title_snapshot',
          'service_title_snapshot', 'duration_minutes_snapshot', 'price_minor_snapshot', 'cancelled_at',
          'created_at', 'updated_at',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.mutate_current_patient_booking(uuid,text,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'apply the bounded lifecycle mutation to the current patient own booking projection',
      typedArgs: ['uuid', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_bookings', columns: [
          'id', 'organization_id', 'platform_user_id', 'booking_type', 'city', 'category', 'slot_start', 'slot_end',
          'status', 'cancelled_at', 'cancel_reason', 'gcal_event_id', 'contact_phone', 'contact_email', 'contact_name',
          'reminder_24h_sent', 'reminder_2h_sent', 'created_at', 'updated_at', 'branch_id', 'service_id',
          'branch_service_id', 'city_code_snapshot', 'branch_title_snapshot', 'service_title_snapshot',
          'duration_minutes_snapshot', 'price_minor_snapshot', 'provenance_created_by', 'provenance_updated_by',
          'canonical_appointment_id',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.create_current_patient_booking_appointments(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'atomically create one validated current-patient appointment or consecutive chain with audit rows',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialist_service_availability',
          columns: ['organization_id', 'branch_id', 'specialist_id', 'service_id', 'room_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_specialists', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_branches', columns: ['id', 'organization_id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_clinic_services',
          columns: ['id', 'organization_id', 'is_active', 'public_widget_visible', 'admin_manual_only'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_specialist_links',
          columns: ['organization_id', 'patient_user_id', 'specialist_id', 'status', 'created_via'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'branch_id', 'room_id', 'specialist_id', 'service_id', 'platform_user_id',
          'start_at', 'end_at', 'duration_minutes', 'chain_id', 'chain_position', 'source', 'status',
          'original_start_at', 'reschedule_count', 'payment_ref', 'package_usage_ref', 'phone_normalized',
          'attribution_json', 'appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id',
          'appointment_reminder_selection_source', 'created_at', 'updated_at', 'deleted_at',
        ], operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_history_events',
          columns: ['organization_id', 'appointment_id', 'event_type', 'actor_id', 'payload', 'occurred_at'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_timeline_events', columns: [
          'organization_id', 'platform_user_id', 'domain', 'event_type', 'linked_object_type',
          'linked_object_id', 'payload', 'occurred_at',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_appointment(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return only the current patient own non-deleted canonical appointment',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'branch_id', 'room_id', 'specialist_id', 'service_id', 'platform_user_id',
          'start_at', 'end_at', 'duration_minutes', 'chain_id', 'chain_position', 'source', 'status',
          'original_start_at', 'reschedule_count', 'payment_ref', 'package_usage_ref', 'phone_normalized',
          'attribution_json', 'appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id',
          'appointment_reminder_selection_source', 'created_at', 'updated_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.set_current_patient_booking_reminder_preset(uuid,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false, execute: ['app_patient'],
      purpose: 'update only the current patient own active appointment reminder preset to an allowed value',
      typedArgs: ['uuid', 'text'], volatility: 'VOLATILE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'platform_user_id', 'status', 'deleted_at',
          'appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id',
          'appointment_reminder_selection_source', 'updated_at',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.current_patient_lfk_sessions(text,text)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_patient'], purpose: 'read and mutate only the current enrolled patient own LFK diary sessions',
      typedArgs: ['text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.lfk_complexes', columns: [
          'id', 'organization_id', 'user_id', 'platform_user_id', 'title', 'is_active',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.lfk_sessions', columns: [
          'id', 'organization_id', 'user_id', 'complex_id', 'completed_at', 'source', 'created_at',
          'recorded_at', 'duration_minutes', 'difficulty_0_10', 'pain_0_10', 'comment',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_staff_notification_profiles(uuid,text)': rev10Function({
      owner: 'app_seam_reminder_specialist_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_patient'], purpose: 'resolve delivery profiles only for active staff in the current enrolled patient organization',
      typedArgs: ['uuid', 'text'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.platform_users', columns: ['id', 'role', 'merged_into_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id', 'created_at'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_preferences', columns: [
          'user_id', 'platform_user_id', 'channel_code', 'is_enabled_for_messages',
          'is_enabled_for_notifications', 'is_preferred_for_auth',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_notification_topic_channels', columns: ['user_id', 'topic_code', 'channel_code', 'is_enabled'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_web_push_subscriptions', columns: ['user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_integrator_web_push_subscriptions(uuid,uuid)': rev10Function({
      owner: 'app_seam_reminder_specialist_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'return web-push subscriptions only for a user active in the attested organization',
      typedArgs: ['uuid', 'uuid'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_web_push_subscriptions', columns: [
          'user_id', 'endpoint', 'p256dh', 'auth', 'updated_at', 'created_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_integrator_web_push_delivery_settings(uuid)': rev10Function({
      owner: 'app_seam_settings_integrator_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'return global VAPID plus a derived public contact only; SMTP credentials never cross this seam',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.system_settings', columns: ['key', 'scope', 'organization_id', 'value_json'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)': rev10Function({
      owner: 'app_seam_delivery_scope_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_tenant_service'],
      purpose: 'idempotently record one delivery result inside the attested organization',
      typedArgs: ['uuid', 'text', 'text', 'text', 'text', 'integer', 'text', 'text', 'timestamp with time zone'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.support_delivery_events', columns: [
          'id', 'organization_id', 'conversation_message_id', 'integrator_intent_event_id',
          'correlation_id', 'channel_code', 'status', 'attempt', 'reason', 'payload_json', 'occurred_at',
        ], operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_row(uuid,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return only the current patient own booking projection by booking or canonical appointment id',
      typedArgs: ['uuid', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_bookings', columns: [
          'id', 'organization_id', 'platform_user_id', 'booking_type', 'city', 'category', 'slot_start', 'slot_end',
          'status', 'cancelled_at', 'cancel_reason', 'gcal_event_id', 'contact_phone', 'contact_email', 'contact_name',
          'reminder_24h_sent', 'reminder_2h_sent', 'created_at', 'updated_at', 'branch_id', 'service_id',
          'branch_service_id', 'city_code_snapshot', 'branch_title_snapshot', 'service_title_snapshot',
          'duration_minutes_snapshot', 'price_minor_snapshot', 'provenance_created_by', 'provenance_updated_by',
          'canonical_appointment_id',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_policies(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return current-organization booking policies needed to evaluate patient lifecycle actions',
      typedArgs: ['text'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_cancellation_policies', columns: [
          'id', 'organization_id', 'scope_level', 'scope_entity_id', 'title', 'is_active',
          'free_cancel_hours_before', 'cancellation_allowed', 'late_cancellation_behavior',
          'refund_prepayment_on_late', 'charge_package_session_on_late', 'requires_staff_confirmation',
          'notify_patient', 'notify_staff', 'sort_order', 'created_at', 'updated_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_reschedule_policies', columns: [
          'id', 'organization_id', 'scope_level', 'scope_entity_id', 'title', 'is_active',
          'self_reschedule_hours_before', 'max_self_reschedules', 'allow_different_branch',
          'allow_different_city', 'allow_different_specialist', 'allow_different_service',
          'limit_exceeded_behavior', 'requires_staff_confirmation', 'notify_patient', 'notify_staff',
          'sort_order', 'created_at', 'updated_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_booking_reschedules(uuid)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'return only lifecycle reschedules for the current patient own appointment',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'platform_user_id', 'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_reschedules', columns: [
          'id', 'organization_id', 'appointment_id', 'from_start_at', 'from_end_at', 'to_start_at', 'to_end_at',
          'actor_type', 'actor_id', 'was_in_free_reschedule_window',
          'free_cancellation_available_at_reschedule', 'free_cancellation_available_after',
          'applied_policy_id', 'applied_policy_snapshot', 'reason', 'staff_comment', 'notifications_sent',
          'manual_override', 'created_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.apply_current_patient_booking_reschedule(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'apply an already policy-evaluated same-catalog reschedule to the current patient own appointment',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'branch_id', 'room_id', 'specialist_id', 'service_id', 'platform_user_id',
          'start_at', 'end_at', 'duration_minutes', 'chain_id', 'chain_position', 'source', 'status',
          'original_start_at', 'reschedule_count', 'payment_ref', 'package_usage_ref', 'phone_normalized',
          'attribution_json', 'appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id',
          'appointment_reminder_selection_source', 'created_at', 'updated_at', 'deleted_at',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_reschedules', columns: [
          'organization_id', 'appointment_id', 'from_start_at', 'from_end_at', 'to_start_at', 'to_end_at',
          'actor_type', 'actor_id', 'was_in_free_reschedule_window',
          'free_cancellation_available_at_reschedule', 'free_cancellation_available_after',
          'applied_policy_id', 'applied_policy_snapshot', 'reason', 'staff_comment', 'notifications_sent',
          'manual_override', 'created_at',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_history_events',
          columns: ['organization_id', 'appointment_id', 'event_type', 'actor_id', 'payload', 'occurred_at'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_timeline_events', columns: [
          'organization_id', 'platform_user_id', 'domain', 'event_type', 'linked_object_type',
          'linked_object_id', 'payload', 'occurred_at',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.apply_current_patient_booking_cancellation(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'apply an already policy-evaluated cancellation to the current patient own appointment',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'branch_id', 'room_id', 'specialist_id', 'service_id', 'platform_user_id',
          'start_at', 'end_at', 'duration_minutes', 'chain_id', 'chain_position', 'source', 'status',
          'original_start_at', 'reschedule_count', 'payment_ref', 'package_usage_ref', 'phone_normalized',
          'attribution_json', 'appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id',
          'appointment_reminder_selection_source', 'created_at', 'updated_at', 'deleted_at',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_cancellations', columns: [
          'organization_id', 'appointment_id', 'actor_type', 'actor_id', 'cancellation_type', 'reason',
          'was_free', 'was_penalized', 'package_session_charged', 'prepayment_retained',
          'prepayment_refunded', 'staff_comment', 'notifications_sent', 'manual_override',
          'applied_policy_id', 'applied_policy_snapshot', 'created_at',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_history_events',
          columns: ['organization_id', 'appointment_id', 'event_type', 'actor_id', 'payload', 'occurred_at'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_timeline_events', columns: [
          'organization_id', 'platform_user_id', 'domain', 'event_type', 'linked_object_type',
          'linked_object_id', 'payload', 'occurred_at',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.patch_current_patient_booking_notifications(uuid,text,text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'void', returnsSet: false, execute: ['app_patient'],
      purpose: 'patch the latest lifecycle notification outcome for the current patient own appointment',
      typedArgs: ['uuid', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.be_appointments',
          columns: ['id', 'organization_id', 'platform_user_id', 'deleted_at'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_reschedules',
          columns: ['id', 'organization_id', 'appointment_id', 'created_at', 'notifications_sent'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointment_cancellations',
          columns: ['id', 'organization_id', 'appointment_id', 'created_at', 'notifications_sent'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.reserve_current_patient_booking_package(text)': rev10Function({
      owner: 'app_seam_patient_booking_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false, execute: ['app_patient'],
      purpose: 'reserve one available service unit from the current patient own active package',
      typedArgs: ['text'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_patient_packages', columns: [
          'id', 'organization_id', 'platform_user_id', 'status', 'valid_from', 'valid_until',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_appointments', columns: [
          'id', 'organization_id', 'platform_user_id', 'service_id', 'deleted_at', 'package_usage_ref', 'updated_at',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_patient_package_items',
          columns: ['id', 'patient_package_id', 'service_id', 'quantity_initial', 'sort_order'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_package_usages', columns: [
          'id', 'organization_id', 'patient_package_id', 'patient_package_item_id', 'appointment_id',
          'usage_kind', 'quantity', 'comment', 'created_by_platform_user_id', 'occurred_at', 'created_at',
        ], operations: ['SELECT' as const, 'INSERT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_package_history_events',
          columns: ['organization_id', 'patient_package_id', 'event_type', 'payload_json', 'occurred_at'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_material_rating_snapshot(text,uuid)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_patient'], purpose: 'patient.material-rating.snapshot.read', typedArgs: ['text', 'uuid'],
      volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.material_ratings',
        columns: ['organization_id', 'stars', 'target_id', 'target_kind', 'user_id'],
        operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.record_current_patient_practice_completion(uuid,text,integer)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'uuid', returnsSet: true,
      execute: ['app_patient'], purpose: 'record one completion only for the current enrolled patient',
      typedArgs: ['uuid', 'text', 'integer'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'id', 'organization_id', 'slug', 'is_published', 'archived_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_blocks', columns: ['code', 'organization_id', 'is_visible'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_block_items', columns: [
          'block_code', 'organization_id', 'is_visible', 'target_type', 'target_ref',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_practice_completions', columns: [
          'id', 'organization_id', 'user_id', 'content_page_id', 'source', 'feeling', 'notes',
        ], operations: ['SELECT' as const, 'INSERT' as const], operationColumns: { SELECT: ['id'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: true,
      execute: ['app_patient'], purpose: 'upsert one material rating only for the current enrolled patient',
      typedArgs: ['text', 'uuid', 'integer', 'uuid', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings', columns: [
          'key', 'scope', 'audience', 'organization_id', 'value_json',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'id', 'organization_id', 'slug', 'is_published', 'archived_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instances', columns: [
          'id', 'organization_id', 'patient_user_id', 'status',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stages', columns: [
          'id', 'organization_id', 'instance_id',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stage_items', columns: [
          'id', 'organization_id', 'stage_id', 'item_type', 'item_ref_id', 'status',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.material_ratings', columns: [
          'organization_id', 'user_id', 'target_kind', 'target_id', 'stars', 'updated_at',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_current_patient_fio()': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_patient'], purpose: 'read canonical structured FIO for the current patient only',
      typedArgs: [], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.platform_users',
          columns: ['id', 'role', 'merged_into_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity',
          columns: ['platform_user_id', 'last_name', 'first_name', 'patronymic', 'display_name'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.update_current_patient_fio(text,text,text)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_patient'], purpose: 'update canonical FIO, compatibility mirror and audit for the current patient only',
      typedArgs: ['text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.platform_users',
          columns: ['id', 'role', 'merged_into_id', 'last_name', 'first_name', 'patronymic', 'display_name', 'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          operationColumns: { SELECT: ['id', 'role', 'merged_into_id'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity',
          columns: ['platform_user_id', 'last_name', 'first_name', 'patronymic', 'display_name', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.admin_audit_log',
          columns: ['organization_id', 'actor_id', 'action', 'target_id', 'details'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.update_current_patient_practice_completion_feeling(uuid,integer)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'update only the current patient own warmup completion feeling',
      typedArgs: ['uuid', 'integer'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.patient_practice_completions', columns: [
          'id', 'organization_id', 'user_id', 'feeling',
        ], operations: ['SELECT' as const, 'UPDATE' as const],
          operationColumns: { SELECT: ['id', 'organization_id', 'user_id'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.save_current_patient_daily_warmup_presentation(uuid,timestamp with time zone,boolean)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'save only a visible daily-warmup presentation for the current patient',
      typedArgs: ['uuid', 'timestamp with time zone', 'boolean'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'id', 'organization_id', 'slug', 'is_published', 'archived_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_blocks', columns: ['code', 'organization_id', 'is_visible'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_block_items', columns: [
          'block_code', 'organization_id', 'is_visible', 'target_type', 'target_ref',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_daily_warmup_presentations', columns: [
          'organization_id', 'user_id', 'content_page_id', 'last_rotation_at',
          'skip_next_scheduled_rotation', 'updated_at',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_current_patient_daily_warmup_video_view(uuid)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'record a view only for the current patient presented daily warmup',
      typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.patient_daily_warmup_presentations', columns: [
          'organization_id', 'user_id', 'content_page_id',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'id', 'organization_id', 'is_published', 'archived_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_daily_warmup_video_views', columns: [
          'organization_id', 'user_id', 'content_page_id',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_current_patient_content_rating_feedback(uuid,integer,text,text)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false,
      execute: ['app_patient'], purpose: 'record rating feedback for one visible current-clinic page as current patient',
      typedArgs: ['uuid', 'integer', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.app_runtime_settings', columns: [
          'key', 'scope', 'audience', 'organization_id', 'value_json',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'id', 'organization_id', 'is_published', 'archived_at', 'deleted_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_blocks', columns: ['code', 'organization_id', 'is_visible'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_home_block_items', columns: [
          'block_code', 'organization_id', 'is_visible', 'target_type', 'target_ref',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_content_rating_feedback', columns: [
          'id', 'organization_id', 'user_id', 'content_page_id', 'rating_value', 'reason_codes', 'comment',
        ], operations: ['SELECT' as const, 'INSERT' as const], operationColumns: { SELECT: ['id'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_current_patient_playback_client_event(uuid,text,text,text,text)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'record bounded playback diagnostics for media visible to the current patient',
      typedArgs: ['uuid', 'text', 'text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.media_files', columns: [
          'id', 'organization_id', 'owner_kind', 'usage_purpose', 'uploaded_by',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'organization_id', 'is_published', 'archived_at', 'deleted_at', 'video_url', 'image_url',
          'body_md', 'body_html',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instances', columns: [
          'id', 'organization_id', 'patient_user_id', 'status',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stages', columns: ['id', 'instance_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stage_items', columns: [
          'id', 'stage_id', 'status', 'snapshot',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.program_item_discussion_messages', columns: [
          'instance_stage_item_id', 'media_file_id', 'organization_id',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_playback_client_events', columns: [
          'organization_id', 'media_id', 'user_id', 'event_class', 'delivery', 'error_detail', 'user_agent',
        ], operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.record_current_patient_playback_first_resolve(uuid)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'record one first-resolve marker for media visible to the current patient',
      typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_files', columns: [
          'id', 'organization_id', 'owner_kind', 'usage_purpose', 'uploaded_by',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.content_pages', columns: [
          'organization_id', 'is_published', 'archived_at', 'deleted_at', 'video_url', 'image_url',
          'body_md', 'body_html',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instances', columns: [
          'id', 'organization_id', 'patient_user_id', 'status',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stages', columns: ['id', 'instance_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stage_items', columns: [
          'id', 'stage_id', 'status', 'snapshot',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.program_item_discussion_messages', columns: [
          'instance_stage_item_id', 'media_file_id', 'organization_id',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_playback_user_video_first_resolve', columns: [
          'organization_id', 'user_id', 'media_id',
        ], operations: ['SELECT' as const, 'INSERT' as const],
          operationColumns: { SELECT: ['user_id', 'media_id'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'capture one verified past diary-day snapshot for the current patient',
      typedArgs: ['text', 'text', 'integer', 'integer', 'boolean', 'uuid', 'text', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'], relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'calendar_timezone'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings', columns: ['key', 'scope', 'organization_id', 'value_json'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instances', columns: ['id', 'organization_id', 'patient_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stages', columns: ['id', 'instance_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.treatment_program_instance_stage_items', columns: ['id', 'organization_id', 'stage_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.program_action_log', columns: [
          'organization_id', 'patient_user_id', 'instance_id', 'instance_stage_item_id', 'action_type', 'created_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_practice_completions', columns: [
          'organization_id', 'user_id', 'source', 'completed_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.patient_diary_day_snapshots', columns: [
          'organization_id', 'platform_user_id', 'local_date', 'iana', 'warmup_slot_limit', 'warmup_done_count',
          'warmup_all_done', 'plan_instance_id', 'plan_item_ids', 'plan_done_mask',
        ], operations: ['SELECT' as const, 'INSERT' as const],
          operationColumns: { SELECT: ['platform_user_id', 'local_date'] },
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.set_current_patient_notification_topic(text,boolean)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'set one supported notification topic for the current patient',
      typedArgs: ['text', 'boolean'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings', columns: [
          'key', 'scope', 'audience', 'organization_id', 'value_json',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_notification_topics', columns: [
          'user_id', 'topic_code', 'is_enabled', 'updated_at',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.set_current_patient_notification_topic_channel(text,text,boolean)': rev10Function({
      owner: 'app_seam_patient_self_actions_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'set one supported notification topic channel for the current patient',
      typedArgs: ['text', 'text', 'boolean'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.app_runtime_settings', columns: [
          'key', 'scope', 'audience', 'organization_id', 'value_json',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_notification_topic_channels', columns: [
          'user_id', 'topic_code', 'channel_code', 'is_enabled', 'updated_at',
        ], operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.create_current_patient_reminder_rule(text,text)': patientSelfFunction(
      'jsonb', false, ['text', 'text'], 'patient.reminder-rule.create', exactPatientSurfaces(
        [...PATIENT_REMINDER_CORE_SURFACES, PATIENT_ORG_ENROLLMENT_SURFACE],
        PATIENT_ROOT_OPERATIONS.create_current_patient_reminder_rule)),
    'app.update_current_patient_reminder_rule(text,text)': patientSelfFunction(
      'jsonb', false, ['text', 'text'], 'patient.reminder-rule.update', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.update_current_patient_reminder_rule)),
    'app.delete_current_patient_reminder_rule(text)': patientSelfFunction(
      'boolean', false, ['text'], 'patient.reminder-rule.delete', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.delete_current_patient_reminder_rule)),
    'app.record_current_patient_reminder_journal_action(text,text,text,timestamp with time zone,text)': patientSelfFunction(
      'uuid', false, ['text', 'text', 'text', 'timestamp with time zone', 'text'],
      'patient.reminder-journal.record', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.record_current_patient_reminder_journal_action)),
    'app.mark_current_patient_reminder_history_seen(text)': patientSelfFunction(
      'integer', false, ['text'], 'patient.reminder-history.seen', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_reminder_history_seen)),
    'app.mark_all_current_patient_reminder_history_seen()': patientSelfFunction(
      'integer', false, [], 'patient.reminder-history.seen-all', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_all_current_patient_reminder_history_seen)),
    'app.set_current_patient_reminder_muted_until(timestamp with time zone)': patientSelfFunction(
      'boolean', false, ['timestamp with time zone'], 'patient.reminder.mute', exactPatientSurfaces(
        PATIENT_REMINDER_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.set_current_patient_reminder_muted_until)),
    'app.ensure_current_patient_support_conversation()': patientSelfFunction(
      'jsonb', false, [], 'patient.support-conversation.ensure', exactPatientSurfaces(
        [...PATIENT_SUPPORT_CORE_SURFACES, PATIENT_ORG_ENROLLMENT_SURFACE],
        PATIENT_ROOT_OPERATIONS.ensure_current_patient_support_conversation)),
    'app.append_current_patient_support_message(uuid,text,text,text,timestamp with time zone,text,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'text', 'text', 'text', 'timestamp with time zone', 'text', 'text'],
      'patient.support-message.append', exactPatientSurfaces(
        PATIENT_SUPPORT_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.append_current_patient_support_message)),
    'app.mark_current_patient_support_conversation_read(uuid)': patientSelfFunction(
      'integer', false, ['uuid'], 'patient.support-conversation.read', exactPatientSurfaces(
        PATIENT_SUPPORT_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_support_conversation_read)),
    'app.mark_current_patient_support_messages_read(text)': patientSelfFunction(
      'integer', false, ['text'], 'patient.support-messages.read', exactPatientSurfaces(
        PATIENT_SUPPORT_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_support_messages_read)),
    'app.mark_current_patient_support_notifications_read()': patientSelfFunction(
      'integer', false, [], 'patient.support-notifications.read', exactPatientSurfaces(
        PATIENT_SUPPORT_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_support_notifications_read)),
    'app.ensure_current_patient_system_symptom_tracking(text,text,uuid)': patientSelfFunction(
      'jsonb', false, ['text', 'text', 'uuid'], 'patient.symptom-system-tracking.ensure', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.ensure_current_patient_system_symptom_tracking)),
    'app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'integer', 'text', 'timestamp with time zone', 'text'],
      'patient.symptom-entry.record', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.record_current_patient_symptom_entry)),
    'app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'integer', 'text', 'timestamp with time zone', 'text'],
      'patient.symptom-entry.update', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.update_current_patient_symptom_entry)),
    'app.delete_current_patient_symptom_entry(uuid)': patientSelfFunction(
      'boolean', false, ['uuid'], 'patient.symptom-entry.delete', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.delete_current_patient_symptom_entry)),
    'app.configure_current_patient_assigned_symptom_tracking(uuid,text,boolean)': patientSelfFunction(
      'boolean', false, ['uuid', 'text', 'boolean'], 'patient.symptom-tracking.configure', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES,
        PATIENT_ROOT_OPERATIONS.configure_current_patient_assigned_symptom_tracking)),
    'app.apply_current_patient_warmup_feeling(uuid,integer,uuid,text,uuid,text)': patientSelfFunction(
      'boolean', false, ['uuid', 'integer', 'uuid', 'text', 'uuid', 'text'],
      'patient.warmup-feeling.apply', exactPatientSurfaces(
        PATIENT_SYMPTOM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.apply_current_patient_warmup_feeling)),
    'app.save_current_patient_channel_preference(text,boolean,boolean)': patientSelfFunction(
      'jsonb', false, ['text', 'boolean', 'boolean'], 'patient.channel-preference.save', exactPatientSurfaces(
        PATIENT_CHANNEL_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.save_current_patient_channel_preference)),
    'app.set_current_patient_preferred_auth_channel(text)': patientSelfFunction(
      'boolean', false, ['text'], 'patient.preferred-auth-channel.set', exactPatientSurfaces(
        PATIENT_CHANNEL_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.set_current_patient_preferred_auth_channel)),
    'app.save_current_patient_web_push_subscription(text,text,text,text)': patientSelfFunction(
      'boolean', false, ['text', 'text', 'text', 'text'], 'patient.web-push-subscription.save', exactPatientSurfaces(
        PATIENT_CHANNEL_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.save_current_patient_web_push_subscription)),
    'app.remove_current_patient_web_push_subscription(text)': patientSelfFunction(
      'boolean', false, ['text'], 'patient.web-push-subscription.remove', exactPatientSurfaces(
        PATIENT_CHANNEL_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.remove_current_patient_web_push_subscription)),
    'app.remove_all_current_patient_web_push_subscriptions()': patientSelfFunction(
      'integer', false, [], 'patient.web-push-subscriptions.remove-all', exactPatientSurfaces(
        PATIENT_CHANNEL_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.remove_all_current_patient_web_push_subscriptions)),
    'app.touch_current_patient_program_item(uuid,uuid)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid'], 'patient.program-item.touch', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.touch_current_patient_program_item)),
    'app.complete_current_patient_program_item(uuid,uuid,integer,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid', 'integer', 'text'], 'patient.program-item.complete', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.complete_current_patient_program_item)),
    'app.enrich_current_patient_program_completion(uuid,uuid,uuid,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid', 'uuid', 'text'], 'patient.program-completion.enrich', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.enrich_current_patient_program_completion)),
    'app.record_current_patient_program_action(uuid,uuid,text,uuid,text,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid', 'text', 'uuid', 'text', 'text'], 'patient.program-action.record',
      exactPatientSurfaces(PATIENT_PROGRAM_CORE_SURFACES,
        PATIENT_ROOT_OPERATIONS.record_current_patient_program_action)),
    'app.delete_current_patient_program_actions_in_window(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)': patientSelfFunction(
      'integer', false, ['uuid', 'uuid', 'timestamp with time zone', 'timestamp with time zone', 'boolean'],
      'patient.program-actions.delete-window', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES,
        PATIENT_ROOT_OPERATIONS.delete_current_patient_program_actions_in_window)),
    'app.append_current_patient_program_event(uuid,text,text,uuid,text,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'text', 'text', 'uuid', 'text', 'text'], 'patient.program-event.append',
      exactPatientSurfaces(PATIENT_PROGRAM_CORE_SURFACES,
        PATIENT_ROOT_OPERATIONS.append_current_patient_program_event)),
    'app.mark_current_patient_program_item_viewed(uuid,uuid)': patientSelfFunction(
      'boolean', false, ['uuid', 'uuid'], 'patient.program-item.viewed', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_program_item_viewed)),
    'app.append_current_patient_program_discussion(uuid,text,uuid)': patientSelfFunction(
      'jsonb', false, ['uuid', 'text', 'uuid'], 'patient.program-discussion.append', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.append_current_patient_program_discussion)),
    'app.mark_current_patient_program_discussion_read(uuid,timestamp with time zone)': patientSelfFunction(
      'boolean', false, ['uuid', 'timestamp with time zone'], 'patient.program-discussion.read', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.mark_current_patient_program_discussion_read)),
    'app.ensure_current_patient_test_attempt(uuid)': patientSelfFunction(
      'jsonb', false, ['uuid'], 'patient.test-attempt.ensure', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.ensure_current_patient_test_attempt)),
    'app.start_current_patient_test_attempt(uuid,uuid)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid'], 'patient.test-attempt.start', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.start_current_patient_test_attempt)),
    'app.save_current_patient_test_result(uuid,uuid,text,text)': patientSelfFunction(
      'jsonb', false, ['uuid', 'uuid', 'text', 'text'], 'patient.test-result.save', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.save_current_patient_test_result)),
    'app.submit_current_patient_test_attempt(uuid)': patientSelfFunction(
      'boolean', false, ['uuid'], 'patient.test-attempt.submit', exactPatientSurfaces(
        PATIENT_PROGRAM_CORE_SURFACES, PATIENT_ROOT_OPERATIONS.submit_current_patient_test_attempt)),
    'app.enqueue_media_transcode_job_core(uuid)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      // Ядро зовут только `_for_staff`/`_for_service` — оба SECURITY DEFINER ТОГО ЖЕ владельца,
      // то есть внутри них `current_user` уже владелец ядра и EXECUTE у него подразумеваемый.
      // Явный грант владельцу самому себе ничего не добавлял, а внутренний делегированный шов по
      // канону обязан быть caller-free (как все `*_impl`); проверка увидела это, когда
      // `public.media_transcode_jobs` осталась без прямых ролей (миграция 0050).
      execute: [],
      purpose: 'private idempotent media transcode producer shared by exact patient/staff/service roots',
      typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'], invocation: 'internal' as const,
      relationSurfaces: [
        { relation: 'public.media_files',
          columns: ['id', 'organization_id', 'mime_type', 's3_key', 'status',
            'hls_master_playlist_s3_key', 'video_processing_status', 'video_processing_error'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_transcode_jobs',
          columns: ['id', 'media_id', 'organization_id', 'status', 'attempts', 'created_at', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.create_patient_program_submission_media(uuid,text,text,text,bigint)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'patient.media.program-submission.create',
      typedArgs: ['uuid', 'text', 'text', 'text', 'bigint'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.org_enrollments',
          columns: ['organization_id', 'platform_user_id', 'status'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_folders',
          columns: ['id', 'organization_id', 'parent_id', 'name', 'kind', 'patient_user_id'],
          operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity',
          columns: ['platform_user_id', 'first_name', 'last_name', 'patronymic', 'display_name'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files',
          columns: ['id', 'owner_kind', 'organization_id', 'original_name', 'stored_path', 'mime_type',
            'size_bytes', 'uploaded_by', 's3_key', 'status', 'folder_id', 'usage_purpose',
            'video_delivery_override'],
          operations: ['INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.confirm_patient_program_submission_media(uuid)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'patient.media.program-submission.confirm', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.media_files',
        columns: ['id', 'organization_id', 'uploaded_by', 'usage_purpose', 'status', 'mime_type'],
        operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.abort_patient_program_submission_media(uuid)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_patient'], purpose: 'patient.media.program-submission.abort', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.media_files',
        columns: ['id', 'organization_id', 'uploaded_by', 'usage_purpose', 'status'],
        operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.enqueue_media_transcode_job_for_staff(uuid)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_staff'], purpose: 'media.transcode.enqueue', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.media_files', columns: ['id'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
      delegatesTo: ['app.enqueue_media_transcode_job_core(uuid)'],
    }),
    'app.enqueue_media_transcode_job_for_service(uuid)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_operational_media_worker'], purpose: 'media.transcode.enqueue', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [], delegatesTo: ['app.enqueue_media_transcode_job_core(uuid)'],
    }),
    // Три двери разбора очереди пересборки видео (миграция 0050). Постановка в очередь уже стояла
    // за корнем этого же шва (`app.enqueue_media_transcode_job_for_staff/_for_service`), а разбор
    // ходил отношением под `app_operational_media_worker` — и не мог взять НИ ОДНОЙ работы:
    // единственная разрешающая политика этой роли на `public.media_transcode_jobs` состоит из
    // арендаторских веток, обе зовут `app.current_org_id()` подзапросом-InitPlan'ом, а та на роли
    // воркера не возвращает NULL, а поднимает `42501 accepted organization context required`.
    // Отказ приходит ровно тогда, когда узлу есть что фильтровать, поэтому ПУСТАЯ очередь молчала,
    // а первая же поставленная работа начинала петлю падения. Замер на TEST 19.08: воркер падал
    // раз в 5 секунд с 18.08 19:26, видео не пересобиралось больше суток; воспроизведено на живой
    // bcb_webapp_dev тем же боевым маршрутом при возвращённых старых правах.
    // Диспетчер очереди межарендный по построению — своего `organization_id` у него нет и быть не
    // может, поэтому дверь у него собственная, а стена «организация работы = организация файла»
    // стоит в теле каждого корня.
    'app.claim_media_transcode_job(text,integer)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_operational_media_worker'], purpose: 'media.transcode.claim',
      typedArgs: ['text', 'integer'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_transcode_jobs',
          columns: ['id', 'media_id', 'organization_id', 'status', 'attempts', 'created_at',
            'updated_at', 'locked_at', 'locked_by', 'last_error', 'next_attempt_at',
            'processing_started_at', 'finished_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files', columns: ['id', 'organization_id'],
          operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.read_media_transcode_job_media(uuid,uuid,text)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_operational_media_worker'], purpose: 'media.transcode.job-media.read',
      typedArgs: ['uuid', 'uuid', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_transcode_jobs',
          columns: ['id', 'media_id', 'organization_id', 'status', 'locked_by'],
          operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files',
          columns: ['id', 'organization_id', 'mime_type', 's3_key', 'hls_master_playlist_s3_key',
            'video_processing_status', 'video_duration_seconds', 'usage_purpose'],
          operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    // Один исход — одна дверь. Ветка выбирается параметром из ЗАКРЫТОГО списка внутри тела, как у
    // соседа `app.prune_retention_target(text,integer,boolean)`: каждый исход сохраняет своё
    // поведение, общей у них только эта дверь.
    'app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)': rev10Function({
      owner: 'app_seam_patient_lfk_media_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_operational_media_worker'], purpose: 'media.transcode.outcome.record',
      typedArgs: ['uuid', 'uuid', 'text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.media_transcode_jobs',
          columns: ['id', 'media_id', 'organization_id', 'status', 'locked_by', 'locked_at',
            'last_error', 'next_attempt_at', 'processing_started_at', 'finished_at', 'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.media_files',
          columns: ['id', 'organization_id', 'mime_type', 's3_key', 'video_processing_status',
            'video_processing_error', 'video_delivery_override', 'available_qualities_json',
            'hls_master_playlist_s3_key', 'hls_artifact_prefix', 'poster_s3_key',
            'video_duration_seconds'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.resolve_active_organization_for_integrator_user_id(bigint)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_integrator_resolver'], purpose: 'integrator.user-organization.resolve',
      typedArgs: ['bigint'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.platform_users', columns: ['id', 'integrator_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.integrator_upsert_channel_identity(text,text,text)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_integrator_resolver'], purpose: 'integrator.channel-identity.upsert',
      typedArgs: ['text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.platform_users',
          columns: ['id', 'display_name', 'merged_into_id'],
          operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings',
          columns: ['user_id', 'channel_code', 'external_id', 'display_handle'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity',
          columns: ['platform_user_id', 'display_name', 'updated_at'],
          operations: ['INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_preferences',
          columns: ['user_id', 'platform_user_id', 'channel_code', 'is_enabled_for_messages',
            'is_enabled_for_notifications', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)': rev10Function({
      owner: 'app_seam_phone_binding_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_integrator_resolver'], purpose: 'integrator.bootstrap-phone-bind',
      typedArgs: ['text', 'text', 'text', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.platform_users',
          columns: ['id', 'integrator_user_id', 'phone_normalized', 'email', 'merged_into_id',
            'patient_phone_trust_at', 'updated_at'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity',
          columns: ['platform_user_id', 'first_name', 'last_name', 'patronymic', 'birth_date'],
          operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_bindings',
          columns: ['user_id', 'channel_code', 'external_id'],
          operations: ['SELECT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_channel_preferences',
          columns: ['user_id', 'platform_user_id', 'channel_code', 'is_enabled_for_messages',
            'is_enabled_for_notifications', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts',
          columns: ['platform_user_id', 'contact_kind', 'value_normalized', 'is_primary',
            'confirmed_at', 'source_origin', 'updated_at'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_phone_history',
          columns: ['platform_user_id', 'phone_normalized', 'valid_from', 'valid_to', 'source'],
          operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['platform_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['platform_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.install_port_context(uuid,app.port_context_claims)': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'void', returnsSet: false, loginExecute: true as const,
      execute: [], purpose: 'install', typedArgs: ['uuid', 'app.port_context_claims'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      bodyRelationSurfaceContract: 'port-context' as const }),
    'app.clear_port_context()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'void', returnsSet: false, loginExecute: true as const,
      execute: [], purpose: 'clear', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      bodyRelationSurfaceContract: 'port-context' as const }),
    // Сетевая обёртка установки контекста: SECURITY INVOKER, собственных прав на отношения не
    // имеет и иметь не должна — она только зовёт два корня шва и переходит в целевую роль правами
    // вызывающего логина. DEFINER здесь невозможен: PostgreSQL запрещает `SET ROLE` внутри
    // security-definer тела.
    'app.begin_port_context(uuid,app.port_context_claims)': rev10Function({ owner: 'app_seam_context_owner', security: 'INVOKER', returns: 'void', returnsSet: false, loginExecute: true as const,
      execute: [], purpose: 'install a port context and assume its declared target role in one round trip',
      typedArgs: ['uuid', 'app.port_context_claims'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, pg_temp'],
      relationSurfaces: [],
      delegatesTo: [
        'app.clear_port_context()',
        'app.install_port_context(uuid,app.port_context_claims)',
      ] }),
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)': rev10Function({
      owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false, execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS],
      purpose: 'gate', typedArgs: ['name', 'name', 'class', 'text', 'bytea', 'regprocedure'],
      volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      bodyRelationSurfaceContract: 'port-context' as const }),
    'app.require_attested_context_for_roles(name,name[])': rev10Function({
      owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false, execute: [...REV10_SEAM_OWNERS],
      purpose: 'verify one current transaction-bound port context before an ordinary definer body',
      typedArgs: ['name', 'name[]'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], invocation: 'internal' as const,
      relationSurfaces: [
        { relation: 'app_ext.accepted_port_contexts', columns: [
          'database_oid', 'backend_pid', 'transaction_id', 'capability_id', 'session_login', 'port',
          'target_role', 'context_class', 'purpose', 'function_identity', 'cleared_at',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'app_ext.port_context_capabilities', columns: [
          'capability_id', 'port', 'session_login', 'target_role', 'context_class', 'purpose',
          'function_identity', 'active_from', 'active_until',
        ], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.require_platform_principal()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'boolean', returnsSet: false,
      execute: ['app_platform_settings', 'saas_telemetry_operator', ...REV10_SEAM_OWNERS], purpose: 'platform', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'] }),
    'app.resolve_platform_audit_conflict(uuid)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'text', returnsSet: false,
      execute: ['app_platform_admin'], purpose: 'resolve one whitelisted platform audit conflict', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.admin_audit_log',
        columns: ['id', 'action', 'resolved_at'], operations: ['SELECT' as const, 'UPDATE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.append_platform_audit_event(text,text,text)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false,
      execute: ['app_platform_admin', 'app_pre_session'],
      purpose: 'append one whitelisted platform operator or pre-session auth audit event',
      typedArgs: ['text', 'text', 'text'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      relationSurfaces: [{ relation: 'public.admin_audit_log',
        columns: ['organization_id', 'actor_id', 'action', 'details', 'status', 'id'],
        operations: ['SELECT' as const, 'INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.acknowledge_open_outbound_provider_incidents()': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false,
      execute: ['app_platform_admin'], purpose: 'acknowledge all open outbound-provider incidents', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.operator_incidents',
        columns: ['resolved_at', 'acknowledged_at', 'direction', 'alert_claim_phase', 'alert_claim_token', 'alert_claimed_at'],
        operations: ['SELECT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    // Единственная дверь ОТКРЫТИЯ критического инцидента. До неё пятиминутный сторож писал строку
    // прямым drizzle-INSERT под `app_worker`, который перечисляет ВСЕ колонки таблицы: семь
    // выданных поколоночно и десять невыданных с `default`, — и получал
    // `42501 permission denied for table operator_incidents` каждый прогон (замер 19.08 на TEST).
    // Сторож читал инциденты и не мог открыть ни одного. Владелец шва тот же, что стоит в гейте
    // интеграторского `app.open_or_touch_operator_incident(...)`; отдельная дверь, а не
    // переиспользование, потому что набор исполнителей той закрыт утверждением
    // `NOT has_function_privilege('app_worker', ...)` в `integrator-server-runtime-config.sql`,
    // и её контракт не отдаёт `opened_at`, по которому каденция считает T0 -> +1ч.
    'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['app_worker'],
      purpose: 'open or touch only one critical-cadence operator incident',
      typedArgs: ['text', 'text', 'text', 'timestamp with time zone', 'text'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.operator_incidents',
        columns: ['id', 'dedup_key', 'direction', 'integration', 'error_class', 'error_detail',
          'opened_at', 'last_seen_at', 'occurrence_count', 'resolved_at'],
        operations: ['SELECT' as const, 'INSERT' as const, 'UPDATE' as const],
        evidence: 'exact INSERT ON CONFLICT(dedup_key) in migration 0041' as const }],
    }),
    'app.resolve_all_open_operator_incidents()': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false,
      execute: ['app_platform_admin'], purpose: 'resolve all open platform operator incidents', typedArgs: [],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.operator_incidents',
        columns: ['resolved_at', 'alert_claim_phase', 'alert_claim_token', 'alert_claimed_at'],
        operations: ['SELECT' as const, 'UPDATE' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.read_tenant_isolation_canary()': rev10Function({
      owner: 'saas_system_health_owner', security: 'DEFINER', returns: 'jsonb', returnsSet: false,
      execute: ['saas_telemetry_operator'],
      purpose: 'return a bounded organization/member-count snapshot for the critical isolation canary',
      typedArgs: [], volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.be_organizations', columns: ['id', 'is_active'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.be_organization_members', columns: ['id', 'organization_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_platform_admin'], purpose: 'list only sanitized platform health archive fields',
      typedArgs: ['text', 'integer', 'timestamp with time zone', 'uuid'], volatility: 'STABLE',
      parallel: 'RESTRICTED', proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [{ relation: 'public.operator_health_failure_archive',
        columns: ['id', 'archived_at', 'archived_by_user_id', 'health_probe', 'source_kind', 'source_id',
          'severity_at_archive', 'summary_json'], operations: ['SELECT' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    'app.archive_operator_health_failures(text,integer,uuid)': rev10Function({
      owner: 'app_seam_telemetry_operator_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_platform_admin'], purpose: 'archive and remove one sanitized non-clinical dead queue batch',
      typedArgs: ['text', 'integer', 'uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog'],
      relationSurfaces: [
        { relation: 'public.outgoing_delivery_queue', columns: ['id', 'organization_id', 'status', 'failure_class',
          'kind', 'channel', 'payload_json', 'last_error', 'created_at'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.broadcast_audit', columns: ['id', 'organization_id', 'actor_id', 'message_title'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.platform_users', columns: ['id', 'display_name', 'first_name', 'last_name',
          'phone_normalized'], operations: ['SELECT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.integrator_push_outbox', columns: ['id', 'kind', 'status', 'last_error',
          'created_at'], operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'integrator.projection_outbox', columns: ['id', 'event_type', 'idempotency_key',
          'status', 'attempts_done', 'last_error', 'created_at'],
          operations: ['SELECT' as const, 'DELETE' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.operator_health_failure_archive', columns: ['organization_id', 'archived_by_user_id',
          'health_probe', 'source_kind', 'source_id', 'severity_at_archive', 'doctor_user_id', 'summary_json',
          'raw_error_truncated'],
          operations: ['SELECT' as const, 'INSERT' as const],
          evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.current_org_id()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-org', typedArgs: [], volatility: 'STABLE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], bodyRelationSurfaceContract: 'port-context' as const }),
    'app.current_actor_user_id()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-actor', typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], bodyRelationSurfaceContract: 'port-context' as const }),
    'app.current_patient_user_id()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-patient', typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], bodyRelationSurfaceContract: 'port-context' as const }),
    'app.current_integrator_user_id()': rev10Function({ owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'bigint', returnsSet: false, execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-integrator', typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'], bodyRelationSurfaceContract: 'port-context' as const }),
    'app.hash_port_typed_args(app.port_typed_arg[])': rev10Function({ owner: 'app_seam_context_owner', security: 'INVOKER', returns: 'bytea', returnsSet: false, execute: ['app_seam_context_owner', ...REV10_SEAM_OWNERS], purpose: 'typed-args', typedArgs: ['app.port_typed_arg[]'], volatility: 'IMMUTABLE', parallel: 'SAFE', proconfig: ['search_path=pg_catalog'] }),
    'app.is_staff()': rev10Function({ owner: 'app_object_owner', security: 'INVOKER', returns: 'boolean', returnsSet: false, execute: [...REV10_RUNTIME], purpose: 'staff-class', typedArgs: [], volatility: 'STABLE', parallel: 'SAFE', proconfig: ['search_path=pg_catalog'] }),
    'app_ext.resolve_variant_a_identity(uuid)': rev10Function({ owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: [], purpose: 'private variant-a map mutation behind the exact pre-session root', typedArgs: ['uuid'], volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      // UPDATE dropped 19.08 with the no-op upsert: the map is append-only, so the resolver only
      // ever reads an existing reference or inserts a missing one. It never rewrites a row.
      relationSurfaces: [{ relation: 'app_ext.variant_a_identity_refs', columns: ['physical_user_id', 'opaque_ref'], operations: ['SELECT' as const, 'INSERT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }] }),
    // Deferred constraint trigger on app_ext.accepted_port_contexts: the accepted context is deleted
    // at COMMIT of the very transaction that installed it, so a committed context row cannot exist
    // and no periodic sweep is needed. DEFINER on the table owner because the effective role at
    // COMMIT is the bare login, which holds no USAGE on app_ext.
    'app_ext.expire_accepted_port_context()': rev10Function({
      owner: 'app_seam_context_owner', security: 'DEFINER', returns: 'trigger', returnsSet: false,
      execute: [], purpose: 'delete the accepted port context at COMMIT of its own transaction',
      typedArgs: [], volatility: 'VOLATILE', parallel: 'UNSAFE',
      proconfig: ['search_path=pg_catalog, app_ext, pg_temp'], invocation: 'trigger' as const,
      relationSurfaces: [{
        relation: 'app_ext.accepted_port_contexts',
        columns: ['database_oid', 'backend_pid', 'transaction_id'],
        operations: ['SELECT' as const, 'DELETE' as const],
        evidence: 'pg16-function-body-lexical-upper-bound' as const,
      }],
    }),
    'app_ext.resolve_variant_a_physical(uuid)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: ['app_seam_context_owner'],
      purpose: 'resolve an opaque Variant-A context reference only for the context installer', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      relationSurfaces: [{ relation: 'app_ext.variant_a_identity_refs', columns: ['physical_user_id', 'opaque_ref'], operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
    // Проверка заявки на арендатора при установке контекста (19.08).  Живёт у шва личностей, а не
    // у шва контекста: контекст ещё не установлен, а этому владельцу RLS-политики членства открыты
    // без контекста, и ровно эти колонки у него уже есть под другие его функции — новых прав
    // проверка не требует.  Подробности и разбор порядка — в теле функции.
    'app_ext.assert_port_context_claim(text,name,uuid,uuid,uuid,bigint)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'void', returnsSet: false,
      execute: ['app_seam_context_owner'],
      purpose: 'refuse a port context whose organization claim is not backed by the actor own membership, enrollment or platform role',
      typedArgs: ['text', 'name', 'uuid', 'uuid', 'uuid', 'bigint'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
      relationSurfaces: [
        { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.platform_users', columns: ['id', 'role', 'merged_into_id', 'integrator_user_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.pre_session_resolve_identity(uuid)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'uuid', returnsSet: false, execute: ['app_pre_session', 'app_platform_admin'],
      purpose: 'exact physical-to-opaque handoff before a human transaction', typedArgs: ['uuid'],
      volatility: 'VOLATILE', parallel: 'UNSAFE', proconfig: ['search_path=pg_catalog, app, app_ext, pg_temp'],
    }),
    'app.auth_channel_binding_session(text,text)': rev10Function({
      owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session'], purpose: 'resolve one verified messenger binding into session-only identity data',
      typedArgs: ['text', 'text'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [
        { relation: 'public.user_channel_bindings', columns: ['user_id', 'channel_code', 'external_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.platform_users', columns: ['id', 'role', 'merged_into_id'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_identity', columns: ['platform_user_id', 'display_name'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
        { relation: 'public.user_contacts',
          columns: ['platform_user_id', 'contact_kind', 'is_primary', 'value_normalized'],
          operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const },
      ],
    }),
    'app.resolve_staff_workspace_memberships(uuid)': rev10Function({
      owner: 'app_seam_org_directory_owner', security: 'DEFINER', returns: 'record', returnsSet: true,
      execute: ['app_pre_session', 'app_staff'], purpose: 'resolve active organization memberships before staff routing and revalidate self after routing',
      typedArgs: ['uuid'], volatility: 'STABLE', parallel: 'RESTRICTED',
      proconfig: ['search_path=pg_catalog, app, public, pg_temp'],
      relationSurfaces: [{ relation: 'public.be_organization_members',
        columns: ['id', 'organization_id', 'platform_user_id', 'role', 'specialist_id', 'status',
          'doctor_screens_disabled', 'created_at', 'updated_at'],
        operations: ['SELECT' as const], evidence: 'pg16-function-body-lexical-upper-bound' as const }],
    }),
  },
} as const;

type LockedPolicyTarget = { policyName: string; descriptor: { table: string } };

const REV10_LOCKED_POLICIES = new Map<string, LockedPolicyTarget>(
  (getPhase4LockedPolicyTargets() as LockedPolicyTarget[]).map((target: LockedPolicyTarget) => [target.descriptor.table, target]),
);

type DirectAccessSeed = Omit<Extract<RelationAccess, { kind: 'direct' }>, 'seams'>;

const REV10_PATIENT_NAMED_WRITE_OPERATIONS: Readonly<Record<string, readonly Privilege[]>> = {
  'public.material_ratings': ['INSERT', 'UPDATE'],
  'public.media_playback_client_events': ['INSERT'],
  'public.media_playback_user_video_first_resolve': ['INSERT'],
  'public.patient_content_rating_feedback': ['INSERT'],
  'public.patient_daily_warmup_presentations': ['INSERT', 'UPDATE'],
  'public.patient_daily_warmup_video_views': ['INSERT'],
  'public.patient_diary_day_snapshots': ['INSERT'],
  'public.patient_practice_completions': ['INSERT', 'UPDATE'],
  'public.user_notification_topic_channels': ['INSERT', 'UPDATE'],
  'public.user_notification_topics': ['INSERT', 'UPDATE'],
};

function withoutConvertedPatientWrites(
  tableKey: string,
  grants: readonly Extract<RelationAccess, { kind: 'direct' }>['grants'][number][],
): Extract<RelationAccess, { kind: 'direct' }>['grants'] {
  const converted = new Set(REV10_PATIENT_NAMED_WRITE_OPERATIONS[tableKey] ?? []);
  if (converted.size === 0) return [...grants];
  return grants.flatMap((grant) => {
    if (grant.role !== 'app_patient') return [grant];
    const operations = grant.operations.filter((operation) => !converted.has(operation));
    return operations.length > 0 ? [{ ...grant, operations }] : [];
  });
}

const REV10_SYSTEM_DIRECT_ACCESS: Record<string, DirectAccessSeed> = {
  'public.admin_audit_log': {
    kind: 'direct',
    purpose: 'platform operations reads and appends the non-clinical administrative event journal; '
      + 'the clinic billing role appends only its own organization row when the clinic owner changes tariff',
    codePaths: [
      'apps/webapp/src/infra/adminAuditLog.ts#listAdminAuditLog',
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts#appendAudit',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts#appendManualAssignmentAudit',
    ],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: [
        'id', 'actor_id', 'action', 'target_id', 'conflict_key', 'details', 'status', 'repeat_count',
        'last_seen_at', 'resolved_at', 'created_at',
      ] },
      { role: 'app_platform_settings', operations: ['INSERT'], columns: [
        'id', 'organization_id', 'actor_id', 'action', 'target_id', 'conflict_key', 'details', 'status',
        'repeat_count', 'last_seen_at', 'resolved_at', 'created_at',
      ] },
      // Стена `platform-role+clinic` уже объявляет: org-строки живут под стеной клиники. Владелец
      // клиники меняет тариф под ролью app_clinic_billing, и тот же путь обязан записать «кто что
      // сделал». Даём ТОЛЬКО INSERT: читать журнал арендатор по-прежнему не может, править и удалять
      // записи — тоже. Колонки перечислены все, потому что drizzle именует в INSERT каждую колонку
      // таблицы (включая DEFAULT-ные), а PostgreSQL проверяет привилегию на каждую названную.
      { role: 'app_clinic_billing', operations: ['INSERT'], columns: [
        'id', 'organization_id', 'actor_id', 'action', 'target_id', 'conflict_key', 'details', 'status',
        'repeat_count', 'last_seen_at', 'resolved_at', 'created_at',
      ] },
    ],
  },
  'public.be_organizations': {
    kind: 'direct', purpose: 'platform operations reads the clinic registry and changes only its assigned tariff',
    codePaths: [
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts',
    ],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: ['tariff_id', 'updated_at'] },
    ],
  },
  'public.be_branches': {
    kind: 'direct', purpose: 'platform operations reads the non-clinical clinic branch catalog',
    codePaths: ['apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'],
    grants: [{ role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' }],
  },
  'public.be_clinic_services': {
    kind: 'direct', purpose: 'platform operations reads the non-clinical clinic service catalog',
    codePaths: ['apps/webapp/src/infra/repos/pgBookingEngine.ts'],
    grants: [{ role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' }],
  },
  'public.saas_org_entitlement_overrides': {
    kind: 'direct', purpose: 'platform operations manages explicit commercial overrides for a clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'], columns: [
        'created_at', 'enabled', 'expires_at', 'id', 'mechanic', 'organization_id', 'quota',
        'seat_limit_override', 'updated_at',
      ] },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: [
        'enabled', 'expires_at', 'quota', 'seat_limit_override', 'updated_at',
      ] },
      { role: 'app_platform_settings', operations: ['DELETE'], columns: 'table' },
    ],
  },
  'public.saas_organization_trials': {
    kind: 'direct', purpose: 'platform operations reads and starts the one-time commercial trial for a clinic',
    codePaths: [
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts',
      'apps/webapp/src/infra/repos/pgSaasBilling.ts',
    ],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'], columns: [
        'id', 'organization_id', 'tariff_id', 'started_at', 'ends_at', 'discount_ends_at',
        'post_trial_behavior', 'post_trial_tariff_id', 'status', 'created_by', 'created_at',
        'updated_at',
      ] },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: [
        'discount_ends_at', 'ends_at', 'post_trial_behavior', 'post_trial_tariff_id', 'status',
        'tariff_id', 'updated_at',
      ] },
    ],
  },
  'public.saas_trial_policy': {
    kind: 'direct', purpose: 'platform operations manages the singleton trial policy',
    codePaths: ['apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'], columns: [
        'discount_window_days', 'duration_days', 'is_active', 'key', 'post_trial_behavior',
        'post_trial_tariff_id', 'start_event', 'created_at', 'updated_at', 'updated_by',
      ] },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: [
        'discount_window_days', 'duration_days', 'is_active', 'post_trial_behavior',
        'post_trial_tariff_id', 'start_event', 'updated_at', 'updated_by',
      ] },
    ],
  },
  'public.saas_registration_tariff_policy': {
    kind: 'direct', purpose: 'platform operations manages the singleton registration tariff policy',
    codePaths: ['apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'],
    grants: [
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'], columns: [
        'key', 'tariff_id', 'created_at', 'updated_at', 'updated_by',
      ] },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: [
        'tariff_id', 'updated_at', 'updated_by',
      ] },
    ],
  },
  'public.content_pages': {
    kind: 'direct', purpose: 'patient reads published non-archived CMS pages of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgContentPages.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.content_section_slug_history': {
    kind: 'direct', purpose: 'patient resolves renamed section links inside the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgContentSections.ts#getRedirectNewSlugForOldSlug'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: ['new_slug', 'old_slug', 'organization_id'] }],
  },
  'public.content_sections': {
    kind: 'direct', purpose: 'patient reads visible CMS navigation sections of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgContentSections.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.courses': {
    kind: 'direct', purpose: 'patient reads only courses assigned through its own treatment program',
    codePaths: ['apps/webapp/src/infra/repos/pgCourses.ts#listPublished'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.lfk_complexes': {
    kind: 'direct', purpose: 'patient reads only its own assigned exercise complexes in the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgLfkDiary.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.material_ratings': {
    kind: 'direct', purpose: 'patient manages only its own row; current-clinic aggregates use one named root',
    codePaths: ['apps/webapp/src/infra/repos/pgMaterialRating.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'],
        columns: ['organization_id', 'stars', 'target_id', 'target_kind', 'user_id'] },
    ],
  },
  'public.patient_content_rating_feedback': {
    kind: 'direct', purpose: 'patient writes feedback only for itself inside the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgMaterialRatingFeedback.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: ['id'] },
    ],
  },
  'public.patient_home_block_items': {
    kind: 'direct', purpose: 'patient reads only visible home items of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.patient_home_blocks': {
    kind: 'direct', purpose: 'patient reads only visible home blocks of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.reminder_rules': {
    kind: 'direct', purpose: 'patient reads and manages only its own reminder rules in the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgReminderRules.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.reminder_journal': {
    kind: 'direct', purpose: 'patient reads and records actions only for its own reminder rules',
    codePaths: ['apps/webapp/src/infra/repos/pgReminderJournal.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.reminder_occurrence_history': {
    kind: 'direct',
    purpose: 'patient reads its own reminder history across clinic contexts and advances only its own seen cursor',
    codePaths: ['apps/webapp/src/infra/repos/pgReminderProjection.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.support_conversation_messages': {
    kind: 'direct', purpose: 'patient reads its own support thread, sends messages and marks only those messages read',
    codePaths: ['apps/webapp/src/infra/repos/pgSupportCommunication.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.support_conversations': {
    kind: 'direct', purpose: 'patient reads and creates only its own current-clinic support conversation',
    codePaths: ['apps/webapp/src/infra/repos/pgSupportCommunication.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.symptom_entries': {
    kind: 'direct', purpose: 'patient reads and manages only its own symptom and wellbeing entries',
    codePaths: ['apps/webapp/src/infra/repos/pgSymptomDiary.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.symptom_trackings': {
    kind: 'direct', purpose: 'patient reads and manages only its own symptom trackers in the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgSymptomDiary.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.treatment_program_instances': {
    kind: 'direct', purpose: 'patient reads only its own assigned treatment programs in the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.treatment_program_instance_stages': {
    kind: 'direct', purpose: 'patient reads and advances only stages of its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.treatment_program_instance_stage_items': {
    kind: 'direct', purpose: 'patient reads and records progress only on items of its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.treatment_program_instance_stage_groups': {
    kind: 'direct', purpose: 'patient reads grouping of items in its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.treatment_program_events': {
    kind: 'direct', purpose: 'patient reads and appends audit events only for its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramEvents.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.program_action_log': {
    kind: 'direct', purpose: 'patient reads and records actions only for its own current-clinic program items',
    codePaths: ['apps/webapp/src/infra/repos/pgProgramActionLog.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.test_attempts': {
    kind: 'direct', purpose: 'patient reads and submits test attempts only through items of its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.test_results': {
    kind: 'direct', purpose: 'patient reads and records results only for attempts in its own current-clinic program',
    codePaths: ['apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.program_item_discussion_messages': {
    kind: 'direct', purpose: 'patient reads and sends messages only in discussion of its own current-clinic program item',
    codePaths: ['apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.program_item_discussion_reads': {
    kind: 'direct', purpose: 'patient reads and advances only its own discussion cursor in the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.reference_categories': {
    kind: 'direct',
    purpose: 'patients and clinic staff read the complete reference-category catalog of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgReferences.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.reference_items': {
    kind: 'direct',
    purpose: 'patients read and clinic staff manages the complete reference-item catalog of the current clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgReferences.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.user_contacts': {
    kind: 'direct', purpose: 'patient reads only its own normalized contacts used by account and session resolution',
    codePaths: [
      'apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts',
      'apps/webapp/src/infra/repos/pgUserByPhone.ts#loadSessionIdentityUser',
    ],
    grants: [{ role: 'app_patient', operations: ['SELECT'],
      columns: ['id', 'platform_user_id', 'contact_kind', 'value_normalized', 'is_primary',
        'confirmed_at', 'source_origin', 'created_at'] }],
  },
  'public.user_identity': {
    kind: 'direct', purpose: 'patient reads only its own canonical identity used by account and session resolution',
    codePaths: [
      'apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts',
      'apps/webapp/src/infra/repos/pgUserByPhone.ts#loadSessionIdentityUser',
    ],
    grants: [{ role: 'app_patient', operations: ['SELECT'],
      columns: ['platform_user_id', 'display_name', 'first_name', 'last_name', 'patronymic'] }],
  },
  'public.app_runtime_settings': {
    kind: 'direct',
    purpose: 'patients read safe global/current-clinic runtime values; clinic staff manages current-clinic rows; platform settings manages global rows',
    codePaths: [
      'apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts',
      'apps/webapp/src/modules/system-settings/service.ts',
    ],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
      { role: 'app_staff', operations: ['SELECT'], columns: 'table' },
      { role: 'app_staff', operations: ['INSERT'],
        columns: ['key', 'scope', 'organization_id', 'audience', 'value_json', 'updated_at', 'updated_by'] },
      { role: 'app_staff', operations: ['UPDATE'],
        columns: ['audience', 'value_json', 'updated_at', 'updated_by'] },
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'],
        columns: ['key', 'scope', 'organization_id', 'audience', 'value_json', 'updated_at', 'updated_by'] },
      { role: 'app_platform_settings', operations: ['UPDATE'],
        columns: ['audience', 'value_json', 'updated_at', 'updated_by'] },
    ],
  },
  'public.platform_users': {
    kind: 'direct',
    purpose: 'identity-self reads own account and controls only its own timezone and reminder mute; clinic staff reads current-clinic members; platform settings reads them for global administration',
    codePaths: [
      'apps/webapp/src/infra/repos/pgUserProjection.ts#getProfileEmailFields',
      'apps/webapp/src/infra/repos/pgUserByPhone.ts#loadSessionIdentityUser',
      'apps/webapp/src/infra/repos/pgPlatformUserCalendarTimezone.ts',
      'apps/webapp/src/infra/repos/pgReminderRules.ts#setReminderMutedUntil',
      'apps/webapp/src/infra/repos/pgDoctorClients.ts#isClientMessagingBlocked',
      'apps/webapp/src/app/app/account/page.tsx',
    ],
    grants: [
      { role: 'app_patient', operations: ['SELECT'],
        columns: ['id', 'email', 'email_verified_at', 'calendar_timezone', 'integrator_user_id',
          'merged_into_id', 'display_name', 'role', 'session_epoch', 'is_archived',
          'is_blocked',
          'patient_phone_trust_at',
          'reminder_muted_until'] },
      { role: 'app_platform_settings', operations: ['SELECT'],
        columns: ['id', 'email', 'email_verified_at', 'calendar_timezone'] },
      { role: 'app_platform_settings', operations: ['UPDATE'], columns: ['calendar_timezone', 'updated_at'] },
    ],
  },
  'public.user_channel_bindings': {
    kind: 'direct',
    purpose: 'patient reads only its own messenger binding channel and creation time for account authentication settings',
    codePaths: ['apps/webapp/src/infra/repos/pgChannelPreferences.ts#getDefaultAuthOtpChannel'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'],
        columns: ['channel_code', 'created_at', 'external_id', 'user_id'] },
    ],
  },
  'public.user_web_push_subscriptions': {
    kind: 'direct',
    purpose: 'patient manages only its own browser push subscriptions',
    codePaths: [
      'apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts',
      'apps/webapp/src/app/api/patient/web-push/subscribe/route.ts',
      'apps/webapp/src/app/api/patient/web-push/unsubscribe/route.ts',
    ],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.user_channel_preferences': {
    kind: 'direct',
    purpose: 'patient reads and changes only its own channel preferences',
    codePaths: ['apps/webapp/src/infra/repos/pgChannelPreferences.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.user_notification_topics': {
    kind: 'direct',
    purpose: 'patient reads and changes only its own notification topic switches',
    codePaths: ['apps/webapp/src/infra/repos/pgPatientNotificationTopics.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.user_notification_topic_channels': {
    kind: 'direct',
    purpose: 'patient reads and changes only its own per-topic channel switches',
    codePaths: ['apps/webapp/src/infra/repos/pgTopicChannelPrefs.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ],
  },
  'public.user_phone_history': {
    kind: 'direct',
    purpose: 'patient reads only its own active phone-confirmation channel for account settings',
    codePaths: ['apps/webapp/src/infra/repos/pgChannelPreferences.ts#getDefaultAuthOtpChannel'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'],
        columns: ['confirming_channel', 'platform_user_id', 'valid_to'] },
    ],
  },
  'public.media_files': {
    kind: 'direct',
    purpose: 'the accepted media worker handles transcodes; patient reads current-clinic presentation media and only its own submissions',
    codePaths: [
      'apps/webapp/src/infra/repos/pgMediaWorkerControl.ts',
      'apps/webapp/src/infra/repos/pgOrgBranding.ts#selectRevision',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts#getMediaRowForPlayback',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts#getMediaPreviewS3KeyForRedirect',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts#getMediaRowForConfirm',
      'apps/webapp/src/infra/repos/s3MediaStorage.ts#getProgramSubmissionMediaStatusRow',
    ],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: [
        'available_qualities_json', 'created_at', 'display_name', 'hls_artifact_prefix',
        'hls_master_playlist_s3_key', 'id', 'mime_type', 'organization_id', 'original_name',
        'owner_kind', 'poster_s3_key', 'preview_md_key', 'preview_sm_key', 'preview_status', 's3_key',
        'size_bytes', 'source_height', 'source_width', 'standard_rendition_at', 'status',
        'stored_path', 'uploaded_by',
        'usage_purpose', 'video_delivery_override', 'video_duration_seconds',
        'video_processing_error', 'video_processing_status',
      ] },
      { role: 'app_operational_media_worker', operations: ['SELECT'], columns: 'table' },
      { role: 'app_operational_media_worker', operations: ['UPDATE', 'DELETE'], columns: 'table' },
    ],
  },
  'public.media_upload_sessions': {
    kind: 'direct',
    purpose: 'the accepted media housekeeping worker expires multipart sessions across clinics',
    codePaths: ['apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts'],
    grants: [
      { role: 'app_operational_media_worker', operations: ['SELECT', 'UPDATE', 'DELETE'], columns: 'table' },
    ],
  },
  'public.media_playback_stats_hourly': {
    kind: 'direct',
    purpose: 'the accepted media housekeeping worker deletes expired aggregate playback telemetry',
    codePaths: ['apps/webapp/src/app-layer/media/playbackStats.ts'],
    grants: [
      { role: 'app_operational_maintenance', operations: ['SELECT', 'DELETE'], columns: 'table' },
    ],
  },
  'public.media_hls_proxy_error_events': {
    kind: 'direct',
    purpose: 'expired HLS proxy diagnostics are swept only through the closed-list retention root',
    codePaths: ['apps/webapp/src/app-layer/media/hlsProxyErrorEvents.ts'],
      // Прямой DELETE арендной роли обслуживания здесь мёртв с рождения: единственная разрешающая
      // runtime-политика этой таблицы требует `app_staff` И принятую организацию, а у уборки всех
      // клиник организации нет и быть не должно. Уборка ходит корнем
      // `app.prune_retention_target(text,integer,boolean)`.
      grants: [],
  },
  'public.org_brand_revisions': {
    kind: 'direct', purpose: 'patient reads only the published brand revision of its active clinic',
    codePaths: ['apps/webapp/src/infra/repos/pgOrgBranding.ts#getPublishedRevision'],
    grants: [{ role: 'app_patient', operations: ['SELECT'], columns: 'table' }],
  },
  'public.media_playback_client_events': {
    kind: 'direct', purpose: 'patient appends playback failures only through the exact visibility-checked root',
    codePaths: ['apps/webapp/src/app-layer/media/playbackClientEvents.ts#recordPlaybackClientEvent'],
    grants: [],
  },
  'public.media_playback_user_video_first_resolve': {
    kind: 'direct', purpose: 'patient reads its own marker and records it only through the exact visibility-checked root',
    codePaths: ['apps/webapp/src/infra/repos/pgPlaybackUserVideoFirstResolve.ts'],
    grants: [
      { role: 'app_patient', operations: ['SELECT'], columns: ['media_id', 'user_id'] },
    ],
  },
  // `public.media_transcode_jobs` прямой поверхности БОЛЬШЕ НЕ ИМЕЕТ. Гранты
  // `app_operational_media_worker` стояли здесь с формулировкой «диспетчер забирает и завершает
  // межарендные работы», но были мертвы: единственная разрешающая политика этой роли на таблице
  // (`rev10_saas_org_dormant_p0_8_4`) собрана из арендаторских веток, обе зовут
  // `app.current_org_id()`, а та роль воркера не принимает и поднимает 42501 — то есть ни один
  // оператор под этой ролью не доходил до строки очереди. Убраны в миграции 0050 вместе с переводом диспетчера на
  // три корня шва `app_seam_patient_lfk_media_owner`; без прямых ролей генератор больше не рисует
  // на таблицу и саму неудовлетворимую политику. Доступ теперь целиком `named-seams`.
  'public.operator_job_status': {
    kind: 'direct',
    purpose: 'the accepted webapp worker records and reads scheduler health ticks',
    codePaths: [
      'apps/webapp/src/infra/repos/pgOperatorHealthRead.ts',
      'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts',
      'apps/webapp/src/infra/repos/pgOperatorHealthDigestRead.ts',
    ],
    grants: [
      { role: 'app_worker', operations: ['SELECT'], columns: 'table' },
      { role: 'app_worker', operations: ['INSERT'], columns: [
        'job_key', 'job_family', 'last_status', 'last_started_at', 'last_finished_at',
        'last_success_at', 'last_failure_at', 'last_duration_ms', 'last_error', 'meta_json',
      ] },
      { role: 'app_worker', operations: ['UPDATE'], columns: [
        'job_family', 'last_status', 'last_started_at', 'last_finished_at', 'last_success_at',
        'last_failure_at', 'last_duration_ms', 'last_error', 'meta_json',
      ] },
    ],
  },
  'public.operator_incidents': {
    kind: 'direct',
    purpose: 'the accepted health worker reads and advances only the operator incident lifecycle',
    codePaths: ['apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts', 'apps/webapp/src/infra/repos/pgOperatorHealthRead.ts'],
    grants: [
      { role: 'app_worker', operations: ['SELECT'], columns: 'table' },
      // Поколоночного INSERT у рабочей роли больше нет: drizzle перечислял в INSERT ВСЕ колонки
      // таблицы и упирался в те десять, которых роли не выдавали (замер 19.08 на TEST:
      // `42501 permission denied for table operator_incidents`, повтор каждые пять минут).
      // Открытие инцидента переехало на объявленный корень
      // `app.open_or_touch_operator_critical_incident(...)` — второго пути к той же записи не
      // оставлено. UPDATE-путь каденции (claim/complete/release/resolve) остаётся реляционным:
      // он трогает только выданные колонки уже открытой строки.
      { role: 'app_worker', operations: ['UPDATE'], columns: [
        'last_seen_at', 'occurrence_count', 'error_detail', 'alert_sent_at', 'resolved_at',
        'initial_alert_sent_at', 'one_hour_alert_sent_at', 'alert_claim_phase', 'alert_claim_token',
        'alert_claimed_at',
      ] },
    ],
  },
  'public.product_analytics_events_recent': {
    kind: 'direct',
    purpose: 'expired recent product events are swept only through the closed-list retention root',
    codePaths: ['apps/webapp/src/infra/repos/pgProductAnalytics.ts#purgeRecentOlderThan'],
      // Прямой DELETE арендной роли обслуживания здесь мёртв с рождения: единственная разрешающая
      // runtime-политика этой таблицы требует `app_staff` И принятую организацию, а у уборки всех
      // клиник организации нет и быть не должно. Уборка ходит корнем
      // `app.prune_retention_target(text,integer,boolean)`.
      grants: [],
  },
  'public.product_analytics_user_hourly': {
    kind: 'direct',
    purpose: 'expired per-user analytics aggregates are swept only through the closed-list retention root',
    codePaths: ['apps/webapp/src/infra/repos/pgProductAnalytics.ts#purgeUserHourlyOlderThan'],
      // Прямой DELETE арендной роли обслуживания здесь мёртв с рождения: единственная разрешающая
      // runtime-политика этой таблицы требует `app_staff` И принятую организацию, а у уборки всех
      // клиник организации нет и быть не должно. Уборка ходит корнем
      // `app.prune_retention_target(text,integer,boolean)`.
      grants: [],
  },
  'public.product_analytics_hourly': {
    kind: 'direct',
    purpose: 'the accepted housekeeping worker deletes expired anonymous analytics aggregates',
    codePaths: ['apps/webapp/src/infra/repos/pgProductAnalytics.ts#purgeHourlyOlderThan'],
    grants: [
      { role: 'app_operational_maintenance', operations: ['SELECT', 'DELETE'], columns: 'table' },
    ],
  },
  'public.product_push_notifications': {
    kind: 'direct',
    purpose: 'expired push analytics correlation rows are swept only through the closed-list retention root',
    codePaths: ['apps/webapp/src/infra/repos/pgProductAnalytics.ts#purgePushNotificationsOlderThan'],
      // Прямой DELETE арендной роли обслуживания здесь мёртв с рождения: единственная разрешающая
      // runtime-политика этой таблицы требует `app_staff` И принятую организацию, а у уборки всех
      // клиник организации нет и быть не должно. Уборка ходит корнем
      // `app.prune_retention_target(text,integer,boolean)`.
      grants: [],
  },
  'public.outgoing_delivery_queue': {
    kind: 'direct',
    purpose: 'the accepted operational delivery worker claims and finishes cross-tenant queue rows',
    codePaths: ['apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts'],
    grants: [
      { role: 'app_operational_delivery_worker', operations: ['SELECT'], columns: 'table' },
      { role: 'app_operational_delivery_worker', operations: ['UPDATE'], columns: [
        'status', 'reclaim_count', 'next_retry_at', 'dead_at', 'failure_class', 'last_error',
        'updated_at', 'attempt_count', 'last_attempt_at', 'sent_at', 'payload_json',
      ] },
    ],
  },
  'public.system_settings': {
    kind: 'direct',
    purpose: 'clinic staff manages its own settings and consumes global doctor defaults; platform settings manages only global rows; the accepted webapp worker reads only fixed global health keys',
    codePaths: [
      'apps/webapp/src/infra/repos/pgSystemSettings.ts',
      'apps/webapp/src/app/app/settings/page.tsx',
      'apps/webapp/src/app-layer/health/runOperatorHealthDigestTick.ts',
      'apps/webapp/src/app-layer/health/collectOperatorHealthDigestInput.ts',
      'apps/webapp/src/app-layer/health/deliveryHeartbeatObserver.ts',
      'apps/webapp/src/app-layer/operator-alerts/reportEmptyNotificationAudience.ts',
    ],
    grants: [
      { role: 'app_staff', operations: ['SELECT'], columns: 'table' },
      { role: 'app_staff', operations: ['INSERT'],
        columns: ['key', 'scope', 'organization_id', 'value_json', 'updated_at', 'updated_by'] },
      { role: 'app_staff', operations: ['UPDATE'], columns: ['value_json', 'updated_at', 'updated_by'] },
      { role: 'app_staff', operations: ['DELETE'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'],
        columns: ['key', 'scope', 'organization_id', 'value_json', 'updated_at', 'updated_by'] },
      { role: 'app_platform_settings', operations: ['UPDATE'],
        columns: ['value_json', 'updated_at', 'updated_by'] },
      { role: 'app_platform_settings', operations: ['DELETE'], columns: 'table' },
      { role: 'app_worker', operations: ['SELECT'],
        columns: ['key', 'scope', 'organization_id', 'value_json', 'updated_at', 'updated_by'] },
    ],
  },
  'public.operator_health_failure_archive': {
    kind: 'direct', purpose: 'clinic staff handles only its own archive rows; retention and platform access are sanitized through named seams',
    codePaths: ['apps/webapp/src/app/api/doctor/health-failure-archive/route.ts', 'apps/webapp/src/infra/repos/pgHealthFailureArchive.ts'],
    grants: [
      { role: 'app_staff', operations: ['SELECT', 'INSERT', 'DELETE'], columns: 'table' },
    ],
  },
  'integrator.projection_outbox': {
    kind: 'direct', purpose: 'enqueue projections in request transactions and drain them in the dedicated worker',
    codePaths: ['apps/integrator/src/infra/db/repos/projectionOutbox.ts', 'apps/integrator/src/infra/runtime/worker/projectionWorker.ts'],
    grants: [
      { role: 'app_integrator_request', operations: ['INSERT'],
        columns: ['event_type', 'idempotency_key', 'occurred_at', 'payload'] },
      { role: 'app_operational_delivery_worker', operations: ['SELECT'], columns: 'table' },
      { role: 'app_operational_delivery_worker', operations: ['UPDATE'],
        columns: ['status', 'updated_at', 'attempts_done', 'next_try_at', 'last_error'] },
    ],
  },
  'public.saas_billing_periods': {
    kind: 'direct', purpose: 'staff reads the billing-period catalog; platform operations alone maintain it',
    codePaths: ['apps/webapp/src/infra/repos/pgSaasBilling.ts', 'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'],
    grants: [
      { role: 'app_staff', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], columns: 'table' },
    ],
  },
  'public.saas_paid_period_policy': {
    kind: 'direct',
    purpose: 'clinic staff reads the active global post-payment rule needed to calculate its own cabinet access; platform settings alone maintains it',
    codePaths: [
      'apps/webapp/src/infra/repos/pgOrgEntitlements.ts',
      'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts',
    ],
    grants: [
      { role: 'app_clinic_billing', operations: ['SELECT'],
        columns: ['key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active'] },
      { role: 'app_staff', operations: ['SELECT'],
        columns: ['key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active'] },
      { role: 'app_platform_settings', operations: ['SELECT'], columns: 'table' },
      { role: 'app_platform_settings', operations: ['INSERT'],
        columns: ['key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active',
          'updated_by', 'created_at', 'updated_at'] },
      { role: 'app_platform_settings', operations: ['UPDATE'],
        columns: ['post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active',
          'updated_by', 'updated_at'] },
    ],
  },
  'public.system_settings_audit': {
    kind: 'direct', purpose: 'platform settings reads the global ledger; clinic staff may only append audit rows for its own organization',
    codePaths: ['apps/webapp/src/infra/repos/pgSystemSettings.ts'],
    grants: [
      { role: 'app_staff', operations: ['INSERT'], columns: [
        'key', 'scope', 'organization_id', 'old_value_json', 'new_value_json', 'changed_by', 'source',
      ] },
      { role: 'app_platform_settings', operations: ['SELECT', 'INSERT'], columns: 'table' },
    ],
  },
};

const REV10_NO_RUNTIME_ACCESS: Record<string, Extract<RelationAccess, { kind: 'no-runtime-surface' }>> = {
  'app.context_nonce_ledger': { kind: 'no-runtime-surface', purpose: 'obsolete custom signed-context nonce ledger replaced by app_ext accepted transaction contexts', evidence: [
    'node /home/dev/brain/tools/code-search.mjs "context nonce ledger runtime" --repo bcb: migrations and the retired custom protocol only',
    'deploy/postgres/port-context/contract.sql uses app_ext.accepted_port_contexts instead',
  ] },
  'app.principal_context': { kind: 'no-runtime-surface', purpose: 'obsolete session-row context replaced by transaction-bound app_ext.accepted_port_contexts', evidence: [
    'node /home/dev/brain/tools/code-search.mjs "principal_context runtime" --repo bcb: legacy migrations/tests only',
    'deploy/postgres/port-context/contract.sql installs accepted_port_contexts rows',
  ] },
  'drizzle.__drizzle_migrations': { kind: 'no-runtime-surface', purpose: 'Drizzle-owned migration ledger is used only by the migration process', evidence: [
    'apps/webapp runtime source reverse search has no reader/writer',
    'migration wrapper owns ledger access before runtime cutover',
  ] },
  'public.webapp_schema_migrations': { kind: 'no-runtime-surface', purpose: 'legacy webapp migration ledger is not a runtime product surface', evidence: [
    'node /home/dev/brain/tools/code-search.mjs "webapp_schema_migrations runtime" --repo bcb: migration history only',
    'runtime readiness uses the declared migration wrapper, not application ACL',
  ] },
};

function revision10RelationSeams(tableKey: string, dbName: string): NamedSeamAccess[] {
  const seams: NamedSeamAccess[] = [];
  for (const [regprocedure, fn] of Object.entries(REV10_CONTEXT.functions) as Array<[string, DeclaredFunction]>) {
    if (fn.databases && !fn.databases.includes(dbName)) continue;
    const surface = fn.relationSurfaces?.find((candidate) => candidate.relation === tableKey);
    if (!surface) continue;
    const invocation = fn.invocation ?? 'runtime';
    seams.push({
      regprocedure, owner: fn.owner, callers: invocation === 'runtime' ? [...fn.execute] : [], invocation,
      columns: [...surface.columns], operations: [...surface.operations],
      ...(surface.operationColumns ? { operationColumns: Object.fromEntries(
        Object.entries(surface.operationColumns).map(([operation, columns]) => [operation, [...columns]]),
      ) } : {}),
      ...(surface.tableOperations ? { tableOperations: [...surface.tableOperations] } : {}),
      purpose: `${fn.purpose}: ${tableKey}`,
    });
  }
  return seams.sort((a, b) => a.regprocedure.localeCompare(b.regprocedure));
}

function revision10RelationAccess(tableKey: string, dbName: string): RelationAccess {
  const seams = revision10RelationSeams(tableKey, dbName);
  const clinical = REV10_CLINICAL_ACCESS[tableKey];
  const systemDirect = REV10_SYSTEM_DIRECT_ACCESS[tableKey];
  const finalizeDirect = (seed: DirectAccessSeed): RelationAccess => {
    const grants = withoutConvertedPatientWrites(tableKey, seed.grants);
    if (grants.length > 0) return { ...seed, grants, seams };
    if (seams.length > 0) return {
      kind: 'named-seams', seams, purpose: `exact declared function surfaces for ${tableKey}`,
    };
    return { kind: 'unresolved', reason: 'converted direct writes lack an exact named seam', codePaths: seed.codePaths };
  };
  if (clinical?.kind === 'direct' && systemDirect) return finalizeDirect({
    kind: 'direct', purpose: `${clinical.purpose}; ${systemDirect.purpose}`,
    codePaths: [...new Set([...clinical.codePaths, ...systemDirect.codePaths])],
    grants: [...clinical.grants, ...systemDirect.grants],
  });
  if (clinical?.kind === 'direct') return finalizeDirect(clinical);
  if (clinical?.kind === 'no-runtime-surface') return clinical;
  if (systemDirect) return finalizeDirect(systemDirect);
  const noRuntime = REV10_NO_RUNTIME_ACCESS[tableKey];
  if (noRuntime) return noRuntime;
  if (seams.length > 0) return { kind: 'named-seams', seams, purpose: `exact declared function surfaces for ${tableKey}` };
  return { kind: 'unresolved', reason: 'no exact direct, seam, or exhaustive no-runtime proof', codePaths: [] };
}

function revision10TableGrants(access: RelationAccess): Record<string, GrantDecl> {
  if (access.kind === 'unresolved' || access.kind === 'no-runtime-surface') return {};
  const byRole = new Map<string, { privs: GrantDecl['privs']; reasons: Set<string> }>();
  const add = (role: string, operations: readonly Privilege[], columns: 'table' | readonly string[], why: string) => {
    const row = byRole.get(role) ?? { privs: [], reasons: new Set<string>() };
    row.reasons.add(why);
    for (const operation of operations) {
      const entry = columns === 'table' || operation === 'DELETE'
        ? operation
        : { kind: 'columns' as const, priv: operation, columns: [...columns].sort() };
      const serialized = JSON.stringify(entry);
      if (!row.privs.some((candidate) => JSON.stringify(candidate) === serialized)) row.privs.push(entry);
    }
    byRole.set(role, row);
  };
  if (access.kind === 'direct') {
    for (const grant of access.grants) add(grant.role, grant.operations, grant.columns, access.purpose);
  }
  for (const seam of access.kind === 'direct' ? access.seams : access.seams) {
    for (const operation of seam.operations) {
      add(
        seam.owner,
        [operation],
        seam.tableOperations?.includes(operation)
          ? 'table'
          : seam.operationColumns?.[operation] ?? seam.columns,
        seam.purpose,
      );
    }
  }
  return Object.fromEntries([...byRole.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([role, row]) => [role, {
    privs: row.privs, why: [...row.reasons].sort().join('; '),
  }]));
}

const REV10_CONTEXT_ROLE_CLASS = "CASE WHEN current_user = 'app_pre_session' THEN 'pre_session'::app.port_context_class WHEN current_user = 'app_patient' THEN 'patient'::app.port_context_class WHEN current_user IN ('app_integrator_request','app_integrator_resolver') THEN 'integrator'::app.port_context_class WHEN current_user = 'app_tenant_service' THEN 'tenant_service'::app.port_context_class WHEN current_user IN ('app_platform_settings','app_platform_admin','saas_telemetry_operator') THEN 'platform'::app.port_context_class WHEN current_user IN ('app_worker','app_operational_media_worker','app_operational_maintenance','app_operational_delivery_worker','app_operational_scheduler','app_service') THEN 'service'::app.port_context_class ELSE 'staff'::app.port_context_class END";
const REV10_EMPTY_TYPED_ARGS_HASH = "decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex')";

function revision10ContextGates(table: string, index: number, access: RelationAccess): PolicyDecl[] {
  const directRoles = access.kind === 'direct' ? [...new Set(access.grants.map((grant) => grant.role))].sort() : [];
  const ordinaryPredicate = `(SELECT app.require_accepted_context(current_user::name, current_user::name, ${REV10_CONTEXT_ROLE_CLASS}, 'relation', ${REV10_EMPTY_TYPED_ARGS_HASH}, NULL::regprocedure))`;
  const ordinaryDirectRoles = directRoles;
  const seams = access.kind === 'direct' || access.kind === 'named-seams' ? access.seams : [];
  const seamOwners = [...new Set(seams.map((seam) => seam.owner))].sort();
  const policies: PolicyDecl[] = [];
  if (ordinaryDirectRoles.length > 0 || access.kind === 'no-runtime-surface' || access.kind === 'unresolved') policies.push({
    name: `rev10_context_gate_${index + 1}`, as: 'RESTRICTIVE', cmd: 'ALL',
    to: ordinaryDirectRoles.length > 0 ? ordinaryDirectRoles : [...REV10_RUNTIME],
    using: ordinaryPredicate, withCheck: ordinaryPredicate,
    note: `accepted direct relation context for ${table}`,
  });
  // Named roots themselves enforce the exact role/purpose/argument tuple before
  // FORCE RLS. This policy only limits the physical table surface to their exact,
  // non-login owners; it deliberately does not reconstruct a weaker transcript.
  if (seamOwners.length > 0) policies.push({
    name: `rev10_named_root_owner_gate_${index + 1}`, as: 'RESTRICTIVE', cmd: 'ALL',
    to: seamOwners,
    using: seamOwners.map((owner) => `current_user = '${owner}'::name`).join(' OR '),
    withCheck: seamOwners.map((owner) => `current_user = '${owner}'::name`).join(' OR '),
    note: `exact named roots independently verify the installed accepted context for ${table}`,
  });
  return policies;
}

const REV10_PLATFORM_USER_COLUMN: Record<string, string> = {
  'public.platform_users': 'id',
  'public.user_channel_bindings': 'user_id',
  'public.user_channel_preferences': 'platform_user_id',
  'public.user_contacts': 'platform_user_id',
  'public.user_identity': 'platform_user_id',
  'public.user_notification_topic_channels': 'user_id',
  'public.user_notification_topics': 'user_id',
  'public.user_web_push_subscriptions': 'user_id',
};

/**
 * Exact tenant-service row walls.  These are deliberately independent from
 * the staff/patient policies: the integrator tenant port proves one current
 * organization, then every relation operation must prove D (direct org), M
 * (active staff OR patient enrollment), or P (an exact current-org parent).
 */
const REV10_TENANT_DIRECT_ORG = new Set([
  'integrator.user_reminder_occurrences',
  'public.be_appointment_staff_comments', 'public.be_appointments', 'public.be_organization_members',
  'public.be_organizations', 'public.be_package_usages', 'public.be_patient_booking_profiles',
  'public.be_patient_packages', 'public.be_patient_timeline_events', 'public.be_payment_history_events',
  'public.be_payment_intents', 'public.be_payments', 'public.broadcast_audit',
  'public.broadcast_audit_recipients', 'public.content_access_grants_webapp', 'public.doctor_notes',
  'public.doctor_patient_support', 'public.lfk_complexes', 'public.lfk_sessions', 'public.material_ratings',
  'public.media_files', 'public.media_upload_sessions', 'public.message_log',
  'public.notification_delivery_attempts', 'public.online_intake_requests', 'public.org_enrollments',
  'public.patient_bookings', 'public.patient_content_rating_feedback',
  'public.patient_daily_warmup_presentations', 'public.patient_daily_warmup_video_views',
  'public.patient_diary_day_snapshots', 'public.patient_lfk_assignments',
  'public.patient_practice_completions', 'public.product_analytics_events_recent',
  'public.platform_user_contacts', 'public.product_analytics_user_hourly', 'public.product_push_notifications',
  'public.program_action_log',
  'public.reminder_rules', 'public.specialist_tasks', 'public.support_conversation_messages',
  'public.support_conversations', 'public.support_delivery_events', 'public.support_question_messages',
  'public.support_questions', 'public.symptom_entries', 'public.symptom_trackings', 'public.test_attempts',
  'public.treatment_program_events', 'public.treatment_program_instance_stage_items',
  'public.treatment_program_instance_stages', 'public.treatment_program_instances',
  'public.user_phone_history',
]);

type TenantMembershipReference = { column: string; type: 'uuid' | 'text' };

const REV10_TENANT_MEMBERSHIP_BASE: Record<string, readonly TenantMembershipReference[]> = {
  'public.platform_users': [{ column: 'id', type: 'uuid' }],
  'public.user_channel_bindings': [{ column: 'user_id', type: 'uuid' }],
  'public.user_channel_preferences': [
    { column: 'user_id', type: 'text' }, { column: 'platform_user_id', type: 'uuid' },
  ],
  'public.user_contacts': [{ column: 'platform_user_id', type: 'uuid' }],
  'public.user_identity': [{ column: 'platform_user_id', type: 'uuid' }],
  'public.user_notification_topic_channels': [{ column: 'user_id', type: 'uuid' }],
  'public.user_notification_topics': [{ column: 'user_id', type: 'uuid' }],
  'public.user_web_push_subscriptions': [{ column: 'user_id', type: 'uuid' }],
};

const REV10_TENANT_MEMBERSHIP_WRITE: Record<string, Partial<Record<'INSERT' | 'UPDATE', readonly TenantMembershipReference[]>>> = {
  'public.be_appointment_staff_comments': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_appointments': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_patient_booking_profiles': {
    INSERT: [{ column: 'platform_user_id', type: 'uuid' }, { column: 'updated_by', type: 'uuid' }],
    UPDATE: [{ column: 'updated_by', type: 'uuid' }],
  },
  'public.be_patient_packages': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_patient_timeline_events': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_payment_history_events': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_payment_intents': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.be_payments': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.broadcast_audit_recipients': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.content_access_grants_webapp': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.doctor_notes': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.lfk_complexes': { UPDATE: [
    { column: 'user_id', type: 'text' }, { column: 'platform_user_id', type: 'uuid' },
  ] },
  'public.lfk_sessions': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.material_ratings': { INSERT: [{ column: 'user_id', type: 'uuid' }] },
  'public.media_files': { UPDATE: [{ column: 'uploaded_by', type: 'uuid' }] },
  'public.media_upload_sessions': { UPDATE: [{ column: 'owner_user_id', type: 'uuid' }] },
  'public.message_log': { UPDATE: [
    { column: 'user_id', type: 'text' }, { column: 'platform_user_id', type: 'uuid' },
  ] },
  'public.notification_delivery_attempts': { INSERT: [{ column: 'user_id', type: 'uuid' }] },
  'public.online_intake_requests': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.patient_bookings': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.patient_content_rating_feedback': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.patient_daily_warmup_presentations': { INSERT: [{ column: 'user_id', type: 'uuid' }] },
  'public.patient_daily_warmup_video_views': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.patient_diary_day_snapshots': { UPDATE: [{ column: 'platform_user_id', type: 'uuid' }] },
  'public.patient_lfk_assignments': { UPDATE: [{ column: 'patient_user_id', type: 'uuid' }] },
  'public.patient_practice_completions': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.product_analytics_events_recent': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.product_analytics_user_hourly': { INSERT: [{ column: 'user_id', type: 'uuid' }] },
  'public.product_push_notifications': { UPDATE: [{ column: 'user_id', type: 'uuid' }] },
  'public.program_action_log': { UPDATE: [{ column: 'patient_user_id', type: 'uuid' }] },
  'public.reminder_rules': {
    INSERT: [{ column: 'platform_user_id', type: 'uuid' }], UPDATE: [{ column: 'platform_user_id', type: 'uuid' }],
  },
  'public.specialist_tasks': { INSERT: [{ column: 'owner_user_id', type: 'uuid' }] },
  'public.support_conversations': {
    INSERT: [{ column: 'platform_user_id', type: 'uuid' }], UPDATE: [{ column: 'platform_user_id', type: 'uuid' }],
  },
  'public.symptom_entries': { UPDATE: [
    { column: 'user_id', type: 'text' }, { column: 'platform_user_id', type: 'uuid' },
  ] },
  'public.symptom_trackings': { UPDATE: [
    { column: 'user_id', type: 'text' }, { column: 'platform_user_id', type: 'uuid' },
  ] },
  'public.test_attempts': { UPDATE: [{ column: 'patient_user_id', type: 'uuid' }] },
  'public.treatment_program_events': { INSERT: [{ column: 'actor_id', type: 'uuid' }] },
  'public.treatment_program_instances': { UPDATE: [{ column: 'patient_user_id', type: 'uuid' }] },
  'public.user_phone_history': {
    INSERT: [{ column: 'platform_user_id', type: 'uuid' }], UPDATE: [{ column: 'platform_user_id', type: 'uuid' }],
  },
};

function revision10TenantOuterColumn(tableKey: string, column: string): string {
  const relationName = tableKey.split('.')[1];
  if (!relationName) throw new Error(`invalid qualified tenant relation ${tableKey}`);
  return `${relationName}.${column}`;
}

function revision10TenantMemberPredicate(tableKey: string, ref: TenantMembershipReference): string {
  const outerColumn = revision10TenantOuterColumn(tableKey, ref.column);
  const staffMatch = ref.type === 'uuid'
    ? `tenant_staff.platform_user_id = ${outerColumn}`
    : `tenant_staff.platform_user_id::text = ${outerColumn}`;
  const patientMatch = ref.type === 'uuid'
    ? `tenant_patient.platform_user_id = ${outerColumn}`
    : `tenant_patient.platform_user_id::text = ${outerColumn}`;
  return `(EXISTS (SELECT 1 FROM public.be_organization_members tenant_staff`
    + ` WHERE ${staffMatch} AND tenant_staff.organization_id = (SELECT app.current_org_id())`
    + ` AND tenant_staff.status = 'active')`
    + ` OR EXISTS (SELECT 1 FROM public.org_enrollments tenant_patient`
    + ` WHERE ${patientMatch} AND tenant_patient.organization_id = (SELECT app.current_org_id())`
    + ` AND tenant_patient.status = 'active'))`;
}

function revision10TenantMembershipPredicate(
  tableKey: string, refs: readonly TenantMembershipReference[], requireReference: boolean,
): string {
  const nonNull = refs.map((ref) => `${revision10TenantOuterColumn(tableKey, ref.column)} IS NOT NULL`).join(' OR ');
  const bounded = refs.map((ref) => {
    const outerColumn = revision10TenantOuterColumn(tableKey, ref.column);
    return `(${outerColumn} IS NULL OR ${revision10TenantMemberPredicate(tableKey, ref)})`;
  }).join(' AND ');
  return requireReference ? `((${nonNull}) AND ${bounded})` : `(${bounded})`;
}

function revision10TenantBasePredicate(tableKey: string): string {
  if (REV10_TENANT_DIRECT_ORG.has(tableKey)) {
    return tableKey === 'public.be_organizations'
      ? '(id = (SELECT app.current_org_id()))'
      : '(organization_id = (SELECT app.current_org_id()))';
  }
  const membership = REV10_TENANT_MEMBERSHIP_BASE[tableKey];
  if (membership) return revision10TenantMembershipPredicate(tableKey, membership, true);
  if (tableKey === 'public.be_patient_package_items') {
    return `(EXISTS (SELECT 1 FROM public.be_patient_packages tenant_package`
      + ` WHERE tenant_package.id = be_patient_package_items.patient_package_id`
      + ` AND tenant_package.organization_id = (SELECT app.current_org_id()))`
      + ` AND EXISTS (SELECT 1 FROM public.be_clinic_services tenant_service`
      + ` WHERE tenant_service.id = be_patient_package_items.service_id`
      + ` AND tenant_service.organization_id = (SELECT app.current_org_id())))`;
  }
  throw new Error(`missing tenant D/M/P base predicate for ${tableKey}`);
}

function revision10TenantParentWritePredicate(tableKey: string, operation: 'INSERT' | 'UPDATE'): string | undefined {
  const nullableParent = (column: string, expression: string) =>
    `(${revision10TenantOuterColumn(tableKey, column)} IS NULL OR ${expression})`;
  if (tableKey === 'public.support_conversation_messages') {
    return `EXISTS (SELECT 1 FROM public.support_conversations tenant_conversation`
      + ` WHERE tenant_conversation.id = support_conversation_messages.conversation_id`
      + ` AND tenant_conversation.organization_id = (SELECT app.current_org_id()))`;
  }
  if (tableKey === 'public.support_delivery_events' && operation === 'INSERT') {
    return nullableParent('conversation_message_id', `EXISTS (SELECT 1 FROM public.support_conversation_messages tenant_message`
      + ` JOIN public.support_conversations tenant_conversation ON tenant_conversation.id = tenant_message.conversation_id`
      + ` WHERE tenant_message.id = support_delivery_events.conversation_message_id`
      + ` AND tenant_conversation.organization_id = (SELECT app.current_org_id()))`);
  }
  if (tableKey === 'public.support_question_messages' && operation === 'INSERT') {
    return `EXISTS (SELECT 1 FROM public.support_questions tenant_question`
      + ` JOIN public.support_conversations tenant_conversation ON tenant_conversation.id = tenant_question.conversation_id`
      + ` WHERE tenant_question.id = support_question_messages.question_id`
      + ` AND tenant_conversation.organization_id = (SELECT app.current_org_id()))`;
  }
  if (tableKey === 'public.support_questions') {
    return nullableParent('conversation_id', `EXISTS (SELECT 1 FROM public.support_conversations tenant_conversation`
      + ` WHERE tenant_conversation.id = support_questions.conversation_id`
      + ` AND tenant_conversation.organization_id = (SELECT app.current_org_id()))`);
  }
  if (tableKey === 'public.treatment_program_events' && operation === 'INSERT') {
    return `EXISTS (SELECT 1 FROM public.treatment_program_instances tenant_instance`
      + ` WHERE tenant_instance.id = treatment_program_events.instance_id`
      + ` AND tenant_instance.organization_id = (SELECT app.current_org_id()))`;
  }
  if (tableKey === 'public.program_action_log' && operation === 'UPDATE') {
    return `EXISTS (SELECT 1 FROM public.treatment_program_instances tenant_instance`
      + ` JOIN public.treatment_program_instance_stages tenant_stage ON tenant_stage.instance_id = tenant_instance.id`
      + ` JOIN public.treatment_program_instance_stage_items tenant_item ON tenant_item.stage_id = tenant_stage.id`
      + ` WHERE tenant_instance.id = program_action_log.instance_id`
      + ` AND tenant_item.id = program_action_log.instance_stage_item_id`
      + ` AND tenant_instance.organization_id = (SELECT app.current_org_id()))`;
  }
  if (tableKey === 'public.symptom_entries' && operation === 'UPDATE') {
    return `EXISTS (SELECT 1 FROM public.symptom_trackings tenant_tracking`
      + ` WHERE tenant_tracking.id = symptom_entries.tracking_id`
      + ` AND tenant_tracking.organization_id = (SELECT app.current_org_id()))`;
  }
  return undefined;
}

function revision10TenantPolicies(
  tableKey: string, index: number, access: Extract<RelationAccess, { kind: 'direct' }>,
): PolicyDecl[] {
  const operations = [...new Set(access.grants
    .filter((grant) => grant.role === 'app_tenant_service')
    .flatMap((grant) => grant.operations)
    .filter((operation): operation is 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' =>
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(operation)))].sort();
  return operations.map((operation) => {
    const base = revision10TenantBasePredicate(tableKey);
    const membershipRefs = operation === 'INSERT' || operation === 'UPDATE'
      ? REV10_TENANT_MEMBERSHIP_WRITE[tableKey]?.[operation]
      : undefined;
    const membershipCheck = membershipRefs
      ? revision10TenantMembershipPredicate(
        tableKey,
        membershipRefs,
        tableKey === 'public.reminder_occurrence_history' && operation === 'INSERT',
      )
      : undefined;
    const parentCheck = operation === 'INSERT' || operation === 'UPDATE'
      ? revision10TenantParentWritePredicate(tableKey, operation)
      : undefined;
    const withCheck = [base, membershipCheck, parentCheck].filter(Boolean).join(' AND ');
    return {
      name: `rev10_tenant_${operation.toLowerCase()}_${index + 1}`,
      as: 'PERMISSIVE', cmd: operation, to: ['app_tenant_service'],
      ...(operation === 'INSERT' ? {} : { using: base }),
      ...(operation === 'SELECT' || operation === 'DELETE' ? {} : { withCheck }),
      note: `exact tenant ${operation} D/M/P wall for ${tableKey}`,
    };
  });
}

const REV10_EXPLICIT_ORG_COLUMN = new Set([
  'public.operator_health_failure_archive',
  'public.be_organization_members', 'public.manual_patient_commands', 'public.org_brand_revisions',
  'public.organization_slug_claims', 'public.organization_slug_rename_events', 'public.patient_bookings',
  'public.product_analytics_hourly', 'public.saas_billing_accounts', 'public.saas_billing_invoices',
  'public.saas_billing_provider_events', 'public.saas_billing_refunds', 'public.saas_billing_subscriptions',
  'public.saas_org_entitlement_overrides', 'public.saas_organization_trials',
]);

function revision10DirectBusinessPredicate(tableKey: string, access: Extract<RelationAccess, { kind: 'direct' }>): string {
  const roles = [...new Set(access.grants.map((grant) => grant.role))].sort();
  const ordinaryRoles = roles.filter((role) => !['app_tenant_service'].includes(role));
  const rolePredicate = ordinaryRoles.length > 0
    ? ordinaryRoles.map((role) => `current_user = '${role}'::name`).join(' OR ')
    : 'false';
  if (tableKey === 'public.clinical_test_regions') return `(current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())`
    + ' AND EXISTS (SELECT 1 FROM public.tests parent_test WHERE parent_test.id = clinical_test_id AND parent_test.organization_id = (SELECT app.current_org_id()))'
    + ' AND EXISTS (SELECT 1 FROM public.reference_items parent_region WHERE parent_region.id = body_region_id AND parent_region.organization_id = (SELECT app.current_org_id())))';
  if (tableKey === 'public.be_appointment_staff_comments') return `(current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())`
    + ' AND EXISTS (SELECT 1 FROM public.be_appointments parent_appointment WHERE parent_appointment.id = appointment_id AND parent_appointment.organization_id = (SELECT app.current_org_id())))';
  if (tableKey === 'public.be_patient_booking_profiles') return "(current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id()))";
  if (tableKey === 'public.content_pages') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_patient'::name THEN organization_id = (SELECT app.current_org_id()) AND is_published = true AND archived_at IS NULL AND deleted_at IS NULL ELSE false END)";
  if (tableKey === 'public.content_sections') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_patient'::name THEN organization_id = (SELECT app.current_org_id()) AND is_visible = true ELSE false END)";
  if (tableKey === 'public.content_section_slug_history') return "(current_user IN ('app_staff'::name, 'app_patient'::name) AND organization_id = (SELECT app.current_org_id()))";
  if (tableKey === 'public.doctor_patient_support') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_patient'::name THEN organization_id = (SELECT app.current_org_id()) AND patient_user_id = app.current_patient_user_id() ELSE false END)";
  if (tableKey === 'public.reference_categories' || tableKey === 'public.reference_items') return "(current_user IN ('app_staff'::name, 'app_patient'::name) AND organization_id = (SELECT app.current_org_id()))";
  if (tableKey === 'public.reminder_occurrence_history') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_patient'::name THEN platform_user_id = app.current_patient_user_id() ELSE false END)";
  if (tableKey === 'public.support_conversations') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_patient'::name THEN platform_user_id = app.current_patient_user_id() AND (organization_id IS NULL OR organization_id = (SELECT app.current_org_id())) ELSE false END)";
  if (tableKey === 'public.be_organizations') return "(CASE WHEN current_user = 'app_platform_settings'::name THEN true WHEN current_user IN ('app_staff'::name, 'app_clinic_billing'::name) THEN id = (SELECT app.current_org_id()) ELSE false END)";
  if (tableKey === 'public.operator_health_failure_archive') return "((current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())) OR (current_user = 'app_platform_settings'::name AND organization_id IS NULL))";
  if (tableKey === 'public.system_settings_audit') return "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_platform_settings'::name THEN organization_id IS NULL ELSE false END)";
  if (
    REV10_EXPLICIT_ORG_COLUMN.has(tableKey)
    && PLATFORM_ROLE_SCOPE.mayTouch.includes(tableKey)
    && ordinaryRoles.includes('app_platform_settings')
  ) {
    const organizationBoundRoles = ordinaryRoles.filter((role) => role !== 'app_platform_settings');
    const organizationBoundPredicate = organizationBoundRoles.length > 0
      ? `current_user IN (${organizationBoundRoles.map((role) => `'${role}'::name`).join(', ')})`
      : 'false';
    return `(CASE WHEN current_user = 'app_platform_settings'::name THEN true WHEN ${organizationBoundPredicate} THEN organization_id = (SELECT app.current_org_id()) ELSE false END)`;
  }
  const platformUserColumn = REV10_PLATFORM_USER_COLUMN[tableKey];
  if (platformUserColumn) return `((${rolePredicate}) AND EXISTS (SELECT 1 FROM public.be_organization_members access_member`
    + ` WHERE access_member.platform_user_id = ${platformUserColumn} AND access_member.organization_id = (SELECT app.current_org_id()) AND access_member.status = 'active'))`;
  if (REV10_EXPLICIT_ORG_COLUMN.has(tableKey)) return `((${rolePredicate}) AND organization_id = (SELECT app.current_org_id()))`;
  return `(${rolePredicate})`;
}

function revision10CoursesPolicies(index: number): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientAssignment = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())"
    + ' AND app.current_patient_user_id() IS NOT NULL'
    + ' AND EXISTS (SELECT 1 FROM public.treatment_program_instances assigned_instance'
    + ' WHERE assigned_instance.organization_id = (SELECT app.current_org_id())'
    + ' AND assigned_instance.patient_user_id = app.current_patient_user_id()'
    + ' AND assigned_instance.template_id = courses.program_template_id)';
  return [
    { name: `rev10_courses_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff', 'app_patient'], using: `((${staffOrg}) OR (${patientAssignment}))`,
      note: 'staff reads clinic courses; patient reads only courses assigned in its own current-clinic program' },
    { name: `rev10_courses_staff_write_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_staff'], using: `(${staffOrg})`, withCheck: `(${staffOrg})`,
      note: 'only clinic staff mutates current-clinic courses' },
  ];
}

function revision10OrgBrandRevisionPolicies(index: number): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientPublished = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())"
    + " AND status = 'published' AND app.current_patient_has_active_org_enrollment(organization_id)";
  return [
    { name: `rev10_org_brand_revision_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff', 'app_patient'], using: `((${staffOrg}) OR (${patientPublished}))`,
      note: 'staff reads clinic brand history; patient reads only the published revision of its active clinic' },
    { name: `rev10_org_brand_revision_staff_write_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_staff'], using: `(${staffOrg})`, withCheck: `(${staffOrg})`,
      note: 'only clinic staff mutates current-clinic brand revisions' },
  ];
}

function revision10MediaFilesPolicies(index: number): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientMedia = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())"
    + " AND owner_kind = 'organization'"
    + " AND (usage_purpose IS DISTINCT FROM 'program_item_submission'"
    + ' OR uploaded_by = app.current_patient_user_id())';
  const worker = "current_user = 'app_operational_media_worker'::name";
  // Drizzle names EVERY column of the table in an INSERT, including the ones it sends as `default`,
  // and PostgreSQL checks the privilege on each named column — so the staff INSERT grant has to
  // cover the whole table or no staff upload can start at all. Seven of those columns are worker
  // output (`owner_kind` is the patient read discriminator); staff writes none of them anywhere in
  // the app. The grant is plumbing, this policy is the wall: a staff INSERT is accepted only while
  // those seven still carry their column default.
  // `standard_rendition_at` is on that list because the UI trusts it: it is the row's only fact
  // that the stored object is our encoder's output, and a raw upload is shown to nobody. If an
  // uploader could set it, the fact would be forgeable by the upload that it is meant to describe.
  const staffInsertDefaults = "current_user <> 'app_staff'::name"
    + " OR (owner_kind = 'organization'"
    + ' AND hls_master_playlist_s3_key IS NULL AND hls_artifact_prefix IS NULL'
    + ' AND poster_s3_key IS NULL AND video_duration_seconds IS NULL'
    + ' AND available_qualities_json IS NULL'
    + ' AND standard_rendition_at IS NULL)';
  return [
    { name: `rev10_media_files_staff_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_staff'], using: `(${staffOrg})`, withCheck: `(${staffOrg})`,
      note: 'clinic staff manages media only inside the current clinic' },
    { name: `rev10_media_files_staff_worker_columns_${index + 1}`, as: 'RESTRICTIVE', cmd: 'INSERT',
      to: ['app_staff'], withCheck: `(${staffInsertDefaults})`,
      note: 'staff creates media rows but never authors transcode output or the patient read discriminator' },
    { name: `rev10_media_files_patient_read_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_patient'], using: `(${patientMedia})`,
      note: 'patient reads current-clinic presentation media and only submissions uploaded by itself' },
    { name: `rev10_media_files_worker_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_operational_media_worker'], using: `(${worker})`, withCheck: `(${worker})`,
      note: 'accepted media worker processes media across clinics' },
  ];
}

function revision10PatientPlaybackTelemetryPolicies(
  tableKey: 'public.media_playback_client_events' | 'public.media_playback_user_video_first_resolve',
  index: number,
): PolicyDecl[] {
  const patientOwn = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())"
    + ' AND user_id = app.current_patient_user_id()';
  if (tableKey === 'public.media_playback_client_events') {
    return [{
      name: `rev10_playback_client_event_patient_insert_${index + 1}`,
      as: 'PERMISSIVE', cmd: 'INSERT', to: ['app_patient'], withCheck: `(${patientOwn})`,
      note: 'patient appends browser playback errors only for itself in the current clinic',
    }];
  }
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  return [{
    name: `rev10_playback_first_resolve_self_${index + 1}`,
    as: 'PERMISSIVE', cmd: 'ALL', to: ['app_staff', 'app_patient'],
    using: `((${staffOrg}) OR (${patientOwn}))`, withCheck: `((${staffOrg}) OR (${patientOwn}))`,
    note: 'staff stays in its clinic; patient reads and inserts only its own first-view marker',
  }];
}

function revision10MaterialRatingsPolicies(index: number): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientOrg = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())";
  const patientOwn = `${patientOrg} AND user_id = app.current_patient_user_id()`;
  return [
    { name: `rev10_material_ratings_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff', 'app_patient'], using: `((${staffOrg}) OR (${patientOwn}))`,
      note: 'staff reads clinic rows; patient direct reads remain self-only' },
    { name: `rev10_material_ratings_insert_${index + 1}`, as: 'PERMISSIVE', cmd: 'INSERT',
      to: ['app_staff', 'app_patient'], withCheck: `((${staffOrg}) OR (${patientOwn}))`,
      note: 'patient inserts only its own current-clinic rating' },
    { name: `rev10_material_ratings_update_${index + 1}`, as: 'PERMISSIVE', cmd: 'UPDATE',
      to: ['app_staff', 'app_patient'], using: `((${staffOrg}) OR (${patientOwn}))`,
      withCheck: `((${staffOrg}) OR (${patientOwn}))`,
      note: 'patient updates only its own current-clinic rating' },
    { name: `rev10_material_ratings_delete_${index + 1}`, as: 'PERMISSIVE', cmd: 'DELETE',
      to: ['app_staff'], using: `(${staffOrg})`, note: 'only clinic staff deletes clinic ratings' },
  ];
}

function revision10PatientRatingFeedbackPolicies(index: number): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientOwn = "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id())"
    + ' AND user_id = app.current_patient_user_id()';
  return [
    { name: `rev10_patient_rating_feedback_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff', 'app_patient'], using: `((${staffOrg}) OR (${patientOwn}))`,
      note: 'clinic staff reads clinic feedback; patient can return only its own inserted row id' },
    { name: `rev10_patient_rating_feedback_insert_${index + 1}`, as: 'PERMISSIVE', cmd: 'INSERT',
      to: ['app_staff', 'app_patient'], withCheck: `((${staffOrg}) OR (${patientOwn}))`,
      note: 'patient inserts feedback only for itself inside the accepted clinic context' },
  ];
}

function revision10PatientHomeCatalogPolicies(
  tableKey: 'public.patient_home_blocks' | 'public.patient_home_block_items',
  index: number,
): PolicyDecl[] {
  const staffOrg = "current_user = 'app_staff'::name AND organization_id = (SELECT app.current_org_id())";
  const patientVisible = tableKey === 'public.patient_home_blocks'
    ? "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id()) AND is_visible = true"
    : "current_user = 'app_patient'::name AND organization_id = (SELECT app.current_org_id()) AND is_visible = true"
      + ' AND EXISTS (SELECT 1 FROM public.patient_home_blocks parent_block'
      + ' WHERE parent_block.code = block_code AND parent_block.organization_id = (SELECT app.current_org_id())'
      + ' AND parent_block.is_visible = true)';
  return [{
    name: `rev10_patient_home_catalog_${index + 1}`,
    as: 'PERMISSIVE', cmd: 'ALL', to: ['app_staff', 'app_patient'],
    using: `((${staffOrg}) OR (${patientVisible}))`,
    withCheck: `(${staffOrg})`,
    note: `staff manages and patient only reads visible current-clinic rows of ${tableKey}`,
  }];
}

function revision10SystemSettingsPolicies(index: number): PolicyDecl[] {
  const readWall = "(CASE WHEN current_user = 'app_staff'::name THEN ((organization_id = (SELECT app.current_org_id())) OR (organization_id IS NULL AND scope = 'doctor')) WHEN current_user = 'app_platform_settings'::name THEN organization_id IS NULL WHEN current_user = 'app_worker'::name THEN organization_id IS NULL AND scope = 'admin' AND key IN ('operator_health_alert_config', 'admin_incident_alert_config', 'operator_health_projection_thresholds', 'operator_heartbeat_config') ELSE false END)";
  const writeWall = "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_platform_settings'::name THEN organization_id IS NULL ELSE false END)";
  return [
    { name: `rev10_system_settings_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff', 'app_platform_settings', 'app_worker'], using: readWall,
      note: 'staff sees its clinic rows and non-secret doctor defaults; platform settings sees global rows; worker sees only fixed global health keys' },
    { name: `rev10_system_settings_insert_${index + 1}`, as: 'PERMISSIVE', cmd: 'INSERT',
      to: ['app_staff', 'app_platform_settings'], withCheck: writeWall,
      note: 'staff writes only its clinic rows; platform settings writes only global rows' },
    { name: `rev10_system_settings_update_${index + 1}`, as: 'PERMISSIVE', cmd: 'UPDATE',
      to: ['app_staff', 'app_platform_settings'], using: writeWall,
      withCheck: writeWall,
      note: 'settings rows cannot cross the clinic/global ownership boundary on update' },
    { name: `rev10_system_settings_delete_${index + 1}`, as: 'PERMISSIVE', cmd: 'DELETE',
      to: ['app_staff', 'app_platform_settings'], using: writeWall,
      note: 'staff deletes only its clinic rows; platform settings deletes only global rows' },
  ];
}

function revision10AppRuntimeSettingsPolicies(index: number): PolicyDecl[] {
  const readWall = "(CASE WHEN current_user = 'app_patient'::name THEN audience IN ('public','authenticated_client') AND CASE WHEN organization_id IS NULL THEN true ELSE organization_id = (SELECT app.current_org_id()) END WHEN current_user = 'app_staff'::name THEN CASE WHEN organization_id IS NULL THEN true ELSE organization_id = (SELECT app.current_org_id()) END WHEN current_user = 'app_platform_settings'::name THEN organization_id IS NULL ELSE false END)";
  const writeWall = "(CASE WHEN current_user = 'app_staff'::name THEN organization_id = (SELECT app.current_org_id()) WHEN current_user = 'app_platform_settings'::name THEN organization_id IS NULL ELSE false END)";
  return [
    { name: `rev10_app_runtime_settings_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_patient', 'app_staff', 'app_platform_settings'], using: readWall,
      note: 'safe runtime values follow patient audience and clinic/global row ownership' },
    { name: `rev10_app_runtime_settings_insert_${index + 1}`, as: 'PERMISSIVE', cmd: 'INSERT',
      to: ['app_staff', 'app_platform_settings'], withCheck: writeWall,
      note: 'clinic staff writes current-clinic rows; platform settings writes global rows' },
    { name: `rev10_app_runtime_settings_update_${index + 1}`, as: 'PERMISSIVE', cmd: 'UPDATE',
      to: ['app_staff', 'app_platform_settings'], using: writeWall, withCheck: writeWall,
      note: 'runtime settings cannot cross the clinic/global ownership boundary' },
  ];
}

function revision10PlatformUsersPolicies(index: number): PolicyDecl[] {
  return [
    { name: `rev10_platform_users_patient_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_patient'], using: '(id = app.current_patient_user_id())',
      note: 'patient may read only its own explicitly granted profile columns' },
    { name: `rev10_platform_users_staff_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_staff'],
      using: '((EXISTS (SELECT 1 FROM public.be_organization_members access_member'
        + ' WHERE access_member.platform_user_id = platform_users.id'
        + ' AND access_member.organization_id = (SELECT app.current_org_id())'
        + " AND access_member.status = 'active'))"
        + ' OR (EXISTS (SELECT 1 FROM public.org_enrollments access_patient'
        + ' WHERE access_patient.platform_user_id = platform_users.id'
        + ' AND access_patient.organization_id = (SELECT app.current_org_id())'
        + " AND access_patient.status IN ('invited', 'active'))))",
      note: 'staff may read explicitly granted profile columns of current-clinic members and enrolled patients' },
    { name: `rev10_platform_users_platform_select_${index + 1}`, as: 'PERMISSIVE', cmd: 'SELECT',
      to: ['app_platform_settings'], using: "(current_user = 'app_platform_settings'::name)",
      note: 'platform administration may read explicitly granted non-clinical directory columns' },
    { name: `rev10_platform_users_account_timezone_update_${index + 1}`, as: 'PERMISSIVE', cmd: 'UPDATE',
      to: ['app_patient', 'app_staff', 'app_platform_settings'], using: '(id = app.current_actor_user_id())',
      withCheck: '(id = app.current_actor_user_id())',
      note: 'identity-self, staff and platform administration may update only their own account timezone' },
  ];
}

function revision10AdminAuditLogPolicies(index: number): PolicyDecl[] {
  const platformWall = "(current_user = 'app_platform_settings'::name)";
  return [
    {
      name: `rev10_admin_audit_platform_select_${index + 1}`,
      as: 'PERMISSIVE', cmd: 'SELECT', to: ['app_platform_settings'], using: platformWall,
      note: 'platform operations reads the administrative journal',
    },
    {
      name: `rev10_admin_audit_platform_insert_${index + 1}`,
      as: 'PERMISSIVE', cmd: 'INSERT', to: ['app_platform_settings'], withCheck: platformWall,
      note: 'platform commercial transactions append their audit rows directly in the same transaction',
    },
    {
      name: `rev10_admin_audit_clinic_insert_${index + 1}`,
      as: 'PERMISSIVE', cmd: 'INSERT', to: ['app_clinic_billing'],
      withCheck: "(current_user = 'app_clinic_billing'::name"
        + ' AND organization_id = (SELECT app.current_org_id()))',
      note: 'clinic billing appends only its own organization row; the NULL-organization platform '
        + 'branch stays unreachable for the tenant, and no SELECT/UPDATE/DELETE policy is added',
    },
  ];
}

const REV10_PATIENT_SELF_MANAGED_COLUMN: Record<string, string> = {
  'public.user_channel_bindings': 'user_id',
  'public.user_channel_preferences': 'platform_user_id',
  'public.user_contacts': 'platform_user_id',
  'public.user_identity': 'platform_user_id',
  'public.user_notification_topic_channels': 'user_id',
  'public.user_notification_topics': 'user_id',
  'public.user_phone_history': 'platform_user_id',
  'public.user_web_push_subscriptions': 'user_id',
};

function revision10PatientSelfManagedPolicies(tableKey: string, index: number): PolicyDecl[] {
  const relationName = tableKey.slice('public.'.length);
  const userColumn = REV10_PATIENT_SELF_MANAGED_COLUMN[tableKey];
  if (!userColumn) throw new Error(`missing patient self-managed column for ${tableKey}`);
  const patientWall = `(${userColumn} = app.current_patient_user_id())`;
  const staffWall = '((EXISTS (SELECT 1 FROM public.be_organization_members access_member'
    + ` WHERE access_member.platform_user_id = ${relationName}.${userColumn}`
    + ' AND access_member.organization_id = (SELECT app.current_org_id())'
    + " AND access_member.status = 'active'))"
    + ' OR (EXISTS (SELECT 1 FROM public.org_enrollments access_patient'
    + ` WHERE access_patient.platform_user_id = ${relationName}.${userColumn}`
    + ' AND access_patient.organization_id = (SELECT app.current_org_id())'
    + " AND access_patient.status IN ('invited', 'active'))))";
  return [
    { name: `rev10_patient_self_managed_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_patient'], using: patientWall, withCheck: patientWall,
      note: `patient manages only its own rows in ${tableKey}` },
    { name: `rev10_staff_member_managed_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL',
      to: ['app_staff'], using: staffWall, withCheck: staffWall,
      note: `staff manages ${tableKey} only for current-clinic members and enrolled patients` },
  ];
}

function revision10SeamOwnerPolicy(tableKey: string, index: number, access: RelationAccess): PolicyDecl[] {
  const seams = access.kind === 'direct' || access.kind === 'named-seams' ? access.seams : [];
  const owners = [...new Set(seams.map((seam) => seam.owner))].sort();
  if (owners.length === 0) return [];
  const predicate = owners.map((owner) => `current_user = '${owner}'::name`).join(' OR ');
  return [{ name: `rev10_seam_business_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL', to: owners,
    using: `(${predicate})`, withCheck: `(${predicate})`, note: `only declared narrow owners may reach ${tableKey}` }];
}

function revision10Database(name: 'bersoncarebot_test' | 'bcb_webapp_dev'): DatabaseDecl {
  const legacy = name === 'bersoncarebot_test' ? db_bersoncarebot_test : db_bcb_webapp_dev;
  const loginNames = Object.keys(REV10_ENV_MAPPING[name === 'bersoncarebot_test' ? 'test' : 'dev']);
  const known = new Set([...Object.keys(REV10_ROLES), ...loginNames, 'pg_database_owner']);
  const tables = Object.fromEntries(Object.entries(legacy.tables).map(([key, table], index) => {
    const active = table.disposition === 'ACTIVE';
    const access = active ? revision10RelationAccess(key, name) : undefined;
    const grants = access ? revision10TableGrants(access) : {};
    const explicitPolicies = (table.policies ?? []).filter((policy): policy is PolicyDecl => !('todo' in policy)
      && policy.to.every((role) => known.has(role) || role === 'PUBLIC'));
    const contextGates = access ? revision10ContextGates(key, index, access) : [];
    const locked = REV10_LOCKED_POLICIES.get(key);
    const directRoles = access?.kind === 'direct' ? [...new Set(access.grants.map((grant) => grant.role))].sort() : [];
    const ordinaryDirectRoles = directRoles.filter((role) =>
      !['app_tenant_service'].includes(role));
    const classSafe = (predicate: string, policyRoles: string[] = ordinaryDirectRoles) => {
      // Каждый вызов организационного аксессора в квале политики оборачивается в собственный
      // скалярный под-запрос: планировщик считает его один раз (InitPlan), а не на каждую строку.
      // Обёртка остаётся РОВНО на месте вызова — вынос её выше своей ветки CASE дал бы 42501 на
      // каждом чтении тем ролям, у которых организации нет.
      let result = predicate
        .replace(/(?<!\(SELECT )app\.current_org_id\(\)/gu, '(SELECT app.current_org_id())')
        .replaceAll('app.is_staff()', "current_user = 'app_staff'::name");
      if (table.org === true) result = result.replaceAll(
        '(app.current_patient_user_id() IS NOT NULL AND ',
        '(app.current_patient_user_id() IS NOT NULL AND "organization_id" = (SELECT app.current_org_id()) AND ');
      result = result.replaceAll('"b4f_appt"."platform_user_id" = app.current_patient_user_id()',
        '"b4f_appt"."organization_id" = (SELECT app.current_org_id()) AND "b4f_appt"."platform_user_id" = app.current_patient_user_id()');
      const hasPatientAccessor = result.includes('app.current_patient_user_id()');
      const hasSafeClassBranch = /CASE\s+WHEN\s+current_user/u.test(result);
      const staffPolicy = policyRoles.includes('app_staff');
      const patientPolicy = policyRoles.includes('app_patient');
      if (!hasPatientAccessor || hasSafeClassBranch || !staffPolicy) return result;
      const staffPredicate = result.replaceAll('app.current_patient_user_id()', 'NULL::uuid');
      if (!patientPolicy) return staffPredicate;
      return `(CASE WHEN current_user = 'app_staff'::name THEN (${staffPredicate})`
        + ` WHEN current_user = 'app_patient'::name THEN (${result}) ELSE false END)`;
    };
    const platformScoped = (predicate: string) => PLATFORM_ROLE_SCOPE.mayTouch.includes(key)
      ? `(current_user = 'app_platform_settings'::name OR (${predicate}))`
      : predicate;
    const specialized = new Set(['public.clinical_test_regions', 'public.be_appointment_staff_comments',
      'public.be_patient_booking_profiles', 'public.content_pages', 'public.content_sections',
      'public.content_section_slug_history', 'public.reference_categories', 'public.reference_items',
      'public.reminder_occurrence_history',
      'public.saas_org_entitlement_overrides', 'public.saas_organization_trials',
      'public.support_conversations']).has(key);
    const directBusiness: PolicyDecl[] = access?.kind === 'direct' && ordinaryDirectRoles.length > 0 ? [{
      name: `rev10_direct_business_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL', to: ordinaryDirectRoles,
      using: revision10DirectBusinessPredicate(key, access), withCheck: revision10DirectBusinessPredicate(key, access),
      note: `exact direct role business wall for ${key}`,
    }] : [];
    const runtimeBusinessBaseRaw: PolicyDecl[] = !active ? []
      : key === 'public.system_settings' && access?.kind === 'direct'
        ? revision10SystemSettingsPolicies(index)
      : key === 'public.app_runtime_settings' && access?.kind === 'direct'
        ? revision10AppRuntimeSettingsPolicies(index)
      : key === 'public.platform_users' && access?.kind === 'direct'
        ? revision10PlatformUsersPolicies(index)
      : key === 'public.admin_audit_log' && access?.kind === 'direct'
        ? revision10AdminAuditLogPolicies(index)
      : key === 'public.courses' && access?.kind === 'direct'
        ? revision10CoursesPolicies(index)
      : key === 'public.org_brand_revisions' && access?.kind === 'direct'
        ? revision10OrgBrandRevisionPolicies(index)
      : key === 'public.media_files' && access?.kind === 'direct'
        ? revision10MediaFilesPolicies(index)
      : (key === 'public.media_playback_client_events'
          || key === 'public.media_playback_user_video_first_resolve') && access?.kind === 'direct'
        ? revision10PatientPlaybackTelemetryPolicies(key, index)
      : key === 'public.material_ratings' && access?.kind === 'direct'
        ? revision10MaterialRatingsPolicies(index)
      : key === 'public.patient_content_rating_feedback' && access?.kind === 'direct'
        ? revision10PatientRatingFeedbackPolicies(index)
      : (key === 'public.patient_home_blocks' || key === 'public.patient_home_block_items')
          && access?.kind === 'direct'
        ? revision10PatientHomeCatalogPolicies(key, index)
      : REV10_PATIENT_SELF_MANAGED_COLUMN[key] && access?.kind === 'direct'
        ? revision10PatientSelfManagedPolicies(key, index)
      : access?.kind === 'direct' && specialized ? directBusiness
      : access?.kind === 'direct' && locked && ordinaryDirectRoles.length > 0 ? [{
        name: `rev10_${locked.policyName}`, as: 'PERMISSIVE', cmd: 'ALL', to: ordinaryDirectRoles,
        using: platformScoped(renderPhase4StrictPredicate(locked.descriptor)),
        withCheck: platformScoped(renderPhase4StrictPredicate(locked.descriptor)), note: `locked descriptor policy for ${key}`,
      }]
      : access?.kind === 'direct' && explicitPolicies.length > 0 && ordinaryDirectRoles.length > 0
        ? explicitPolicies.map((policy) => ({ ...policy, to: ordinaryDirectRoles }))
      : access?.kind === 'direct' ? directBusiness
      : [{ name: `rev10_fail_closed_${index + 1}`, as: 'PERMISSIVE', cmd: 'ALL', to: [...REV10_RUNTIME],
          using: 'false', withCheck: 'false', note: `no direct runtime relation surface for ${key}` }];
    const runtimeBusinessBase = runtimeBusinessBaseRaw.map((policy) => ({
      ...policy,
      ...(policy.using ? { using: classSafe(policy.using, policy.to) } : {}),
      ...(policy.withCheck ? { withCheck: classSafe(policy.withCheck, policy.to) } : {}),
    }));
    const tenantBusiness = access?.kind === 'direct' && directRoles.includes('app_tenant_service')
      ? revision10TenantPolicies(key, index, access)
      : [];
    const runtimeBusiness = [...runtimeBusinessBase, ...tenantBusiness];
    const seamBusiness = access ? revision10SeamOwnerPolicy(key, index, access) : [];
    return [key, {
      ...table, owner: 'app_object_owner', rls: table.disposition === 'ACTIVE' ? 'force' : 'n/a',
      grantMatrix: undefined, grants, policies: [...contextGates, ...runtimeBusiness, ...seamBusiness], access,
    }];
  }));
  const schemaUsage = (schema: string) => [...new Set(Object.entries(tables)
    .filter(([identity]) => identity.startsWith(`${schema}.`))
    .flatMap(([, table]) => Object.keys(table.grants ?? {})))].sort();
  return {
    ...legacy,
    database: { owner: 'postgres', connect: loginNames, publicConnectTempDefect: false },
    schemas: {
      app: { owner: 'app_object_owner', present: true,
        usage: [...new Set([...REV10_RUNTIME, ...REV10_SEAM_OWNERS, 'app_seam_context_owner', ...loginNames])].sort(),
        create: ['app_object_owner'] },
      app_ext: { owner: 'app_object_owner', present: true,
        usage: [
          'app_seam_context_owner',
          'app_seam_dedicated_bot_owner',
          'app_seam_identity_lookup_owner',
          'app_seam_password_auth_owner',
          'app_seam_patient_invite_owner',
        ],
        create: ['app_object_owner'] },
      public: { owner: 'app_object_owner', present: true, usage: schemaUsage('public'), create: ['app_object_owner'] },
      integrator: { owner: 'app_object_owner', present: true, usage: schemaUsage('integrator'), create: ['app_object_owner'] },
      drizzle: { owner: 'app_object_owner', present: true, usage: [], create: ['app_object_owner'] },
    },
    tables,
    sequences: { rule: 'all sequence ACL is exact and deny-by-default', examples: {} },
    functionsViews: { default: 'all views are SECURITY INVOKER; no undeclared view ACL', views: {} },
    definerExceptions: { defaults: { schema: 'app', securityDefiner: true, owner: 'app_object_owner',
      searchPath: ['search_path=pg_catalog, app, app_ext, pg_temp'], publicExecute: false, coveredCount: 0,
      rule: 'no SECURITY DEFINER function is allowed outside the exact portContext.functions census' },
    proconfigExceptions: {}, ownershipExceptions: { intentional: {}, drift: {} } },
    creators: ['postgres', 'app_object_owner', ...REV10_SEAM_OWNERS],
    orgTableAllowlist: { derivedFrom: 'tables[*].org === true', named: Object.keys(tables).filter((key) => tables[key].org === true).sort(),
      fullCountLive: Object.keys(tables).filter((key) => tables[key].org === true).length, todo: '' },
    dbSettings: { datdba: 'postgres', perRoleInDatabase: {} },
  } as DatabaseDecl;
}

/* ============================================================================================
 * СБОРКА
 * ========================================================================================== */

export const declaration: PrivilegeDeclaration = {
  ownerDecisions: OWNER_DECISIONS,
  acceptanceInvariant: ACCEPTANCE_INVARIANT,
  platformRoleScope: PLATFORM_ROLE_SCOPE,
  patientVisibility: PATIENT_VISIBILITY,
  referenceModel: REFERENCE_MODEL,
  ports: PORTS,
  wallTemplates: WALL_TEMPLATES,
  codeMustChange: CODE_MUST_CHANGE,
  ownerGatesOpen: OWNER_GATES_OPEN,
  cluster: {
    envs: ['test', 'dev'], // TEST + dev на одном общем PG16 :5432 (SCHEME §A); прод вне скоупа
    roles: REV10_ROLES,
  },
  zeroState: { legacyRoles: [
    'app_identity_bootstrap',
    'app_migrator',
    'app_operational_diagnostic',
    'app_operational_web_push_reminder',
    'app_owner',
    'app_phone_bind_completion',
    'app_web_push_reminder_discovery_definer',
    'app_bootstrap_base_c1_20260713021531',
    'app_runtime_login_c1_20260713021531',
    'bcb_dev',
    'bcb_dev_runtime_nonstaff_login',
    'bcb_dev_runtime_staff_login',
    'bcb_saas_diag_test',
    'bcb_saas_operator_dev',
    'bcb_saas_operator_test',
    'bcb_test_integrator_login',
    'bcb_test_maintenance_login',
    'bcb_test_nonstaff_login',
    'bcb_test_operational_delivery_login',
    'bcb_test_operational_diagnostic_login',
    'bcb_test_operational_media_login',
    'bcb_test_operational_scheduler_login',
    'bcb_test_operational_web_push_reminder_login',
    'bcb_test_staff_login',
    'bcb_test_worker_login',
    'bcb_webapp_dev_user',
    'bcb_webapp_prod',
    'bersoncarebot_test',
  ] },
  envMapping: REV10_ENV_MAPPING,
  databases: {
    bersoncarebot_test: revision10Database('bersoncarebot_test'),
    bcb_webapp_dev: revision10Database('bcb_webapp_dev'),
  },
  portContext: REV10_CONTEXT,
};

/* ============================================================================================
 * САМООПИСАНИЕ — считается ИЗ декларации, поэтому числа не могут разойтись с ней.
 * ========================================================================================== */

const allTables: TableDecl[] = Object.keys(APP_TABLES).map(
  (k: string): TableDecl => APP_TABLES[k] as TableDecl,
);

function countBy(pick: (t: TableDecl) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  allTables.forEach((t: TableDecl): void => {
    const key = pick(t);
    acc[key] = (acc[key] ?? 0) + 1;
  });
  return acc;
}

export const DECLARATION_STATS = {
  tablesClassified: allTables.length,
  withClassAndWall: allTables.filter((t: TableDecl) => t.disposition === 'ACTIVE').length,
  pendingRemoval: allTables.filter((t: TableDecl) => t.disposition === 'PENDING_REMOVAL').length,
  byClass: countBy((t: TableDecl): string => t.cls),
  byWall: countBy((t: TableDecl): string => t.wall),
  /** сколько строк отклоняются от стены своего класса — у каждой обязан быть wallWhy */
  wallDeviations: allTables.filter((t: TableDecl) => t.wallWhy !== undefined).length,
  orgTablesDeclared: allTables.filter((t: TableDecl) => t.org === true).length,
  tablesWithRevokes: allTables.filter((t: TableDecl) => t.revoke !== undefined).length,
  revokePairs: allTables.reduce((n: number, t: TableDecl) => n + Object.keys(t.revoke ?? {}).length, 0),
  grantMatrixPending: allTables.filter((t: TableDecl) => t.grantMatrix === 'G2-pending').length,
  codeChanges: CODE_MUST_CHANGE.length,
  openOwnerGates: OWNER_GATES_OPEN.length,
  /** пробелы, открытые в шапке файла */
  openGaps: ['G1', 'G2', 'G3', 'G8', 'G9', 'G10', 'G11'],
  resolvedGaps: ['G4', 'G5', 'G6', 'G7'],
} as const;

export default declaration;
