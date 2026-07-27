#!/usr/bin/env node
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const DEFAULT_PACKET_PATH = "/opt/env/bersoncarebot/saas-smoke-login.env";
const DEFAULT_REFS_PATH = "/run/bersoncarebot/saas-smoke.fixture";
const SESSION_COOKIE_NAME = "bersoncare_webapp_session";
const PACKET_KEYS = Object.freeze([
  "SAAS_SMOKE_LOGIN_ENABLED",
  "SAAS_SMOKE_DOCTOR_EMAIL",
  "SAAS_SMOKE_DOCTOR_PASSWORD",
  "SAAS_SMOKE_GLOBAL_ADMIN_EMAIL",
  "SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD",
  "SAAS_SMOKE_PATIENT_EMAIL",
  "SAAS_SMOKE_PATIENT_PASSWORD",
]);
const REQUIRED_REF_KEYS = Object.freeze([
  "doctorClientUserId",
  "patientProgramInstanceId",
  "patientProgramItemId",
  "mediaFileId",
  "publicBookingBranchId",
  "publicBookingClinicServiceId",
  "publicBookingOrganizationSlug",
  "clinicAAppointmentId",
]);
const ALLOWED_PACKET_KEYS = new Set(PACKET_KEYS);
const UNSAFE_VALUE_PATTERN = /\$\(|\$\{|`/;

function fail(code) {
  throw new Error(code);
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    packetPath: DEFAULT_PACKET_PATH,
    refsPath: DEFAULT_REFS_PATH,
    outPath: null,
    check: false,
  };
  for (const arg of argv) {
    if (arg === "--check") options.check = true;
    else if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--packet=")) options.packetPath = arg.slice("--packet=".length);
    else if (arg.startsWith("--refs-from=")) options.refsPath = arg.slice("--refs-from=".length);
    else if (arg.startsWith("--out=")) options.outPath = arg.slice("--out=".length);
    else fail("unknown_argument");
  }
  if (!options.packetPath) fail("packet_path_required");
  if (!options.refsPath) fail("refs_path_required");
  if (!options.check && !options.baseUrl) fail("base_url_required");
  if (!options.check && !options.outPath) fail("out_path_required");
  return options;
}

function assertNoSymlinkParents(filePath) {
  let current = dirname(resolve(filePath));
  while (true) {
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink()) fail("symlink_parent_forbidden");
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function resolveDeployGroupId(groupFile = "/etc/group") {
  const line = readFileSync(groupFile, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("deploy:"));
  const groupId = Number((line?.split(":") ?? [])[2]);
  if (!Number.isSafeInteger(groupId) || groupId < 0) fail("deploy_group_not_found");
  return groupId;
}

function validatePacketMetadata(metadata, expectedGroupId) {
  if (metadata.isSymbolicLink()) fail("symlink_forbidden");
  if (!metadata.isFile()) fail("regular_file_required");
  if ((metadata.mode & 0o777) !== 0o640) fail("mode_must_be_0640");
  if (metadata.uid !== 0) fail("owner_must_be_root");
  if (metadata.gid !== expectedGroupId) fail("group_must_be_deploy");
}

function parsePacket(text) {
  const parsed = Object.create(null);
  const seen = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=("(?:[^"\\]|\\.)*")$/.exec(rawLine);
    if (!match) fail("malformed_line");
    const [, key, encodedValue] = match;
    if (!ALLOWED_PACKET_KEYS.has(key)) fail("unknown_key");
    if (seen.has(key)) fail("duplicate_key");
    if (UNSAFE_VALUE_PATTERN.test(encodedValue)) fail("unsafe_value");
    let value;
    try {
      value = JSON.parse(encodedValue);
    } catch {
      fail("malformed_value");
    }
    if (typeof value !== "string" || value.length === 0) fail("empty_value");
    if (UNSAFE_VALUE_PATTERN.test(value)) fail("unsafe_value");
    seen.add(key);
    parsed[key] = value;
  }
  if (seen.size !== PACKET_KEYS.length || PACKET_KEYS.some((key) => !seen.has(key))) fail("missing_key");
  if (parsed.SAAS_SMOKE_LOGIN_ENABLED !== "1") fail("explicit_enable_required");
  return Object.freeze(parsed);
}

function readPacket(filePath) {
  try {
    assertNoSymlinkParents(filePath);
    validatePacketMetadata(lstatSync(filePath), resolveDeployGroupId());
    return parsePacket(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") fail("packet_missing");
    throw error;
  }
}

function readRefs(filePath) {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") fail("refs_fixture_missing");
    fail("refs_fixture_unreadable");
  }
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture) || !fixture.refs || typeof fixture.refs !== "object" || Array.isArray(fixture.refs)) {
    fail("refs_missing");
  }
  const refs = {};
  for (const key of REQUIRED_REF_KEYS) {
    const value = fixture.refs[key];
    if (typeof value !== "string" || value.trim().length === 0) fail(`refs_missing:${key}`);
    refs[key] = value;
  }
  return Object.freeze(refs);
}

function normalizedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("invalid_base_url");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash) {
    fail("invalid_base_url");
  }
  return url.origin;
}

function firstSessionCookie(setCookieHeaders) {
  for (const raw of setCookieHeaders ?? []) {
    const match = raw.match(new RegExp(`^(${SESSION_COOKIE_NAME}=[^;]+)`));
    if (match) return match[1];
  }
  return null;
}

async function login(baseUrl, actor, email, password) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/auth/email-password/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });
  } catch {
    fail(`actor=${actor} login_failed http_status=network_error`);
  }
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const body = await response.json().catch(() => null);
  const cookie = firstSessionCookie(setCookies);
  if (response.status !== 200 || body?.ok !== true || !cookie || body?.factorRequired === true) {
    fail(`actor=${actor} login_failed http_status=${response.status}`);
  }
  return cookie;
}

async function elevateAdminMode(baseUrl, cookie) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/admin/mode`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: baseUrl },
      redirect: "manual",
    });
  } catch {
    fail("actor=global_admin admin_mode_failed http_status=network_error");
  }
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const body = await response.json().catch(() => null);
  const elevated = firstSessionCookie(setCookies);
  if (response.status !== 200 || body?.adminMode !== true || !elevated) {
    fail(`actor=global_admin admin_mode_failed http_status=${response.status}`);
  }
  return elevated;
}

function writeFixtureAtomically(outPath, fixture) {
  const directory = dirname(resolve(outPath));
  const directoryMetadata = lstatSync(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) fail("out_parent_must_be_real_directory");
  const temporary = `${outPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(fixture, null, 2)}\n`, { encoding: "utf8", mode: 0o640, flag: "wx" });
    chmodSync(temporary, 0o640);
    renameSync(temporary, outPath);
    if ((lstatSync(outPath).mode & 0o777) !== 0o640) fail("fixture_mode_must_be_0640");
  } catch {
    rmSync(temporary, { force: true });
    fail("fixture_write_failed");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const refs = readRefs(options.refsPath);
  const packet = readPacket(options.packetPath);
  if (options.check) {
    process.stdout.write(`ready: packet=${options.packetPath} refs=${options.refsPath}\n`);
    return;
  }

  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const doctor = await login(baseUrl, "doctor", packet.SAAS_SMOKE_DOCTOR_EMAIL, packet.SAAS_SMOKE_DOCTOR_PASSWORD);
  const patient = await login(baseUrl, "patient", packet.SAAS_SMOKE_PATIENT_EMAIL, packet.SAAS_SMOKE_PATIENT_PASSWORD);
  const globalAdminLogin = await login(
    baseUrl,
    "global_admin",
    packet.SAAS_SMOKE_GLOBAL_ADMIN_EMAIL,
    packet.SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD,
  );
  const globalAdmin = await elevateAdminMode(baseUrl, globalAdminLogin);
  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: doctor } },
      clinic_admin: { headers: { Cookie: doctor } },
      patient: { headers: { Cookie: patient } },
      global_admin: { headers: { Cookie: globalAdmin }, adminMode: true },
      public: { headers: {} },
    },
    refs,
  };
  writeFixtureAtomically(options.outPath, fixture);
  process.stdout.write(`minted: out=${options.outPath} actors=doctor,clinic_admin,patient,global_admin,public\n`);
}

main().catch((error) => {
  process.stderr.write(`mint-smoke-session: ${error instanceof Error ? error.message : "failed"}\n`);
  process.exitCode = 1;
});
