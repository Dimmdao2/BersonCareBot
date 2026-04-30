import { describe, expect, it } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "./ports";
import {
  DEFAULT_SUBSCRIPTION_BADGE,
  getSubscriptionCarouselSectionPresentation,
  resolveCourseRowCards,
  resolveSituationChips,
  resolveSosCard,
  resolveSubscriptionCarouselCards,
  resolveUsefulPostCard,
} from "./patientHomeResolvers";

function item(p: Partial<PatientHomeBlockItem> & Pick<PatientHomeBlockItem, "id" | "targetType" | "targetRef">): PatientHomeBlockItem {
  return {
    blockCode: "situations",
    titleOverride: null,
    subtitleOverride: null,
    imageUrlOverride: null,
    badgeLabel: null,
    isVisible: true,
    sortOrder: 0,
    ...p,
  };
}

function homeBlock(p: Partial<PatientHomeBlock> & Pick<PatientHomeBlock, "code" | "items">): PatientHomeBlock {
  return {
    title: "",
    description: "",
    isVisible: true,
    sortOrder: 0,
    iconImageUrl: null,
    ...p,
  };
}

describe("patientHomeResolvers", () => {
  it("getSubscriptionCarouselSectionPresentation returns null when carousel hidden", () => {
    const blocks = [
      homeBlock({
        code: "subscription_carousel",
        isVisible: false,
        items: [
          item({
            id: "1",
            blockCode: "subscription_carousel",
            targetType: "content_section",
            targetRef: "fixture-alpha",
            sortOrder: 1,
          }),
        ],
      }),
    ];
    expect(getSubscriptionCarouselSectionPresentation(blocks, "fixture-alpha")).toBeNull();
  });

  it("getSubscriptionCarouselSectionPresentation matches target_ref to section slug", () => {
    const blocks = [
      homeBlock({
        code: "subscription_carousel",
        items: [
          item({
            id: "a",
            blockCode: "subscription_carousel",
            targetType: "content_section",
            targetRef: "  fixture-alpha  ",
            badgeLabel: "Премиум",
            sortOrder: 2,
          }),
          item({
            id: "b",
            blockCode: "subscription_carousel",
            targetType: "content_section",
            targetRef: "fixture-alpha",
            badgeLabel: null,
            sortOrder: 1,
          }),
        ],
      }),
    ];
    const pres = getSubscriptionCarouselSectionPresentation(blocks, "fixture-alpha");
    expect(pres?.badgeLabel).toBe(DEFAULT_SUBSCRIPTION_BADGE);
  });

  it("getSubscriptionCarouselSectionPresentation uses custom badgeLabel", () => {
    const blocks = [
      homeBlock({
        code: "subscription_carousel",
        items: [
          item({
            id: "1",
            blockCode: "subscription_carousel",
            targetType: "content_section",
            targetRef: "fixture-beta",
            badgeLabel: "Клуб",
            sortOrder: 0,
          }),
        ],
      }),
    ];
    expect(getSubscriptionCarouselSectionPresentation(blocks, "fixture-beta")?.badgeLabel).toBe("Клуб");
  });

  it("resolveSituationChips skips auth sections for guest", async () => {
    const deps = {
      contentSections: {
        getBySlug: async (slug: string) =>
          slug === "pub" ?
            {
              slug: "pub",
              title: "Public",
              description: "",
              isVisible: true,
              requiresAuth: false,
              iconImageUrl: null,
              coverImageUrl: null,
            }
          : {
              slug: "auth",
              title: "Auth",
              description: "",
              isVisible: true,
              requiresAuth: true,
              iconImageUrl: null,
              coverImageUrl: null,
            },
      },
      contentPages: { getBySlug: async () => null },
      courses: { getCourseForDoctor: async () => null },
    };
    const items = [
      item({ id: "1", blockCode: "situations", targetType: "content_section", targetRef: "auth", sortOrder: 1 }),
      item({ id: "2", blockCode: "situations", targetType: "content_section", targetRef: "pub", sortOrder: 2 }),
    ];
    const chips = await resolveSituationChips(items, deps, false);
    expect(chips.map((c) => c.slug)).toEqual(["pub"]);
  });

  it("resolveSubscriptionCarouselCards applies default badge", async () => {
    const deps = {
      contentSections: {
        getBySlug: async () => ({
          slug: "s1",
          title: "S",
          description: "D",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
        }),
      },
      contentPages: { getBySlug: async () => null },
      courses: { getCourseForDoctor: async () => null },
    };
    const cards = await resolveSubscriptionCarouselCards(
      [item({ id: "1", blockCode: "subscription_carousel", targetType: "content_section", targetRef: "s1", badgeLabel: null })],
      deps,
      true,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.badgeLabel).toBe("По подписке");
  });

  it("resolveSosCard returns first visible resolved item", async () => {
    const deps = {
      contentSections: { getBySlug: async () => null },
      contentPages: {
        getBySlug: async (slug: string) =>
          slug === "p1" ?
            {
              slug: "p1",
              title: "Page",
              summary: "",
              requiresAuth: false,
              imageUrl: null,
            }
          : null,
      },
      courses: { getCourseForDoctor: async () => null },
    };
    const sos = await resolveSosCard(
      [
        item({ id: "a", blockCode: "sos", targetType: "content_page", targetRef: "missing", sortOrder: 1 }),
        item({ id: "b", blockCode: "sos", targetType: "content_page", targetRef: "p1", sortOrder: 2 }),
      ],
      deps,
      true,
    );
    expect(sos?.title).toBe("Page");
  });

  it("resolveCourseRowCards skips non-published", async () => {
    const deps = {
      contentSections: { getBySlug: async () => null },
      contentPages: { getBySlug: async () => null },
      courses: {
        getCourseForDoctor: async (id: string) =>
          id === "draft" ?
            { id: "draft", title: "D", description: null, status: "draft" }
          : { id: "pub", title: "P", description: null, status: "published" },
      },
    };
    const cards = await resolveCourseRowCards(
      [
        item({ id: "1", blockCode: "courses", targetType: "course", targetRef: "draft", sortOrder: 1 }),
        item({ id: "2", blockCode: "courses", targetType: "course", targetRef: "pub", sortOrder: 2 }),
      ],
      deps,
    );
    expect(cards.map((c) => c.courseId)).toEqual(["pub"]);
  });

  it("resolveUsefulPostCard returns first visible content_page", async () => {
    const deps = {
      contentSections: { getBySlug: async () => null },
      contentPages: {
        getBySlug: async (slug: string) =>
          slug === "post-a" ?
            {
              slug: "post-a",
              title: "Post A",
              summary: "Sum",
              requiresAuth: false,
              imageUrl: "/img/a.png",
            }
          : slug === "post-b" ?
            {
              slug: "post-b",
              title: "Post B",
              summary: "",
              requiresAuth: false,
              imageUrl: null,
            }
          : null,
      },
      courses: { getCourseForDoctor: async () => null },
    };
    const card = await resolveUsefulPostCard(
      [
        item({ id: "x", blockCode: "useful_post", targetType: "content_page", targetRef: "missing", sortOrder: 1 }),
        item({
          id: "y",
          blockCode: "useful_post",
          targetType: "content_page",
          targetRef: "post-a",
          badgeLabel: "  Новый пост  ",
          sortOrder: 2,
        }),
        item({ id: "z", blockCode: "useful_post", targetType: "content_page", targetRef: "post-b", sortOrder: 3 }),
      ],
      deps,
      true,
    );
    expect(card?.slug).toBe("post-a");
    expect(card?.showTitle).toBe(true);
    expect(card?.badgeLabel).toBe("Новый пост");
    expect(card?.href).toContain("post-a");
  });

  it("resolveUsefulPostCard returns null when auth-only page for guest", async () => {
    const deps = {
      contentSections: { getBySlug: async () => null },
      contentPages: {
        getBySlug: async () => ({
          slug: "auth-post",
          title: "Auth",
          summary: "",
          requiresAuth: true,
          imageUrl: null,
        }),
      },
      courses: { getCourseForDoctor: async () => null },
    };
    const card = await resolveUsefulPostCard(
      [item({ id: "1", blockCode: "useful_post", targetType: "content_page", targetRef: "auth-post", sortOrder: 0 })],
      deps,
      false,
    );
    expect(card).toBeNull();
  });

  it("resolveUsefulPostCard preserves hidden title setting", async () => {
    const deps = {
      contentSections: { getBySlug: async () => null },
      contentPages: {
        getBySlug: async () => ({
          slug: "post",
          title: "Post",
          summary: "",
          requiresAuth: false,
          imageUrl: null,
        }),
      },
      courses: { getCourseForDoctor: async () => null },
    };
    const card = await resolveUsefulPostCard(
      [
        {
          ...item({ id: "1", blockCode: "useful_post", targetType: "content_page", targetRef: "post", sortOrder: 0 }),
          showTitle: false,
        },
      ],
      deps,
      true,
    );
    expect(card?.showTitle).toBe(false);
  });
});
