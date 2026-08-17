#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_DEV_BASE_URL = 'http://127.0.0.1:5200';
export const CANONICAL_DEV_DATABASE = 'bcb_webapp_dev';

const CANONICAL_DEV_REPO_ROOT = '/home/dev/dev-projects/BersonCareBot';
const API_ENV_PATH = resolve(CANONICAL_DEV_REPO_ROOT, '.env');
const WEBAPP_ENV_PATH = resolve(CANONICAL_DEV_REPO_ROOT, 'apps/webapp/.env.dev');

/**
 * These counts are deliberately conservative. One product journey may exercise several old low-level
 * cases, but a case is counted only when the public readback observes the same consequence. The
 * remaining cases stay named blockers in the matrix instead of being replaced by mocks or source text.
 */
export const LIVE_COVERAGE = Object.freeze({
  adminAuditLog: 3,
  pgBookingSchedulingDeactivateWorkingHours: 2,
  pgBookingSchedulingReadChokepoint: 3,
  pgCanonicalAppointments: 2,
  pgDoctorAnalyticsMetricAccounts: 1,
  pgDoctorClients: 3,
  pgPatientBookings: 2,
  pgPhase14DCommsTail: 1,
  pgSupportCommunication: 5,
  reminderRulesD5Migration: 1,
  tenantIsolationMatrix: 10,
});

export const LIVE_COVERED_CALLS = Object.values(LIVE_COVERAGE).reduce(
  (sum, count) => sum + count,
  0,
);

function parseEnvFile(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

export function databaseNameFromUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${label} must be a PostgreSQL URL`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`${label} must name exactly one database`);
  }
  return databaseName;
}

export function assertCanonicalArgs(args) {
  if (args.length !== 1 || !['--run', '--self-test'].includes(args[0])) {
    throw new Error(
      'Usage: node apps/webapp/scripts/named-dev-db-behavior-runner.mjs --run|--self-test',
    );
  }
  if (args.some((arg) => /url|host|database|test|prod/i.test(arg) && arg !== '--self-test')) {
    throw new Error('target overrides are forbidden; the runner accepts only canonical named DEV');
  }
}

function assertCanonicalFile(path, label) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error(`${label} must be the canonical non-symlink file`);
  }
}

export function assertCanonicalNamedDevEnvFiles() {
  assertCanonicalFile(API_ENV_PATH, 'DEV API env');
  assertCanonicalFile(WEBAPP_ENV_PATH, 'DEV webapp env');
  assertNamedDevEnv(readFileSync(API_ENV_PATH, 'utf8'), readFileSync(WEBAPP_ENV_PATH, 'utf8'));
}

export function assertNamedDevEnv(apiSource, webappSource) {
  const api = parseEnvFile(apiSource);
  const webapp = parseEnvFile(webappSource);
  const targets = [
    ['INTEGRATOR_DB_URL', api.get('INTEGRATOR_DB_URL')],
    ['DATABASE_URL_STAFF', webapp.get('DATABASE_URL_STAFF')],
    ['DATABASE_URL_PATIENT', webapp.get('DATABASE_URL_PATIENT')],
    ['DATABASE_URL_GLOBAL_ADMIN', webapp.get('DATABASE_URL_GLOBAL_ADMIN')],
  ];
  for (const [label, value] of targets) {
    if (!value) throw new Error(`${label} is required for the canonical named DEV runner`);
    const actual = databaseNameFromUrl(value, label);
    if (actual !== CANONICAL_DEV_DATABASE) {
      throw new Error(`${label} targets ${actual}; only ${CANONICAL_DEV_DATABASE} is allowed`);
    }
  }
  const mode = webapp.get('DB_PRINCIPAL_CONTEXT_MODE') ?? api.get('DB_PRINCIPAL_CONTEXT_MODE');
  if (mode !== 'port-context') {
    throw new Error('DB_PRINCIPAL_CONTEXT_MODE must be port-context');
  }
}

function cookiePairs(headers) {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return raw.map((value) => value.split(';', 1)[0]).filter(Boolean);
}

class DevSession {
  constructor(label, token, expectedRole) {
    this.label = label;
    this.token = token;
    this.expectedRole = expectedRole;
    this.cookies = new Map();
    this.me = null;
  }

  absorbCookies(headers) {
    for (const pair of cookiePairs(headers)) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(path, options = {}) {
    assert(path.startsWith('/'), `relative product path required: ${path}`);
    const headers = new Headers(options.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (options.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(`${CANONICAL_DEV_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      redirect: options.redirect ?? 'manual',
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body),
    });
    this.absorbCookies(response.headers);
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { nonJson: true };
      }
    }
    return { status: response.status, body, headers: response.headers };
  }

  async login() {
    const auth = await this.request(`/api/auth/dev-bypass?token=${encodeURIComponent(this.token)}`);
    assert.equal(auth.status, 303, `${this.label}: dev-bypass must return 303`);
    assert(this.cookies.size > 0, `${this.label}: dev-bypass did not issue a cookie`);
    const me = await this.request('/api/me');
    assert.equal(me.status, 200, `${this.label}: /api/me failed`);
    assert.equal(me.body?.ok, true, `${this.label}: /api/me did not return ok`);
    assert.equal(me.body?.user?.role, this.expectedRole, `${this.label}: unexpected role`);
    assert.equal(
      me.body?.platformAccessUnresolved,
      undefined,
      `${this.label}: platform access is unresolved`,
    );
    this.me = me.body.user;
  }
}

function expectOk(result, label, expectedStatus = 200) {
  assert.equal(result.status, expectedStatus, `${label}: status ${result.status}`);
  assert.equal(result.body?.ok, true, `${label}: response is not ok`);
  return result.body;
}

function expectNotFound(result, label) {
  assert.equal(
    result.status,
    404,
    `${label}: foreign object must be indistinguishable from absent`,
  );
  assert.equal(result.body?.error, 'not_found', `${label}: expected not_found`);
}

async function openSessions() {
  const sessions = {
    globalAdmin: new DevSession('global-admin', 'dev:admin', 'admin'),
    clinicAdmin: new DevSession('clinic-admin', 'dev:clinic-admin', 'doctor'),
    doctor: new DevSession('doctor', 'dev:doctor', 'doctor'),
    isolatedDoctor: new DevSession('isolated-doctor', 'dev:doctor-isolated', 'doctor'),
    patient: new DevSession('patient', 'dev:client', 'client'),
    isolatedPatient: new DevSession('isolated-patient', 'dev:client-isolated', 'client'),
  };
  for (const session of Object.values(sessions)) await session.login();
  return sessions;
}

async function proveAdminAudit(globalAdmin) {
  const impossibleAction = `named_dev_absent_${randomUUID()}`;
  const empty = expectOk(
    await globalAdmin.request(
      `/api/admin/audit-log?action=${encodeURIComponent(impossibleAction)}`,
    ),
    'admin audit impossible filter',
  );
  assert.deepEqual(empty.items ?? empty.entries ?? [], [], 'impossible audit filter must be empty');
  const real = expectOk(
    await globalAdmin.request('/api/admin/audit-log?limit=5'),
    'admin audit list',
  );
  const entries = real.items ?? real.entries ?? [];
  assert(Array.isArray(entries), 'admin audit list must be an array');
  assert.equal(
    typeof real.openAutoMergeConflictCount,
    'number',
    'open merge conflict count must be numeric',
  );
  return { impossibleFilterRows: 0, listedRows: entries.length };
}

function clientIds(responseBody) {
  const rows = Array.isArray(responseBody?.clients) ? responseBody.clients : [];
  return rows.map((row) => row?.userId ?? row?.id).filter((value) => typeof value === 'string');
}

async function proveDoctorTenantWalls(sessions) {
  const own = await sessions.doctor.request('/api/doctor/patients');
  const isolated = await sessions.isolatedDoctor.request('/api/doctor/patients');
  assert.equal(own.status, 200, 'doctor patient list failed');
  assert.equal(isolated.status, 200, 'isolated doctor patient list failed');
  const ownIds = clientIds(own.body);
  const isolatedIds = clientIds(isolated.body);
  const ownOnly = ownIds.find((id) => !isolatedIds.includes(id));
  const isolatedOnly = isolatedIds.find((id) => !ownIds.includes(id));
  assert(ownOnly, 'canonical DEV doctor fixture has no tenant-exclusive patient');
  assert(isolatedOnly, 'canonical DEV isolated fixture has no tenant-exclusive patient');

  expectOk(
    await sessions.doctor.request(`/api/doctor/patients/${encodeURIComponent(ownOnly)}`),
    'doctor own patient card',
  );
  expectNotFound(
    await sessions.isolatedDoctor.request(`/api/doctor/patients/${encodeURIComponent(ownOnly)}`),
    'isolated doctor foreign patient card',
  );
  expectNotFound(
    await sessions.doctor.request(`/api/doctor/patients/${encodeURIComponent(isolatedOnly)}`),
    'doctor isolated-clinic patient card',
  );

  const metric = expectOk(
    await sessions.doctor.request(
      '/api/doctor/analytics-metric-accounts?metric=clients_total&limit=10&offset=0',
    ),
    'doctor clients_total metric',
  );
  assert(Array.isArray(metric.items), 'clients_total metric items must be an array');
  return { doctorRows: ownIds.length, isolatedDoctorRows: isolatedIds.length };
}

async function proveWorkingHours(sessions) {
  const own = expectOk(
    await sessions.doctor.request('/api/doctor/booking-engine/working-hours'),
    'doctor working hours',
  );
  const isolated = expectOk(
    await sessions.isolatedDoctor.request('/api/doctor/booking-engine/working-hours'),
    'isolated doctor working hours',
  );
  const row = (own.rows ?? []).find((candidate) => typeof candidate?.id === 'string');
  assert(row, 'canonical DEV doctor fixture has no working-hours row');
  const before = row.isActive !== false;
  const toggled = !before;
  try {
    expectOk(
      await sessions.doctor.request('/api/doctor/booking-engine/working-hours', {
        method: 'PATCH',
        body: { id: row.id, isActive: toggled },
      }),
      'toggle own working hours',
    );
    const readback = expectOk(
      await sessions.doctor.request('/api/doctor/booking-engine/working-hours'),
      'working hours readback',
    );
    assert.equal(
      (readback.rows ?? []).find((candidate) => candidate.id === row.id)?.isActive,
      toggled,
      'working-hours state did not persist',
    );
    const foreign = await sessions.isolatedDoctor.request(
      '/api/doctor/booking-engine/working-hours',
      { method: 'PATCH', body: { id: row.id, isActive: before } },
    );
    assert.equal(foreign.status, 403, 'foreign working-hours mutation must be forbidden');
  } finally {
    expectOk(
      await sessions.doctor.request('/api/doctor/booking-engine/working-hours', {
        method: 'PATCH',
        body: { id: row.id, isActive: before },
      }),
      'restore working hours',
    );
  }
  return { ownRows: own.rows.length, isolatedRows: (isolated.rows ?? []).length, restored: true };
}

async function findBookingCandidate(patient) {
  const cities = expectOk(
    await patient.request('/api/booking/catalog/cities'),
    'booking cities',
  ).cities;
  for (const city of cities ?? []) {
    const servicesResult = await patient.request(
      `/api/booking/catalog/services?cityCode=${encodeURIComponent(city.code)}`,
    );
    if (servicesResult.status !== 200 || servicesResult.body?.ok !== true) continue;
    for (const service of servicesResult.body.services ?? []) {
      const slotsResult = await patient.request(
        `/api/booking/slots?type=in_person&branchId=${encodeURIComponent(city.id)}&serviceId=${encodeURIComponent(service.id)}`,
      );
      if (slotsResult.status !== 200 || slotsResult.body?.ok !== true) continue;
      const slots = (slotsResult.body.slots ?? []).flatMap((row) => row.slots ?? []);
      if (slots.length >= 2) return { city, service, slots };
    }
  }
  throw new Error('canonical named DEV has no booking candidate with two slots');
}

async function proveBookingLifecycle(sessions, runTag) {
  const { city, service, slots } = await findBookingCandidate(sessions.patient);
  const phone = sessions.patient.me?.phone;
  assert.equal(typeof phone, 'string', 'patient fixture has no phone for booking');
  const payload = {
    type: 'in_person',
    branchId: city.id,
    serviceId: service.id,
    cityCode: city.code,
    slotStart: slots[0].startAt,
    slotEnd: slots[0].endAt,
    contactName: `Аудит ${runTag}`,
    contactFio: { lastName: 'Аудит', firstName: 'Системный', patronymic: 'Проход' },
    contactPhone: phone,
  };
  const settledAttempts = await Promise.allSettled([
    sessions.patient.request('/api/booking/create', { method: 'POST', body: payload }),
    sessions.patient.request('/api/booking/create', { method: 'POST', body: payload }),
  ]);
  const attempts = settledAttempts
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const requestFailures = settledAttempts.filter((result) => result.status === 'rejected');
  const winners = attempts.filter((result) => result.status === 200 && result.body?.ok === true);
  const rejected = attempts.filter((result) => result.status === 409);
  const createdBookings = winners
    .map((result) => result.body?.booking)
    .filter((booking) => typeof booking?.id === 'string');
  let booking;
  try {
    assert.equal(requestFailures.length, 0, 'same-slot concurrency request failed before response');
    assert.equal(winners.length, 1, 'same-slot concurrency must have exactly one winner');
    assert.equal(rejected.length, 1, 'same-slot concurrency must reject exactly one contender');
    booking = winners[0].body.booking;
    assert.equal(typeof booking?.id, 'string', 'booking id missing');
    const own = expectOk(await sessions.patient.request('/api/booking/my'), 'booking readback');
    assert(
      (own.upcoming ?? []).some((row) => row.id === booking.id),
      'created booking is absent from upcoming readback',
    );
    const foreignCancel = await sessions.isolatedPatient.request('/api/booking/cancel', {
      method: 'POST',
      body: { bookingId: booking.id, reason: runTag },
    });
    expectNotFound(foreignCancel, 'foreign patient booking cancel');
    const rescheduled = expectOk(
      await sessions.patient.request('/api/booking/reschedule', {
        method: 'POST',
        body: {
          bookingId: booking.id,
          slotStart: slots[1].startAt,
          slotEnd: slots[1].endAt,
          reason: runTag,
        },
      }),
      'reschedule booking',
    );
    assert.equal(rescheduled.booking?.slotStart, slots[1].startAt, 'rescheduled slot mismatch');
    const movedReadback = expectOk(
      await sessions.patient.request('/api/booking/my'),
      'rescheduled booking readback',
    );
    assert.equal(
      (movedReadback.upcoming ?? []).find((row) => row.id === booking.id)?.slotStart,
      slots[1].startAt,
      'rescheduled booking is absent from upcoming readback',
    );
  } finally {
    const cleanupReadback = expectOk(
      await sessions.patient.request('/api/booking/my'),
      'booking cleanup discovery',
    );
    const cleanupBookings = new Map(createdBookings.map((created) => [created.id, created]));
    for (const tagged of cleanupReadback.upcoming ?? []) {
      if (tagged.contactName === payload.contactName && typeof tagged.id === 'string') {
        cleanupBookings.set(tagged.id, tagged);
      }
    }
    for (const created of cleanupBookings.values()) {
      const cancellation = await sessions.patient.request('/api/booking/cancel', {
        method: 'POST',
        body: { bookingId: created.id, reason: runTag },
      });
      if (cancellation.status !== 200 && cancellation.status !== 409) {
        throw new Error(`booking cleanup failed with status ${cancellation.status}`);
      }
    }
  }
  const terminal = expectOk(
    await sessions.patient.request('/api/booking/my'),
    'booking terminal readback',
  );
  assert(
    !(terminal.upcoming ?? []).some((row) => row.id === booking.id) &&
      (terminal.history ?? []).some((row) => row.id === booking.id && row.status === 'cancelled'),
    'terminal booking is not cancelled in the retained product history',
  );
  expectOk(await sessions.patient.request('/api/booking/history'), 'patient visit-history read');
  return { terminalState: 'cancelled', retainedTaggedRows: 1, concurrency: 'one_winner' };
}

async function provePatientTimezone(patient) {
  const before = expectOk(
    await patient.request('/api/patient/profile/calendar-timezone'),
    'patient timezone read',
  ).calendarTimezone;
  const target = before === 'Etc/UTC' ? 'Europe/Moscow' : 'Etc/UTC';
  try {
    expectOk(
      await patient.request('/api/patient/profile/calendar-timezone', {
        method: 'PATCH',
        body: { calendarTimezone: target },
      }),
      'patient timezone write',
    );
    const after = expectOk(
      await patient.request('/api/patient/profile/calendar-timezone'),
      'patient timezone readback',
    );
    assert.equal(after.calendarTimezone, target, 'patient timezone did not persist');
  } finally {
    expectOk(
      await patient.request('/api/patient/profile/calendar-timezone', {
        method: 'PATCH',
        body: { calendarTimezone: before ?? null },
      }),
      'restore patient timezone',
    );
  }
  return { restored: true };
}

async function proveSupportCommunication(sessions, runTag) {
  const boot = expectOk(
    await sessions.patient.request('/api/patient/messages'),
    'patient chat boot',
  );
  assert.equal(typeof boot.conversationId, 'string', 'patient conversation id missing');
  assert.equal(boot.readOnly, false, 'patient fixture conversation is read-only');
  const text = `named-dev:${runTag}`;
  expectOk(
    await sessions.patient.request('/api/patient/messages', {
      method: 'POST',
      body: { conversationId: boot.conversationId, text },
    }),
    'patient chat send',
  );
  const readback = expectOk(
    await sessions.patient.request(
      `/api/patient/messages?conversationId=${encodeURIComponent(boot.conversationId)}`,
    ),
    'patient chat readback',
  );
  assert(
    (readback.messages ?? []).some((message) => message.text === text),
    'chat message missing',
  );

  const doctorList = expectOk(
    await sessions.clinicAdmin.request('/api/doctor/messages/conversations'),
    'doctor conversation list',
  );
  assert(
    (doctorList.conversations ?? []).some((row) => row.conversationId === boot.conversationId),
    'doctor cannot see the patient conversation',
  );
  expectOk(
    await sessions.clinicAdmin.request(
      `/api/doctor/messages/${encodeURIComponent(boot.conversationId)}`,
    ),
    'doctor conversation read',
  );
  expectNotFound(
    await sessions.isolatedDoctor.request(
      `/api/doctor/messages/${encodeURIComponent(boot.conversationId)}`,
    ),
    'isolated doctor conversation read',
  );
  return { retainedTaggedMessages: 1, tag: runTag };
}

async function proveReminderRuleLifecycle(sessions) {
  const programs = expectOk(
    await sessions.patient.request('/api/patient/treatment-program-instances'),
    'read existing patient treatment programs',
  );
  const activeProgram = (programs.items ?? [])
    .filter((program) => program.status === 'active')
    .sort(
      (left, right) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)) ||
        String(right.id).localeCompare(String(left.id)),
    )[0];
  assert.equal(
    typeof activeProgram?.id,
    'string',
    'canonical patient fixture needs an existing active treatment program',
  );
  const created = expectOk(
    await sessions.patient.request('/api/patient/reminders/create', {
      method: 'POST',
      body: {
        linkedObjectType: 'rehab_program',
        linkedObjectId: activeProgram.id,
        enabled: true,
        schedule: {
          scheduleType: 'interval_window',
          intervalMinutes: 120,
          windowStartMinute: 600,
          windowEndMinute: 1200,
          daysMask: '1111111',
        },
      },
    }),
    'create patient reminder',
    201,
  );
  const id = created.reminder?.id;
  assert.equal(typeof id, 'string', 'created reminder id missing');
  try {
    const foreign = await sessions.isolatedPatient.request(
      `/api/patient/reminders/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { enabled: false } },
    );
    expectNotFound(foreign, 'foreign reminder mutation');
    const updated = expectOk(
      await sessions.patient.request(`/api/patient/reminders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { enabled: false },
      }),
      'update patient reminder',
    );
    assert.equal(updated.reminder?.enabled, false, 'reminder update did not persist');
  } finally {
    expectOk(
      await sessions.patient.request(`/api/patient/reminders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      'delete patient reminder',
    );
  }
  return { deleted: true };
}

async function runLive() {
  assertCanonicalNamedDevEnvFiles();
  const health = await fetch(`${CANONICAL_DEV_BASE_URL}/api/auth/dev-public`, {
    redirect: 'manual',
  });
  assert(
    [200, 303].includes(health.status),
    'shared DEV webapp is not reachable on 127.0.0.1:5200',
  );

  const runTag = randomUUID();
  try {
    const sessions = await openSessions();
    const scenarios = {};
    scenarios.adminAudit = await proveAdminAudit(sessions.globalAdmin);
    scenarios.doctorTenantWalls = await proveDoctorTenantWalls(sessions);
    scenarios.workingHours = await proveWorkingHours(sessions);
    scenarios.booking = await proveBookingLifecycle(sessions, runTag);
    scenarios.patientTimezone = await provePatientTimezone(sessions.patient);
    scenarios.supportCommunication = await proveSupportCommunication(sessions, runTag);
    scenarios.reminderRule = await proveReminderRuleLifecycle(sessions);
    return {
      ok: true,
      target: CANONICAL_DEV_DATABASE,
      baseUrl: CANONICAL_DEV_BASE_URL,
      runTag,
      coveredDeletedCalls: LIVE_COVERED_CALLS,
      scenarios,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`run ${runTag} failed: ${message}`);
  }
}

export function selfTestRegistry(candidate = LIVE_COVERAGE) {
  const expectedKeys = Object.keys(LIVE_COVERAGE).sort();
  const actualKeys = Object.keys(candidate).sort();
  assert.deepEqual(actualKeys, expectedKeys, 'live coverage registry keys changed');
  for (const [key, expected] of Object.entries(LIVE_COVERAGE)) {
    assert.equal(candidate[key], expected, `live coverage count changed for ${key}`);
  }
  assert.equal(LIVE_COVERED_CALLS, 33, 'live coverage total must stay explicit');
}

async function main() {
  assertCanonicalArgs(process.argv.slice(2));
  if (process.argv[2] === '--self-test') {
    assertCanonicalNamedDevEnvFiles();
    selfTestRegistry();
    console.log('named-dev-db-behavior-runner: SELF-TEST PASS (target refusal + 33-call registry)');
    return;
  }
  const result = await runLive();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `named-dev-db-behavior-runner: FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
