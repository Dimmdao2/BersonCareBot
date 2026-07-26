#!/usr/bin/env node
/**
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * !! DANGER: THIS SCRIPT OVERWRITES REAL PEOPLE'S LOGIN PASSWORDS.          !!
 * !!                                                                        !!
 * !! TEST is rebuilt from a PRODUCTION dump. The accounts named in         !!
 * !! --config are REAL PATIENTS, DOCTORS AND ADMINS, not fixtures. Before  !!
 * !! this script can log in as any of them it FIRST replaces their stored  !!
 * !! password hash (see upsertPasswordHashes below) -- there is no way to  !!
 * !! "just log in" without that step.                                     !!
 * !!                                                                        !!
 * !! It refuses to write ANYTHING unless BOTH are true:                    !!
 * !!   1. --i-understand-this-rewrites-real-passwords is passed, AND       !!
 * !!   2. every user id it would touch is explicitly listed in --config's  !!
 * !!      top-level "allowlist" array.                                     !!
 * !! Any doubt (missing flag, id not allowlisted, backup cannot be         !!
 * !! written) aborts with NO write. It never "warns and continues".        !!
 * !!                                                                        !!
 * !! On 2026-07-25 a worker ran an earlier, unguarded copy of this file    !!
 * !! and overwrote two real patients' password hashes by accident. That    !!
 * !! incident is prohibition #1 in docs/_TODO/HANDOFF_2026-07-26.md.       !!
 * !! DO NOT weaken or bypass these guards.                                 !!
 * !!                                                                        !!
 * !! Owner ruling 2026-07-26 (taskdb #1017): TEST ONLY. --db is checked    !!
 * !! against the exact hardcoded string "bersoncarebot_test" (see          !!
 * !! ALLOWED_TEST_DB_NAME below) before any connection or write -- there   !!
 * !! is no override flag. Running against PROD is refused by code, not    !!
 * !! just by convention. This file is deliberately UNTRACKED by git (see   !!
 * !! .gitignore) -- it stays on disk, on this box only, never in the repo. !!
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 *
 * Regenerates /run/bersoncarebot/saas-smoke.fixture (the operator fixture consumed by
 * smoke-saas-product.mjs / deploy/host/deploy-test-saas.sh:run_locked_product_smoke) by LOGGING IN
 * as real accounts on the target base URL and capturing the resulting session cookies. It never
 * forges a session — every cookie comes back from a real POST /api/auth/email-password/login (+
 * POST /api/admin/mode for the global_admin profile).
 *
 * Why this exists (2026-07-25): the previous fixture held cookies for the synthetic S3 demo
 * clinics A/B, which the owner retired 2026-07-24 when TEST was rebuilt from a fresh production
 * dump. Every authenticated smoke scenario failed (307/401) against users who no longer exist, and
 * because the smoke gate is mandatory, deploy-test-saas.sh aborted mid-closure and stopped every
 * TEST systemd unit. This script repoints the fixture at REAL accounts on whatever clinic is
 * actually live on TEST instead of re-seeding demo data. Per owner ruling 2026-07-26 (taskdb
 * #1017) this script runs against TEST only -- --db is hardcoded-checked, see
 * ALLOWED_TEST_DB_NAME below; there is no prod-cutover use of this file.
 *
 * Usage (run as a user that can both reach --base-url over HTTP and write to Postgres as a role
 * that owns user_password_credentials, e.g. the `dev` box user via `sudo -u postgres psql`):
 *
 *   node docs/_TODO/SAAS_FOUNDATION/scripts/regenerate-saas-smoke-fixture.mjs \
 *     --base-url=https://test.bersoncare.ru \
 *     --db=bersoncarebot_test \
 *     --out=/run/bersoncarebot/saas-smoke.fixture \
 *     --config=/path/to/smoke-fixture-accounts.json \
 *     --i-understand-this-rewrites-real-passwords
 *
 * The --config file is a small JSON document (see `sampleConfig()` below, or run with
 * --print-sample-config) naming the real user ids/emails to use for each profile plus the
 * requiredFixtureRefs values. It intentionally lives OUTSIDE this repo (same rule as the fixture
 * itself) because it names real people. Nothing in this script ever prints a password, a password
 * hash, or a session cookie to stdout/stderr — only ok/fail status lines.
 *
 * The config file must ALSO carry a top-level "allowlist": string[] naming every user id this run
 * is authorized to touch. This is deliberately a second, independent list from "accounts" (not
 * derived from it) so a typo'd or copy-pasted wrong id in "accounts" does not silently pass — the
 * operator has to consciously re-affirm each id. A run whose "accounts" name any id missing from
 * "allowlist" aborts before any write, naming the offending id. The allowlist lives in the config
 * file (not a CLI flag) because the config file already lives outside the repo for the same
 * "names real people" reason, and because the ids only make sense alongside the accounts they gate.
 *
 * Before any password is overwritten, the script backs up the current row (or the fact that no row
 * exists yet) for every id it is about to touch to a SQL restore script outside this repo, mode
 * 0600, and prints the path plus a ready-to-paste restore command. If the backup cannot be written,
 * the run aborts with no write.
 *
 * Picking real ids at prod cutover (or any time TEST is rebuilt from a fresh dump): open
 * bersoncarebot_test (or the prod DB, read-only) and choose, per profile:
 *   doctor        — a be_organization_members row with role IN ('owner','doctor') for the org you
 *                   want to smoke-test; use its platform_user_id. Needs email + email_verified_at.
 *   clinic_admin  — a distinct role='admin' member if one exists; otherwise it is legitimate (and
 *                   is what this script does by default) to reuse the doctor/owner session, since
 *                   membershipRole='owner' already satisfies canManageOrganization — see
 *                   apps/webapp/src/app-layer/guards/workspaceCapabilities.ts.
 *   global_admin  — a platform_users row with role='admin' (the site-wide operator), email + verified.
 *   patient       — an org_enrollments row for that org whose platform_user_id has: email +
 *                   email_verified_at, an active treatment_program_instances row with
 *                   assignment_source='doctor', at least one program_action_log row for that
 *                   instance (doctor.analytics.patient-engagement needs non-empty `entries`), and a
 *                   doctor_patient_support row with on_support=true (patient.program.item.discussion-
 *                   summary needs comments enabled) OR reflect its absence as a known gap.
 * A single SQL sketch for all of that lives in this file's `pickCandidatesQuery` export — run it
 * read-only against the target DB to shortlist candidates before writing --config.
 *
 * Known, currently-unfixable limitation this script does NOT attempt to paper over: if the target
 * org has no clinic_public_directory_entries row (no in-app publish flow is wired yet — see
 * modules/clinic-directory/ports.ts, zero route callers of reserveSlug/claimReservedSlug today),
 * `publicBookingOrganizationSlug` cannot resolve to a real slug. Put any non-empty placeholder in
 * --config for that ref (the fixture schema just requires a non-empty string) and exclude
 * `public.booking.slots` from the pass/fail scenario set — deploy-test-saas.sh's
 * run_locked_product_smoke already does this by default via SAAS_PRODUCT_SMOKE_KNOWN_SKIP_IDS.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIRM_FLAG = "--i-understand-this-rewrites-real-passwords";

// Owner ruling 2026-07-26 (taskdb #1017): this script may be run ONLY against TEST, checked by
// exact database name -- not "starts with", not "contains". Canonical TEST database name per
// docs/ARCHITECTURE/SERVER CONVENTIONS.md ("Тест-БД `bersoncarebot_test` на том же PG16
// (`:5432`)"). Deliberately NO override flag: the owner's ruling is "TEST only", full stop, and
// an escape hatch here would just be a backdoor around that -- if a future run truly needs a
// different target, that is a new owner ruling, not a flag in this file.
const ALLOWED_TEST_DB_NAME = "bersoncarebot_test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(resolve(repoRoot, "apps/webapp/package.json"));

const sessionCookieName = "bersoncare_webapp_session";

export const pickCandidatesQuery = `
-- Read-only shortlist for --config. Run against the TARGET database (TEST or, read-only, prod).
select pu.id, pu.role, pu.display_name, pu.email, pu.email_verified_at,
       bom.organization_id, bom.role as membership_role
from platform_users pu
join be_organization_members bom on bom.platform_user_id = pu.id
where pu.email is not null and pu.email_verified_at is not null
order by bom.organization_id, bom.role;

-- Patient candidates with real engagement + support enabled (avoids any extra mutation):
select pu.id, pu.display_name, pu.email, tpi.id as instance_id, tpi.assignment_source,
       (select count(*) from program_action_log pal where pal.instance_id = tpi.id) as action_log_count,
       coalesce(dps.on_support, false) as on_support
from platform_users pu
join org_enrollments oe on oe.platform_user_id = pu.id
join treatment_program_instances tpi on tpi.patient_user_id = pu.id and tpi.status = 'active'
left join doctor_patient_support dps on dps.patient_user_id = pu.id
where pu.email is not null and pu.email_verified_at is not null and oe.organization_id = $1
order by action_log_count desc;
`;

function fail(message) {
  throw new Error(message);
}

// Guard 0: hard-coded TEST-only database name check. Runs BEFORE any network call, any DB
// connection, any config/file read -- the first thing main() does with a parsed --db. Strict
// equality (never `includes`/`startsWith`) so an unknown name, an empty string, or a name that
// merely contains "bersoncarebot_test" (e.g. a typo'd "bersoncarebot_test_old" or the prod name
// "bersoncarebot") are all refused the same way. Fail closed: any falsy/non-string value refuses.
function assertTestDatabaseOrDie(db) {
  if (typeof db !== "string" || db.length === 0 || db !== ALLOWED_TEST_DB_NAME) {
    fail(
      `refusing to run: --db must be exactly "${ALLOWED_TEST_DB_NAME}" (the TEST database; see ` +
        `docs/ARCHITECTURE/SERVER CONVENTIONS.md). Got: ${JSON.stringify(db)}. This script rewrites ` +
        `REAL password hashes (TEST is rebuilt from a production dump) and per owner ruling ` +
        `2026-07-26 (taskdb #1017) may run against TEST only. No connection was attempted, no ` +
        `write was performed.`,
    );
  }
}

// Defense in depth: --db is a plain string handed straight to `psql -d <db>` with no env var or
// URL indirection in this script, so in the current code path assertTestDatabaseOrDie above is
// already exact. This second check asks Postgres itself which database the connection actually
// landed on (`current_database()`) and re-confirms it matches, so a future refactor that adds a
// DATABASE_URL/service-alias layer -- or a psql service file mapping the name elsewhere -- cannot
// silently point a "bersoncarebot_test"-looking run at something else. Read-only, no write; runs
// before backupExistingHashes/upsertPasswordHashes.
function assertConnectionTargetsTestDb(db) {
  let actual;
  try {
    actual = execFileSync(
      "sudo",
      ["-u", "postgres", "psql", "-d", db, "-X", "-A", "-t", "-c", "SELECT current_database();"],
      { encoding: "utf8" },
    ).trim();
  } catch (error) {
    fail(`could not verify the connection actually targets ${ALLOWED_TEST_DB_NAME}: ${error.message}. No write was performed.`);
  }
  if (actual !== ALLOWED_TEST_DB_NAME) {
    fail(
      `refusing to run: connected database reports current_database()=${JSON.stringify(actual)}, ` +
        `expected exactly "${ALLOWED_TEST_DB_NAME}". No write was performed.`,
    );
  }
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    db: null,
    out: null,
    config: null,
    printSampleConfig: false,
    confirmRewrite: false,
  };
  for (const arg of argv) {
    if (arg === "--print-sample-config") options.printSampleConfig = true;
    else if (arg === CONFIRM_FLAG) options.confirmRewrite = true;
    else if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--db=")) options.db = arg.slice("--db=".length);
    else if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    else if (arg.startsWith("--config=")) options.config = arg.slice("--config=".length);
    else fail(`unknown argument: ${arg}`);
  }
  return options;
}

function sampleConfig() {
  return {
    accounts: {
      doctor: { userId: "00000000-0000-4000-8000-000000000000", email: "doctor@example.test" },
      global_admin: { userId: "00000000-0000-4000-8000-000000000001", email: "admin@example.test" },
      patient: { userId: "00000000-0000-4000-8000-000000000002", email: "patient@example.test" },
    },
    // Every id the script will WRITE a password hash for (doctor/global_admin/patient above) must
    // also appear here, verbatim. This is a second, independent list — not derived from
    // "accounts" — so a wrong/typo'd id in "accounts" cannot silently pass. Any id in "accounts"
    // missing from here aborts the run before any write.
    allowlist: [
      "00000000-0000-4000-8000-000000000000",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ],
    // clinic_admin is optional: omit it to reuse the doctor session (see module docstring above).
    refs: {
      doctorClientUserId: "00000000-0000-4000-8000-000000000002",
      patientProgramInstanceId: "00000000-0000-4000-8000-000000000003",
      patientProgramItemId: "00000000-0000-4000-8000-000000000004",
      mediaFileId: "00000000-0000-4000-8000-000000000005",
      publicBookingBranchId: "00000000-0000-4000-8000-000000000006",
      publicBookingClinicServiceId: "00000000-0000-4000-8000-000000000007",
      publicBookingOrganizationSlug: "placeholder-no-published-slug",
      clinicAAppointmentId: "00000000-0000-4000-8000-000000000008",
    },
  };
}

async function hashPassword(plain) {
  const argon2 = require("argon2");
  return argon2.hash(plain, { type: argon2.argon2id });
}

function upsertPasswordHashes(db, entries) {
  // Applies via `sudo -u postgres psql -f -`, piping the SQL directly over stdin (the `input`
  // option below) — no temp file ever touches disk, so the hash never appears as a command-line
  // argument or in a discoverable path.
  const sql = entries
    .map(
      ({ userId, hash }) => `INSERT INTO user_password_credentials (user_id, password_hash, algo, updated_at)
VALUES ('${userId}'::uuid, '${hash}', 'argon2id', now())
ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, algo = 'argon2id', updated_at = now();`,
    )
    .join("\n");
  execFileSync("sudo", ["-u", "postgres", "psql", "-d", db, "-X", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

// Backs up the CURRENT state (existing row, or "no row yet") of every userId about to be
// overwritten to a SQL restore script outside the repo, mode 0600, before any write happens.
// Fails closed: any error here (query fails, directory/file cannot be created) throws and the
// caller must not proceed to upsertPasswordHashes. Returns the backup file path (never its
// contents — callers must only log the path).
function backupExistingHashes(db, userIds) {
  const idList = userIds.map((id) => `'${id}'::uuid`).join(", ");
  const selectSql = `SELECT user_id, password_hash, algo, updated_at FROM user_password_credentials WHERE user_id IN (${idList});`;
  let existingRaw;
  try {
    existingRaw = execFileSync(
      "sudo",
      ["-u", "postgres", "psql", "-d", db, "-X", "-A", "-t", "-F", "\x1f", "-c", selectSql],
      { encoding: "utf8" },
    );
  } catch (error) {
    fail(`could not read existing password credentials to back them up: ${error.message}. No write was performed.`);
  }

  const existingById = new Map();
  for (const line of existingRaw.split("\n")) {
    if (!line.trim()) continue;
    const [userId, hash, algo, updatedAt] = line.split("\x1f");
    existingById.set(userId, { hash, algo, updatedAt });
  }

  const dir = resolve(homedir(), ".bersoncare-smoke-fixture-backups");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(dir, `${db}-${timestamp}.restore.sql`);
  const statements = userIds.map((userId) => {
    const existing = existingById.get(userId);
    if (existing) {
      return `UPDATE user_password_credentials SET password_hash = '${existing.hash}', algo = '${existing.algo}', updated_at = '${existing.updatedAt}' WHERE user_id = '${userId}'::uuid;`;
    }
    return `DELETE FROM user_password_credentials WHERE user_id = '${userId}'::uuid; -- had no prior row, restore = remove the row this run created`;
  });
  // Stdin redirection, not `-f <path>`: the backup file is mode 0600 owned by the invoking user,
  // so `psql -f <path>` run as the postgres user (via sudo -u postgres) cannot open() it. `<` is
  // opened by the shell as the invoking user BEFORE the sudo exec, so the already-open fd is
  // inherited — permission is checked once, correctly, at the owning user's read.
  const restoreCommand = `sudo -u postgres psql -d ${db} -X -v ON_ERROR_STOP=1 -f - < ${backupPath}`;
  const contents =
    `-- Restore script for user_password_credentials, generated ${new Date().toISOString()}\n` +
    `-- Restores the ${userIds.length} account(s) touched by regenerate-saas-smoke-fixture.mjs to\n` +
    `-- their pre-run state. Apply with:\n` +
    `--   ${restoreCommand}\n\n` +
    `${statements.join("\n")}\n`;

  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(backupPath, contents, { mode: 0o600 });
    // Belt-and-braces: writeFileSync's mode can be loosened by umask on some systems, so pin it
    // explicitly. If this throws, the backup is not trustworthy — fail closed.
    chmodSync(backupPath, 0o600);
  } catch (error) {
    fail(`could not write backup file at ${backupPath}: ${error.message}. Refusing to overwrite any password without a verified backup. No write was performed.`);
  }

  return { backupPath, restoreCommand };
}

function firstSessionCookie(setCookieHeaders) {
  for (const raw of setCookieHeaders ?? []) {
    const match = raw.match(new RegExp(`^(${sessionCookieName}=[^;]+)`));
    if (match) return match[1];
  }
  return null;
}

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/email-password/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const body = await response.json().catch(() => null);
  const cookie = firstSessionCookie(setCookies);
  if (response.status !== 200 || body?.ok !== true || !cookie) {
    fail(`login_failed:${email.replace(/.(?=.{2}@)/g, "*")}`); // never print the full email either
  }
  if (body?.factorRequired === true) fail("login_requires_second_factor_unsupported_by_this_script");
  return cookie;
}

async function elevateAdminMode(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/admin/mode`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl },
    redirect: "manual",
  });
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const body = await response.json().catch(() => null);
  const elevated = firstSessionCookie(setCookies);
  if (response.status !== 200 || body?.adminMode !== true || !elevated) {
    fail("admin_mode_elevation_failed");
  }
  return elevated;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printSampleConfig) {
    process.stdout.write(`${JSON.stringify(sampleConfig(), null, 2)}\n`);
    return;
  }
  if (!options.baseUrl || !options.db || !options.out || !options.config) {
    fail(
      "usage: regenerate-saas-smoke-fixture.mjs --base-url=<url> --db=<database> --out=<fixture path> --config=<accounts json> " +
        CONFIRM_FLAG +
        "\n       regenerate-saas-smoke-fixture.mjs --print-sample-config",
    );
  }

  // Guard 0: TEST-only database name, checked before any connection/read/write of any kind.
  assertTestDatabaseOrDie(options.db);

  const config = JSON.parse(readFileSync(options.config, "utf8"));
  const profiles = ["doctor", "global_admin", "patient"];
  const targetIds = [];
  for (const profile of profiles) {
    const account = config.accounts[profile];
    if (!account) fail(`config missing accounts.${profile}`);
    targetIds.push({ profile, userId: account.userId });
  }

  // Guard 1: mandatory explicit flag. Fail closed with NO write, naming exactly who it would
  // have touched (by user id only — never email/name/etc).
  if (!options.confirmRewrite) {
    fail(
      `refusing to run: this would overwrite REAL password hashes for:\n` +
        targetIds.map(({ profile, userId }) => `  - ${profile}: ${userId}`).join("\n") +
        `\nRe-run with ${CONFIRM_FLAG} to proceed. No write was performed.`,
    );
  }

  // Guard 2: allowlist. Every id this run would touch must be explicitly present in config's
  // "allowlist" array. Fail closed BEFORE any write, naming the offending id.
  const allowlist = Array.isArray(config.allowlist) ? new Set(config.allowlist) : null;
  if (!allowlist || allowlist.size === 0) {
    fail(
      `config is missing a non-empty top-level "allowlist" array of permitted user ids (see --print-sample-config). No write was performed.`,
    );
  }
  for (const { profile, userId } of targetIds) {
    if (!allowlist.has(userId)) {
      fail(
        `refusing to write: user id ${userId} (profile ${profile}) is NOT present in config's "allowlist" array. ` +
          `Add it explicitly to authorize this run. No write was performed.`,
      );
    }
  }

  // Guard 3: re-confirm the live connection actually landed on the TEST database (defense in
  // depth on top of Guard 0's --db string check; see assertConnectionTargetsTestDb above).
  assertConnectionTargetsTestDb(options.db);

  // Guard 4: automatic backup of the pre-run state, before any overwrite.
  const { backupPath, restoreCommand } = backupExistingHashes(
    options.db,
    targetIds.map((t) => t.userId),
  );
  console.log(`backup written: ${backupPath} (mode 0600; contents not printed)`);
  console.log(`restore command: ${restoreCommand}`);

  const passwordEntries = [];
  const passwordsByProfile = {};
  for (const { profile, userId } of targetIds) {
    const password = randomBytes(24).toString("base64url");
    const hash = await hashPassword(password);
    passwordEntries.push({ userId, hash });
    passwordsByProfile[profile] = password;
  }
  upsertPasswordHashes(options.db, passwordEntries);
  console.log(`upserted password credentials for: ${profiles.join(", ")} (not printed)`);

  const cookies = {};
  for (const profile of profiles) {
    const account = config.accounts[profile];
    cookies[profile] = await login(options.baseUrl, account.email, passwordsByProfile[profile]);
    console.log(`logged in: ${profile} (cookie captured, not printed)`);
  }
  cookies.clinic_admin = config.accounts.clinic_admin
    ? await login(options.baseUrl, config.accounts.clinic_admin.email, passwordsByProfile.clinic_admin)
    : cookies.doctor;
  if (!config.accounts.clinic_admin) {
    console.log("clinic_admin: reusing doctor session (no distinct clinic_admin in config)");
  }

  cookies.global_admin = await elevateAdminMode(options.baseUrl, cookies.global_admin);
  console.log("elevated: global_admin adminMode=true");

  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: cookies.doctor } },
      clinic_admin: { headers: { Cookie: cookies.clinic_admin } },
      patient: { headers: { Cookie: cookies.patient } },
      global_admin: { headers: { Cookie: cookies.global_admin }, adminMode: true },
      public: { headers: {} },
    },
    refs: config.refs,
  };

  writeFileSync(options.out, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o640 });
  console.log(`fixture written: ${options.out} (contents not printed; set ownership root:deploy 0640 separately)`);
}

main().catch((error) => {
  console.error(`regenerate-saas-smoke-fixture: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
