/** Pure helpers for toolbar insertions (unit-tested). */

export function wrapSelection(
  text: string,
  start: number,
  end: number,
  wrap: string,
  placeholder = "текст",
): { next: string; caret: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const sel = text.slice(safeStart, safeEnd);
  const inner = sel.length > 0 ? sel : placeholder;
  const wrapped = `${wrap}${inner}${wrap}`;
  const next = text.slice(0, safeStart) + wrapped + text.slice(safeEnd);
  const caret = safeStart + wrapped.length;
  return { next, caret };
}

export function insertLinePrefix(
  text: string,
  start: number,
  prefix: string,
): { next: string; caret: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const lineStart = text.lastIndexOf("\n", safeStart - 1) + 1;
  const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  const caret = safeStart + prefix.length;
  return { next, caret };
}

export function insertSnippet(
  text: string,
  start: number,
  end: number,
  snippet: string,
): { next: string; caret: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const next = text.slice(0, safeStart) + snippet + text.slice(safeEnd);
  const caret = safeStart + snippet.length;
  return { next, caret };
}
