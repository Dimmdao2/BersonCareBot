/**
 * types.ts — ГРАММАТИКА декларации слоя прав БД (SCHEME §A) + шаблоны стен + разворачивание
 * компактных строк таблиц в полные записи.
 *
 * Здесь НЕТ решений и НЕТ данных о конкретных таблицах — только замкнутые перечисления (чтобы
 * компилятор ловил опечатки), шаблон стены на каждый класс данных и функция `expandTables`,
 * которая достраивает умолчания. Данные и решения живут в `declaration.ts`.
 *
 * ЗАЧЕМ разделение: декларация — это ~240 решений, которые читает человек на ревью. Пока грамматика
 * (≈300 строк типов) лежала вперемешку с данными, файл нельзя было прочесть целиком.
 */

/* ============================================================================================
 * КЛАССЫ ДАННЫХ И СТЕНЫ (решение D7: стена — по объявленному КЛАССУ, не по наличию organization_id)
 * ========================================================================================== */

/** FINDINGS_TABLES: класс, в который классифицирована каждая из 239 таблиц. */
export type DataClass =
  | 'P' // данные пациента
  | 'C' // операционные данные клиники/врача
  | 'S' // системные таблицы платформы
  | 'R' // справочник (глобальный шаблон и/или его копия на организацию)
  | 'T'; // техническое

export type Wall =
  | 'clinic+patient' // RLS FORCE; ветка персонала по org; ветка пациента по своей строке
  | 'parent+patient' // organization_id нет ПО ЗАМЫСЛУ; org и пациент выводятся EXISTS по родителю
  | 'clinic' // RLS FORCE; ветка персонала по org; пациентского гранта нет вовсе
  | 'parent' // organization_id нет по замыслу; org выводится EXISTS по родителю
  | 'platform-role' // RLS FORCE; только объявленная платформенная/сервисная роль; арендного гранта нет
  | 'platform-role+clinic' // глобальные строки (organization_id IS NULL) — платформенная роль; org-строки — стена клиники
  | 'reference-template' // платформенный глобальный шаблон: аренда только ЧИТАЕТ, запись запрещена (D3)
  | 'reference-org-copy' // копия шаблона, принадлежащая организации: organization_id + стена клиники (D3)
  | 'definer-only' // ноль грантов любым прикладным ролям; путь только через перечисленные definer-аксессоры
  | 'closed' // техническое: закрыто от всех прикладных ролей (владелец/мигратор)
  | 'pending-removal'; // таблица уходит — ни стены, ни грантов (evidence/15, evidence/18)

export const WALL_TEMPLATES: Record<Wall, { rls: 'force' | 'n/a'; requires: string }> = {
  'clinic+patient': {
    rls: 'force',
    requires: 'ветка персонала `organization_id = app.current_org_id() AND app.is_staff()`; ветка пациента '
      + 'по своей строке (platform_user_id / patient_user_id либо EXISTS по родителю). Обе — в USING и в WITH CHECK.',
  },
  'parent+patient': {
    rls: 'force',
    requires: 'organization_id отсутствует ПО ЗАМЫСЛУ: org-ветка — EXISTS по org родителя, пациентская — '
      + 'EXISTS по пациентскому ключу родителя. Объявляется, а не выводится.',
  },
  clinic: { rls: 'force', requires: 'ветка персонала по org; у app_patient ни гранта, ни ветки политики.' },
  parent: { rls: 'force', requires: 'org-ветка через EXISTS по родителю; пациентского доступа нет.' },
  'platform-role': {
    rls: 'force',
    requires: 'политика ограничена объявленной платформенной/сервисной ролью; app_staff и app_patient грантов '
      + 'не имеют. «Стена своей роли» из нормы владельца.',
  },
  'platform-role+clinic': {
    rls: 'force',
    requires: 'две ветки: строки organization_id IS NULL достижимы только объявленной платформенной/сервисной '
      + 'ролью; строки с организацией — под стеной клиники. NULL-ветка ОБЯЗАНА проверять роль — безусловный '
      + 'дизъюнкт `organization_id IS NULL` и есть дефект Д3/Д7.',
  },
  'reference-template': {
    rls: 'force',
    requires: 'D3: строки платформенного шаблона. Арендным ролям — только SELECT (или ничего); '
      + 'INSERT/UPDATE/DELETE арендатору запрещены. Пишет платформенная роль либо засевочный шов.',
  },
  'reference-org-copy': {
    rls: 'force',
    requires: 'D3: копия, сделанная для организации при её создании. Несёт organization_id, стену клиники, и '
      + 'клиника ею владеет (правит/переименовывает/удаляет свои строки). Засевочный шов — перечисленное '
      + 'definer-исключение, а не арендный грант.',
  },
  'definer-only': {
    rls: 'force',
    requires: 'ноль грантов любым рантайм-ролям; единственный путь — перечисленные SECURITY DEFINER аксессоры. '
      + 'RLS+FORCE остаётся сверху как backstop (FINDINGS И1 + канон репо «FORCE RLS не снимать»): стена из '
      + 'одних грантов держится ровно до дня, когда грант выдали, — и Д1 это тринадцать таблиц, где такой день настал.',
  },
  closed: { rls: 'force', requires: 'рантайм-грантов нет вовсе; только владелец/мигратор. RLS+FORCE — тот же backstop.' },
  'pending-removal': {
    rls: 'n/a',
    requires: 'НИ стены, НИ грантов: таблица уходит (evidence/15 / evidence/18). Объявлена, чтобы у двустороннего '
      + 'диффа §F было ИМЕНОВАННОЕ исключение вместо молчания и чтобы на неё не тратили работу по стенам.',
  },
};

/** класс → стена по умолчанию (таблица может отклониться, но обязана назвать причину). */
export const CLASS_DEFAULT_WALL: Record<DataClass, Wall> = {
  P: 'clinic+patient',
  C: 'clinic',
  S: 'platform-role',
  R: 'reference-template',
  T: 'closed',
};

/** Решение D4 — ровно два порта. */
export type Port = 'webapp' | 'integrator';

export interface PortSpec {
  process: string;
  what: string;
  logins: string[];
  reachedThrough: string;
}

/* ============================================================================================
 * ГРАММАТИКА РОЛЕЙ, ЛОГИНОВ, ОБЪЕКТОВ (SCHEME §A)
 * ========================================================================================== */

/** SCHEME §A.2 — одна область на роль. */
export type Scope = 'ORG' | 'OWN' | 'GLOBAL' | 'NONE';

/** SCHEME §A.1 — замкнутая грамматика ролей. `service` = инфра-роли кластера (§E, прунер D8). */
export type RoleKind = 'terminal' | 'capability' | 'owner' | 'service' | 'operator' | 'superuser';

/** SCHEME §A.4 — режим RLS. 'force'=RLS+FORCE, 'on'=RLS без FORCE (требует обоснования),
 *  'off'=ЯВНО объявленное отсутствие (не молчание), 'n/a'=таблица PENDING_REMOVAL. */
export type RlsMode = 'force' | 'on' | 'off' | 'n/a';

export type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'REFERENCES' | 'TRIGGER' | 'TRUNCATE';

/** Колоночный грант (SCHEME §A.4 — табличная проверка без него врёт, FACTS §1.4). */
export interface ColumnGrant {
  kind: 'columns';
  priv: Privilege;
  columns: string[];
}

export type GrantSet = Array<Privilege | ColumnGrant>;

/** ДИСЦИПЛИНА: грант без обоснования не объявляем — `why` требуется структурно. */
export interface GrantDecl {
  privs: GrantSet;
  /** кто им пользуется / зачем; прослеживается до классификации либо до кода (file:line). */
  why: string;
  /** SCHEME §A.4: по умолчанию false, и этот дефолт — ЧАСТЬ ожидаемой стороны (c5a:1300). */
  grantable?: false;
}

/** Членство на стороне GRANTED, опции — по pg_auth_members. */
export interface Membership {
  role: string;
  admin: boolean;
  inherit: boolean;
  set: boolean;
}

export interface RoleDecl {
  kind: RoleKind;
  scope: Scope;
  login: boolean;
  superuser: boolean;
  bypassrls: boolean;
  inherit: boolean;
  createrole: boolean;
  rolconfig: string[] | null;
  grantedTo?: Membership[];
  members?: string[];
  /** true = роли ещё нет в живом каталоге; её создаёт roles-install (§B шаг 1). */
  isNew?: boolean;
  why?: string;
}

/** SCHEME §A.1 — запись логина на окружение (env-зависимая истина; живёт в env/<env>.json). */
export interface LoginRecord {
  /** D4: к какому из двух портов относится логин; null = не относится ни к одному (должен свернуться). */
  port: Port | null;
  /** заполнено там, где сегодня это ТРЕТИЙ порт и его надо свернуть в `port` (CODE_MUST_CHANGE). */
  mustFold?: string;
  canonicalRole: string | null;
  membership?: Membership;
  /** A port login may SET only its explicitly named runtime roles. */
  memberships?: Membership[];
  login: true;
  superuser: false;
  bypassrls: false;
  createrole: false;
  /** ОБЪЯВЛЕННАЯ ЦЕЛЬ: NOINHERIT везде (SCHEME §A.1). Расхождение с живым — в `inheritDrift`. */
  inherit: false;
  inheritDrift?: string;
  passwordEnv: string;
  rolconfig: string[] | null;
  connect: string[];
  validUntil?: string | null;
  connectionLimit?: number | null;
  why?: string;
}

export interface SchemaDecl {
  owner: string;
  usage: string[];
  create: string[];
  publicDefect?: boolean;
  present: boolean;
  ownerDrift?: string;
  why?: string;
}

export interface PolicyDecl {
  name: string;
  as: 'PERMISSIVE' | 'RESTRICTIVE';
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  to: string[];
  using?: string;
  withCheck?: string;
  note?: string;
}

export type Disposition = 'ACTIVE' | 'PENDING_REMOVAL' | 'REMOVED';

/** для PENDING_REMOVAL: источник решения о сносе и что его блокирует. */
export interface RemovalDecl {
  verdict: string;
  source: string;
  blockedBy?: string;
}

/** ПОЛНАЯ запись таблицы — то, что видит генератор. Человек пишет компактную `TableRow` (ниже). */
export interface TableDecl {
  cls: DataClass;
  wall: Wall;
  disposition: Disposition;
  why: string;
  /** причина ОТКЛОНЕНИЯ стены от CLASS_DEFAULT_WALL; обязательна там, где отклонение есть. */
  wallWhy?: string;
  rls: RlsMode;
  rlsWhy?: string;
  owner: string;
  /** несёт organization_id (питает orgTableAllowlist §A.9). Опущено там, где перепись не мерила. */
  org?: boolean;
  /** только обоснованные гранты. Пустой объект = deny-by-default и есть объявленная цель. */
  grants: Record<string, GrantDecl>;
  /** полный relacl переписью не перечислен (GAP G2) — класс+стена объявлены, ACL не выдуман. */
  grantMatrix?: 'G2-pending';
  /**
   * Executable access census.  An ACTIVE relation cannot be generated until it is
   * either backed by a direct grant, one or more exact definer seams, or a demonstrated
   * absence of a runtime surface.  `unresolved` is deliberately machine-readable
   * so `--gaps` fails instead of treating deny-by-default as an operable matrix.
   */
  access?: RelationAccess;
  /** живые гранты, которые модель СНИМАЕТ, с причиной. */
  revoke?: Record<string, string>;
  /** требуемая семантика политик СВЕРХ шаблона стены (тела политик — GAP G8). */
  policyRequirement?: string;
  policies?: Array<PolicyDecl | { todo: string }>;
  defect?: string[];
  ownerGate?: string[];
  codeMustChange?: string[];
  removal?: RemovalDecl;
  drift?: string;
}

export interface NamedSeamAccess {
  regprocedure: string;
  owner: string;
  /** Exact runtime/capability roles which may invoke the root. Triggers have no SQL callers. */
  callers: string[];
  invocation: 'runtime' | 'trigger';
  columns: string[];
  operations: Privilege[];
  purpose: string;
}

export type RelationAccess =
  | {
    kind: 'direct';
    codePaths: string[];
    purpose: string;
    /** Exact runtime role × operation × table/column shape. */
    grants: Array<{ role: string; operations: Privilege[]; columns: 'table' | string[] }>;
    /** Exact definer surfaces which coexist with the direct path. */
    seams: NamedSeamAccess[];
  }
  | { kind: 'named-seams'; seams: NamedSeamAccess[]; purpose: string }
  | { kind: 'no-runtime-surface'; evidence: string[]; purpose: string }
  | { kind: 'unresolved'; reason: string; codePaths: string[] };

export interface FunctionRelationSurface {
  relation: string;
  columns: readonly string[];
  operations: readonly Privilege[];
  /** The census is evidence for a later exact grant stage, not authority to emit grants now. */
  evidence: 'pg16-function-body-lexical-upper-bound';
}

export interface DeclaredFunction {
  owner: string;
  security: 'DEFINER' | 'INVOKER';
  /** Exact SQL result type, compared against pg_proc.prorettype. */
  returns: string;
  /** Exact pg_proc attributes; omission is a declaration gap, never a generator default. */
  volatility: 'IMMUTABLE' | 'STABLE' | 'VOLATILE';
  parallel: 'SAFE' | 'RESTRICTED' | 'UNSAFE';
  proconfig: readonly string[];
  execute: readonly string[];
  /** Add every declared application login connected to the rendered database. */
  loginExecute?: true;
  purpose: string;
  typedArgs: readonly string[];
  /** Omitted means both declared databases; otherwise this is the exact per-DB presence set. */
  databases?: readonly string[];
  relationSurfaces?: readonly FunctionRelationSurface[];
  /** Exact same-seam/context roots used when this wrapper has no direct relation access. */
  delegatesTo?: readonly string[];
  invocation?: 'runtime' | 'trigger' | 'internal';
}

/**
 * КОМПАКТНАЯ строка таблицы — то, что пишет и читает человек. Всё, что выводится из класса,
 * стены и диспозиции, здесь ОТСУТСТВУЕТ; `expandTables` достраивает (правила — в README).
 */
export interface TableRow {
  /** <схема>.<таблица> */
  t: string;
  cls: DataClass;
  /** ОДНА строка: что лежит и что ломается без этого. */
  why: string;
  /** только если стена ОТЛИЧАЕТСЯ от CLASS_DEFAULT_WALL[cls]; тогда `wallWhy` обязателен. */
  wall?: Wall;
  wallWhy?: string;
  /** только если режим отличается от WALL_TEMPLATES[wall].rls; тогда `rlsWhy` обязателен. */
  rls?: RlsMode;
  rlsWhy?: string;
  /** только если владелец не `migrator`. */
  owner?: string;
  org?: boolean;
  grants?: Record<string, GrantDecl>;
  revoke?: Record<string, string>;
  /** policyRequirement СВЕРХ шаблона стены; шаблон сам себя не пересказывает. */
  pol?: string;
  defect?: string[];
  gate?: string[];
  code?: string[];
  /** присутствие = disposition PENDING_REMOVAL + стена 'pending-removal'. */
  drop?: RemovalDecl;
  /** только если диспозиция не выводится из `drop` (например REMOVED). */
  disp?: Disposition;
  /** 'enumerated' = полный ACL таблицы перечислен переписью, маркер GAP G2 снимается. */
  acl?: 'enumerated';
  drift?: string;
  policies?: Array<PolicyDecl | { todo: string }>;
}

export interface SequenceRuleDecl {
  rule: string;
  examples: Record<string, Record<string, Array<'USAGE' | 'SELECT' | 'UPDATE'>>>;
}

export interface DefinerException {
  owner: string;
  /** ожидаемый pg_proc.proconfig, ПОБАЙТНО. Пишет ТЕЛО функции в миграции, не генератор. */
  searchPath: string[];
  execute?: string[];
  why: string;
  /** true = функции ещё нет; её миграция — часть этой работы. */
  isNew?: boolean;
}

export interface DefinerExceptionsSection {
  defaults: {
    schema: 'app';
    securityDefiner: true;
    /** Historical field retained for fixture compatibility; revision 10 never uses it as a fallback. */
    owner: string;
    searchPath: string[];
    publicExecute: false;
    coveredCount: number;
    rule: string;
  };
  proconfigExceptions: Record<string, DefinerException>;
  ownershipExceptions: {
    intentional: Record<string, { count: number; why: string; functions: string[] | { todo: string } }>;
    drift: Record<string, { count: number; targetOwner: string; why: string; known: string[]; todo: string }>;
  };
}

export interface DbSettingsSection {
  datdba: string;
  databaseLevel?: Record<string, string[]>;
  perRoleInDatabase: Record<string, string[]>;
}

export interface DatabaseDecl {
  database: {
    owner: string;
    connect: string[];
    publicConnectTempDefect: boolean;
    note?: string;
  };
  schemas: Record<string, SchemaDecl>;
  tables: Record<string, TableDecl>;
  sequences: SequenceRuleDecl;
  functionsViews: {
    default: string;
    views: Record<string, { securityInvoker: true; execute?: string[] }> | { todo: string };
  };
  types: Record<string, { usage: string[] }>;
  definerExceptions: DefinerExceptionsSection;
  creators: string[];
  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true';
    named: string[];
    fullCountLive: number;
    todo: string;
  };
  dbSettings: DbSettingsSection;
}

/* ============================================================================================
 * РЕШЕНИЯ ВЛАДЕЛЬЦА — форма записи (сами решения и их канон — в declaration.ts)
 * ========================================================================================== */

export interface OwnerDecision {
  id: string;
  /** слова владельца (дословно там, где они были дословны) — ОДНА строка. */
  said: string;
  /** что этот файл делает по решению — ОДНА строка. */
  encodedAs: string;
  /** true = решение о ТЕКУЩЕМ состоянии («пока»), пересмотр ожидается. */
  provisional: boolean;
}

export interface OwnerGate {
  id: string;
  question: string;
  safeDefault: string;
}

export interface AcceptanceInvariant {
  owner: string;
  date: string;
  /** половина «0 строк»: чем обеспечена сегодня. */
  zeroRows: string;
  /** половина «и пишет ошибку в журнал»: чего сегодня НЕТ и что меняется. */
  andLogs: string;
  contextAccessorsMustRaise: string[];
  appliedBy: string;
  acceptanceTest: string;
}

export interface PlatformRoleScope {
  role: string;
  owner: string;
  provisional: boolean;
  mayTouch: string[];
  mustNotTouch: string;
  consequenceRecorded: string;
}

export interface PatientVisibility {
  role: string;
  scope: Scope;
  owner: string;
  sees: string[];
  doesNotSee: string[];
}

export interface ReferenceModel {
  owner: string;
  shape: string;
  alreadyImplemented: string;
  consequence: string;
}

export interface CodeChange {
  id: string;
  what: string;
  where: string[];
  /** id решения владельца либо дефекта. */
  becauseOf: string;
}

export interface PrivilegeDeclaration {
  ownerDecisions: OwnerDecision[];
  acceptanceInvariant: AcceptanceInvariant;
  platformRoleScope: PlatformRoleScope;
  patientVisibility: PatientVisibility;
  referenceModel: ReferenceModel;
  ports: Record<Port, PortSpec>;
  wallTemplates: Record<Wall, { rls: 'force' | 'n/a'; requires: string }>;
  codeMustChange: CodeChange[];
  ownerGatesOpen: OwnerGate[];
  cluster: {
    envs: string[];
    roles: Record<string, RoleDecl>;
  };
  envMapping: Record<string, Record<string, LoginRecord>>;
  /** Exact retired application identities removed by owner-ordered zero before install. */
  zeroState?: { legacyRoles: readonly string[] };
  databases: Record<string, DatabaseDecl>;
  /** Transaction-context surface, separate from ordinary relation ACLs. */
  portContext?: {
    classes: readonly string[];
    privateRelations: Record<string, { owner: string; columns: readonly string[] }>;
    /** One runtime catalog. Function-bound rows also feed the exact DB seed; relation rows feed env only. */
    capabilities: Record<string, {
      port: Port;
      /** Exact key consumed by the runtime; allows the same key on both physical ports. */
      runtimeName?: string;
      /** Canonical role of the one application login used for this capability in each environment. */
      sessionRole: string;
      targetRole: string;
      contextClass: string;
      purpose: string;
      functionIdentity?: string;
      /** Exact infra source allowlist for relation capabilities; empty for typed human principals. */
      runtimeSources?: readonly string[];
    }>;
    functions: Record<string, DeclaredFunction>;
  };
}

/* ============================================================================================
 * РАЗВОРАЧИВАНИЕ КОМПАКТНЫХ СТРОК
 *   Правила умолчаний (они же — конвенция ревью, README §«Компактная форма»):
 *     wall        = row.wall ?? (row.drop ? 'pending-removal' : CLASS_DEFAULT_WALL[cls])
 *     rls         = row.rls  ?? WALL_TEMPLATES[wall].rls
 *     disposition = row.disp ?? (row.drop ? 'PENDING_REMOVAL' : 'ACTIVE')
 *     owner       = row.owner ?? 'migrator'
 *     grantMatrix = 'G2-pending' на каждой ACTIVE-таблице, кроме row.acl === 'enumerated'
 *   ОТКЛОНЕНИЕ БЕЗ ПРИЧИНЫ — ОШИБКА ЗАГРУЗКИ, а не тихое умолчание: «стена не по классу» и «RLS не
 *   по шаблону» — это решения, и они обязаны нести одну строку обоснования.
 * ========================================================================================== */

export function expandTables(rows: TableRow[]): Record<string, TableDecl> {
  const out: Record<string, TableDecl> = {};
  for (const row of rows) {
    if (out[row.t]) throw new Error(`declaration: таблица '${row.t}' объявлена дважды`);
    const defaultWall: Wall = row.drop ? 'pending-removal' : CLASS_DEFAULT_WALL[row.cls];
    const wall: Wall = row.wall ?? defaultWall;
    if (row.wall && row.wall !== defaultWall && !row.wallWhy) {
      throw new Error(`declaration: '${row.t}' отклоняет стену (${row.cls} → ${wall}) без wallWhy`);
    }
    const templateRls = WALL_TEMPLATES[wall].rls;
    const rls: RlsMode = row.rls ?? templateRls;
    if (row.rls && row.rls !== templateRls && !row.rlsWhy) {
      throw new Error(`declaration: '${row.t}' отклоняет rls ('${rls}' против шаблона '${templateRls}') без rlsWhy`);
    }
    const disposition: Disposition = row.disp ?? (row.drop ? 'PENDING_REMOVAL' : 'ACTIVE');
    const decl: TableDecl = {
      cls: row.cls,
      wall,
      disposition,
      why: row.why,
      rls,
      owner: row.owner ?? 'migrator',
      grants: row.grants ?? {},
    };
    if (row.wallWhy) decl.wallWhy = row.wallWhy;
    if (row.rlsWhy) decl.rlsWhy = row.rlsWhy;
    if (row.org !== undefined) decl.org = row.org;
    if (disposition === 'ACTIVE' && row.acl !== 'enumerated') decl.grantMatrix = 'G2-pending';
    if (row.revoke) decl.revoke = row.revoke;
    if (row.pol) decl.policyRequirement = row.pol;
    if (row.policies) decl.policies = row.policies;
    if (row.defect) decl.defect = row.defect;
    if (row.gate) decl.ownerGate = row.gate;
    if (row.code) decl.codeMustChange = row.code;
    if (row.drop) decl.removal = row.drop;
    if (row.drift) decl.drift = row.drift;
    out[row.t] = decl;
  }
  return out;
}
