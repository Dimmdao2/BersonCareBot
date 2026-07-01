#!/usr/bin/env tsx
/**
 * Dry-run FIO backfill proposal.
 *
 * This script never writes to the database and intentionally has no --commit
 * mode in Phase 3. Reports contain PII and stay under `.tmp/fio-backfill/reports/`.
 */
import pg from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideFio,
  formatDoctorFio,
  parseFioCandidate,
  type FioCandidate,
  type FioConfidence,
  type FioSource,
  type RussianNameDictionaries,
  type StructuredFio,
} from "../../src/shared/lib/fio";

type PlatformUserRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  phone_normalized: string | null;
  created_at: string;
};

type BookingNameRow = {
  platform_user_id: string | null;
  contact_name: string | null;
  source: string | null;
  rubitime_id: string | null;
  slot_start: string | null;
};

type AppointmentRecordNameRow = {
  platform_user_id: string | null;
  phone_normalized: string | null;
  record_at: string | null;
  payload_name: string | null;
};

type RubitimeRecordNameRow = {
  phone_normalized: string | null;
  record_at: string | null;
  payload_name: string | null;
};

type CandidateReport = {
  source: FioSource;
  raw: string;
  confidence: FioConfidence;
  score: number;
  value: StructuredFio;
  reasons: string[];
};

type BackfillAction = "no_change" | "fill_missing" | "replace_weak" | "review_conflict" | "insufficient";

type BackfillProposal = {
  userId: string;
  current: StructuredFio;
  currentDisplayName: string;
  selected: CandidateReport | null;
  candidates: CandidateReport[];
  conflicts: string[];
  action: BackfillAction;
  proposedDisplayName: string | null;
  wouldUpdate: boolean;
};

type BackfillSummary = {
  generatedAt: string;
  totalUsers: number;
  usersWithCandidates: number;
  noChange: number;
  fillMissing: number;
  replaceWeak: number;
  reviewConflict: number;
  insufficient: number;
  selectedHigh: number;
  selectedMedium: number;
  selectedLow: number;
};

function dictionaryKey(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function readDictionarySet(path: string): Set<string> {
  const result = new Set<string>();
  const file = readFileSync(path, "utf8");
  for (const line of file.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const text = typeof parsed.text === "string" ? parsed.text : null;
    const femaleForm = typeof parsed.f_form === "string" ? parsed.f_form : null;
    if (text) result.add(dictionaryKey(text));
    if (femaleForm) result.add(dictionaryKey(femaleForm));
  }
  return result;
}

function loadDictionaries(): RussianNameDictionaries {
  const datasetDir = resolve(process.cwd(), "../../.tmp/fio-backfill/russiannames/jsonl");
  return {
    firstNames: readDictionarySet(resolve(datasetDir, "names.jsonl")),
    patronymics: readDictionarySet(resolve(datasetDir, "midnames.jsonl")),
  };
}

function asNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function pushGrouped(map: Map<string, string[]>, key: string | null | undefined, value: string | null | undefined) {
  const k = asNonEmpty(key);
  const v = asNonEmpty(value);
  if (!k || !v) return;
  const list = map.get(k) ?? [];
  list.push(v);
  map.set(k, list);
}

function pushCandidate(
  candidates: FioCandidate[],
  raw: string | null | undefined,
  source: FioSource,
  dictionaries: RussianNameDictionaries,
) {
  const text = asNonEmpty(raw);
  if (!text) return;
  candidates.push(parseFioCandidate(text, source, dictionaries));
}

function currentFio(user: PlatformUserRow): StructuredFio {
  return {
    lastName: asNonEmpty(user.last_name),
    firstName: asNonEmpty(user.first_name),
    patronymic: asNonEmpty(user.patronymic),
  };
}

function fioKey(value: StructuredFio): string {
  return [value.lastName, value.firstName, value.patronymic].map((part) => dictionaryKey(part ?? "")).join("|");
}

function hasStructured(value: StructuredFio): boolean {
  return Boolean(value.lastName || value.firstName || value.patronymic);
}

function isComplete(value: StructuredFio): boolean {
  return Boolean(value.lastName && value.firstName && value.patronymic);
}

function toReport(candidate: FioCandidate): CandidateReport {
  return {
    source: candidate.source,
    raw: candidate.raw,
    confidence: candidate.confidence,
    score: candidate.score,
    value: candidate.value,
    reasons: candidate.reasons,
  };
}

function classifyProposal(current: StructuredFio, selected: FioCandidate | null, conflicts: string[]): BackfillAction {
  if (!selected || selected.confidence === "none" || selected.confidence === "low") return "insufficient";
  const same = fioKey(current) === fioKey(selected.value);
  if (same) return "no_change";
  if (conflicts.includes("candidate_disagrees_with_winner")) return "review_conflict";
  if (isComplete(current)) return "review_conflict";
  if (!hasStructured(current)) return "fill_missing";
  return selected.confidence === "high" ? "replace_weak" : "review_conflict";
}

function csvEscape(value: string | number | boolean | null): string {
  const text = String(value ?? "");
  if (!/[",\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(path: string, proposals: BackfillProposal[]) {
  const header = [
    "userId",
    "action",
    "wouldUpdate",
    "currentDisplayName",
    "currentLastName",
    "currentFirstName",
    "currentPatronymic",
    "selectedSource",
    "selectedConfidence",
    "proposedDisplayName",
    "conflicts",
    "candidateCount",
  ];
  const lines = [
    header.join(","),
    ...proposals.map((proposal) =>
      [
        proposal.userId,
        proposal.action,
        proposal.wouldUpdate,
        proposal.currentDisplayName,
        proposal.current.lastName,
        proposal.current.firstName,
        proposal.current.patronymic,
        proposal.selected?.source ?? null,
        proposal.selected?.confidence ?? null,
        proposal.proposedDisplayName,
        proposal.conflicts.join(" | "),
        proposal.candidates.length,
      ].map(csvEscape).join(","),
    ),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function buildSummary(proposals: BackfillProposal[]): BackfillSummary {
  return {
    generatedAt: new Date().toISOString(),
    totalUsers: proposals.length,
    usersWithCandidates: proposals.filter((proposal) => proposal.candidates.length > 0).length,
    noChange: proposals.filter((proposal) => proposal.action === "no_change").length,
    fillMissing: proposals.filter((proposal) => proposal.action === "fill_missing").length,
    replaceWeak: proposals.filter((proposal) => proposal.action === "replace_weak").length,
    reviewConflict: proposals.filter((proposal) => proposal.action === "review_conflict").length,
    insufficient: proposals.filter((proposal) => proposal.action === "insufficient").length,
    selectedHigh: proposals.filter((proposal) => proposal.selected?.confidence === "high").length,
    selectedMedium: proposals.filter((proposal) => proposal.selected?.confidence === "medium").length,
    selectedLow: proposals.filter((proposal) => proposal.selected?.confidence === "low").length,
  };
}

function bookingSource(row: BookingNameRow): FioSource {
  const source = row.source?.toLowerCase() ?? "";
  if (row.rubitime_id || source.includes("rubitime")) return "rubitime";
  if (source.includes("native")) return "native_booking";
  return "booking";
}

async function main() {
  if (process.argv.includes("--commit")) {
    console.error("This Phase 3 script is dry-run only and intentionally has no --commit mode.");
    process.exit(2);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("MISSING DATABASE_URL — run: set -a && source apps/webapp/.env.dev && set +a");
    process.exit(1);
  }

  const dictionaries = loadDictionaries();
  const reportDir = resolve(process.cwd(), "../../.tmp/fio-backfill/reports");
  mkdirSync(reportDir, { recursive: true });

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
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
              created_at::text
       FROM platform_users
       WHERE role = 'client'
         AND merged_into_id IS NULL
         AND is_archived = false
       ORDER BY created_at ASC`,
    );

    const bookingRows = await client.query<BookingNameRow>(
      `SELECT platform_user_id::text,
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
              record_at::text,
              NULLIF(trim(payload_json->>'name'), '') AS payload_name
       FROM appointment_records
       WHERE deleted_at IS NULL
       ORDER BY record_at DESC NULLS LAST`,
    );

    const rubitimeRows = await client.query<RubitimeRecordNameRow>(
      `SELECT phone_normalized,
              record_at::text,
              NULLIF(trim(payload_json->>'name'), '') AS payload_name
       FROM rubitime_records
       WHERE status <> 'canceled'
       ORDER BY record_at DESC NULLS LAST`,
    );

    const bookingByUser = new Map<string, BookingNameRow[]>();
    for (const row of bookingRows.rows) {
      const key = asNonEmpty(row.platform_user_id);
      if (!key) continue;
      const list = bookingByUser.get(key) ?? [];
      list.push(row);
      bookingByUser.set(key, list);
    }

    const appointmentNamesByUser = new Map<string, string[]>();
    for (const row of appointmentRows.rows) {
      pushGrouped(appointmentNamesByUser, row.platform_user_id, row.payload_name);
    }

    const rubitimeNamesByPhone = new Map<string, string[]>();
    for (const row of rubitimeRows.rows) {
      pushGrouped(rubitimeNamesByPhone, row.phone_normalized, row.payload_name);
    }

    const proposals = users.rows.map((user): BackfillProposal => {
      const candidates: FioCandidate[] = [];
      const current = currentFio(user);
      const structuredLabel = formatDoctorFio(current);
      pushCandidate(candidates, structuredLabel, "profile_structured", dictionaries);

      for (const row of bookingByUser.get(user.id) ?? []) {
        pushCandidate(candidates, row.contact_name, bookingSource(row), dictionaries);
      }
      for (const name of appointmentNamesByUser.get(user.id) ?? []) {
        pushCandidate(candidates, name, "rubitime", dictionaries);
      }
      for (const name of rubitimeNamesByPhone.get(user.phone_normalized ?? "") ?? []) {
        pushCandidate(candidates, name, "rubitime", dictionaries);
      }
      pushCandidate(candidates, user.display_name, "display_name", dictionaries);

      const decision = decideFio(candidates);
      const action = classifyProposal(current, decision.selected, decision.conflicts);
      const proposedDisplayName = decision.selected ? formatDoctorFio(decision.selected.value) : null;
      return {
        userId: user.id,
        current,
        currentDisplayName: user.display_name,
        selected: decision.selected ? toReport(decision.selected) : null,
        candidates: candidates.map(toReport),
        conflicts: decision.conflicts,
        action,
        proposedDisplayName,
        wouldUpdate: action === "fill_missing" || action === "replace_weak",
      };
    });

    await client.query("ROLLBACK");

    const summary = buildSummary(proposals);
    const stamp = summary.generatedAt.replace(/[:.]/g, "-");
    const json = JSON.stringify({ summary, proposals }, null, 2);
    const jsonPath = resolve(reportDir, `fio-backfill-dry-run-${stamp}.json`);
    const csvPath = resolve(reportDir, `fio-backfill-dry-run-${stamp}.csv`);
    const latestJsonPath = resolve(reportDir, "fio-backfill-dry-run.latest.json");
    const latestCsvPath = resolve(reportDir, "fio-backfill-dry-run.latest.csv");
    writeFileSync(jsonPath, json, "utf8");
    writeFileSync(latestJsonPath, json, "utf8");
    writeCsv(csvPath, proposals);
    writeCsv(latestCsvPath, proposals);

    console.log("FIO backfill dry-run completed.");
    console.log(`Users scanned: ${summary.totalUsers}`);
    console.log(`Would fill missing: ${summary.fillMissing}`);
    console.log(`Would replace weak partials: ${summary.replaceWeak}`);
    console.log(`Needs conflict review: ${summary.reviewConflict}`);
    console.log(`Reports written under: ${reportDir}`);
    console.log("No DB writes were made.");
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
