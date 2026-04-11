/**
 * Admin-only read models: probable name overlap hints for manual review (not identity proof).
 *
 * `limitGroups` caps how many distinct (nf, nl) keys are considered (ordered by population);
 * `limitMembersPerGroup` caps rows per key. `swappedPairs` is capped separately — full table scan;
 * tune limits if the `platform_users` table grows large.
 */
import type { Pool } from "pg";

export const NAME_MATCH_HINTS_DISCLAIMER =
  "Результаты носят справочный характер: совпадение ФИО не подтверждает, что это один человек. Решение о слиянии записей принимает администратор после ручной проверки.";

export type NameMatchHintMember = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  created_at: Date;
};

export type NameMatchOrderedGroup = {
  normalizedFirst: string;
  normalizedLast: string;
  members: NameMatchHintMember[];
};

export type NameMatchSwappedPair = {
  userA: NameMatchHintMember;
  userB: NameMatchHintMember;
};

export type NameMatchHintsReport = {
  orderedGroups: NameMatchOrderedGroup[];
  swappedPairs: NameMatchSwappedPair[];
  disclaimer: string;
};

type BuildOpts = {
  missingPhone: boolean;
  limitGroups: number;
  limitMembersPerGroup: number;
  limitSwappedPairs: number;
};

type OrderedRow = NameMatchHintMember & { nf: string; nl: string };

type SwappedSqlRow = {
  a_id: string;
  a_display_name: string;
  a_first_name: string | null;
  a_last_name: string | null;
  a_phone_normalized: string | null;
  a_integrator_user_id: string | null;
  a_created_at: Date;
  b_id: string;
  b_display_name: string;
  b_first_name: string | null;
  b_last_name: string | null;
  b_phone_normalized: string | null;
  b_integrator_user_id: string | null;
  b_created_at: Date;
};

function mapMember(r: NameMatchHintMember): NameMatchHintMember {
  return {
    id: r.id,
    display_name: r.display_name,
    first_name: r.first_name,
    last_name: r.last_name,
    phone_normalized: r.phone_normalized,
    integrator_user_id: r.integrator_user_id,
    created_at: r.created_at,
  };
}

function groupOrderedRows(rows: OrderedRow[]): NameMatchOrderedGroup[] {
  const map = new Map<string, NameMatchOrderedGroup>();
  for (const row of rows) {
    const key = `${row.nf}\0${row.nl}`;
    let g = map.get(key);
    if (!g) {
      g = { normalizedFirst: row.nf, normalizedLast: row.nl, members: [] };
      map.set(key, g);
    }
    const { nf: _n1, nl: _n2, ...rest } = row;
    g.members.push(mapMember(rest));
  }
  return [...map.values()];
}

/**
 * Canonical clients only. Requires non-empty normalized first and last for hint rows.
 */
export async function buildNameMatchHintsReport(pool: Pool, opts: BuildOpts): Promise<NameMatchHintsReport> {
  const {
    missingPhone,
    limitGroups,
    limitMembersPerGroup,
    limitSwappedPairs,
  } = opts;

  const phoneFilter = missingPhone
    ? `AND (pu.phone_normalized IS NULL OR trim(pu.phone_normalized) = '')`
    : "";

  const baseCte = `
    base AS (
      SELECT
        pu.id,
        pu.display_name,
        pu.first_name,
        pu.last_name,
        pu.phone_normalized,
        pu.integrator_user_id::text AS integrator_user_id,
        pu.created_at,
        lower(trim(both from regexp_replace(coalesce(pu.first_name, ''), '[[:space:]]+', ' ', 'g'))) AS nf,
        lower(trim(both from regexp_replace(coalesce(pu.last_name, ''), '[[:space:]]+', ' ', 'g'))) AS nl
      FROM platform_users pu
      WHERE pu.role = 'client'
        AND pu.merged_into_id IS NULL
        ${phoneFilter}
    )
  `;

  const orderedSql = `
    WITH ${baseCte},
    grouped_keys AS (
      SELECT nf, nl
      FROM base
      WHERE nf <> '' AND nl <> ''
      GROUP BY nf, nl
      HAVING count(*) >= 2
      ORDER BY count(*) DESC, nf ASC, nl ASC
      LIMIT $1::int
    ),
    ranked AS (
      SELECT
        b.id,
        b.display_name,
        b.first_name,
        b.last_name,
        b.phone_normalized,
        b.integrator_user_id,
        b.created_at,
        b.nf,
        b.nl,
        row_number() OVER (PARTITION BY b.nf, b.nl ORDER BY b.created_at DESC) AS rn
      FROM base b
      INNER JOIN grouped_keys g ON b.nf = g.nf AND b.nl = g.nl
      WHERE b.nf <> '' AND b.nl <> ''
    )
    SELECT id, display_name, first_name, last_name, phone_normalized, integrator_user_id, created_at, nf, nl
    FROM ranked
    WHERE rn <= $2::int
    ORDER BY nf ASC, nl ASC, rn ASC
  `;

  const swappedSql = `
    WITH ${baseCte}
    SELECT
      a.id AS a_id,
      a.display_name AS a_display_name,
      a.first_name AS a_first_name,
      a.last_name AS a_last_name,
      a.phone_normalized AS a_phone_normalized,
      a.integrator_user_id AS a_integrator_user_id,
      a.created_at AS a_created_at,
      b.id AS b_id,
      b.display_name AS b_display_name,
      b.first_name AS b_first_name,
      b.last_name AS b_last_name,
      b.phone_normalized AS b_phone_normalized,
      b.integrator_user_id AS b_integrator_user_id,
      b.created_at AS b_created_at
    FROM base a
    INNER JOIN base b
      ON a.id < b.id
     AND a.nf = b.nl
     AND a.nl = b.nf
     AND NOT (a.nf = b.nf AND a.nl = b.nl)
    WHERE a.nf <> '' AND a.nl <> '' AND b.nf <> '' AND b.nl <> ''
    ORDER BY a.created_at DESC, b.created_at DESC
    LIMIT $1::int
  `;

  const orderedRes = await pool.query<OrderedRow>(orderedSql, [limitGroups, limitMembersPerGroup]);
  const swappedRes = await pool.query<SwappedSqlRow>(swappedSql, [limitSwappedPairs]);

  const orderedGroups = groupOrderedRows(orderedRes.rows);

  const swappedPairs: NameMatchSwappedPair[] = swappedRes.rows.map((row) => ({
    userA: mapMember({
      id: row.a_id,
      display_name: row.a_display_name,
      first_name: row.a_first_name,
      last_name: row.a_last_name,
      phone_normalized: row.a_phone_normalized,
      integrator_user_id: row.a_integrator_user_id,
      created_at: row.a_created_at,
    }),
    userB: mapMember({
      id: row.b_id,
      display_name: row.b_display_name,
      first_name: row.b_first_name,
      last_name: row.b_last_name,
      phone_normalized: row.b_phone_normalized,
      integrator_user_id: row.b_integrator_user_id,
      created_at: row.b_created_at,
    }),
  }));

  return {
    orderedGroups,
    swappedPairs,
    disclaimer: NAME_MATCH_HINTS_DISCLAIMER,
  };
}
