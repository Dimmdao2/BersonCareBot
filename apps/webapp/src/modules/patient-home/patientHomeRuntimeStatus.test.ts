import { describe, expect, it } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "./ports";
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
  isPatientHomeItemRuntimeResolvedOnHome,
} from "./patientHomeRuntimeStatus";

const knownEmpty = { contentPages: [] as string[], contentSections: [] as string[], courses: [] as string[] };

function item(
  partial: Partial<PatientHomeBlockItem> & Pick<PatientHomeBlockItem, "id" | "blockCode" | "targetType" | "targetRef">,
): PatientHomeBlockItem {
  return {
    titleOverride: null,
    subtitleOverride: null,
    imageUrlOverride: null,
    badgeLabel: null,
    isVisible: true,
    sortOrder: 0,
    ...partial,
  };
}

function block(code: PatientHomeBlock["code"], items: PatientHomeBlockItem[], isVisible = true): PatientHomeBlock {
  return {
    code,
    title: "T",
    description: "",
    isVisible,
    sortOrder: 0,
    iconImageUrl: null,
    items,
  };
}

describe("computePatientHomeBlockRuntimeStatus", () => {
  const resolverSync = buildPatientHomeResolverSyncContext({
    sections: [
      { slug: "sec-vis", isVisible: true, requiresAuth: false, kind: "system", systemParentCode: "situations" },
      { slug: "sec-hidden", isVisible: false, requiresAuth: false, kind: "system", systemParentCode: "situations" },
      { slug: "sec-auth", isVisible: true, requiresAuth: true, kind: "system", systemParentCode: "situations" },
      { slug: "warm-sec", isVisible: true, requiresAuth: false, kind: "system", systemParentCode: "warmups" },
      { slug: "articles-sec", isVisible: true, requiresAuth: false, kind: "article", systemParentCode: null },
    ],
    pages: [
      { slug: "page-ok", requiresAuth: false, section: "warm-sec" },
      { slug: "page-auth", requiresAuth: true, section: "warm-sec" },
      { slug: "post-ok", requiresAuth: false, section: "articles-sec" },
    ],
    courses: [
      { id: "c-pub", status: "published" },
      { id: "c-draft", status: "draft" },
    ],
  });

  it("hidden when block not visible", () => {
    const b = block("situations", [item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "sec-vis" })], false);
    const st = computePatientHomeBlockRuntimeStatus(b, { knownRefs: { ...knownEmpty, contentSections: ["sec-vis"] }, resolverSync });
    expect(st.kind).toBe("hidden");
    expect(st.blockCode).toBe("situations");
  });

  it("daily_warmup: visible block with no resolvable page is empty", () => {
    const b = block(
      "daily_warmup",
      [item({ id: "1", blockCode: "daily_warmup", targetType: "content_page", targetRef: "missing" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentPages: ["missing"] },
      resolverSync,
    });
    expect(st.kind).toBe("empty");
    expect(st.visibleResolvedItems).toBe(0);
  });

  it("daily_warmup: resolves visible content_page when slug exists", () => {
    const b = block(
      "daily_warmup",
      [item({ id: "1", blockCode: "daily_warmup", targetType: "content_page", targetRef: "page-ok" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentPages: ["page-ok"] },
      resolverSync,
    });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(1);
  });

  it("useful_post: visible block with no resolvable page is empty", () => {
    const b = block(
      "useful_post",
      [item({ id: "1", blockCode: "useful_post", targetType: "content_page", targetRef: "missing" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentPages: ["missing"] },
      resolverSync,
    });
    expect(st.kind).toBe("empty");
    expect(st.visibleResolvedItems).toBe(0);
  });

  it("useful_post: resolves visible content_page when slug exists", () => {
    const b = block(
      "useful_post",
      [item({ id: "1", blockCode: "useful_post", targetType: "content_page", targetRef: "post-ok" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentPages: ["post-ok"] },
      resolverSync,
    });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(1);
  });

  it("useful_post: resolves content_page in system folder (e.g. lessons) after CMS section attach", () => {
    const resolverWithLessons = buildPatientHomeResolverSyncContext({
      sections: [
        { slug: "lessons-sec", isVisible: true, requiresAuth: false, kind: "system", systemParentCode: "lessons" },
      ],
      pages: [{ slug: "post-lessons", requiresAuth: false, section: "lessons-sec" }],
      courses: [],
    });
    const b = block(
      "useful_post",
      [item({ id: "1", blockCode: "useful_post", targetType: "content_page", targetRef: "post-lessons" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentPages: ["post-lessons"] },
      resolverSync: resolverWithLessons,
    });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(1);
  });

  it("situations: section in DB but not patient-visible yields empty", () => {
    const b = block(
      "situations",
      [item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "sec-hidden" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentSections: ["sec-hidden"] },
      resolverSync,
    });
    expect(st.kind).toBe("empty");
    expect(st.visibleResolvedItems).toBe(0);
  });

  it("situations: visible section counts as ready", () => {
    const b = block(
      "situations",
      [item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "sec-vis" })],
      true,
    );
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentSections: ["sec-vis"] },
      resolverSync,
    });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(1);
  });

  it("subscription_carousel: accepts article section, useful_post-like page, published course", () => {
    const b = block("subscription_carousel", [
      item({ id: "1", blockCode: "subscription_carousel", targetType: "content_section", targetRef: "articles-sec" }),
      item({ id: "2", blockCode: "subscription_carousel", targetType: "content_page", targetRef: "post-ok" }),
      item({ id: "3", blockCode: "subscription_carousel", targetType: "course", targetRef: "c-pub" }),
    ]);
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { contentPages: ["post-ok"], contentSections: ["articles-sec"], courses: ["c-pub"] },
      resolverSync,
    });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(3);
  });

  it("courses: only published courses resolve", () => {
    const b = block("courses", [
      item({ id: "1", blockCode: "courses", targetType: "course", targetRef: "c-draft" }),
    ]);
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, courses: ["c-draft"] },
      resolverSync,
    });
    expect(st.kind).toBe("empty");
  });

  it("non-CMS visible blocks are always ready", () => {
    const b = block("booking", [], true);
    const st = computePatientHomeBlockRuntimeStatus(b, { knownRefs: knownEmpty, resolverSync });
    expect(st.kind).toBe("ready");
    expect(st.visibleResolvedItems).toBe(0);
  });

  it("counts visibleConfiguredItems and unresolvedConfiguredItems", () => {
    const b = block("situations", [
      item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "gone", isVisible: true }),
      item({ id: "2", blockCode: "situations", targetType: "content_section", targetRef: "sec-vis", isVisible: false }),
    ]);
    const st = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs: { ...knownEmpty, contentSections: ["sec-vis"] },
      resolverSync,
    });
    expect(st.visibleConfiguredItems).toBe(1);
    expect(st.unresolvedConfiguredItems).toBe(1);
  });
});

describe("isPatientHomeItemRuntimeResolvedOnHome", () => {
  const ctx = buildPatientHomeResolverSyncContext({
    sections: [
      { slug: "s1", isVisible: true, requiresAuth: false, kind: "system", systemParentCode: "situations" },
      { slug: "sos-sec", isVisible: true, requiresAuth: false, kind: "system", systemParentCode: "sos" },
    ],
    pages: [{ slug: "p1", requiresAuth: false, section: "sos-sec" }],
    courses: [{ id: "pub", status: "published" }],
  });

  it("respects canViewAuthOnlyContent for section", () => {
    const ctxNoAuth = buildPatientHomeResolverSyncContext({
      sections: [{ slug: "sa", isVisible: true, requiresAuth: true, kind: "system", systemParentCode: "situations" }],
      pages: [],
      courses: [],
      canViewAuthOnlyContent: false,
    });
    const row = item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "sa" });
    expect(isPatientHomeItemRuntimeResolvedOnHome("situations", row, ctxNoAuth)).toBe(false);
  });

  it("allows auth-only section when canViewAuthOnlyContent", () => {
    const ctxAuth = buildPatientHomeResolverSyncContext({
      sections: [{ slug: "sa", isVisible: true, requiresAuth: true, kind: "system", systemParentCode: "situations" }],
      pages: [],
      courses: [],
      canViewAuthOnlyContent: true,
    });
    const row = item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "sa" });
    expect(isPatientHomeItemRuntimeResolvedOnHome("situations", row, ctxAuth)).toBe(true);
  });

  it("sos prefers any matching visible item semantics", () => {
    const row = item({ id: "1", blockCode: "sos", targetType: "content_page", targetRef: "p1" });
    expect(isPatientHomeItemRuntimeResolvedOnHome("sos", { ...row, blockCode: "sos" }, ctx)).toBe(true);
  });
});
