/** Первая непустая строка тела новости без ведущих `#`. */
export function firstNewsBodyLine(bodyMd: string): string {
  const line =
    bodyMd
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((l) => l.length > 0) ?? "";
  return line.replace(/^#+\s*/, "").trim();
}
