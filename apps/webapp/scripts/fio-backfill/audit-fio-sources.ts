#!/usr/bin/env tsx
/**
 * Read-only FIO/source quality audit for the FIO identity cleanup initiative.
 *
 * Outputs PII-containing reports under `.tmp/fio-backfill/reports/`.
 * Do not paste report contents into chat/logs.
 *
 * Usage:
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run fio:audit-sources
 */
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type PlatformUserRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  phone_normalized: string | null;
  email: string | null;
  email_normalized: string | null;
  email_verified_at: string | null;
  created_at: string;
};

type BookingNameRow = {
  platform_user_id: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_name: string | null;
  source: string | null;
  rubitime_id: string | null;
  slot_start: string | null;
};

type AppointmentRecordNameRow = {
  platform_user_id: string | null;
  phone_normalized: string | null;
  status: string | null;
  record_at: string | null;
  payload_name: string | null;
  payload_email: string | null;
};

type RubitimeRecordNameRow = {
  phone_normalized: string | null;
  status: string | null;
  record_at: string | null;
  payload_name: string | null;
  payload_email: string | null;
};

type SupplementaryContactRow = {
  platform_user_id: string;
  contact_type: string;
  source: string;
  value_normalized: string;
};

type UserNameQuality = {
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  phoneNormalized: string | null;
  emailNormalized: string | null;
  emailVerified: boolean;
  displayTokenCount: number;
  displayScript: "empty" | "cyrillic" | "latin" | "mixed" | "other";
  structuredState:
    | "missing_all"
    | "first_only"
    | "last_only"
    | "first_last"
    | "first_last_patronymic"
    | "other_partial";
  bookingNameCandidates: string[];
  appointmentNameCandidates: string[];
  rubitimeNameCandidatesByPhone: string[];
  supplementaryBookingEmails: string[];
  hasBookingProfileConflict: boolean;
  conflictNotes: string[];
};

type ReportSummary = {
  generatedAt: string;
  userCount: number;
  missingAllStructured: number;
  firstOnly: number;
  firstLast: number;
  firstLastPatronymic: number;
  displayEmpty: number;
  displayOneToken: number;
  displayTwoTokens: number;
  displayThreePlusTokens: number;
  displayLatinOrMixed: number;
  usersWithBookingCandidates: number;
  usersWithAppointmentCandidates: number;
  usersWithRubitimeCandidatesByPhone: number;
  usersWithBookingProfileConflicts: number;
  verifiedEmailUsers: number;
  bookingRowsWithContactEmail: number;
  bookingRowsWithMissingContactEmail: number;
  profileVerifiedEmailButBookingEmailMissingRows: number;
};

const CODE_PATH_INVENTORY = [
  {
    area: "Canonical user schema",
    paths: ["apps/webapp/db/schema/schema.ts"],
    notes: "platform_users currently stores display_name, first_name, last_name, patronymic, phone/email, email_verified_at.",
  },
  {
    area: "Patient booking UI and contract",
    paths: [
      "apps/webapp/src/app/app/patient/booking/new/confirm/page.tsx",
      "apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx",
      "apps/webapp/src/modules/patient-booking/types.ts",
      "apps/webapp/src/modules/patient-booking/createInputValidation.ts",
      "apps/webapp/src/modules/patient-booking/canonicalCreate.ts",
      "apps/webapp/src/modules/patient-booking/service.ts",
    ],
    notes: "Current patient booking flow passes a single contactName and prefills it from session displayName; email field starts empty.",
  },
  {
    area: "Rubitime / booking projections",
    paths: [
      "apps/webapp/src/modules/integrator/events.ts",
      "apps/integrator/src/integrations/rubitime/connector.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "packages/booking-rubitime-sync/src/upsertPatientBookingFromRubitime.ts",
    ],
    notes: "Rubitime full names arrive as payload.name/contactName and are projected into patient_bookings.contact_name and platform user ensure paths.",
  },
  {
    area: "Merge and dedupe",
    paths: [
      "packages/platform-merge/src/pgPlatformUserMerge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/autoMergeScalarEffective.ts",
    ],
    notes: "Current merge SQL resolves display_name/first_name/last_name via phone/created_at/COALESCE rules; no source-strength model yet.",
  },
  {
    area: "OAuth / messenger identity",
    paths: [
      "apps/webapp/src/modules/auth/service.ts",
      "apps/webapp/src/modules/auth/oauthWebLoginResolve.ts",
      "apps/webapp/src/modules/auth/oauthYandexResolve.ts",
      "apps/webapp/src/infra/repos/pgIdentityResolution.ts",
      "apps/integrator/src/integrations/telegram/webhook.ts",
      "apps/integrator/src/integrations/telegram/mapIn.ts",
    ],
    notes: "Provider names are weaker hints and must not overwrite booking/manual FIO.",
  },
  {
    area: "Doctor and patient display",
    paths: [
      "apps/webapp/src/modules/doctor-clients/**",
      "apps/webapp/src/app/app/doctor/**",
      "apps/webapp/src/app/app/patient/**",
      "apps/webapp/src/shared/types/session.ts",
    ],
    notes: "Doctor surfaces still use displayName in many places; patient session already exposes firstName for greeting but not all surfaces use it.",
  },
  {
    area: "Booking lifecycle notifications",
    paths: [
      "apps/webapp/src/modules/booking-notifications/settings.ts",
      "apps/webapp/src/app/app/settings/BookingEventNotificationsSection.tsx",
      "apps/integrator/src/integrations/rubitime/recordM2mRoute.ts",
    ],
    notes: "booking_lifecycle_notifications exists but currently stores switches, while integrator lifecycle texts are hardcoded.",
  },
] as const;

function asNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNameForCompare(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function uniqueNonEmpty(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = asNonEmpty(value);
    if (!text) continue;
    const key = normalizeNameForCompare(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function tokenCount(value: string): number {
  const text = value.trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function scriptKind(value: string): UserNameQuality["displayScript"] {
  const text = value.trim();
  if (!text) return "empty";
  const hasCyrillic = /[А-Яа-яЁё]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasCyrillic && hasLatin) return "mixed";
  if (hasCyrillic) return "cyrillic";
  if (hasLatin) return "latin";
  return "other";
}

function structuredState(user: PlatformUserRow): UserNameQuality["structuredState"] {
  const first = Boolean(asNonEmpty(user.first_name));
  const last = Boolean(asNonEmpty(user.last_name));
  const patronymic = Boolean(asNonEmpty(user.patronymic));
  if (!first && !last && !patronymic) return "missing_all";
  if (first && !last && !patronymic) return "first_only";
  if (!first && last && !patronymic) return "last_only";
  if (first && last && !patronymic) return "first_last";
  if (first && last && patronymic) return "first_last_patronymic";
  return "other_partial";
}

function doctorFioFromProfile(user: PlatformUserRow): string | null {
  return asNonEmpty([user.last_name, user.first_name, user.patronymic].filter(Boolean).join(" "));
}

function pushGrouped(map: Map<string, string[]>, key: string | null | undefined, value: string | null | undefined) {
  const k = asNonEmpty(key);
  const v = asNonEmpty(value);
  if (!k || !v) return;
  const list = map.get(k) ?? [];
  list.push(v);
  map.set(k, list);
}

function csvEscape(value: string | number | boolean | null): string {
  const text = String(value ?? "");
  if (!/[",\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(path: string, rows: UserNameQuality[]) {
  const header = [
    "userId",
    "displayName",
    "firstName",
    "lastName",
    "patronymic",
    "phoneNormalized",
    "emailNormalized",
    "emailVerified",
    "displayTokenCount",
    "displayScript",
    "structuredState",
    "bookingNameCandidates",
    "appointmentNameCandidates",
    "rubitimeNameCandidatesByPhone",
    "supplementaryBookingEmails",
    "hasBookingProfileConflict",
    "conflictNotes",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.userId,
        row.displayName,
        row.firstName,
        row.lastName,
        row.patronymic,
        row.phoneNormalized,
        row.emailNormalized,
        row.emailVerified,
        row.displayTokenCount,
        row.displayScript,
        row.structuredState,
        row.bookingNameCandidates.join(" | "),
        row.appointmentNameCandidates.join(" | "),
        row.rubitimeNameCandidatesByPhone.join(" | "),
        row.supplementaryBookingEmails.join(" | "),
        row.hasBookingProfileConflict,
        row.conflictNotes.join(" | "),
      ].map(csvEscape).join(","),
    ),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function buildInventoryMarkdown(summary: ReportSummary, generatedAt: string): string {
  const sections = CODE_PATH_INVENTORY.map((item) => {
    const paths = item.paths.map((path) => `- \`${path}\``).join("\n");
    return `### ${item.area}\n\n${paths}\n\n${item.notes}`;
  }).join("\n\n");

  return `# FIO Source Inventory\n\nGenerated: ${generatedAt}\n\n## Data Summary\n\n` +
    `- active client rows: ${summary.userCount}\n` +
    `- missing all structured names: ${summary.missingAllStructured}\n` +
    `- first only: ${summary.firstOnly}\n` +
    `- first + last: ${summary.firstLast}\n` +
    `- first + last + patronymic: ${summary.firstLastPatronymic}\n` +
    `- legacy display one token: ${summary.displayOneToken}\n` +
    `- legacy display two tokens: ${summary.displayTwoTokens}\n` +
    `- legacy display three+ tokens: ${summary.displayThreePlusTokens}\n` +
    `- legacy display Latin/mixed: ${summary.displayLatinOrMixed}\n` +
    `- users with booking name candidates: ${summary.usersWithBookingCandidates}\n` +
    `- users with appointment payload candidates: ${summary.usersWithAppointmentCandidates}\n` +
    `- users with Rubitime candidates by phone: ${summary.usersWithRubitimeCandidatesByPhone}\n` +
    `- users with booking/profile name conflicts: ${summary.usersWithBookingProfileConflicts}\n` +
    `- verified-email users: ${summary.verifiedEmailUsers}\n` +
    `- booking rows with contact email: ${summary.bookingRowsWithContactEmail}\n` +
    `- booking rows missing contact email: ${summary.bookingRowsWithMissingContactEmail}\n` +
    `- booking rows missing email while profile email is verified: ${summary.profileVerifiedEmailButBookingEmailMissingRows}\n\n` +
    `## Runtime Code Map\n\n${sections}\n`;
}

function buildSummary(rows: UserNameQuality[], extra: {
  bookingRowsWithContactEmail: number;
  bookingRowsWithMissingContactEmail: number;
  profileVerifiedEmailButBookingEmailMissingRows: number;
}): ReportSummary {
  return {
    generatedAt: new Date().toISOString(),
    userCount: rows.length,
    missingAllStructured: rows.filter((row) => row.structuredState === "missing_all").length,
    firstOnly: rows.filter((row) => row.structuredState === "first_only").length,
    firstLast: rows.filter((row) => row.structuredState === "first_last").length,
    firstLastPatronymic: rows.filter((row) => row.structuredState === "first_last_patronymic").length,
    displayEmpty: rows.filter((row) => row.displayTokenCount === 0).length,
    displayOneToken: rows.filter((row) => row.displayTokenCount === 1).length,
    displayTwoTokens: rows.filter((row) => row.displayTokenCount === 2).length,
    displayThreePlusTokens: rows.filter((row) => row.displayTokenCount >= 3).length,
    displayLatinOrMixed: rows.filter((row) => row.displayScript === "latin" || row.displayScript === "mixed").length,
    usersWithBookingCandidates: rows.filter((row) => row.bookingNameCandidates.length > 0).length,
    usersWithAppointmentCandidates: rows.filter((row) => row.appointmentNameCandidates.length > 0).length,
    usersWithRubitimeCandidatesByPhone: rows.filter((row) => row.rubitimeNameCandidatesByPhone.length > 0).length,
    usersWithBookingProfileConflicts: rows.filter((row) => row.hasBookingProfileConflict).length,
    verifiedEmailUsers: rows.filter((row) => row.emailVerified).length,
    bookingRowsWithContactEmail: extra.bookingRowsWithContactEmail,
    bookingRowsWithMissingContactEmail: extra.bookingRowsWithMissingContactEmail,
    profileVerifiedEmailButBookingEmailMissingRows: extra.profileVerifiedEmailButBookingEmailMissingRows,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("MISSING DATABASE_URL — run: set -a && source apps/webapp/.env.dev && set +a");
    process.exit(1);
  }

  const reportDir = resolve(process.cwd(), "../../.tmp/fio-backfill/reports");
  mkdirSync(reportDir, { recursive: true });

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");

    const users = await client.query<PlatformUserRow>(
      `SELECT id::text,
              display_name,
              first_name,
              last_name,
              patronymic,
              phone_normalized,
              email,
              email_normalized,
              email_verified_at::text,
              created_at::text
       FROM platform_users
       WHERE role = 'client'
         AND merged_into_id IS NULL
         AND is_archived = false
       ORDER BY created_at ASC`,
    );

    const bookingRows = await client.query<BookingNameRow>(
      `SELECT platform_user_id::text,
              contact_phone,
              contact_email,
              contact_name,
              source,
              rubitime_id,
              slot_start::text
       FROM patient_bookings
       WHERE status <> 'cancelled'
       ORDER BY slot_start DESC`,
    );

    const appointmentRows = await client.query<AppointmentRecordNameRow>(
      `SELECT platform_user_id::text,
              phone_normalized,
              status,
              record_at::text,
              NULLIF(trim(payload_json->>'name'), '') AS payload_name,
              NULLIF(trim(payload_json->>'email'), '') AS payload_email
       FROM appointment_records
       WHERE deleted_at IS NULL
       ORDER BY record_at DESC NULLS LAST`,
    );

    const rubitimeRows = await client.query<RubitimeRecordNameRow>(
      `SELECT phone_normalized,
              status,
              record_at::text,
              NULLIF(trim(payload_json->>'name'), '') AS payload_name,
              NULLIF(trim(payload_json->>'email'), '') AS payload_email
       FROM rubitime_records
       WHERE status <> 'canceled'
       ORDER BY record_at DESC NULLS LAST`,
    );

    const supplementaryContacts = await client.query<SupplementaryContactRow>(
      `SELECT platform_user_id::text,
              contact_type,
              source,
              value_normalized
       FROM platform_user_contacts
       WHERE contact_type IN ('email', 'phone')
       ORDER BY created_at DESC`,
    );

    const bookingByUser = new Map<string, string[]>();
    const appointmentByUser = new Map<string, string[]>();
    const rubitimeByPhone = new Map<string, string[]>();

    for (const row of bookingRows.rows) {
      pushGrouped(bookingByUser, row.platform_user_id, row.contact_name);
    }

    for (const row of appointmentRows.rows) {
      pushGrouped(appointmentByUser, row.platform_user_id, row.payload_name);
    }

    for (const row of rubitimeRows.rows) {
      pushGrouped(rubitimeByPhone, row.phone_normalized, row.payload_name);
    }

    const supplementaryBookingEmailsByUser = new Map<string, string[]>();
    for (const row of supplementaryContacts.rows) {
      if (row.contact_type === "email" && row.source === "booking") {
        pushGrouped(supplementaryBookingEmailsByUser, row.platform_user_id, row.value_normalized);
      }
    }

    const qualityRows: UserNameQuality[] = users.rows.map((user) => {
      const bookingNameCandidates = uniqueNonEmpty(bookingByUser.get(user.id) ?? []);
      const appointmentNameCandidates = uniqueNonEmpty(appointmentByUser.get(user.id) ?? []);
      const rubitimeNameCandidatesByPhone = uniqueNonEmpty(rubitimeByPhone.get(user.phone_normalized ?? "") ?? []);
      const profileFio = doctorFioFromProfile(user);
      const displayName = user.display_name.trim();
      const conflictNotes: string[] = [];
      const strongestBookingNames = uniqueNonEmpty([
        ...bookingNameCandidates,
        ...appointmentNameCandidates,
        ...rubitimeNameCandidatesByPhone,
      ]);
      const profileComparable = normalizeNameForCompare(profileFio ?? displayName);
      for (const candidate of strongestBookingNames) {
        if (profileComparable && normalizeNameForCompare(candidate) !== profileComparable) {
          conflictNotes.push(`booking/profile mismatch: ${candidate}`);
        }
      }

      return {
        userId: user.id,
        displayName,
        firstName: user.first_name,
        lastName: user.last_name,
        patronymic: user.patronymic,
        phoneNormalized: user.phone_normalized,
        emailNormalized: user.email_normalized,
        emailVerified: Boolean(user.email_verified_at),
        displayTokenCount: tokenCount(displayName),
        displayScript: scriptKind(displayName),
        structuredState: structuredState(user),
        bookingNameCandidates,
        appointmentNameCandidates,
        rubitimeNameCandidatesByPhone,
        supplementaryBookingEmails: uniqueNonEmpty(supplementaryBookingEmailsByUser.get(user.id) ?? []),
        hasBookingProfileConflict: conflictNotes.length > 0,
        conflictNotes,
      };
    });

    const bookingRowsWithContactEmail = bookingRows.rows.filter((row) => Boolean(asNonEmpty(row.contact_email))).length;
    const bookingRowsWithMissingContactEmail = bookingRows.rows.length - bookingRowsWithContactEmail;
    let profileVerifiedEmailButBookingEmailMissingRows = 0;
    for (const row of bookingRows.rows) {
      if (asNonEmpty(row.contact_email)) continue;
      const user = row.platform_user_id ? users.rows.find((u) => u.id === row.platform_user_id) : null;
      if (user?.email_verified_at) profileVerifiedEmailButBookingEmailMissingRows++;
    }

    const summary = buildSummary(qualityRows, {
      bookingRowsWithContactEmail,
      bookingRowsWithMissingContactEmail,
      profileVerifiedEmailButBookingEmailMissingRows,
    });
    summary.generatedAt = new Date().toISOString();

    const stamp = summary.generatedAt.replace(/[:.]/g, "-");
    const jsonPath = resolve(reportDir, `fio-quality-report-${stamp}.json`);
    const csvPath = resolve(reportDir, `fio-quality-report-${stamp}.csv`);
    const inventoryPath = resolve(reportDir, `name-field-inventory-${stamp}.md`);
    const latestJsonPath = resolve(reportDir, "fio-quality-report.latest.json");
    const latestCsvPath = resolve(reportDir, "fio-quality-report.latest.csv");
    const latestInventoryPath = resolve(reportDir, "name-field-inventory.latest.md");

    const json = JSON.stringify({ summary, users: qualityRows }, null, 2);
    writeFileSync(jsonPath, json, "utf8");
    writeFileSync(latestJsonPath, json, "utf8");
    writeCsv(csvPath, qualityRows);
    writeCsv(latestCsvPath, qualityRows);
    const inventory = buildInventoryMarkdown(summary, summary.generatedAt);
    writeFileSync(inventoryPath, inventory, "utf8");
    writeFileSync(latestInventoryPath, inventory, "utf8");

    await client.query("ROLLBACK");

    console.log("FIO source audit completed.");
    console.log(`Users scanned: ${summary.userCount}`);
    console.log(`Booking/profile conflicts: ${summary.usersWithBookingProfileConflicts}`);
    console.log(`Reports written under: ${reportDir}`);
    console.log("PII stays in .tmp reports; do not paste report contents into chat.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
