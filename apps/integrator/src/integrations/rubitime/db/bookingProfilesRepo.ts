/**
 * DB-репо для справочников Rubitime и профилей записи.
 *
 * Таблицы:
 *   rubitime_branches, rubitime_services, rubitime_cooperators, rubitime_booking_profiles
 *
 * **Legacy runtime mapping:** `resolveBookingProfile` maps (type/category/city) → Rubitime IDs
 * for **v1** M2M only. Очная запись v2 получает ID из webapp-каталога и не использует этот
 * lookup в hot path. Сохраняется для online v1 и отката / совместимости.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';

// ---- Branch ----

export type RubitimeBranch = {
  id: number;
  rubitimeBranchId: number;
  cityCode: string;
  title: string;
  address: string;
  isActive: boolean;
};

export async function listBranches(db: DbPort): Promise<RubitimeBranch[]> {
  const res = await db.query<{
    id: string;
    rubitime_branch_id: number;
    city_code: string;
    title: string;
    address: string;
    is_active: boolean;
  }>(`SELECT id, rubitime_branch_id, city_code, title, address, is_active
      FROM rubitime_branches
      ORDER BY title`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    rubitimeBranchId: r.rubitime_branch_id,
    cityCode: r.city_code,
    title: r.title,
    address: r.address,
    isActive: r.is_active,
  }));
}

export async function upsertBranch(
  db: DbPort,
  input: { rubitimeBranchId: number; cityCode: string; title: string; address?: string },
): Promise<RubitimeBranch> {
  const res = await db.query<{
    id: string;
    rubitime_branch_id: number;
    city_code: string;
    title: string;
    address: string;
    is_active: boolean;
  }>(
    `INSERT INTO rubitime_branches (rubitime_branch_id, city_code, title, address, is_active, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, NOW())
     ON CONFLICT (rubitime_branch_id) DO UPDATE
       SET city_code  = EXCLUDED.city_code,
           title      = EXCLUDED.title,
           address    = EXCLUDED.address,
           is_active  = TRUE,
           updated_at = NOW()
     RETURNING id, rubitime_branch_id, city_code, title, address, is_active`,
    [input.rubitimeBranchId, input.cityCode, input.title, input.address ?? ''],
  );
  const r = res.rows[0];
  if (!r) throw new Error('upsertBranch: no row returned');
  return {
    id: Number(r.id),
    rubitimeBranchId: r.rubitime_branch_id,
    cityCode: r.city_code,
    title: r.title,
    address: r.address,
    isActive: r.is_active,
  };
}

export async function deactivateBranch(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE rubitime_branches SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

// ---- Service ----

export type RubitimeService = {
  id: number;
  rubitimeServiceId: number;
  title: string;
  categoryCode: string;
  durationMinutes: number;
  isActive: boolean;
};

export async function listServices(db: DbPort): Promise<RubitimeService[]> {
  const res = await db.query<{
    id: string;
    rubitime_service_id: number;
    title: string;
    category_code: string;
    duration_minutes: number;
    is_active: boolean;
  }>(`SELECT id, rubitime_service_id, title, category_code, duration_minutes, is_active
      FROM rubitime_services
      ORDER BY title`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    rubitimeServiceId: r.rubitime_service_id,
    title: r.title,
    categoryCode: r.category_code,
    durationMinutes: r.duration_minutes,
    isActive: r.is_active,
  }));
}

export async function upsertService(
  db: DbPort,
  input: { rubitimeServiceId: number; title: string; categoryCode: string; durationMinutes: number },
): Promise<RubitimeService> {
  const res = await db.query<{
    id: string;
    rubitime_service_id: number;
    title: string;
    category_code: string;
    duration_minutes: number;
    is_active: boolean;
  }>(
    `INSERT INTO rubitime_services (rubitime_service_id, title, category_code, duration_minutes, is_active, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, NOW())
     ON CONFLICT (rubitime_service_id) DO UPDATE
       SET title            = EXCLUDED.title,
           category_code    = EXCLUDED.category_code,
           duration_minutes = EXCLUDED.duration_minutes,
           is_active        = TRUE,
           updated_at       = NOW()
     RETURNING id, rubitime_service_id, title, category_code, duration_minutes, is_active`,
    [input.rubitimeServiceId, input.title, input.categoryCode, input.durationMinutes],
  );
  const r = res.rows[0];
  if (!r) throw new Error('upsertService: no row returned');
  return {
    id: Number(r.id),
    rubitimeServiceId: r.rubitime_service_id,
    title: r.title,
    categoryCode: r.category_code,
    durationMinutes: r.duration_minutes,
    isActive: r.is_active,
  };
}

export async function deactivateService(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE rubitime_services SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

// ---- Cooperator ----

export type RubitimeCooperator = {
  id: number;
  rubitimeCooperatorId: number;
  title: string;
  isActive: boolean;
};

export async function listCooperators(db: DbPort): Promise<RubitimeCooperator[]> {
  const res = await db.query<{
    id: string;
    rubitime_cooperator_id: number;
    title: string;
    is_active: boolean;
  }>(`SELECT id, rubitime_cooperator_id, title, is_active
      FROM rubitime_cooperators
      ORDER BY title`);
  return res.rows.map((r) => ({
    id: Number(r.id),
    rubitimeCooperatorId: r.rubitime_cooperator_id,
    title: r.title,
    isActive: r.is_active,
  }));
}

export async function upsertCooperator(
  db: DbPort,
  input: { rubitimeCooperatorId: number; title: string },
): Promise<RubitimeCooperator> {
  const res = await db.query<{
    id: string;
    rubitime_cooperator_id: number;
    title: string;
    is_active: boolean;
  }>(
    `INSERT INTO rubitime_cooperators (rubitime_cooperator_id, title, is_active, updated_at)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (rubitime_cooperator_id) DO UPDATE
       SET title      = EXCLUDED.title,
           is_active  = TRUE,
           updated_at = NOW()
     RETURNING id, rubitime_cooperator_id, title, is_active`,
    [input.rubitimeCooperatorId, input.title],
  );
  const r = res.rows[0];
  if (!r) throw new Error('upsertCooperator: no row returned');
  return {
    id: Number(r.id),
    rubitimeCooperatorId: r.rubitime_cooperator_id,
    title: r.title,
    isActive: r.is_active,
  };
}

export async function deactivateCooperator(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE rubitime_cooperators SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

// ---- Booking Profile ----

export type RubitimeBookingProfile = {
  id: number;
  bookingType: 'online' | 'in_person';
  categoryCode: string;
  cityCode: string | null;
  branchId: number;
  serviceId: number;
  cooperatorId: number;
  isActive: boolean;
  // Resolved Rubitime IDs (joined from child tables)
  rubitimeBranchId: number;
  rubitimeServiceId: number;
  rubitimeCooperatorId: number;
  durationMinutes: number;
  // Labels for display
  branchTitle: string;
  serviceTitle: string;
  cooperatorTitle: string;
};

export type ResolvedProfileParams = {
  rubitimeBranchId: number;
  rubitimeServiceId: number;
  rubitimeCooperatorId: number;
  durationMinutes: number;
};

export async function resolveBookingProfile(
  db: DbPort,
  query: { type: 'online' | 'in_person'; category: string; city?: string },
): Promise<ResolvedProfileParams | null> {
  const cityParam = query.type === 'in_person' ? (query.city ?? null) : null;
  const res = await db.query<{
    rubitime_branch_id: number;
    rubitime_service_id: number;
    rubitime_cooperator_id: number;
    duration_minutes: number;
  }>(
    `SELECT
       b.rubitime_branch_id,
       s.rubitime_service_id,
       c.rubitime_cooperator_id,
       s.duration_minutes
     FROM rubitime_booking_profiles p
     JOIN rubitime_branches     b ON b.id = p.branch_id
     JOIN rubitime_services     s ON s.id = p.service_id
     JOIN rubitime_cooperators  c ON c.id = p.cooperator_id
     WHERE p.booking_type  = $1
       AND p.category_code = $2
       AND COALESCE(p.city_code, '') = COALESCE($3, '')
       AND p.is_active  = TRUE
       AND b.is_active  = TRUE
       AND s.is_active  = TRUE
       AND c.is_active  = TRUE
     LIMIT 1`,
    [query.type, query.category, cityParam],
  );

  const r = res.rows[0];
  if (!r) return null;
  return {
    rubitimeBranchId: r.rubitime_branch_id,
    rubitimeServiceId: r.rubitime_service_id,
    rubitimeCooperatorId: r.rubitime_cooperator_id,
    durationMinutes: r.duration_minutes,
  };
}

/**
 * Любой активный профиль записи → Rubitime IDs для health-probe `get-schedule` (read-only).
 */
export async function pickAnyActiveRubitimeScheduleTriple(
  db: DbPort,
): Promise<{ branchId: number; cooperatorId: number; serviceId: number } | null> {
  const res = await db.query<{
    rubitime_branch_id: number;
    rubitime_service_id: number;
    rubitime_cooperator_id: number;
  }>(
    `SELECT
       b.rubitime_branch_id,
       s.rubitime_service_id,
       c.rubitime_cooperator_id
     FROM rubitime_booking_profiles p
     JOIN rubitime_branches     b ON b.id = p.branch_id
     JOIN rubitime_services     s ON s.id = p.service_id
     JOIN rubitime_cooperators  c ON c.id = p.cooperator_id
     WHERE p.is_active = TRUE AND b.is_active = TRUE AND s.is_active = TRUE AND c.is_active = TRUE
     ORDER BY p.id
     LIMIT 1`,
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    branchId: r.rubitime_branch_id,
    cooperatorId: r.rubitime_cooperator_id,
    serviceId: r.rubitime_service_id,
  };
}

export async function listBookingProfiles(db: DbPort): Promise<RubitimeBookingProfile[]> {
  const res = await db.query<{
    id: string;
    booking_type: string;
    category_code: string;
    city_code: string | null;
    branch_id: string;
    service_id: string;
    cooperator_id: string;
    is_active: boolean;
    rubitime_branch_id: number;
    rubitime_service_id: number;
    rubitime_cooperator_id: number;
    duration_minutes: number;
    branch_title: string;
    service_title: string;
    cooperator_title: string;
  }>(
    `SELECT
       p.id, p.booking_type, p.category_code, p.city_code,
       p.branch_id, p.service_id, p.cooperator_id, p.is_active,
       b.rubitime_branch_id, b.title AS branch_title,
       s.rubitime_service_id, s.duration_minutes, s.title AS service_title,
       c.rubitime_cooperator_id, c.title AS cooperator_title
     FROM rubitime_booking_profiles p
     JOIN rubitime_branches    b ON b.id = p.branch_id
     JOIN rubitime_services    s ON s.id = p.service_id
     JOIN rubitime_cooperators c ON c.id = p.cooperator_id
     ORDER BY p.booking_type, p.category_code, p.city_code NULLS FIRST`,
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    bookingType: r.booking_type as 'online' | 'in_person',
    categoryCode: r.category_code,
    cityCode: r.city_code,
    branchId: Number(r.branch_id),
    serviceId: Number(r.service_id),
    cooperatorId: Number(r.cooperator_id),
    isActive: r.is_active,
    rubitimeBranchId: r.rubitime_branch_id,
    rubitimeServiceId: r.rubitime_service_id,
    rubitimeCooperatorId: r.rubitime_cooperator_id,
    durationMinutes: r.duration_minutes,
    branchTitle: r.branch_title,
    serviceTitle: r.service_title,
    cooperatorTitle: r.cooperator_title,
  }));
}

export async function upsertBookingProfile(
  db: DbPort,
  input: {
    bookingType: 'online' | 'in_person';
    categoryCode: string;
    cityCode: string | null;
    branchId: number;
    serviceId: number;
    cooperatorId: number;
  },
): Promise<{ id: number }> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO rubitime_booking_profiles
       (booking_type, category_code, city_code, branch_id, service_id, cooperator_id, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT ON CONSTRAINT rubitime_booking_profiles_booking_type_category_code_coalesce_ci_key
     DO UPDATE
       SET branch_id     = EXCLUDED.branch_id,
           service_id    = EXCLUDED.service_id,
           cooperator_id = EXCLUDED.cooperator_id,
           is_active     = TRUE,
           updated_at    = NOW()
     RETURNING id`,
    [
      input.bookingType,
      input.categoryCode,
      input.cityCode,
      input.branchId,
      input.serviceId,
      input.cooperatorId,
    ],
  );
  const r = res.rows[0];
  if (!r) throw new Error('upsertBookingProfile: no row returned');
  return { id: Number(r.id) };
}

export async function upsertBookingProfileByIndex(
  db: DbPort,
  input: {
    bookingType: 'online' | 'in_person';
    categoryCode: string;
    cityCode: string | null;
    branchId: number;
    serviceId: number;
    cooperatorId: number;
  },
): Promise<{ id: number }> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO rubitime_booking_profiles
       (booking_type, category_code, city_code, branch_id, service_id, cooperator_id, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT (booking_type, category_code, COALESCE(city_code, ''))
     DO UPDATE
       SET branch_id     = EXCLUDED.branch_id,
           service_id    = EXCLUDED.service_id,
           cooperator_id = EXCLUDED.cooperator_id,
           is_active     = TRUE,
           updated_at    = NOW()
     RETURNING id`,
    [
      input.bookingType,
      input.categoryCode,
      input.cityCode,
      input.branchId,
      input.serviceId,
      input.cooperatorId,
    ],
  );
  const r = res.rows[0];
  // eslint-disable-next-line no-secrets/no-secrets
  if (!r) throw new Error('upsertBookingProfileByIndex: no row returned');
  return { id: Number(r.id) };
}

export async function deactivateBookingProfile(db: DbPort, id: number): Promise<void> {
  await db.query(
    `UPDATE rubitime_booking_profiles SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
}
