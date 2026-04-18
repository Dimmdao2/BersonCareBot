import { describe, expect, it, beforeEach } from "vitest";
import { createCommentsService } from "./service";
import { createInMemoryCommentsPort } from "@/app-layer/testing/commentsInMemory";

describe("comments service", () => {
  let port: ReturnType<typeof createInMemoryCommentsPort>;
  let svc: ReturnType<typeof createCommentsService>;

  beforeEach(() => {
    port = createInMemoryCommentsPort();
    svc = createCommentsService(port);
  });

  it("creates and lists by target", async () => {
    const author = "11111111-1111-4111-8111-111111111111";
    const target = "22222222-2222-4222-8222-222222222222";
    const c = await svc.create(
      {
        targetType: "program_instance",
        targetId: target,
        commentType: "clinical_note",
        body: "  Заметка  ",
      },
      author,
    );
    expect(c.body).toBe("Заметка");
    expect(c.authorId).toBe(author);
    const list = await svc.listByTarget("program_instance", target);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(c.id);
  });

  it("updates and deletes", async () => {
    const author = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const c = await svc.create(
      {
        targetType: "lesson",
        targetId: target,
        commentType: "template",
        body: "v1",
      },
      author,
    );
    const u = await svc.update(c.id, { body: "v2", commentType: "individual_override" });
    expect(u.body).toBe("v2");
    expect(u.commentType).toBe("individual_override");
    await svc.delete(c.id);
    await expect(svc.getById(c.id)).rejects.toThrow(/не найден/);
  });

  it("rejects empty body on create", async () => {
    await expect(
      svc.create(
        {
          targetType: "exercise",
          targetId: "33333333-3333-4333-8333-333333333333",
          commentType: "clinical_note",
          body: "   ",
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toThrow(/обязателен/);
  });

  it("listByTarget returns only rows for that target_type and target_id (§7 index semantics)", async () => {
    const author = "11111111-1111-4111-8111-111111111111";
    const targetA = "22222222-2222-4222-8222-222222222222";
    const targetB = "33333333-3333-4333-8333-333333333333";
    await svc.create(
      { targetType: "program_instance", targetId: targetA, commentType: "clinical_note", body: "A" },
      author,
    );
    await svc.create(
      { targetType: "program_instance", targetId: targetB, commentType: "clinical_note", body: "B" },
      author,
    );
    await svc.create(
      { targetType: "lesson", targetId: targetA, commentType: "template", body: "wrong type" },
      author,
    );
    const listA = await svc.listByTarget("program_instance", targetA);
    expect(listA).toHaveLength(1);
    expect(listA[0]!.body).toBe("A");
    const listB = await svc.listByTarget("program_instance", targetB);
    expect(listB).toHaveLength(1);
    expect(listB[0]!.body).toBe("B");
  });
});
