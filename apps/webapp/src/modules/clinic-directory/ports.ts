/**
 * Narrow public port for the canonical booking link `/book/{publicSlug}`
 * (owner canon: docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md §1).
 *
 * This is deliberately the only public surface of the `clinic_public_directory_entries`
 * projection needed today: slug -> organization id. It must run before any organization
 * principal exists (bootstrap context) and never expose org enumeration, `be_organizations`
 * internals, or a distinct "unpublished" vs "unknown" signal.
 */
export type ClinicDirectoryPort = {
  /**
   * Resolves a public slug to the organization id of a published, active clinic.
   * Returns `null` for unknown, unpublished, or inactive-organization slugs (fail-closed,
   * uniform — callers must not distinguish these cases in the response).
   */
  resolveOrganizationIdBySlug(slug: string): Promise<string | null>;

  /** Staff-only management read. Returns no value until the organization is explicitly published. */
  getPublishedSlugForOrganization(organizationId: string): Promise<string | null>;

  /** Exact-organization management state for the clinic settings surface. */
  getSlugManagementState(organizationId: string): Promise<OrganizationSlugManagementState>;

  /** Internal foundation resolver. Public callers must still require a published projection. */
  resolveCanonicalSlug(slug: string): Promise<OrganizationSlugResolution | null>;
  /** Pre-signup availability signal. It never reveals the owning organization or reservation. */
  isSlugAvailable(slug: string): Promise<boolean>;

  // Mutation repositories derive audit attribution from the trusted staff DB principal. The later
  // route/application layer must additionally enforce the organization-owner role; callers cannot
  // supply or override the audit actor through these inputs.
  reserveSlug(input: ReserveOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  claimReservedSlug(input: ClaimOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
  renameSlug(input: RenameOrganizationSlugInput): Promise<OrganizationSlugMutationResult>;
};

export type OrganizationSlugResolution = {
  organizationId: string;
  requestedSlug: string;
  canonicalSlug: string;
  disposition: 'current' | 'redirect';
};

export type ReserveOrganizationSlugInput = {
  slug: string;
  organizationId: string;
};

export type ClaimOrganizationSlugInput = {
  slug: string;
  organizationId: string;
};

export type RenameOrganizationSlugInput = {
  organizationId: string;
  reservedSlug: string;
};

export type OrganizationSlugManagementState = {
  currentSlug: string | null;
  /**
   * Сколько смен адреса клиника сделала САМА. Считается по событиям
   * `organization_slug_rename_events`, чей актор — член этой же организации; отдельного поля-счётчика
   * нет намеренно (производное поле разошлось бы с событийной таблицей).
   */
  selfRenamesUsed: number;
  /**
   * Осталась ли у клиники её единственная самостоятельная смена (владелец 19.08: «Клинике дается ОДНА
   * смена слаг самостоятельно (за весь период жизни)»). Смена, инициированная админом платформы по
   * обращению в поддержку, лимит не тратит — её актор не член клиники и в счёт не идёт.
   */
  selfRenameAllowed: boolean;
};

export type SetOrganizationSlugInput = {
  organizationId: string;
  slug: string;
  irreversibleRenameConfirmed: boolean;
  /**
   * Кто инициировал смену. `clinic` тратит единственное самостоятельное переименование;
   * `platform_admin` — обращение в поддержку, лимитом не ограничено (владелец 19.08).
   * Никогда не приходит из тела запроса: маршрут проставляет его из своего гейта.
   */
  initiatedBy: 'clinic' | 'platform_admin';
};

export type OrganizationSlugMutationErrorCode =
  | 'slug_unavailable'
  | 'reservation_not_found'
  | 'reservation_owner_mismatch'
  | 'current_slug_not_found'
  | 'current_slug_already_exists'
  | 'invalid_slug'
  | 'slug_invalid_characters'
  | 'slug_too_short'
  | 'slug_too_long'
  | 'slug_unchanged'
  | 'reserved_slug'
  | 'rename_confirmation_required'
  | 'self_rename_allowance_spent';

export type OrganizationSlugMutationResult =
  | { ok: true; slug: string }
  | { ok: false; code: OrganizationSlugMutationErrorCode };
