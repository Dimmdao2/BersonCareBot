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
import type {
  AcceptanceInvariant, CodeChange, DatabaseDecl, DefinerException, DefinerExceptionsSection, LoginRecord,
  OwnerDecision, OwnerGate, PatientVisibility, PlatformRoleScope, Port, PortSpec, PrivilegeDeclaration,
  ReferenceModel, RoleDecl, TableDecl, TableRow,
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
  { id: 'C7', becauseOf: 'D4-two-ports',
    what: 'media-worker — отдельное процессное семейство со своим DATABASE_URL (третий порт)',
    where: ['docs/_TODO/SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md:12-26'] },
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
    where: ['apps/webapp/src/infra/repos/pgEmailSetupFlowPort.ts (FACTS §11.7)',
      'apps/webapp/src/infra/repos/playbackUserVideoFirstResolve.ts:29-35 (И7)',
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
    what: 'сырой SQL по таблицам аутентификации минует полный definer-шов; декларация снимает рантайм-гранты с 13 '
      + 'таблиц Д1, и эти два вызова ломаются, пока не переедут на аксессоры',
    where: ['apps/webapp/src/infra/repos/pgEmailSetupFlowPort.ts:63',
      'apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:88'] },
  { id: 'C14', becauseOf: 'D2-patient-visibility',
    what: 'снять пациентские чтения служебного материала (staff-комментарии, booking-профиль) и перевести '
      + 'пациентскую ветку test_attempts/test_results на элемент программы',
    where: ['apps/webapp/src/infra/repos/pgClientHistory.ts',
      'deploy/postgres (пациентские ветки saas_org_dormant_* на трёх таблицах)'] },
  { id: 'C15', becauseOf: 'D3-reference-org-copy',
    what: 'у app_staff сегодня INSERT на clinical_test_measure_kinds (пул, который сам код называет глобальным) и '
      + 'полный CRUD на booking_cities — запись арендатора в шаблон запрещена',
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
    'клинические тесты с приёма: public.clinical_test_regions, public.clinical_test_measure_kinds — гранта нет '
      + 'и не будет; это объявленное КОНЕЧНОЕ состояние, а не пробел',
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
    logins: ['<env>_staff_login', '<env>_nonstaff_login', '<env>_maintenance_login'],
    reachedThrough: 'крон хоста → POST /api/internal/<job>/tick (Bearer INTERNAL_JOB_SECRET) → пул webapp с '
      + 'объявленной сервисной ролью.',
  },
  integrator: {
    process: 'apps/integrator (модуль доставки)',
    what: 'входящие вебхуки, исходящая доставка, тики планировщика и проекция. По формулировке владельца '
      + '(evidence/15) интегратор — модуль ДОСТАВКИ, а не хранилище пользовательских данных.',
    logins: ['<env>_integrator_login', '<env>_resolver_login'],
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
    bcb_test_operational_media_login: {
      port: 'webapp',
      mustFold: 'C7 — media-worker сегодня отдельное процессное семейство со своим DATABASE_URL',
      canonicalRole: 'app_operational_media_worker',
      membership: { role: 'app_operational_media_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_MEDIA', rolconfig: null, connect: ['bersoncarebot_test'],
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
      count: 4, why: 'владеет definer-функциями health-агрегации; BYPASSRLS-владелец (§I Р9)',
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
const W_PRINCIPAL_SEAM = 'шов принципала: ACL только у владельца, вход исключительно через definer-аксессоры';
const RLS_OFF_MIGRATOR_LEDGER = 'ЯВНО объявленное отсутствие RLS (SCHEME §A.4: \'off\' — объявленное '
  + 'отсутствие, а не молчание). Журнал мигратора читает и пишет сам мигратор, в том числе ВНЕ окна элевации '
  + '(шаг 0 цепочки сверяет max(created_at) против watermark), а FORCE RLS без политики закрыл бы таблицу и от '
  + 'её владельца — цепочка деплоя перестала бы работать. Стена здесь — НУЛЕВОЙ грант рантайм-ролям.';

const TABLE_ROWS: TableRow[] = [
  { t: 'app.context_nonce_ledger', cls: 'T', owner: 'app_owner', wall: 'definer-only', why: 'защита от повтора '
    + 'подписи — без неё подписанный контекст можно проиграть повторно', wallWhy: W_PRINCIPAL_SEAM,
    pol: 'I14: росла неограниченно (12,6 млн просроченных строк снято 08.08) — D8 даёт прунер '
    + 'app.prune_context_nonce_ledger под app_operational_maintenance, ежечасно (evidence/16)',
    defect: ['I1-definer-plus-force', 'I14-unbounded-growth'] },
  { t: 'app.context_signing_secrets', cls: 'T', owner: 'app_owner', wall: 'definer-only', why: 'HMAC-секрет подписи '
    + 'контекста — утечка = подделка принципала, т.е. обход всех стен разом', wallWhy: W_PRINCIPAL_SEAM,
    defect: ['I1-definer-plus-force'] },
  { t: 'app.principal_context', cls: 'T', owner: 'app_owner', wall: 'definer-only', why: '«кто сейчас в этой сессии» '
    + '— несущая деталь: без неё все RLS-предикаты видят NULL и вся база становится пустой',
    wallWhy: W_PRINCIPAL_SEAM, pol: 'пишет только app.install_signed_context, читают только context-аксессоры; без '
    + 'неё все предикаты видят NULL — отсюда требование D6 RAISE вместо NULL', defect: ['I1-definer-plus-force'] },
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
  { t: 'integrator.delivery_attempt_logs', cls: 'S', org: false, why: 'журнал попыток отправки — нельзя разобрать, '
    + 'почему письмо/СМС не ушло',
    revoke: { app_staff: 'D14/I16: payload_json — тело отправленного сообщения; I16(б) — не добавлять '
      + 'organization_id, а отозвать app_staff и ходить операционными ролями области NONE' },
    pol: 'ЕДИНСТВЕННАЯ таблица схемы integrator, где стена реально нужна (evidence/15 §14).',
    defect: ['D14-integrator-no-wall', 'I16-integrator-queues'] },
  { t: 'integrator.idempotency_keys', cls: 'S', org: false, why: 'ключи идемпотентности API — повтор вебхука '
    + 'начинает дублировать записи и отправки',
    revoke: { app_staff: 'D14: очередь дедупа вебхуков — не место арендной роли.' },
    pol: 'приоритет низкий: ПДн нет вовсе — опровергнуто замером (~225 живых строк, response_body=\'{}\' в 261 из '
    + '261). Стены клиники/пациента не требуется', defect: ['D14-integrator-no-wall'] },
  { t: 'integrator.identities', cls: 'P', why: 'связка «человек ↔ внешний аккаунт» — никто не узнаёт, чей это чат — '
    + 'весь вход в бота ломается', defect: ['D14-integrator-no-wall', 'D25-foundation-identities'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §10-11 — волна 3 (это и есть незакрытый фундамент D25)',
      blockedBy: 'горячий путь каждого вебхука; integrator.telegram_state держит FK — дропать только после её '
      + 'урезания. До сноса пять пациентских стен, построенных на EXISTS по этой таблице, остаются недействующими' } },
  { t: 'integrator.integration_data_quality_incidents', cls: 'S', org: false, why: 'инциденты качества внешней '
    + 'интеграции — не видно, что система прислала мусор',
    revoke: { app_staff: 'D14: raw_value может содержать исходное значение поля пациента или филиала.' },
    pol: 'по смыслу клиническая стена (инцидент принадлежит интеграции конкретной клиники), но organization_id нет; '
    + 'при 3 строках приоритет низкий (evidence/15 §19).', defect: ['D14-integrator-no-wall'] },
  { t: 'integrator.message_drafts', cls: 'P', org: true, why: 'черновик сообщения пациента в боте — пациент теряет '
    + 'набранный, но не отправленный текст', pol: 'D25: пациентская ветка построена на EXISTS по '
    + 'integrator.identities, у которой стены нет и которая СНОСИТСЯ — перевесить на public.user_channel_bindings',
    defect: ['D25-foundation-identities'] },
  { t: 'integrator.message_retry_jobs', cls: 'S', why: 'очередь повторной отправки сообщений — недоставленные '
    + 'SMS/сообщения не досылаются', defect: ['D14-integrator-no-wall'],
    drop: { verdict: 'DROP', source: 'evidence/15 §3 — волна 1; заменена public.outgoing_delivery_queue',
      blockedBy: '10 строк pending — не раньше 2026-08-29 17:00 MSK (живая работа, удаление = потерянное сообщение '
      + 'человеку)' } },
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
  { t: 'integrator.telegram_state', cls: 'P', org: false, wall: 'platform-role', why: 'состояние Telegram-диалога — '
    + 'бот теряет шаг диалога и настройки уведомлений', wallWhy: 'после урезания 7 колонок ПДн не остаётся — '
    + 'остаётся стена своей роли (evidence/15 §12)', pol: 'evidence/15 §12: ОСТАВИТЬ, урезав 7 колонок '
    + '(username/first_name/last_name + четыре notify_*/is_active) — после урезания таблица перестаёт нести ПДн и '
    + 'вопрос о стене снимается сам', defect: ['D14-integrator-no-wall'] },
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
  { t: 'integrator.users', cls: 'P', why: 'реестр пользователей интегратора — нет якоря, к которому цепляются '
    + 'идентичности, контакты и напоминания', defect: ['D14-integrator-no-wall'],
    drop: { verdict: 'MOVE+DROP', source: 'evidence/15 §10-11 — волна 3', blockedBy: 'горячий путь; зеркало '
      + 'public.platform_users.integrator_user_id / .merged_into_id' } },
  { t: 'public.admin_audit_log', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'журнал административных '
    + 'действий — пропадает разбор «кто что сделал» и авто-мерджи конфликтов', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.app_runtime_settings', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'настройки рантайма — '
    + 'сервис теряет управляемые из кабинета настройки', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.app_runtime_settings_audit', cls: 'S', org: true, wall: 'platform-role+clinic', why: 'кто и когда '
    + 'менял настройку — нельзя восстановить, кто сломал настройку', wallWhy: W_PLATFORM_OR_CLINIC },
  { t: 'public.appointment_records', cls: 'P', why: 'легаси-проекция записей на приём из Rubitime — ломается '
    + 'статистика и сверка со старым источником записей', defect: ['D15-appointment-records'],
    drop: { verdict: 'DUP-DROP (сначала перевести код)', source: 'evidence/18 §7 — 394/410 отображены в '
      + 'be_appointments, phone 394/394', blockedBy: 'шесть живых читателей (бот, админ интегратора, список врача) — '
      + 'перевести на be_appointments.phone_normalized. До сноса таблица стоит БЕЗ обеих стен (D15) и это '
      + 'единственный пункт списка, где ошибка видна пациенту' } },
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
  { t: 'public.be_external_entity_mappings', cls: 'C', org: true, why: 'сопоставление «наш id ↔ id внешней системы» '
    + '— рвётся связь с Rubitime/внешними системами, начинаются дубли' },
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
  { t: 'public.clinical_test_measure_kinds', cls: 'R', org: false, wall: 'reference-org-copy', why: 'Виды измерений '
    + 'для клинических тестов — единые подписи измерений в тестах', wallWhy: W_REF_COPY,
    revoke: { app_staff: 'D3+D21: арендная роль имеет INSERT в пул, который сам код называет глобальным '
      + '(measureKindCode.ts:1) — тенанту принадлежит его КОПИЯ, не шаблон' },
    defect: ['D21-reference-write'], code: ['C15'] },
  { t: 'public.clinical_test_regions', cls: 'C', org: true, why: 'Связка «клинический тест ↔ регион тела» — фильтр '
    + 'тестов по региону тела', pol: 'РЕШЕНИЕ D2: пациенту гранта НЕТ и не будет — клинические тесты с приёма ему не '
    + 'показываются. Объявленное КОНЕЧНОЕ состояние (закрывает О2), а не пробел' },
  { t: 'public.clinical_visit', cls: 'P', org: true, why: 'Клинический визит — приём как таковой: осмотр, '
    + 'манипуляции, рекомендации' },
  { t: 'public.comments', cls: 'P', org: true, why: 'Комментарии к сущностям — диалог врач↔пациент вокруг '
    + 'упражнений, тестов, программ', pol: 'D10: дизъюнкт target_type = '
    + 'ANY(exercise,test,test_set,recommendation,lesson) стоит БЕЗ условия и в USING, и в WITH CHECK — сотрудник '
    + 'клиники A правит комментарии клиники B', defect: ['D10-comments'] },
  { t: 'public.content_access_grants_webapp', cls: 'P', org: true, why: 'Выданные пациенту доступы к контенту — '
    + 'пациент теряет доступ к выданным ему материалам' },
  { t: 'public.content_pages', cls: 'C', org: true, why: 'Страницы CMS — контент, который читает пациент',
    pol: 'I5/C18: политика c4_web_push_reminder_catalog читает org сырым current_setting, остальные — '
    + 'app.current_org_id(). Свести к одному аксессору, иначе D6 обходится', defect: ['I5-two-org-accessors'],
    code: ['C18'] },
  { t: 'public.content_section_slug_history', cls: 'C', org: true, why: 'История переименований разделов — старые '
    + 'ссылки пациента не ломаются после переименования', pol: 'плюс пациентское чтение. I6: политика '
    + 'patient_current_org_select выдана роли public вместо app_patient — привести к app_patient',
    defect: ['I6-policy-to-public'] },
  { t: 'public.content_sections', cls: 'C', org: true, why: 'Разделы CMS — навигация пациентского контента',
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
    + 'клиента и библиотека клиники раскладываются по папкам', pol: 'D11: дизъюнкт без условий (patient_user_id IS '
    + 'NULL) пропускает всю библиотеку клиники любой сессии с грантом — и в USING, и в WITH CHECK',
    defect: ['D11-media-folders'] },
  { t: 'public.media_hls_proxy_error_events', cls: 'T', org: true, wall: 'platform-role', why: 'Отказы HLS-прокси — '
    + 'диагностика «видео не играет» у конкретного пациента', wallWhy: W_PLATFORM_TELEMETRY, pol: 'I7: у app_staff '
    + 'есть awd, но нет r, при этом код строит SELECT-агрегаты (playbackClientEvents.ts:113-127) — несогласованный '
    + 'набор привилегий.', defect: ['I7-privilege-mismatch'] },
  { t: 'public.media_playback_client_events', cls: 'T', org: true, wall: 'platform-role', why: 'Клиентские события '
    + 'плеера — понять, почему у пациента не грузится видео', wallWhy: W_PLATFORM_TELEMETRY, pol: 'I7: тот же '
    + 'несогласованный набор (awd без r).', defect: ['I7-privilege-mismatch'] },
  { t: 'public.media_playback_resolution_events', cls: 'T', org: true, wall: 'platform-role', why: 'Как отдавалось '
    + 'видео — оценка минут просмотра в отчётах', wallWhy: W_PLATFORM_TELEMETRY },
  { t: 'public.media_playback_stats_hourly', cls: 'T', org: false, wall: 'platform-role', why: 'Почасовой агрегат '
    + 'воспроизведений — дешёвый график вместо скана событий', wallWhy: W_PLATFORM_TELEMETRY,
    revoke: { app_staff: 'D21: строка bucket_hour × delivery суммирует воспроизведения ВСЕХ клиник — ни чтения, ни '
      + 'записи арендной роли' },
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
  { t: 'public.test_attempts', cls: 'P', why: 'попытки прохождения теста — пациент не сможет сдать тест',
    pol: 'РЕШЕНИЕ D2: пациентская ветка обязана резолвиться ЧЕРЕЗ ПРОГРАММУ (instance_stage_item_id → '
    + 'treatment_program_instance_stage_items → instances.patient_user_id), а не по плоской patient_user_id',
    code: ['C14'] },
  { t: 'public.test_results', cls: 'P', why: 'результат попытки — оценка теста', pol: 'РЕШЕНИЕ D2: пациентская ветка '
    + '— только через test_attempts, привязанную к элементу его программы (см. test_attempts).', code: ['C14'] },
  { t: 'public.test_set_items', cls: 'C', why: 'состав набора — наполнение набора' },
  { t: 'public.test_sets', cls: 'C', why: 'наборы тестов — пакетное назначение тестов' },
  { t: 'public.tests', cls: 'C', why: 'каталог клинических тестов клиники — без него врач не назначит тест' },
  { t: 'public.treatment_program_events', cls: 'P', why: 'журнал изменений программы — аудит «кто что менял в '
    + 'лечении»' },
  { t: 'public.treatment_program_instance_stage_groups', cls: 'P', why: 'группы внутри этапа — группировка заданий' },
  { t: 'public.treatment_program_instance_stage_items', cls: 'P', why: 'сами задания — что пациент делает каждый день' },
  { t: 'public.treatment_program_instance_stages', cls: 'P', why: 'этапы программы — шаги лечения' },
  { t: 'public.treatment_program_instances', cls: 'P', why: 'назначенная пациенту программа — ядро лечения — без неё '
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
  { t: 'public.user_email_setup_tokens', cls: 'S', wall: 'definer-only', why: 'одноразовые токены установки пароля — '
    + 'приглашение «задайте пароль»', wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
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
  { t: 'public.user_pins', cls: 'S', wall: 'definer-only', why: 'ПИН-коды — быстрый вход по ПИН',
    wallWhy: W_AUTH_DEFINER,
    revoke: { app_staff: REV_D1 },
    defect: ['D1-auth-tables'], code: ['C13'] },
  { t: 'public.user_web_push_subscriptions', cls: 'P', why: 'push-подписки браузера — без неё нет web-push',
    pol: 'D20: у app_patient полный arwd (в том числе DELETE) при инертной политике — пациент удаляет чужие '
    + 'push-подписки', defect: ['D20-notification-tables'] },
  { t: 'public.webapp_schema_migrations', cls: 'T', rls: 'off', why: 'журнал миграций webapp (89 строк) — миграции '
    + 'применяются повторно или не применяются', rlsWhy: RLS_OFF_MIGRATOR_LEDGER },
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
      'bcb_test_operational_media_login', 'bcb_test_operational_scheduler_login',
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
        'bcb_test_operational_scheduler_login', 'bcb_test_operational_media_login',
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

  types: {},

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
      // ⚠ public.appointment_records НЕ в списке НАМЕРЕННО: она PENDING_REMOVAL (evidence/18 §7),
      //    а таблица под снос стен не получает — иначе стена ставится на копию, которая уезжает.
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

  types: {},

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
      // ⚠ public.appointment_records — PENDING_REMOVAL, см. комментарий в разделе TEST.
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
  'app_pre_session', 'app_staff', 'app_patient', 'app_clinic_billing', 'app_platform_settings', 'app_worker',
  'app_operational_media_worker', 'saas_telemetry_operator', 'app_integrator_request',
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
] as const;

function revision10Role(kind: RoleDecl['kind'], scope: RoleDecl['scope'], why: string): RoleDecl {
  return { kind, scope, login: false, superuser: false, bypassrls: false, inherit: false,
    createrole: false, rolconfig: null, members: [], why };
}

const REV10_ROLES: Record<string, RoleDecl> = Object.fromEntries([
  ...REV10_RUNTIME.map((name) => [name, revision10Role('terminal', 'NONE', 'revision-10 runtime role')]),
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
      ...['app_pre_session', 'app_staff', 'app_clinic_billing', 'app_platform_settings', 'app_worker',
        'app_operational_media_worker', 'saas_telemetry_operator'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_WEBAPP_STAFF_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
    bcb_dev_webapp_patient: { port: 'webapp', canonicalRole: 'app_patient', memberships: [
      rev10Membership('app_pre_session'), rev10Membership('app_patient'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_WEBAPP_PATIENT_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
    bcb_dev_integrator: { port: 'integrator', canonicalRole: 'app_integrator_request', memberships: [
      ...['app_integrator_request', 'app_integrator_resolver', 'app_operational_delivery_worker',
        'app_operational_scheduler', 'app_tenant_service', 'app_service'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_DEV_INTEGRATOR_PASSWORD', rolconfig: null, connect: ['bcb_webapp_dev'] },
  },
  test: {
    bcb_test_webapp_staff: { port: 'webapp', canonicalRole: 'app_staff', memberships: [
      ...['app_pre_session', 'app_staff', 'app_clinic_billing', 'app_platform_settings', 'app_worker',
        'app_operational_media_worker', 'saas_telemetry_operator'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_WEBAPP_STAFF_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
    bcb_test_webapp_patient: { port: 'webapp', canonicalRole: 'app_patient', memberships: [
      rev10Membership('app_pre_session'), rev10Membership('app_patient'),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_WEBAPP_PATIENT_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
    bcb_test_integrator: { port: 'integrator', canonicalRole: 'app_integrator_request', memberships: [
      ...['app_integrator_request', 'app_integrator_resolver', 'app_operational_delivery_worker',
        'app_operational_scheduler', 'app_tenant_service', 'app_service'].map(rev10Membership),
    ], login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
    passwordEnv: 'BCB_TEST_INTEGRATOR_PASSWORD', rolconfig: null, connect: ['bersoncarebot_test'] },
  },
};

const REV10_CONTEXT = {
  classes: ['pre_session', 'staff', 'patient', 'platform', 'integrator', 'tenant_service', 'service'],
  privateRelations: {
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
  functions: {
    'app.install_port_context(uuid,app.port_context_claims)': { owner: 'app_seam_context_owner', security: 'DEFINER',
      execute: ['bcb_dev_webapp_staff', 'bcb_dev_webapp_patient', 'bcb_dev_integrator', 'bcb_test_webapp_staff',
        'bcb_test_webapp_patient', 'bcb_test_integrator'], purpose: 'install', typedArgs: ['uuid', 'app.port_context_claims'] },
    'app.clear_port_context()': { owner: 'app_seam_context_owner', security: 'DEFINER',
      execute: ['bcb_dev_webapp_staff', 'bcb_dev_webapp_patient', 'bcb_dev_integrator', 'bcb_test_webapp_staff',
        'bcb_test_webapp_patient', 'bcb_test_integrator'], purpose: 'clear', typedArgs: [] },
    'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)': {
      owner: 'app_seam_context_owner', security: 'DEFINER', execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS],
      purpose: 'gate', typedArgs: ['name', 'name', 'class', 'text', 'bytea', 'regprocedure'] },
    'app.require_platform_principal()': { owner: 'app_seam_context_owner', security: 'DEFINER',
      execute: ['app_platform_settings', 'saas_telemetry_operator', ...REV10_SEAM_OWNERS], purpose: 'platform', typedArgs: [] },
    'app.current_org_id()': { owner: 'app_seam_context_owner', security: 'DEFINER', execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-org', typedArgs: [] },
    'app.current_actor_user_id()': { owner: 'app_seam_context_owner', security: 'DEFINER', execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-actor', typedArgs: [] },
    'app.current_patient_user_id()': { owner: 'app_seam_context_owner', security: 'DEFINER', execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-patient', typedArgs: [] },
    'app.current_integrator_user_id()': { owner: 'app_seam_context_owner', security: 'DEFINER', execute: [...REV10_RUNTIME, ...REV10_SEAM_OWNERS], purpose: 'current-integrator', typedArgs: [] },
    'app.hash_port_typed_args(app.port_typed_arg[])': { owner: 'app_seam_context_owner', security: 'INVOKER', execute: ['app_seam_context_owner', ...REV10_SEAM_OWNERS], purpose: 'typed-args', typedArgs: ['app.port_typed_arg[]'] },
    'app_ext.resolve_variant_a_identity(uuid)': { owner: 'app_seam_identity_lookup_owner', security: 'DEFINER', execute: ['app_pre_session'], purpose: 'variant-a-resolve', typedArgs: ['uuid'] },
  },
} as const;

function revision10Database(name: 'bersoncarebot_test' | 'bcb_webapp_dev'): DatabaseDecl {
  const legacy = name === 'bersoncarebot_test' ? db_bersoncarebot_test : db_bcb_webapp_dev;
  const loginNames = Object.keys(REV10_ENV_MAPPING[name === 'bersoncarebot_test' ? 'test' : 'dev']);
  const known = new Set([...Object.keys(REV10_ROLES), ...loginNames, 'pg_database_owner']);
  const tables = Object.fromEntries(Object.entries(legacy.tables).map(([key, table]) => [key, {
    ...table, owner: 'app_object_owner', rls: table.disposition === 'PENDING_REMOVAL' ? 'n/a' : 'force',
    grants: Object.fromEntries(Object.entries(table.grants).filter(([role]) => known.has(role))),
    policies: (table.policies ?? []).filter((policy) => !('todo' in policy) && policy.to.every((role) => known.has(role) || role === 'PUBLIC')),
    grantMatrix: undefined,
  }]));
  return {
    ...legacy,
    database: { owner: 'app_object_owner', connect: loginNames, publicConnectTempDefect: false },
    schemas: {
      app: { owner: 'app_object_owner', present: true, usage: [...REV10_RUNTIME, ...loginNames], create: ['app_object_owner'] },
      app_ext: { owner: 'app_object_owner', present: true, usage: [], create: ['app_object_owner'] },
      public: { owner: 'app_object_owner', present: true, usage: [], create: ['app_object_owner'] },
      integrator: { owner: 'app_object_owner', present: true, usage: [], create: ['app_object_owner'] },
      drizzle: { owner: 'app_object_owner', present: true, usage: [], create: ['app_object_owner'] },
    },
    tables,
    sequences: { rule: 'all sequence ACL is exact and deny-by-default', examples: {} },
    functionsViews: { default: 'all views are SECURITY INVOKER; no undeclared view ACL', views: {} },
    definerExceptions: { defaults: { schema: 'app', securityDefiner: true, owner: 'app_seam_context_owner',
      searchPath: ['search_path=pg_catalog, app, app_ext, pg_temp'], publicExecute: false, coveredCount: 0,
      rule: 'every definer root has an explicit revision-10 seam owner and no PUBLIC EXECUTE' },
    proconfigExceptions: {}, ownershipExceptions: { intentional: {}, drift: {} } },
    creators: ['postgres', 'app_object_owner', ...REV10_SEAM_OWNERS],
    orgTableAllowlist: { derivedFrom: 'tables[*].org === true', named: Object.keys(tables).filter((key) => tables[key].org === true).sort(),
      fullCountLive: Object.keys(tables).filter((key) => tables[key].org === true).length, todo: '' },
    dbSettings: { datdba: 'app_object_owner', perRoleInDatabase: {} },
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
