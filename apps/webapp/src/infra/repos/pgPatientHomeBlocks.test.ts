import { describe, expect, it } from "vitest";
import { createInMemoryPatientHomeBlocksPort } from "./inMemoryPatientHomeBlocks";

describe("patient home blocks port (in-memory)", () => {
  it("lists seeded blocks", async () => {
    const port = createInMemoryPatientHomeBlocksPort();
    const blocks = await port.listBlocksWithItems();
    expect(blocks.map((block) => block.code)).toEqual([
      "daily_warmup",
      "booking",
      "situations",
      "progress",
      "next_reminder",
      "mood_checkin",
      "sos",
      "plan",
      "subscription_carousel",
      "courses",
    ]);
  });

  it("add/update/delete item", async () => {
    const port = createInMemoryPatientHomeBlocksPort();
    const itemId = await port.addItem({
      blockCode: "daily_warmup",
      targetType: "content_page",
      targetRef: "warmup-1",
      isVisible: true,
    });
    await port.updateItem(itemId, { isVisible: false, titleOverride: "X" });
    let blocks = await port.listBlocksWithItems();
    const item = blocks.find((block) => block.code === "daily_warmup")?.items[0];
    expect(item?.isVisible).toBe(false);
    expect(item?.titleOverride).toBe("X");
    await port.deleteItem(itemId);
    blocks = await port.listBlocksWithItems();
    expect(blocks.find((block) => block.code === "daily_warmup")?.items).toEqual([]);
  });

  it("deleteItem throws unknown_item when id missing", async () => {
    const port = createInMemoryPatientHomeBlocksPort();
    await expect(port.deleteItem("00000000-0000-0000-0000-000000000099")).rejects.toThrow("unknown_item");
  });

  it("reorders blocks and items", async () => {
    const port = createInMemoryPatientHomeBlocksPort();
    await port.reorderBlocks([
      "courses",
      "daily_warmup",
      "booking",
      "situations",
      "progress",
      "next_reminder",
      "mood_checkin",
      "sos",
      "plan",
      "subscription_carousel",
    ]);
    const first = (await port.listBlocksWithItems())[0]?.code;
    expect(first).toBe("courses");

    const a = await port.addItem({
      blockCode: "sos",
      targetType: "content_page",
      targetRef: "a",
      isVisible: true,
    });
    const b = await port.addItem({
      blockCode: "sos",
      targetType: "content_page",
      targetRef: "b",
      isVisible: true,
    });
    await port.reorderItems("sos", [b, a]);
    const items = (await port.listBlocksWithItems()).find((block) => block.code === "sos")?.items ?? [];
    expect(items.map((item) => item.id)).toEqual([b, a]);
  });

  it("getItemById and updateItem targetRef", async () => {
    const port = createInMemoryPatientHomeBlocksPort();
    const id = await port.addItem({
      blockCode: "daily_warmup",
      targetType: "content_page",
      targetRef: "a",
      isVisible: true,
    });
    expect(await port.getItemById(id)).toMatchObject({ id, targetRef: "a" });
    expect(await port.getItemById("missing")).toBeNull();
    await port.updateItem(id, { targetRef: "b" });
    expect((await port.getItemById(id))?.targetRef).toBe("b");
  });
});
