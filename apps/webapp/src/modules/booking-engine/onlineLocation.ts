import type { OrganizationCatalogPort } from "./ports";
import type { BeBranch } from "./types";

export const ONLINE_LOCATION_CITY_CODE = "online";
export const ONLINE_LOCATION_TITLE = "Онлайн";
export const ONLINE_LOCATION_SHORT_TITLE = "Онлайн";

const ONLINE_LOCATION_DEFAULT_COLOR = "#7c3aed";
const ONLINE_LOCATION_DEFAULT_TIMEZONE = "Europe/Moscow";

type OnlineLocationIdentity = Pick<BeBranch, "cityCode" | "title">;

export function isBuiltInOnlineLocation(location: OnlineLocationIdentity): boolean {
  return isReservedOnlineLocationIdentity(location);
}

export function isBuiltInOnlineLocationCityCode(cityCode: string | null | undefined): boolean {
  return cityCode?.trim().toLowerCase() === ONLINE_LOCATION_CITY_CODE;
}

export function isReservedOnlineLocationIdentity(input: OnlineLocationIdentity): boolean {
  return (
    input.cityCode.trim().toLowerCase() === ONLINE_LOCATION_CITY_CODE ||
    input.title.trim().toLocaleLowerCase("ru") === ONLINE_LOCATION_TITLE.toLocaleLowerCase("ru")
  );
}

export function findBuiltInOnlineLocation(
  branches: readonly BeBranch[],
  organizationId: string,
): BeBranch | null {
  const matches = branches.filter(
    (branch) => branch.organizationId === organizationId && isBuiltInOnlineLocation(branch),
  );
  if (matches.length > 1) throw new Error("online_location_duplicate");
  return matches[0] ?? null;
}

type OnlineLocationCatalog = Pick<OrganizationCatalogPort, "listBranches" | "upsertBranch">;

/**
 * Lazy-provisions the one organization-owned built-in Online location and only changes its
 * active state. Existing service/specialist availability rows are intentionally left intact.
 */
export async function setBuiltInOnlineLocationState(
  catalog: OnlineLocationCatalog,
  input: { organizationId: string; isActive: boolean },
): Promise<BeBranch> {
  const branches = await catalog.listBranches(input.organizationId);
  const existing = findBuiltInOnlineLocation(branches, input.organizationId);

  if (existing) {
    if (
      existing.isActive === input.isActive &&
      existing.title === ONLINE_LOCATION_TITLE &&
      existing.shortTitle === ONLINE_LOCATION_SHORT_TITLE
    ) {
      return existing;
    }
    return catalog.upsertBranch({
      organizationId: input.organizationId,
      id: existing.id,
      title: ONLINE_LOCATION_TITLE,
      shortTitle: ONLINE_LOCATION_SHORT_TITLE,
      color: existing.color,
      cityCode: ONLINE_LOCATION_CITY_CODE,
      address: null,
      timezone: existing.timezone,
      isActive: input.isActive,
      sortOrder: existing.sortOrder,
    });
  }

  const sortOrder = branches.reduce((max, branch) => Math.max(max, branch.sortOrder), 0) + 10;
  try {
    return await catalog.upsertBranch({
      organizationId: input.organizationId,
      title: ONLINE_LOCATION_TITLE,
      shortTitle: ONLINE_LOCATION_SHORT_TITLE,
      color: ONLINE_LOCATION_DEFAULT_COLOR,
      cityCode: ONLINE_LOCATION_CITY_CODE,
      address: null,
      timezone: ONLINE_LOCATION_DEFAULT_TIMEZONE,
      isActive: input.isActive,
      sortOrder,
    });
  } catch (error) {
    // A concurrent idempotent request may have inserted the reserved row first. Re-read it;
    // unrelated write errors still propagate unchanged.
    const current = findBuiltInOnlineLocation(
      await catalog.listBranches(input.organizationId),
      input.organizationId,
    );
    if (!current) throw error;
    if (current.isActive === input.isActive) return current;
    return catalog.upsertBranch({
      organizationId: input.organizationId,
      id: current.id,
      title: ONLINE_LOCATION_TITLE,
      shortTitle: ONLINE_LOCATION_SHORT_TITLE,
      color: current.color,
      cityCode: ONLINE_LOCATION_CITY_CODE,
      address: null,
      timezone: current.timezone,
      isActive: input.isActive,
      sortOrder: current.sortOrder,
    });
  }
}
