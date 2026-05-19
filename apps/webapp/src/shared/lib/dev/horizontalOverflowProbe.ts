/** Элемент, выходящий за visual viewport по горизонали (dev-диагностика PWA). */
export type HorizontalOverflowOffender = {
  tag: string;
  id: string | null;
  testId: string | null;
  classSnippet: string;
  rect: { left: number; right: number; width: number };
  overflowLeftPx: number;
  overflowRightPx: number;
};

const OVERFLOW_TOLERANCE_PX = 1;

function readViewportWidth(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.width ?? document.documentElement.clientWidth;
}

function elementDescriptor(el: HTMLElement): Pick<HorizontalOverflowOffender, "tag" | "id" | "testId" | "classSnippet"> {
  const className = typeof el.className === "string" ? el.className : "";
  const snippet = className.length > 120 ? `${className.slice(0, 117)}…` : className;
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    testId: el.getAttribute("data-testid"),
    classSnippet: snippet,
  };
}

/**
 * Находит видимые узлы, чей border-box выходит за ширину visual viewport.
 * Игнорирует `html`/`body` — их ширина может совпадать со scrollWidth при overflow.
 */
export function scanHorizontalOverflowOffenders(viewportWidth?: number): HorizontalOverflowOffender[] {
  if (typeof document === "undefined") return [];

  const vw = viewportWidth ?? readViewportWidth();
  if (vw <= 0) return [];

  const offenders: HorizontalOverflowOffender[] = [];
  const nodes = document.body?.querySelectorAll("*");
  if (!nodes) return [];

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;

    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const overflowLeftPx = Math.max(0, -rect.left - OVERFLOW_TOLERANCE_PX);
    const overflowRightPx = Math.max(0, rect.right - vw - OVERFLOW_TOLERANCE_PX);
    if (overflowLeftPx <= 0 && overflowRightPx <= 0) continue;

    offenders.push({
      ...elementDescriptor(node),
      rect: { left: rect.left, right: rect.right, width: rect.width },
      overflowLeftPx,
      overflowRightPx,
    });
  }

  return offenders.sort(
    (a, b) =>
      b.overflowLeftPx + b.overflowRightPx - (a.overflowLeftPx + a.overflowRightPx),
  );
}

export function documentHasHorizontalScroll(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document.documentElement;
  return doc.scrollWidth > doc.clientWidth + OVERFLOW_TOLERANCE_PX;
}

export type HorizontalOverflowProbeResult = {
  viewportWidth: number;
  documentScrollOverflow: boolean;
  offenders: HorizontalOverflowOffender[];
};

export function runHorizontalOverflowProbe(viewportWidth?: number): HorizontalOverflowProbeResult {
  const viewport = viewportWidth ?? readViewportWidth();
  return {
    viewportWidth: viewport,
    documentScrollOverflow: documentHasHorizontalScroll(),
    offenders: scanHorizontalOverflowOffenders(viewport),
  };
}
