/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from "vitest";
import {
  documentHasHorizontalScroll,
  runHorizontalOverflowProbe,
  scanHorizontalOverflowOffenders,
} from "./horizontalOverflowProbe";

describe("horizontalOverflowProbe", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.width = "";
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(document.documentElement, "scrollWidth", {
      configurable: true,
      value: 390,
    });
  });

  it("returns no offenders when all nodes fit viewport", () => {
    document.body.innerHTML = '<div style="width:200px">ok</div>';
    expect(scanHorizontalOverflowOffenders(400)).toEqual([]);
  });

  it("detects element wider than viewport", () => {
    const wide = document.createElement("div");
    wide.style.width = "500px";
    wide.style.height = "20px";
    document.body.appendChild(wide);
    wide.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 500,
        top: 0,
        bottom: 20,
        width: 500,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const offenders = scanHorizontalOverflowOffenders(390);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]?.overflowRightPx).toBeGreaterThan(0);
  });

  it("reports document scroll overflow", () => {
    Object.defineProperty(document.documentElement, "scrollWidth", {
      configurable: true,
      value: 420,
    });
    expect(documentHasHorizontalScroll()).toBe(true);
    const result = runHorizontalOverflowProbe(390);
    expect(result.documentScrollOverflow).toBe(true);
  });
});
