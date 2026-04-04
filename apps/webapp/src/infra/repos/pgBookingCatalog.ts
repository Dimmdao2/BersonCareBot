import { getPool } from "@/infra/db/client";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";
import type {
  BookingCity,
  BookingBranch,
  BookingSpecialist,
  BookingService,
  BookingBranchService,
  ResolvedBranchService,
} from "@/modules/booking-catalog/types";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

type CityRow = {
  id: string;
  code: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type BranchRow = {
  id: string;
  city_id: string;
  title: string;
  address: string | null;
  rubitime_branch_id: string;
  timezone: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type SpecialistRow = {
  id: string;
  branch_id: string;
  full_name: string;
  description: string | null;
  rubitime_cooperator_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type ServiceRow = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  price_minor: number;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type BranchServiceRow = {
  id: string;
  branch_id: string;
  service_id: string;
  specialist_id: string;
  rubitime_service_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

function mapCity(row: CityRow): BookingCity {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBranch(row: BranchRow): BookingBranch {
  return {
    id: row.id,
    cityId: row.city_id,
    title: row.title,
    address: row.address,
    rubitimeBranchId: row.rubitime_branch_id,
    timezone: row.timezone,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSpecialist(row: SpecialistRow): BookingSpecialist {
  return {
    id: row.id,
    branchId: row.branch_id,
    fullName: row.full_name,
    description: row.description,
    rubitimeCooperatorId: row.rubitime_cooperator_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapService(row: ServiceRow): BookingService {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceMinor: row.price_minor,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBranchService(row: BranchServiceRow): BookingBranchService {
  return {
    id: row.id,
    branchId: row.branch_id,
    serviceId: row.service_id,
    specialistId: row.specialist_id,
    rubitimeServiceId: row.rubitime_service_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * When `rubitime_branch_id` is numeric, it matches `branches.integrator_branch_id` (integrator/Rubitime id).
 * Keeps `branches.timezone` aligned with booking catalog edits so integrator `getBranchTimezone` sees admin changes.
 */
function parseRubitimeBranchIdAsIntegratorId(rubitimeBranchId: string): number | null {
  const n = Number(String(rubitimeBranchId).trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function syncBranchesTimezoneFromCatalog(
  pool: ReturnType<typeof getPool>,
  rubitimeBranchId: string,
  timezone: string,
): Promise<void> {
  const integratorId = parseRubitimeBranchIdAsIntegratorId(rubitimeBranchId);
  if (integratorId === null) return;
  const tz = timezone.trim() || "Europe/Moscow";
  await pool.query(
    `UPDATE branches SET timezone = $1, updated_at = now() WHERE integrator_branch_id = $2`,
    [tz, integratorId],
  );
}

// ---------------------------------------------------------------------------
// Port implementation
// ---------------------------------------------------------------------------

export function createPgBookingCatalogPort(): BookingCatalogPort {
  const pool = getPool();

  return {
    // -----------------------------------------------------------------------
    // Read
    // -----------------------------------------------------------------------

    async listCitiesForPatient() {
      const result = await pool.query<CityRow>(
        `SELECT id, code, title, is_active, sort_order, created_at, updated_at
         FROM booking_cities
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, title ASC`,
      );
      return result.rows.map(mapCity);
    },

    async listServicesByCity(cityCode) {
      type JoinRow = BranchServiceRow & {
        br_id: string;
        br_city_id: string;
        br_title: string;
        br_address: string | null;
        br_rubitime_branch_id: string;
        br_timezone: string;
        br_is_active: boolean;
        br_sort_order: number;
        br_created_at: Date;
        br_updated_at: Date;
        svc_id: string;
        svc_title: string;
        svc_description: string | null;
        svc_duration_minutes: number;
        svc_price_minor: number;
        svc_is_active: boolean;
        svc_sort_order: number;
        svc_created_at: Date;
        svc_updated_at: Date;
        sp_id: string;
        sp_branch_id: string;
        sp_full_name: string;
        sp_description: string | null;
        sp_rubitime_cooperator_id: string;
        sp_is_active: boolean;
        sp_sort_order: number;
        sp_created_at: Date;
        sp_updated_at: Date;
      };

      const result = await pool.query<JoinRow>(
        `SELECT
           bbs.id, bbs.branch_id, bbs.service_id, bbs.specialist_id,
           bbs.rubitime_service_id, bbs.is_active, bbs.sort_order,
           bbs.created_at, bbs.updated_at,
           br.id AS br_id, br.city_id AS br_city_id, br.title AS br_title,
           br.address AS br_address, br.rubitime_branch_id AS br_rubitime_branch_id,
           br.timezone AS br_timezone,
           br.is_active AS br_is_active, br.sort_order AS br_sort_order,
           br.created_at AS br_created_at, br.updated_at AS br_updated_at,
           svc.id AS svc_id, svc.title AS svc_title, svc.description AS svc_description,
           svc.duration_minutes AS svc_duration_minutes, svc.price_minor AS svc_price_minor,
           svc.is_active AS svc_is_active, svc.sort_order AS svc_sort_order,
           svc.created_at AS svc_created_at, svc.updated_at AS svc_updated_at,
           sp.id AS sp_id, sp.branch_id AS sp_branch_id, sp.full_name AS sp_full_name,
           sp.description AS sp_description,
           sp.rubitime_cooperator_id AS sp_rubitime_cooperator_id,
           sp.is_active AS sp_is_active, sp.sort_order AS sp_sort_order,
           sp.created_at AS sp_created_at, sp.updated_at AS sp_updated_at
         FROM booking_branch_services bbs
         JOIN booking_branches br ON br.id = bbs.branch_id
         JOIN booking_cities c ON c.id = br.city_id
         JOIN booking_services svc ON svc.id = bbs.service_id
         JOIN booking_specialists sp ON sp.id = bbs.specialist_id
         WHERE c.code = $1
           AND c.is_active = TRUE
           AND br.is_active = TRUE
           AND bbs.is_active = TRUE
           AND svc.is_active = TRUE
           AND sp.is_active = TRUE
         ORDER BY bbs.sort_order ASC, svc.title ASC`,
        [cityCode],
      );

      return result.rows.map((row) => ({
        ...mapBranchService(row),
        branch: mapBranch({
          id: row.br_id,
          city_id: row.br_city_id,
          title: row.br_title,
          address: row.br_address,
          rubitime_branch_id: row.br_rubitime_branch_id,
          timezone: row.br_timezone,
          is_active: row.br_is_active,
          sort_order: row.br_sort_order,
          created_at: row.br_created_at,
          updated_at: row.br_updated_at,
        }),
        service: mapService({
          id: row.svc_id,
          title: row.svc_title,
          description: row.svc_description,
          duration_minutes: row.svc_duration_minutes,
          price_minor: row.svc_price_minor,
          is_active: row.svc_is_active,
          sort_order: row.svc_sort_order,
          created_at: row.svc_created_at,
          updated_at: row.svc_updated_at,
        }),
        specialist: mapSpecialist({
          id: row.sp_id,
          branch_id: row.sp_branch_id,
          full_name: row.sp_full_name,
          description: row.sp_description,
          rubitime_cooperator_id: row.sp_rubitime_cooperator_id,
          is_active: row.sp_is_active,
          sort_order: row.sp_sort_order,
          created_at: row.sp_created_at,
          updated_at: row.sp_updated_at,
        }),
      }));
    },

    async resolveBranchService(branchServiceId) {
      type ResolveRow = BranchServiceRow &
        BranchRow &
        ServiceRow &
        SpecialistRow &
        CityRow & {
          bbs_id: string;
          bbs_branch_id: string;
          bbs_service_id: string;
          bbs_specialist_id: string;
          bbs_rubitime_service_id: string;
          bbs_is_active: boolean;
          bbs_sort_order: number;
          bbs_created_at: Date;
          bbs_updated_at: Date;
          br_id: string;
          br_city_id: string;
          br_title: string;
          br_address: string | null;
          br_rubitime_branch_id: string;
          br_timezone: string;
          br_is_active: boolean;
          br_sort_order: number;
          br_created_at: Date;
          br_updated_at: Date;
          svc_id: string;
          svc_title: string;
          svc_description: string | null;
          svc_duration_minutes: number;
          svc_price_minor: number;
          svc_is_active: boolean;
          svc_sort_order: number;
          svc_created_at: Date;
          svc_updated_at: Date;
          sp_id: string;
          sp_branch_id: string;
          sp_full_name: string;
          sp_description: string | null;
          sp_rubitime_cooperator_id: string;
          sp_is_active: boolean;
          sp_sort_order: number;
          sp_created_at: Date;
          sp_updated_at: Date;
          city_id: string;
          city_code: string;
          city_title: string;
          city_is_active: boolean;
          city_sort_order: number;
          city_created_at: Date;
          city_updated_at: Date;
        };

      const result = await pool.query<ResolveRow>(
        `SELECT
           bbs.id AS bbs_id, bbs.branch_id AS bbs_branch_id,
           bbs.service_id AS bbs_service_id, bbs.specialist_id AS bbs_specialist_id,
           bbs.rubitime_service_id AS bbs_rubitime_service_id,
           bbs.is_active AS bbs_is_active, bbs.sort_order AS bbs_sort_order,
           bbs.created_at AS bbs_created_at, bbs.updated_at AS bbs_updated_at,
           br.id AS br_id, br.city_id AS br_city_id, br.title AS br_title,
           br.address AS br_address, br.rubitime_branch_id AS br_rubitime_branch_id,
           br.timezone AS br_timezone,
           br.is_active AS br_is_active, br.sort_order AS br_sort_order,
           br.created_at AS br_created_at, br.updated_at AS br_updated_at,
           svc.id AS svc_id, svc.title AS svc_title, svc.description AS svc_description,
           svc.duration_minutes AS svc_duration_minutes, svc.price_minor AS svc_price_minor,
           svc.is_active AS svc_is_active, svc.sort_order AS svc_sort_order,
           svc.created_at AS svc_created_at, svc.updated_at AS svc_updated_at,
           sp.id AS sp_id, sp.branch_id AS sp_branch_id, sp.full_name AS sp_full_name,
           sp.description AS sp_description,
           sp.rubitime_cooperator_id AS sp_rubitime_cooperator_id,
           sp.is_active AS sp_is_active, sp.sort_order AS sp_sort_order,
           sp.created_at AS sp_created_at, sp.updated_at AS sp_updated_at,
           c.id AS city_id, c.code AS city_code, c.title AS city_title,
           c.is_active AS city_is_active, c.sort_order AS city_sort_order,
           c.created_at AS city_created_at, c.updated_at AS city_updated_at
         FROM booking_branch_services bbs
         JOIN booking_branches br ON br.id = bbs.branch_id
         JOIN booking_cities c ON c.id = br.city_id
         JOIN booking_services svc ON svc.id = bbs.service_id
         JOIN booking_specialists sp ON sp.id = bbs.specialist_id
         WHERE bbs.id = $1
           AND bbs.is_active = TRUE
           AND br.is_active = TRUE
           AND c.is_active = TRUE
           AND svc.is_active = TRUE
           AND sp.is_active = TRUE`,
        [branchServiceId],
      );

      if (result.rows.length === 0) return null;
      const row = result.rows[0]!;

      const branchService: BookingBranchService = {
        id: row.bbs_id,
        branchId: row.bbs_branch_id,
        serviceId: row.bbs_service_id,
        specialistId: row.bbs_specialist_id,
        rubitimeServiceId: row.bbs_rubitime_service_id,
        isActive: row.bbs_is_active,
        sortOrder: row.bbs_sort_order,
        createdAt: row.bbs_created_at.toISOString(),
        updatedAt: row.bbs_updated_at.toISOString(),
      };
      const branch = mapBranch({
        id: row.br_id,
        city_id: row.br_city_id,
        title: row.br_title,
        address: row.br_address,
        rubitime_branch_id: row.br_rubitime_branch_id,
        timezone: row.br_timezone,
        is_active: row.br_is_active,
        sort_order: row.br_sort_order,
        created_at: row.br_created_at,
        updated_at: row.br_updated_at,
      });
      const service = mapService({
        id: row.svc_id,
        title: row.svc_title,
        description: row.svc_description,
        duration_minutes: row.svc_duration_minutes,
        price_minor: row.svc_price_minor,
        is_active: row.svc_is_active,
        sort_order: row.svc_sort_order,
        created_at: row.svc_created_at,
        updated_at: row.svc_updated_at,
      });
      const specialist = mapSpecialist({
        id: row.sp_id,
        branch_id: row.sp_branch_id,
        full_name: row.sp_full_name,
        description: row.sp_description,
        rubitime_cooperator_id: row.sp_rubitime_cooperator_id,
        is_active: row.sp_is_active,
        sort_order: row.sp_sort_order,
        created_at: row.sp_created_at,
        updated_at: row.sp_updated_at,
      });
      const city = mapCity({
        id: row.city_id,
        code: row.city_code,
        title: row.city_title,
        is_active: row.city_is_active,
        sort_order: row.city_sort_order,
        created_at: row.city_created_at,
        updated_at: row.city_updated_at,
      });

      const resolved: ResolvedBranchService = { branchService, branch, service, specialist, city };
      return resolved;
    },

    // -----------------------------------------------------------------------
    // Write (used by seed script and admin CRUD)
    // -----------------------------------------------------------------------

    async upsertCity({ code, title, isActive, sortOrder }) {
      const result = await pool.query<CityRow>(
        `INSERT INTO booking_cities (id, code, title, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
           SET title = EXCLUDED.title,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id, code, title, is_active, sort_order, created_at, updated_at`,
        [code, title, isActive, sortOrder],
      );
      return mapCity(result.rows[0]!);
    },

    async upsertBranch({ cityCode, title, address, rubitimeBranchId, timezone, isActive, sortOrder }) {
      const cityRes = await pool.query<{ id: string }>(
        `SELECT id FROM booking_cities WHERE code = $1`,
        [cityCode],
      );
      if (cityRes.rows.length === 0) throw new Error(`city_not_found:${cityCode}`);
      const cityId = cityRes.rows[0]!.id;
      const tz = (timezone ?? "Europe/Moscow").trim() || "Europe/Moscow";

      const result = await pool.query<{ id: string }>(
        `INSERT INTO booking_branches (id, city_id, title, address, rubitime_branch_id, is_active, sort_order, timezone)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (rubitime_branch_id) DO UPDATE
           SET city_id = EXCLUDED.city_id,
               title = EXCLUDED.title,
               address = EXCLUDED.address,
               timezone = EXCLUDED.timezone,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id`,
        [cityId, title, address, rubitimeBranchId, isActive, sortOrder, tz],
      );
      await syncBranchesTimezoneFromCatalog(pool, rubitimeBranchId, tz);
      return { id: result.rows[0]!.id };
    },

    async upsertSpecialist({
      rubitimeBranchId,
      fullName,
      description,
      rubitimeCooperatorId,
      isActive,
      sortOrder,
    }) {
      const branchRes = await pool.query<{ id: string }>(
        `SELECT id FROM booking_branches WHERE rubitime_branch_id = $1`,
        [rubitimeBranchId],
      );
      if (branchRes.rows.length === 0) throw new Error(`branch_not_found:${rubitimeBranchId}`);
      const branchId = branchRes.rows[0]!.id;

      const result = await pool.query<{ id: string }>(
        `INSERT INTO booking_specialists
           (id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT (rubitime_cooperator_id, branch_id) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               description = EXCLUDED.description,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id`,
        [branchId, fullName, description, rubitimeCooperatorId, isActive, sortOrder],
      );
      return { id: result.rows[0]!.id };
    },

    async upsertService({ title, description, durationMinutes, priceMinor, isActive, sortOrder }) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO booking_services
           (id, title, description, duration_minutes, price_minor, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_booking_services_title_duration DO UPDATE
           SET description = EXCLUDED.description,
               price_minor = EXCLUDED.price_minor,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id`,
        [title, description, durationMinutes, priceMinor, isActive, sortOrder],
      );
      return { id: result.rows[0]!.id };
    },

    async upsertBranchService({
      rubitimeBranchId,
      serviceTitle,
      serviceDurationMinutes,
      rubitimeCooperatorId,
      rubitimeServiceId,
      isActive,
      sortOrder,
    }) {
      const branchRes = await pool.query<{ id: string }>(
        `SELECT id FROM booking_branches WHERE rubitime_branch_id = $1`,
        [rubitimeBranchId],
      );
      if (branchRes.rows.length === 0) throw new Error(`branch_not_found:${rubitimeBranchId}`);
      const branchId = branchRes.rows[0]!.id;

      const specialistRes = await pool.query<{ id: string }>(
        `SELECT id FROM booking_specialists
         WHERE rubitime_cooperator_id = $1 AND branch_id = $2`,
        [rubitimeCooperatorId, branchId],
      );
      if (specialistRes.rows.length === 0)
        throw new Error(`specialist_not_found:${rubitimeCooperatorId}`);
      const specialistId = specialistRes.rows[0]!.id;

      const serviceRes = await pool.query<{ id: string }>(
        `SELECT id FROM booking_services
         WHERE title = $1 AND duration_minutes = $2`,
        [serviceTitle, serviceDurationMinutes],
      );
      if (serviceRes.rows.length === 0)
        throw new Error(`service_not_found:${serviceTitle}/${serviceDurationMinutes}`);
      const serviceId = serviceRes.rows[0]!.id;

      const result = await pool.query<{ id: string }>(
        `INSERT INTO booking_branch_services
           (id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_booking_branch_services DO UPDATE
           SET specialist_id = EXCLUDED.specialist_id,
               rubitime_service_id = EXCLUDED.rubitime_service_id,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id`,
        [branchId, serviceId, specialistId, rubitimeServiceId, isActive, sortOrder],
      );
      return { id: result.rows[0]!.id };
    },

    // -----------------------------------------------------------------------
    // Admin (Stage 3)
    // -----------------------------------------------------------------------

    async listCitiesAdmin() {
      const result = await pool.query<CityRow>(
        `SELECT id, code, title, is_active, sort_order, created_at, updated_at
         FROM booking_cities
         ORDER BY sort_order ASC, title ASC`,
      );
      return result.rows.map(mapCity);
    },

    async getCityById(id) {
      const result = await pool.query<CityRow>(
        `SELECT id, code, title, is_active, sort_order, created_at, updated_at
         FROM booking_cities WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return mapCity(result.rows[0]!);
    },

    async updateCityById(id, patch) {
      const cur = await this.getCityById(id);
      if (!cur) return null;
      const title = patch.title ?? cur.title;
      const isActive = patch.isActive ?? cur.isActive;
      const sortOrder = patch.sortOrder ?? cur.sortOrder;
      const result = await pool.query<CityRow>(
        `UPDATE booking_cities
         SET title = $2, is_active = $3, sort_order = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, code, title, is_active, sort_order, created_at, updated_at`,
        [id, title, isActive, sortOrder],
      );
      return mapCity(result.rows[0]!);
    },

    async deactivateCity(id) {
      const result = await pool.query(
        `UPDATE booking_cities SET is_active = FALSE, updated_at = now() WHERE id = $1`,
        [id],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },

    async listBranchesAdmin() {
      const result = await pool.query<BranchRow>(
        `SELECT id, city_id, title, address, rubitime_branch_id, timezone, is_active, sort_order, created_at, updated_at
         FROM booking_branches
         ORDER BY sort_order ASC, title ASC`,
      );
      return result.rows.map(mapBranch);
    },

    async getBranchById(id) {
      const result = await pool.query<BranchRow>(
        `SELECT id, city_id, title, address, rubitime_branch_id, timezone, is_active, sort_order, created_at, updated_at
         FROM booking_branches WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return mapBranch(result.rows[0]!);
    },

    async updateBranchById(id, patch) {
      const cur = await this.getBranchById(id);
      if (!cur) return null;
      const cityId = patch.cityId ?? cur.cityId;
      const title = patch.title ?? cur.title;
      const address = patch.address !== undefined ? patch.address : cur.address;
      const rubitimeBranchId = patch.rubitimeBranchId ?? cur.rubitimeBranchId;
      const timezone = patch.timezone !== undefined ? patch.timezone : cur.timezone;
      const isActive = patch.isActive ?? cur.isActive;
      const sortOrder = patch.sortOrder ?? cur.sortOrder;
      const result = await pool.query<BranchRow>(
        `UPDATE booking_branches
         SET city_id = $2, title = $3, address = $4, rubitime_branch_id = $5, timezone = $6,
             is_active = $7, sort_order = $8, updated_at = now()
         WHERE id = $1
         RETURNING id, city_id, title, address, rubitime_branch_id, timezone, is_active, sort_order, created_at, updated_at`,
        [id, cityId, title, address, rubitimeBranchId, timezone, isActive, sortOrder],
      );
      const row = result.rows[0]!;
      await syncBranchesTimezoneFromCatalog(pool, row.rubitime_branch_id, row.timezone);
      return mapBranch(row);
    },

    async deactivateBranch(id) {
      const result = await pool.query(
        `UPDATE booking_branches SET is_active = FALSE, updated_at = now() WHERE id = $1`,
        [id],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },

    async listServicesAdmin() {
      const result = await pool.query<ServiceRow>(
        `SELECT id, title, description, duration_minutes, price_minor, is_active, sort_order, created_at, updated_at
         FROM booking_services
         ORDER BY sort_order ASC, title ASC`,
      );
      return result.rows.map(mapService);
    },

    async getServiceById(id) {
      const result = await pool.query<ServiceRow>(
        `SELECT id, title, description, duration_minutes, price_minor, is_active, sort_order, created_at, updated_at
         FROM booking_services WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return mapService(result.rows[0]!);
    },

    async updateServiceById(id, patch) {
      const cur = await this.getServiceById(id);
      if (!cur) return null;
      const title = patch.title ?? cur.title;
      const description = patch.description !== undefined ? patch.description : cur.description;
      const durationMinutes = patch.durationMinutes ?? cur.durationMinutes;
      const priceMinor = patch.priceMinor ?? cur.priceMinor;
      const isActive = patch.isActive ?? cur.isActive;
      const sortOrder = patch.sortOrder ?? cur.sortOrder;
      const result = await pool.query<ServiceRow>(
        `UPDATE booking_services
         SET title = $2, description = $3, duration_minutes = $4, price_minor = $5,
             is_active = $6, sort_order = $7, updated_at = now()
         WHERE id = $1
         RETURNING id, title, description, duration_minutes, price_minor, is_active, sort_order, created_at, updated_at`,
        [id, title, description, durationMinutes, priceMinor, isActive, sortOrder],
      );
      return mapService(result.rows[0]!);
    },

    async deactivateService(id) {
      const result = await pool.query(
        `UPDATE booking_services SET is_active = FALSE, updated_at = now() WHERE id = $1`,
        [id],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },

    async listSpecialistsAdmin(branchId) {
      const result = branchId
        ? await pool.query<SpecialistRow>(
            `SELECT id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order, created_at, updated_at
             FROM booking_specialists
             WHERE branch_id = $1
             ORDER BY sort_order ASC, full_name ASC`,
            [branchId],
          )
        : await pool.query<SpecialistRow>(
            `SELECT id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order, created_at, updated_at
             FROM booking_specialists
             ORDER BY branch_id ASC, sort_order ASC, full_name ASC`,
          );
      return result.rows.map(mapSpecialist);
    },

    async getSpecialistById(id) {
      const result = await pool.query<SpecialistRow>(
        `SELECT id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order, created_at, updated_at
         FROM booking_specialists WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return mapSpecialist(result.rows[0]!);
    },

    async updateSpecialistById(id, patch) {
      const cur = await this.getSpecialistById(id);
      if (!cur) return null;
      const branchId = patch.branchId ?? cur.branchId;
      const fullName = patch.fullName ?? cur.fullName;
      const description = patch.description !== undefined ? patch.description : cur.description;
      const rubitimeCooperatorId = patch.rubitimeCooperatorId ?? cur.rubitimeCooperatorId;
      const isActive = patch.isActive ?? cur.isActive;
      const sortOrder = patch.sortOrder ?? cur.sortOrder;
      const result = await pool.query<SpecialistRow>(
        `UPDATE booking_specialists
         SET branch_id = $2, full_name = $3, description = $4, rubitime_cooperator_id = $5,
             is_active = $6, sort_order = $7, updated_at = now()
         WHERE id = $1
         RETURNING id, branch_id, full_name, description, rubitime_cooperator_id, is_active, sort_order, created_at, updated_at`,
        [id, branchId, fullName, description, rubitimeCooperatorId, isActive, sortOrder],
      );
      return mapSpecialist(result.rows[0]!);
    },

    async deactivateSpecialist(id) {
      const result = await pool.query(
        `UPDATE booking_specialists SET is_active = FALSE, updated_at = now() WHERE id = $1`,
        [id],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },

    async listBranchServicesAdmin(branchId) {
      const result = branchId
        ? await pool.query<BranchServiceRow>(
            `SELECT id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order, created_at, updated_at
             FROM booking_branch_services
             WHERE branch_id = $1
             ORDER BY sort_order ASC, created_at ASC`,
            [branchId],
          )
        : await pool.query<BranchServiceRow>(
            `SELECT id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order, created_at, updated_at
             FROM booking_branch_services
             ORDER BY branch_id ASC, sort_order ASC`,
          );
      return result.rows.map(mapBranchService);
    },

    async getBranchServiceById(id) {
      const result = await pool.query<BranchServiceRow>(
        `SELECT id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order, created_at, updated_at
         FROM booking_branch_services WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return mapBranchService(result.rows[0]!);
    },

    async upsertBranchServiceAdmin({
      branchId,
      serviceId,
      specialistId,
      rubitimeServiceId,
      isActive,
      sortOrder,
    }) {
      const spRes = await pool.query<{ branch_id: string }>(
        `SELECT branch_id FROM booking_specialists WHERE id = $1`,
        [specialistId],
      );
      if (spRes.rows.length === 0) throw new Error("specialist_not_found");
      if (spRes.rows[0]!.branch_id !== branchId) throw new Error("specialist_branch_mismatch");

      const result = await pool.query<BranchServiceRow>(
        `INSERT INTO booking_branch_services
           (id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT uq_booking_branch_services DO UPDATE
           SET specialist_id = EXCLUDED.specialist_id,
               rubitime_service_id = EXCLUDED.rubitime_service_id,
               is_active = EXCLUDED.is_active,
               sort_order = EXCLUDED.sort_order,
               updated_at = now()
         RETURNING id, branch_id, service_id, specialist_id, rubitime_service_id, is_active, sort_order, created_at, updated_at`,
        [branchId, serviceId, specialistId, rubitimeServiceId, isActive, sortOrder],
      );
      return mapBranchService(result.rows[0]!);
    },

    async deactivateBranchService(id) {
      const result = await pool.query(
        `UPDATE booking_branch_services SET is_active = FALSE, updated_at = now() WHERE id = $1`,
        [id],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },
  };
}
