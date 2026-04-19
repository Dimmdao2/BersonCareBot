/**
 * Effective scalar values after automatic platform user merge (reason !== "manual").
 * Must stay aligned with the UPDATE branch in `mergePlatformUsersInTransaction` (`@bersoncare/platform-merge`).
 */
function normPhone(p: string | null | undefined): string | null {
  const t = typeof p === "string" ? p.trim() : "";
  return t ? t : null;
}

function normStr(s: string | null | undefined): string | null {
  const t = typeof s === "string" ? s.trim() : "";
  return t ? t : null;
}

function normStrField(s: string | null | undefined): string | null {
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

function bothFirstLastParsed(side: {
  first_name: string | null;
  last_name: string | null;
}): boolean {
  return (
    normStrField(side.first_name) !== null &&
    normStrField(side.last_name) !== null
  );
}

type PuDupNames = AutoMergeNameSideInput & {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

/** Rubitime / phone-owner row wins for full display string when only one side holds the phone. */
export function effectiveAutoMergedDisplayName(pu: PuDupNames, dup: PuDupNames): string {
  const pp = normPhone(pu.phone_normalized);
  const pd = normPhone(dup.phone_normalized);
  if (pp && !pd) {
    return normStr(pu.display_name) ?? normStr(dup.display_name) ?? "";
  }
  if (pd && !pp) {
    return normStr(dup.display_name) ?? normStr(pu.display_name) ?? "";
  }
  if (pp && pd && pp === pd) {
    const olderFirst = pu.created_at.getTime() <= dup.created_at.getTime();
    const primary = olderFirst ? pu : dup;
    const other = olderFirst ? dup : pu;
    return normStr(primary.display_name) ?? normStr(other.display_name) ?? "";
  }
  return normStr(pu.display_name) ?? normStr(dup.display_name) ?? "";
}

function firstLastOnePhoneXor(pu: PuDupNames, dup: PuDupNames): { first: string | null; last: string | null } {
  const pp = normPhone(pu.phone_normalized);
  const pd = normPhone(dup.phone_normalized);
  if (pp && !pd) {
    const puParsed = bothFirstLastParsed(pu);
    const dupParsed = bothFirstLastParsed(dup);
    if (puParsed && !dupParsed) {
      return {
        first: normStrField(pu.first_name) ?? normStrField(dup.first_name),
        last: normStrField(pu.last_name) ?? normStrField(dup.last_name),
      };
    }
    if (dupParsed && !puParsed) {
      return {
        first: normStrField(dup.first_name) ?? normStrField(pu.first_name),
        last: normStrField(dup.last_name) ?? normStrField(pu.last_name),
      };
    }
    return {
      first: normStrField(pu.first_name) ?? normStrField(dup.first_name),
      last: normStrField(pu.last_name) ?? normStrField(dup.last_name),
    };
  }
  if (pd && !pp) {
    const puParsed = bothFirstLastParsed(pu);
    const dupParsed = bothFirstLastParsed(dup);
    if (dupParsed && !puParsed) {
      return {
        first: normStrField(dup.first_name) ?? normStrField(pu.first_name),
        last: normStrField(dup.last_name) ?? normStrField(pu.last_name),
      };
    }
    if (puParsed && !dupParsed) {
      return {
        first: normStrField(pu.first_name) ?? normStrField(dup.first_name),
        last: normStrField(pu.last_name) ?? normStrField(dup.last_name),
      };
    }
    return {
      first: normStrField(dup.first_name) ?? normStrField(pu.first_name),
      last: normStrField(dup.last_name) ?? normStrField(pu.last_name),
    };
  }
  return { first: null, last: null };
}

export function effectiveAutoMergedFirstName(pu: PuDupNames, dup: PuDupNames): string | null {
  const pp = normPhone(pu.phone_normalized);
  const pd = normPhone(dup.phone_normalized);
  const xorPhone = Boolean((pp && !pd) || (pd && !pp));
  if (xorPhone) {
    return firstLastOnePhoneXor(pu, dup).first;
  }
  if (pp && pd && pp === pd) {
    return pu.created_at.getTime() <= dup.created_at.getTime()
      ? normStrField(pu.first_name) ?? normStrField(dup.first_name)
      : normStrField(dup.first_name) ?? normStrField(pu.first_name);
  }
  return normStrField(pu.first_name) ?? normStrField(dup.first_name);
}

export function effectiveAutoMergedLastName(pu: PuDupNames, dup: PuDupNames): string | null {
  const pp = normPhone(pu.phone_normalized);
  const pd = normPhone(dup.phone_normalized);
  const xorPhone = Boolean((pp && !pd) || (pd && !pp));
  if (xorPhone) {
    return firstLastOnePhoneXor(pu, dup).last;
  }
  if (pp && pd && pp === pd) {
    return pu.created_at.getTime() <= dup.created_at.getTime()
      ? normStrField(pu.last_name) ?? normStrField(dup.last_name)
      : normStrField(dup.last_name) ?? normStrField(pu.last_name);
  }
  return normStrField(pu.last_name) ?? normStrField(dup.last_name);
}
