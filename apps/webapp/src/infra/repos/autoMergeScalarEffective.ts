/**
 * Effective scalar values after automatic platform user merge (reason !== "manual").
 * Must stay aligned with the UPDATE branch in `mergePlatformUsersInTransaction` (pgPlatformUserMerge.ts).
 */
function normPhone(p: string | null | undefined): string | null {
  const t = typeof p === "string" ? p.trim() : "";
  return t ? t : null;
}

function normStr(s: string | null | undefined): string | null {
  const t = typeof s === "string" ? s.trim() : "";
  return t ? t : null;
}

export type AutoMergeNameSideInput = {
  phone_normalized: string | null;
  created_at: Date;
};

/**
 * Which side supplies names first in auto-merge SQL (`pu` / `dup` aliases).
 * Args are **not** commutative: pass merge target row first, duplicate second — same order as `mergePlatformUsersInTransaction`.
 */
export function pickAutoMergeNamePrimarySide(pu: AutoMergeNameSideInput, dup: AutoMergeNameSideInput): "pu" | "dup" {
  const pp = normPhone(pu.phone_normalized);
  const pd = normPhone(dup.phone_normalized);
  if (pp && !pd) return "pu";
  if (pd && !pp) return "dup";
  if (pp && pd) {
    return pu.created_at.getTime() <= dup.created_at.getTime() ? "pu" : "dup";
  }
  return "pu";
}

type PuDupNames = AutoMergeNameSideInput & {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

export function effectiveAutoMergedFirstName(pu: PuDupNames, dup: PuDupNames): string | null {
  const side = pickAutoMergeNamePrimarySide(pu, dup);
  const primary = side === "pu" ? pu : dup;
  const other = side === "pu" ? dup : pu;
  return normStr(primary.first_name) ?? normStr(other.first_name);
}

export function effectiveAutoMergedLastName(pu: PuDupNames, dup: PuDupNames): string | null {
  const side = pickAutoMergeNamePrimarySide(pu, dup);
  const primary = side === "pu" ? pu : dup;
  const other = side === "pu" ? dup : pu;
  return normStr(primary.last_name) ?? normStr(other.last_name);
}

export function effectiveAutoMergedDisplayName(pu: PuDupNames, dup: PuDupNames): string {
  const side = pickAutoMergeNamePrimarySide(pu, dup);
  const primary = side === "pu" ? pu : dup;
  const other = side === "pu" ? dup : pu;
  const p1 = normStr(primary.display_name);
  const p2 = normStr(other.display_name);
  if (p1) return primary.display_name.trim();
  if (p2) return other.display_name.trim();
  return (primary.display_name ?? "").trim();
}
