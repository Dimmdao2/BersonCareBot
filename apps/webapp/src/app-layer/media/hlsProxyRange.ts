export type ParsedBytesRange =
  | { kind: "none" }
  | { kind: "invalid" }
  /** Single-range header suitable for AWS `Range` on GetObject */
  | { kind: "range"; awsHeader: string };

/**
 * Parses a single `bytes=` Range spec; rejects multi-range and malformed grammar.
 */
export function parseSingleBytesRangeHeader(raw: string | null | undefined): ParsedBytesRange {
  if (raw == null || raw.trim() === "") return { kind: "none" };
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (!lower.startsWith("bytes=")) return { kind: "invalid" };
  const spec = v.slice(6).trim();
  if (spec.includes(",")) return { kind: "invalid" };
  const hyphen = spec.indexOf("-");
  if (hyphen < 0) return { kind: "invalid" };
  const startPart = spec.slice(0, hyphen);
  const endPart = spec.slice(hyphen + 1);
  if (startPart === "" && endPart === "") return { kind: "invalid" };

  if (startPart !== "" && !/^\d+$/.test(startPart)) return { kind: "invalid" };
  if (endPart !== "" && !/^\d+$/.test(endPart)) return { kind: "invalid" };

  if (startPart !== "" && endPart !== "") {
    const start = Number(startPart);
    const end = Number(endPart);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { kind: "invalid" };
  }

  return { kind: "range", awsHeader: v };
}
