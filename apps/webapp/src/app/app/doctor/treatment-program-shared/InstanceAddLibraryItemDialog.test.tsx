/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramLibraryPickers } from "./treatmentProgramLibraryTypes";
import { InstanceAddLibraryItemDialog } from "./InstanceAddLibraryItemDialog";

vi.mock("./programInstanceMutationGuard", () => ({
  runIfProgramInstanceMutationAllowed: async (_status: string, action: () => Promise<void>) => {
    await action();
    return true;
  },
}));

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const COMPLEX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("InstanceAddLibraryItemDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, item: {}, recommendationId: "rec-new" }), { status: 200 }),
    );
  });

  it("режим «Свой текст»: один POST на from-freeform-recommendation", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        instanceId={INSTANCE_ID}
        spec={{
          stageId: STAGE_ID,
          context: "phase_zero_recommendations",
          customGroupId: null,
        }}
        library={emptyLibrary}
        programStatus="active"
        editLocked={false}
        onAdded={onAdded}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /свой текст/i }));

    await user.type(screen.getByLabelText(/заголовок/i), "Заголовок из приёма");

    await user.type(screen.getByLabelText(/^Текст$/i), "Текст **markdown**");

    await user.click(screen.getByRole("button", { name: /^добавить$/i }));

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled();
    });

    const posts = vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (init as RequestInit)?.method === "POST");
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0]!;
    expect(String(url)).toContain("/items/from-freeform-recommendation");
    expect(JSON.parse((init!.body as string) as string)).toEqual({
      title: "Заголовок из приёма",
      bodyMd: "Текст **markdown**",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("комплекс ЛФК: POST from-lfk-complex, не POST .../items с lfk_complex", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      lfkComplexes: [
        {
          id: COMPLEX_ID,
          title: "Комплекс А",
          subtitle: "2 упражнений",
          thumbUrl: null,
          description: null,
        },
      ],
    };

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        instanceId={INSTANCE_ID}
        spec={{
          stageId: STAGE_ID,
          context: "custom_group",
          customGroupId: GROUP_ID,
        }}
        library={library}
        programStatus="active"
        editLocked={false}
        onAdded={onAdded}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /комплекс лфк/i }));
    await user.click(screen.getByRole("button", { name: /комплекс а/i }));

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled();
    });

    const posts = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(
        ([url, init]) =>
          (init as RequestInit)?.method === "POST" && String(url).includes("/items/from-lfk-complex"),
      );
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0]!;
    expect(String(url)).not.toMatch(/\/items$/);
    expect(JSON.parse((init!.body as string) as string)).toEqual({
      complexTemplateId: COMPLEX_ID,
      groupId: GROUP_ID,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
