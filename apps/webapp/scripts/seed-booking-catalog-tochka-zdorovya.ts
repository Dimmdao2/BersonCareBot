#!/usr/bin/env tsx
/**
 * Seed script: Booking catalog — Точка Здоровья
 *
 * Source mapping: docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/SEED_MAPPING_TOCHKA_ZDOROVYA.md
 *
 * Usage:
 *   DATABASE_URL=... pnpm seed-booking-catalog
 *   DATABASE_URL=... pnpm seed-booking-catalog --check-only
 *
 * Flags:
 *   --check-only  Validate data integrity without writing to DB.
 *
 * Behavior:
 *   - Idempotent: upserts on natural keys (no duplicate rows on repeated runs).
 *   - Fail-fast: process.exit(1) if any mandatory Rubitime ID is missing.
 *   - No silent skips: every invalid entry causes an explicit error + exit.
 */

import "dotenv/config";
import pg from "pg";

// ---------------------------------------------------------------------------
// Seed data (matches SEED_MAPPING_TOCHKA_ZDOROVYA.md exactly)
// ---------------------------------------------------------------------------

type CityRecord = { code: string; title: string; is_active: boolean; sort_order: number };
type BranchRecord = {
  city_code: string; title: string; address: string;
  rubitime_branch_id: string; is_active: boolean; sort_order: number;
};
type SpecialistRecord = {
  rubitime_branch_id: string; full_name: string; description: string;
  rubitime_cooperator_id: string; is_active: boolean; sort_order: number;
};
type ServiceRecord = {
  title: string; description: string; duration_minutes: number;
  price_minor: number; is_active: boolean; sort_order: number;
};
type BranchServiceRecord = {
  rubitime_branch_id: string; rubitime_cooperator_id: string;
  service_title: string; service_duration_minutes: number;
  rubitime_service_id: string; is_active: boolean; sort_order: number;
};

const CITIES: CityRecord[] = [
  { code: "moscow", title: "Москва", is_active: true, sort_order: 1 },
  { code: "spb", title: "Санкт-Петербург", is_active: true, sort_order: 2 },
];

const BRANCHES: BranchRecord[] = [
  {
    city_code: "moscow",
    title: "Москва. Точка Здоровья",
    address: "Красносельский тупик, 5",
    rubitime_branch_id: "17356",
    is_active: true,
    sort_order: 1,
  },
  {
    city_code: "spb",
    title: "Санкт-Петербург",
    address: "Новочеркасский проспект, д.45к1",
    rubitime_branch_id: "18265",
    is_active: true,
    sort_order: 2,
  },
];

const SPECIALISTS: SpecialistRecord[] = [
  {
    rubitime_branch_id: "17356",
    full_name: "Дмитрий Берсон",
    description: "Реабилитолог, кинезиолог, фасциальный терапевт",
    rubitime_cooperator_id: "34729",
    is_active: true,
    sort_order: 1,
  },
  {
    rubitime_branch_id: "18265",
    full_name: "Дмитрий Берсон",
    description: "Реабилитолог, кинезиолог, фасциальный терапевт",
    rubitime_cooperator_id: "37449",
    is_active: true,
    sort_order: 1,
  },
];

const SERVICES: ServiceRecord[] = [
  {
    title: "Сеанс 40 мин",
    description:
      "Повторный прием (работа с конкретным регионом), Детский прием, Массаж: стопы / лицо и челюсть / шея / лопатки, Висцеральный массаж, Таз / диафрагма",
    duration_minutes: 40,
    price_minor: 400000,
    is_active: true,
    sort_order: 1,
  },
  {
    title: "Сеанс 60 мин",
    description:
      "Повторный прием (реабилитация), Первичный детский, Профилактический сеанс, Работа с беременными",
    duration_minutes: 60,
    price_minor: 600000,
    is_active: true,
    sort_order: 2,
  },
  {
    title: "Сеанс 90 мин",
    description:
      "Первичный прием (реабилитация), Остеопатический сеанс, Антистресс-релакс-восстановление",
    duration_minutes: 90,
    price_minor: 800000,
    is_active: true,
    sort_order: 3,
  },
];

const BRANCH_SERVICES: BranchServiceRecord[] = [
  // Москва #17356 (специалист #34729)
  {
    rubitime_branch_id: "17356",
    rubitime_cooperator_id: "34729",
    service_title: "Сеанс 40 мин",
    service_duration_minutes: 40,
    rubitime_service_id: "67591",
    is_active: true,
    sort_order: 1,
  },
  {
    rubitime_branch_id: "17356",
    rubitime_cooperator_id: "34729",
    service_title: "Сеанс 60 мин",
    service_duration_minutes: 60,
    rubitime_service_id: "67452",
    is_active: true,
    sort_order: 2,
  },
  {
    rubitime_branch_id: "17356",
    rubitime_cooperator_id: "34729",
    service_title: "Сеанс 90 мин",
    service_duration_minutes: 90,
    rubitime_service_id: "67801",
    is_active: true,
    sort_order: 3,
  },
  // СПб #18265 (специалист #37449) — Сеанс 40 мин отсутствует (не добавлять без подтверждения)
  {
    rubitime_branch_id: "18265",
    rubitime_cooperator_id: "37449",
    service_title: "Сеанс 60 мин",
    service_duration_minutes: 60,
    rubitime_service_id: "67472",
    is_active: true,
    sort_order: 1,
  },
  {
    rubitime_branch_id: "18265",
    rubitime_cooperator_id: "37449",
    service_title: "Сеанс 90 мин",
    service_duration_minutes: 90,
    rubitime_service_id: "67471",
    is_active: true,
    sort_order: 2,
  },
];

// ---------------------------------------------------------------------------
// Validation (fail-fast)
// ---------------------------------------------------------------------------

function validateMandatoryFields(): void {
  const errors: string[] = [];

  for (const branch of BRANCHES) {
    if (!branch.rubitime_branch_id)
      errors.push(`Branch "${branch.title}": rubitime_branch_id is missing`);
  }

  for (const sp of SPECIALISTS) {
    if (!sp.rubitime_cooperator_id)
      errors.push(`Specialist "${sp.full_name}" in branch ${sp.rubitime_branch_id}: rubitime_cooperator_id is missing`);
  }

  for (const svc of SERVICES) {
    if (!svc.duration_minutes || svc.duration_minutes <= 0)
      errors.push(`Service "${svc.title}": duration_minutes is missing or invalid`);
    if (!svc.price_minor || svc.price_minor <= 0)
      errors.push(`Service "${svc.title}": price_minor is missing or invalid`);
  }

  for (const bs of BRANCH_SERVICES) {
    if (!bs.rubitime_service_id)
      errors.push(`BranchService ${bs.service_title} in branch ${bs.rubitime_branch_id}: rubitime_service_id is missing`);
    if (!bs.rubitime_branch_id)
      errors.push(`BranchService ${bs.service_title}: rubitime_branch_id is missing`);
    if (!bs.rubitime_cooperator_id)
      errors.push(`BranchService ${bs.service_title}: rubitime_cooperator_id is missing`);
  }

  if (errors.length > 0) {
    console.error("❌ Seed validation failed (fail-fast):");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log("✓ Validation passed.");
}

// ---------------------------------------------------------------------------
// DB upsert functions
// ---------------------------------------------------------------------------

async function upsertCities(client: pg.PoolClient): Promise<void> {
  for (const city of CITIES) {
    await client.query(
      `INSERT INTO booking_cities (id, code, title, is_active, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
         SET title = EXCLUDED.title,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
      [city.code, city.title, city.is_active, city.sort_order],
    );
    console.log(`  city upserted: ${city.code}`);
  }
}

async function upsertBranches(client: pg.PoolClient): Promise<void> {
  for (const branch of BRANCHES) {
    const cityRes = await client.query<{ id: string }>(
      `SELECT id FROM booking_cities WHERE code = $1`,
      [branch.city_code],
    );
    if (cityRes.rows.length === 0) {
      throw new Error(`city not found for code: ${branch.city_code}`);
    }
    const cityId = cityRes.rows[0]!.id;

    await client.query(
      `INSERT INTO booking_branches (id, city_id, title, address, rubitime_branch_id, is_active, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (rubitime_branch_id) DO UPDATE
         SET city_id = EXCLUDED.city_id,
             title = EXCLUDED.title,
             address = EXCLUDED.address,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
      [cityId, branch.title, branch.address, branch.rubitime_branch_id, branch.is_active, branch.sort_order],
    );
    console.log(`  branch upserted: ${branch.rubitime_branch_id} (${branch.title})`);
  }
}

async function upsertSpecialists(client: pg.PoolClient): Promise<void> {
  for (const sp of SPECIALISTS) {
    const branchRes = await client.query<{ id: string }>(
      `SELECT id FROM booking_branches WHERE rubitime_branch_id = $1`,
      [sp.rubitime_branch_id],
    );
    if (branchRes.rows.length === 0) {
      throw new Error(`branch not found for rubitime_branch_id: ${sp.rubitime_branch_id}`);
    }
    const branchId = branchRes.rows[0]!.id;

    await client.query(
      `INSERT INTO booking_specialists
         (id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (rubitime_cooperator_id, branch_id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             description = EXCLUDED.description,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
      [branchId, sp.full_name, sp.description, sp.rubitime_cooperator_id, sp.is_active, sp.sort_order],
    );
    console.log(`  specialist upserted: ${sp.rubitime_cooperator_id} in branch ${sp.rubitime_branch_id}`);
  }
}

async function upsertServices(client: pg.PoolClient): Promise<void> {
  for (const svc of SERVICES) {
    await client.query(
      `INSERT INTO booking_services
         (id, title, description, duration_minutes, price_minor, is_active, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT uq_booking_services_title_duration DO UPDATE
         SET description = EXCLUDED.description,
             price_minor = EXCLUDED.price_minor,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
      [svc.title, svc.description, svc.duration_minutes, svc.price_minor, svc.is_active, svc.sort_order],
    );
    console.log(`  service upserted: "${svc.title}" (${svc.duration_minutes} min, ${svc.price_minor} kopecks)`);
  }
}

async function upsertBranchServices(client: pg.PoolClient): Promise<void> {
  for (const bs of BRANCH_SERVICES) {
    const branchRes = await client.query<{ id: string }>(
      `SELECT id FROM booking_branches WHERE rubitime_branch_id = $1`,
      [bs.rubitime_branch_id],
    );
    if (branchRes.rows.length === 0)
      throw new Error(`branch not found: ${bs.rubitime_branch_id}`);
    const branchId = branchRes.rows[0]!.id;

    const spRes = await client.query<{ id: string }>(
      `SELECT id FROM booking_specialists WHERE rubitime_cooperator_id = $1 AND branch_id = $2`,
      [bs.rubitime_cooperator_id, branchId],
    );
    if (spRes.rows.length === 0)
      throw new Error(`specialist not found: ${bs.rubitime_cooperator_id} in branch ${bs.rubitime_branch_id}`);
    const specialistId = spRes.rows[0]!.id;

    const svcRes = await client.query<{ id: string }>(
      `SELECT id FROM booking_services WHERE title = $1 AND duration_minutes = $2`,
      [bs.service_title, bs.service_duration_minutes],
    );
    if (svcRes.rows.length === 0)
      throw new Error(`service not found: "${bs.service_title}" (${bs.service_duration_minutes} min)`);
    const serviceId = svcRes.rows[0]!.id;

    await client.query(
      `INSERT INTO booking_branch_services
         (id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT uq_booking_branch_services DO UPDATE
         SET specialist_id = EXCLUDED.specialist_id,
             rubitime_service_id = EXCLUDED.rubitime_service_id,
             is_active = EXCLUDED.is_active,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()`,
      [branchId, serviceId, specialistId, bs.rubitime_service_id, bs.is_active, bs.sort_order],
    );
    console.log(`  branch_service upserted: ${bs.service_title} in branch ${bs.rubitime_branch_id} (rubitime_service_id=${bs.rubitime_service_id})`);
  }
}

async function verifySeeded(client: pg.PoolClient): Promise<void> {
  const res = await client.query<{
    cities: string;
    branches: string;
    specialists: string;
    services: string;
    branch_services: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM booking_cities)          AS cities,
      (SELECT count(*)::text FROM booking_branches)        AS branches,
      (SELECT count(*)::text FROM booking_specialists)     AS specialists,
      (SELECT count(*)::text FROM booking_services)        AS services,
      (SELECT count(*)::text FROM booking_branch_services) AS branch_services
  `);
  const counts = res.rows[0]!;
  console.log("\n📊 Seed verification:");
  console.log(`  booking_cities:          ${counts.cities} (expected ≥ 2)`);
  console.log(`  booking_branches:        ${counts.branches} (expected ≥ 2)`);
  console.log(`  booking_specialists:     ${counts.specialists} (expected ≥ 2)`);
  console.log(`  booking_services:        ${counts.services} (expected ≥ 3)`);
  console.log(`  booking_branch_services: ${counts.branch_services} (expected ≥ 5)`);

  if (
    Number(counts.cities) < 2 ||
    Number(counts.branches) < 2 ||
    Number(counts.specialists) < 2 ||
    Number(counts.services) < 3 ||
    Number(counts.branch_services) < 5
  ) {
    console.error("❌ Post-seed verification failed: counts below expected minimums.");
    process.exit(1);
  }
  console.log("✓ Verification passed.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check-only");

  console.log("=== Seed: Booking Catalog — Точка Здоровья ===");
  if (checkOnly) console.log("Mode: --check-only (no writes)\n");

  validateMandatoryFields();

  if (checkOnly) {
    console.log("\n✓ Check-only mode complete. No data was written.");
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("\n[1/5] Upserting cities...");
    await upsertCities(client);

    console.log("\n[2/5] Upserting branches...");
    await upsertBranches(client);

    console.log("\n[3/5] Upserting specialists...");
    await upsertSpecialists(client);

    console.log("\n[4/5] Upserting services...");
    await upsertServices(client);

    console.log("\n[5/5] Upserting branch-service links...");
    await upsertBranchServices(client);

    await client.query("COMMIT");
    console.log("\n✓ All data committed.");

    await verifySeeded(client);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Seed failed, transaction rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
