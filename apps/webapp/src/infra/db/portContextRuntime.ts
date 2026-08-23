import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient, PoolConfig } from 'pg';
import type {
  DbPrincipal,
  PortContextClass,
  PortContextPrincipal,
  PortTypedArg,
} from '@bersoncare/db-principal';
import { portTypedArg, withPortContextTransaction } from '@bersoncare/db-principal';

export type PortCapabilityDescriptor = {
  capabilityId: string;
  targetRole: string;
  contextClass: PortContextClass;
  purpose: string;
  functionIdentity?: string;
  runtimeSources?: readonly string[];
};

export type WebappPortContextRuntimeConfig = {
  staff: PoolConfig;
  patient: PoolConfig;
  globalAdmin: PoolConfig;
  capabilities: Record<string, PortCapabilityDescriptor>;
};

export type WebappPortOperation = {
  functionIdentity: string;
  typedArgs: readonly PortTypedArg[];
};

const operationStorage = new AsyncLocalStorage<WebappPortOperation>();
/**
 * Одна поездка за непрозрачной ссылкой личности на запрос и пул вместо одной на КАЖДЫЙ принципал.
 *
 * Зачем. `app.pre_session_resolve_identity` — чистое отображение физического `platform_users.id`
 * в непрозрачную ссылку; ответ на один и тот же id не меняется в пределах запроса. Память жила в
 * `WeakMap`, ключом которой был ОБЪЕКТ принципала, а каждый `enterWithDbStaffPrincipal` создаёт
 * новый объект — поэтому один рендер `/app/doctor/schedule` спрашивал одно и то же пять раз, и
 * каждый вопрос был отдельной port-транзакцией с установкой и снятием контекста.
 *
 * Почему ключ (пул, физический id), а не только id. Разрешение выполняется под pre_session-
 * capability СВОЕГО пула (`staff_identity_resolve` / `patient_identity_resolve` / …), то есть под
 * своими правами. Пул в ключе не даёт ответу, полученному правами одного пула, перейти в другой;
 * физический id разделяет людей. Ключ строго не грубее входов самой функции, поэтому чужой ответ
 * получить нельзя.
 *
 * Почему НЕ кэш между запросами. Отображение переживает запрос, но контейнер памяти — нет:
 * `react.cache` создаёт его заново на каждый серверный запрос, как в
 * `app-layer/entitlements/requestLocalMechanicAccess.ts`. Обычная `Map` на уровне модуля была бы
 * процессным кэшем навсегда и пережила бы, например, перевыпуск личности.
 *
 * Отказ не запоминается: неудачное разрешение удаляется из контейнера, и следующий спрашивающий
 * идёт в базу заново — ровно то поведение, что было у прежней `WeakMap`.
 *
 * Вне серверного запроса (`react.cache` без области) контейнер создаётся заново на каждый вызов —
 * память просто не срабатывает, ответ при этом всегда свежий. Это не задевает никого: физический
 * id есть только у человеческих принципалов (staff/clinicBilling/patient/platform), а они
 * существуют только внутри HTTP-запроса; infra- и bootstrap-принципалы сюда не доходят вовсе.
 */
const requestOpaqueIdentityRefs = cache(() => new Map<string, Promise<string>>());

/** Вид непрозрачной ссылки: «кто действует» и «о ком данные». Закрытый список — тот же, что в CHECK карты. */
export type OpaqueIdentityRefKind = 'actor' | 'subject';

/**
 * Ключ памяти. Экспортирован ради теста: сама поштучная память принадлежит `react.cache`, а вот
 * РАЗДЕЛЁННОСТЬ ключа — это то, что здесь написано, и именно она не даёт ссылке, полученной
 * правами одного пула или для одного человека, перейти к другому.
 *
 * D15b/7a Ш4 (22.08): в ключе появился ВИД. С этого шага один и тот же человек в одном и том же
 * пуле имеет ДВЕ разные ссылки, и ключ без вида отдал бы вторую поездку ответ первой — пациент
 * получил бы акторскую ссылку в `subject_ref`, то есть ровно ту подмену, против которой затеян
 * весь раздел. Выглядело бы это как исправная страница.
 */
export function opaqueIdentityRefMemoKey(
  pool: 'staff' | 'patient' | 'globalAdmin',
  physicalIdentityId: string,
  refKind: OpaqueIdentityRefKind,
): string {
  return `${pool} ${refKind} ${physicalIdentityId}`;
}

export function runWithWebappPortOperation<T>(operation: WebappPortOperation, fn: () => T): T {
  return operationStorage.run(operation, fn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;
function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new Error(`${name} is required in port-context mode`);
  return trimmed;
}

function requireFile(path: string, name: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${name} must name a readable PEM file`);
  }
}

function strictMtlsPoolConfig(input: {
  connectionString: string | undefined;
  expectedLogin: string | undefined;
  caFile: string | undefined;
  certFile: string | undefined;
  keyFile: string | undefined;
  label: string;
}): PoolConfig {
  const connectionString = required(input.connectionString, `${input.label}_DATABASE_URL`);
  const expectedLogin = required(input.expectedLogin, `${input.label}_DB_LOGIN`);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${input.label}_DATABASE_URL must be a PostgreSQL URL`);
  }
  if ((url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') || !url.hostname) {
    throw new Error(`${input.label}_DATABASE_URL must use a TCP PostgreSQL host`);
  }
  if (decodeURIComponent(url.username) !== expectedLogin) {
    throw new Error(`${input.label}_DATABASE_URL username must equal ${input.label}_DB_LOGIN`);
  }
  for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    if (url.searchParams.has(parameter)) {
      throw new Error(`${input.label}_DATABASE_URL must not override mTLS through ${parameter}`);
    }
  }
  return {
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ca: requireFile(required(input.caFile, 'WEBAPP_DB_TLS_CA_FILE'), 'WEBAPP_DB_TLS_CA_FILE'),
      cert: requireFile(
        required(input.certFile, `${input.label}_DB_TLS_CERT_FILE`),
        `${input.label}_DB_TLS_CERT_FILE`,
      ),
      key: requireFile(
        required(input.keyFile, `${input.label}_DB_TLS_KEY_FILE`),
        `${input.label}_DB_TLS_KEY_FILE`,
      ),
      servername: url.hostname,
    },
  };
}

function parseCapabilities(raw: string | undefined): Record<string, PortCapabilityDescriptor> {
  let value: unknown;
  try {
    value = JSON.parse(required(raw, 'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) throw error;
    throw new Error('WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON must be valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON must be an object');
  }
  const capabilities: Record<string, PortCapabilityDescriptor> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error(`port capability ${name} must be an object`);
    }
    const descriptor = candidate as Partial<PortCapabilityDescriptor>;
    if (
      !descriptor.capabilityId ||
      !UUID_RE.test(descriptor.capabilityId) ||
      !descriptor.targetRole ||
      !ROLE_RE.test(descriptor.targetRole) ||
      !descriptor.purpose ||
      !PURPOSE_RE.test(descriptor.purpose) ||
      ![
        'pre_session',
        'staff',
        'patient',
        'platform',
        'integrator',
        'tenant_service',
        'service',
      ].includes(descriptor.contextClass ?? '')
    ) {
      throw new Error(`port capability ${name} has an invalid descriptor`);
    }
    if (descriptor.runtimeSources !== undefined && (!Array.isArray(descriptor.runtimeSources)
      || descriptor.runtimeSources.some((source) => typeof source !== 'string' || !source.trim())
      || new Set(descriptor.runtimeSources).size !== descriptor.runtimeSources.length)) {
      throw new Error(`port capability ${name} has invalid runtime sources`);
    }
    if (
      (descriptor.purpose === 'relation' && descriptor.functionIdentity) ||
      (descriptor.purpose !== 'relation' && !descriptor.functionIdentity)
    ) {
      throw new Error(
        `port capability ${name} must declare a function identity exactly for a named root`,
      );
    }
    capabilities[name] = descriptor as PortCapabilityDescriptor;
  }
  return capabilities;
}

export function webappPortCapabilityForInfraSource(
  source: string | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
): string {
  const normalized = source?.trim() ?? '';
  const matches = Object.entries(capabilities).filter(
    ([, descriptor]) => descriptor.purpose === 'relation'
      && descriptor.runtimeSources?.includes(normalized),
  );
  if (matches.length === 1) return matches[0]![0];
  throw new Error(`Unknown webapp infra source in port-context mode: ${normalized || '<missing>'}`);
}

export function createWebappPortContextRuntimeConfig(
  env: Record<string, string | undefined>,
): WebappPortContextRuntimeConfig {
  return {
    staff: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_STAFF,
      expectedLogin: env.WEBAPP_DB_STAFF_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_STAFF_CERT_FILE,
      keyFile: env.WEBAPP_DB_STAFF_KEY_FILE,
      label: 'WEBAPP_STAFF',
    }),
    patient: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_PATIENT,
      expectedLogin: env.WEBAPP_DB_PATIENT_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_PATIENT_CERT_FILE,
      keyFile: env.WEBAPP_DB_PATIENT_KEY_FILE,
      label: 'WEBAPP_PATIENT',
    }),
    globalAdmin: strictMtlsPoolConfig({
      connectionString: env.DATABASE_URL_GLOBAL_ADMIN,
      expectedLogin: env.WEBAPP_DB_GLOBAL_ADMIN_LOGIN,
      caFile: env.WEBAPP_DB_TLS_CA_FILE,
      certFile: env.WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE,
      keyFile: env.WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE,
      label: 'WEBAPP_GLOBAL_ADMIN',
    }),
    capabilities: parseCapabilities(env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON),
  };
}

/**
 * Patient roots that necessarily run BEFORE the session can claim a tenant, and therefore may be
 * called with an identity-only patient principal.
 *
 * Both are about the relationship itself rather than about data inside one clinic: the first asks
 * which clinics this person belongs to, the second makes them belong to one. Requiring an
 * organisation on the principal here would be circular — the tenant-claim gate
 * (`app.install_port_context`) only accepts an organisation the person already has an
 * `org_enrollments` row for.
 *
 * The patient wall is unaffected: it is "own data only" and checks identity, never organisation
 * (owner correction 2026-07-12), and both roots read their subject from
 * `app.current_patient_user_id()` rather than from an argument.
 */
const IDENTITY_ONLY_PATIENT_ROOTS = new Set<string>([
  'app.read_current_patient_active_organizations()',
  'app.enroll_current_patient_in_public_booking_clinic(uuid,text)',
  // Public configuration for the current person's browser subscription. It has no clinic
  // relationship to resolve and exposes no private VAPID material.
  'app.get_web_push_vapid_public_key()',
]);

function capabilityFor(
  capabilities: Record<string, PortCapabilityDescriptor>,
  name: string,
  principal: DbPrincipal,
): PortCapabilityDescriptor {
  const operation = operationStorage.getStore();
  if (operation) {
    const matches = Object.entries(capabilities).filter(
      ([, descriptor]) =>
        descriptor.functionIdentity === operation.functionIdentity &&
        (principal.kind === 'staff' || principal.kind === 'clinicBilling'
          ? descriptor.contextClass === 'staff'
          : principal.kind === 'patient'
            ? descriptor.contextClass === 'patient'
          : principal.kind === 'platform'
            ? descriptor.contextClass === 'platform'
            : principal.kind === 'organization'
              ? descriptor.contextClass === 'tenant_service'
              : principal.kind === 'infra'
                ? descriptor.contextClass === 'service'
                : principal.kind === 'bootstrap'
                  ? descriptor.contextClass === 'pre_session'
                  : false),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Missing unique declared webapp port capability for ${operation.functionIdentity}`,
      );
    }
    return matches[0]![1];
  }
  const capability = capabilities[name];
  if (!capability) throw new Error(`Missing declared webapp port capability: ${name}`);
  return capability;
}

/**
 * Непрозрачные ссылки человека, уже разрешённые для этого запроса, по видам.
 *
 * D15b/7a Ш4 (22.08): здесь их стало ДВЕ, а не одна на оба поля. Ключ — вид, а не позиция: подставить
 * субъектную ссылку в `actor_ref` можно только опечаткой в имени поля, а не перепутав аргументы.
 */
export type OpaqueIdentityRefs = Partial<Record<OpaqueIdentityRefKind, string>>;

/**
 * The old ALS carrier remains a request identity source only. In target mode it is never installed
 * as a GUC or signed payload: this projection is validated again by the declared DB capability.
 */
export function webappPortContextPrincipal(
  principal: DbPrincipal | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
  opaqueIdentityRefs?: OpaqueIdentityRefs,
): { pool: 'staff' | 'patient' | 'globalAdmin'; principal: PortContextPrincipal } {
  if (!principal) throw new Error('A webapp principal is required in port-context mode');
  const descriptorName =
    principal.kind === 'organization'
      ? 'tenant_service'
      : principal.kind === 'infra'
        ? webappPortCapabilityForInfraSource(principal.source, capabilities)
        : principal.kind === 'bootstrap'
          ? 'pre_session'
          : principal.kind;
  const descriptor = capabilityFor(capabilities, descriptorName, principal);
  const operation = operationStorage.getStore();
  const base = {
    capabilityId: descriptor.capabilityId,
    contextClass: descriptor.contextClass,
    targetRole: descriptor.targetRole,
    purpose: descriptor.purpose,
    ...(descriptor.functionIdentity ? { functionIdentity: descriptor.functionIdentity } : {}),
    ...(operation ? { typedArgs: operation.typedArgs } : {}),
  } satisfies Omit<
    PortContextPrincipal,
    'actorRef' | 'subjectRef' | 'organizationId' | 'integratorUserId' | 'requestId'
  >;
  switch (descriptor.contextClass) {
    case 'staff':
      if (principal.kind !== 'staff' && principal.kind !== 'clinicBilling')
        throw new Error(`Capability ${descriptorName} requires a staff principal`);
      return {
        pool: 'staff',
        principal: {
          ...base,
          // Класс `staff` несёт ТОЛЬКО акторскую ссылку: `subject_ref` ему запрещён матрицей
          // классов (`contract.sql`), а видимость строк ему даёт стена арендатора.
          actorRef: requiredOpaqueIdentityRef(opaqueIdentityRefs?.actor),
          organizationId: principal.organizationId,
        },
      };
    case 'patient':
      if (
        principal.kind !== 'patient' ||
        (!principal.organizationId &&
          descriptor.purpose !== 'relation' &&
          !IDENTITY_ONLY_PATIENT_ROOTS.has(descriptor.functionIdentity ?? ''))
      )
        throw new Error('Patient port context requires an organization-scoped patient principal');
      return {
        pool: 'patient',
        principal: {
          ...base,
          // D15b/7a Ш4: две РАЗНЫЕ ссылки одного и того же человека. До этого шага сюда приезжало
          // одно значение дважды, и требование «резолвер не принимает actor-ref вместо subject-ref»
          // было невыразимо — подменять было нечем. Обе по-прежнему разрешаются в один физический
          // id, поэтому проверка `actor_id IS DISTINCT FROM subject_id` в
          // `app_ext.assert_port_context_claim` проходит, как и проходила.
          actorRef: requiredOpaqueIdentityRef(opaqueIdentityRefs?.actor),
          subjectRef: requiredOpaqueIdentityRef(opaqueIdentityRefs?.subject),
          ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
        },
      };
    case 'platform':
      if (principal.kind !== 'platform')
        throw new Error('Platform port context requires a platform principal');
      return {
        pool: 'globalAdmin',
        principal: { ...base, actorRef: requiredOpaqueIdentityRef(opaqueIdentityRefs?.actor) },
      };
    case 'tenant_service':
      if (principal.kind !== 'organization')
        throw new Error('Tenant-service port context requires an organization principal');
      return { pool: 'staff', principal: { ...base, organizationId: principal.organizationId } };
    case 'service':
      if (principal.kind !== 'infra')
        throw new Error('Service port context requires an explicit infra principal');
      return {
        pool: 'staff',
        principal: {
          ...base,
          ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
        },
      };
    case 'pre_session':
      if (principal.kind !== 'bootstrap')
        throw new Error('Pre-session port context requires a bootstrap principal');
      return { pool: 'patient', principal: { ...base, requestId: randomUUID() } };
    default:
      throw new Error(
        `Webapp capability ${descriptorName} has unsupported context class ${descriptor.contextClass}`,
      );
  }
}

function requiredOpaqueIdentityRef(value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) {
    throw new Error('An opaque identity reference is required for a human port context');
  }
  return value.toLowerCase();
}

function physicalIdentityId(principal: DbPrincipal): string | undefined {
  switch (principal.kind) {
    case 'staff':
    case 'clinicBilling':
    case 'patient':
    case 'platform':
      return principal.platformUserId;
    default:
      return undefined;
  }
}

function poolForPrincipal(principal: DbPrincipal): 'staff' | 'patient' | 'globalAdmin' {
  if (principal.kind === 'patient' || principal.kind === 'bootstrap') return 'patient';
  return principal.kind === 'platform' ? 'globalAdmin' : 'staff';
}

type IdentityResolverClient = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
  release?(error?: Error): void;
};

async function runWebappPreSessionNamedRoot<T>(
  client: IdentityResolverClient,
  descriptor: PortCapabilityDescriptor,
  functionIdentity: string,
  typedArgs: readonly PortTypedArg[],
  fn: (sameClient: IdentityResolverClient) => Promise<T>,
): Promise<T> {
  if (descriptor.functionIdentity !== functionIdentity) {
    throw new Error(`Pre-session capability does not match ${functionIdentity}`);
  }
  if (descriptor.contextClass !== 'pre_session'
    || (descriptor.targetRole !== 'app_pre_session' && descriptor.targetRole !== 'app_platform_admin')) {
    throw new Error(`Invalid pre-session target for ${functionIdentity}`);
  }
  return withPortContextTransaction(
    client,
    {
      capabilityId: descriptor.capabilityId,
      contextClass: 'pre_session',
      targetRole: descriptor.targetRole,
      purpose: descriptor.purpose,
      functionIdentity,
      requestId: randomUUID(),
      typedArgs,
    },
    fn,
  );
}

function opaqueRefFromResult(result: unknown): string {
  if (!result || typeof result !== 'object' || !('rows' in result) || !Array.isArray(result.rows)) {
    throw new Error('Identity resolver returned no row set');
  }
  const row = result.rows[0];
  const opaqueRef = row && typeof row === 'object' && 'opaque_ref' in row ? row.opaque_ref : undefined;
  if (typeof opaqueRef !== 'string' || !UUID_RE.test(opaqueRef)) {
    throw new Error('Identity resolver returned an invalid opaque reference');
  }
  return opaqueRef.toLowerCase();
}

/**
 * Вид непрозрачной ссылки, который просит приложение, и точный корень, за которым он живёт.
 *
 * D15b/7a Ш3 (22.08): корень принимает вид ВТОРЫМ типизированным аргументом, и хеш аргументов
 * считается по обоим. База считает тот же хеш внутри `app.pre_session_resolve_identity` — назвать
 * здесь один аргумент, а там два (или наоборот) значит получить `42501` «port context capability
 * mismatch» на первом же входе ЛЮБОГО человека, при зелёных миграции и деплое. Поэтому и
 * подставляемое в SQL значение, и типизированный аргумент берутся из ОДНОЙ константы.
 *
 * D15b/7a Ш4 (22.08): вид стал ПАРАМЕТРОМ этой одной поездки, а не константой на весь порт. Класс
 * `patient` просит две ссылки — акторскую и субъектную; `staff` и `platform` — только акторскую,
 * потому что `subject_ref` им запрещён матрицей классов.
 */
const IDENTITY_ROOT = 'app.pre_session_resolve_identity(uuid,text)';
const ACTOR_REF_KIND: OpaqueIdentityRefKind = 'actor';
const SUBJECT_REF_KIND: OpaqueIdentityRefKind = 'subject';

/**
 * Какие виды ссылок вправе нести контекст этого принципала.
 *
 * Соответствие «вид принципала → класс контекста» здесь ровно то же, что в `capabilityFor` и в
 * `webappPortContextPrincipal` ниже: субъектную ссылку несёт один класс `patient`. Спросить лишний
 * вид — не безобидно: это лишняя поездка в базу и лишняя строка карты у человека, которому она не
 * нужна.
 */
function opaqueIdentityRefKindsFor(principal: DbPrincipal): readonly OpaqueIdentityRefKind[] {
  return principal.kind === 'patient' ? [ACTOR_REF_KIND, SUBJECT_REF_KIND] : [ACTOR_REF_KIND];
}

async function resolveOpaqueIdentityRef(
  client: IdentityResolverClient,
  principal: DbPrincipal,
  capabilities: Record<string, PortCapabilityDescriptor>,
  refKind: OpaqueIdentityRefKind,
): Promise<string | undefined> {
  const physicalId = physicalIdentityId(principal);
  if (!physicalId) return undefined;
  const pool = poolForPrincipal(principal);
  const memo = requestOpaqueIdentityRefs();
  const memoKey = opaqueIdentityRefMemoKey(pool, physicalId, refKind);
  const existing = memo.get(memoKey);
  if (existing) return existing;

  const descriptorName = `${pool}_identity_resolve`;
  const descriptor = capabilities[descriptorName];
  if (
    !descriptor ||
    descriptor.contextClass !== 'pre_session' ||
    (descriptor.targetRole !== 'app_pre_session' && descriptor.targetRole !== 'app_platform_admin') ||
    descriptor.purpose !== 'identity.variant-a.resolve' ||
    descriptor.functionIdentity !== IDENTITY_ROOT
  ) {
    throw new Error(`Missing exact declared webapp identity capability: ${descriptorName}`);
  }

  const resolution = runWebappPreSessionNamedRoot(
    client,
    descriptor,
    IDENTITY_ROOT,
    [portTypedArg('uuid', physicalId), portTypedArg('text', refKind)],
    async (sameClient) =>
      opaqueRefFromResult(
        await drizzle(sameClient as unknown as PoolClient).execute(
          sql`SELECT app.pre_session_resolve_identity(${physicalId}::uuid, ${refKind}::text) AS opaque_ref`,
        ),
      ),
  );
  memo.set(memoKey, resolution);
  try {
    return await resolution;
  } catch (error) {
    memo.delete(memoKey);
    throw error;
  }
}

/**
 * Все ссылки, которые вправе нести контекст этого принципала, — одной точкой.
 *
 * Виды разрешаются ПО ОЧЕРЕДИ, а не `Promise.all`: обе поездки идут по ОДНОМУ уже взятому
 * mTLS-соединению, и каждая — отдельная транзакция с установкой и снятием pre-session-контекста.
 * Запустить их параллельно на одном соединении значит вложить транзакцию в транзакцию.
 */
async function resolveOpaqueIdentityRefs(
  client: IdentityResolverClient,
  principal: DbPrincipal,
  capabilities: Record<string, PortCapabilityDescriptor>,
): Promise<OpaqueIdentityRefs> {
  const refs: OpaqueIdentityRefs = {};
  for (const refKind of opaqueIdentityRefKindsFor(principal)) {
    const ref = await resolveOpaqueIdentityRef(client, principal, capabilities, refKind);
    if (ref) refs[refKind] = ref;
  }
  return refs;
}

/** Exact physical→opaque handoff on the checked-out mTLS connection, before human context install. */
export async function resolveWebappPortContextPrincipal(
  client: IdentityResolverClient,
  principal: DbPrincipal | undefined,
  capabilities: Record<string, PortCapabilityDescriptor>,
): Promise<{ pool: 'staff' | 'patient' | 'globalAdmin'; principal: PortContextPrincipal }> {
  if (!principal) throw new Error('A webapp principal is required in port-context mode');
  const opaqueIdentityRefs = await resolveOpaqueIdentityRefs(client, principal, capabilities);
  return webappPortContextPrincipal(principal, capabilities, opaqueIdentityRefs);
}
