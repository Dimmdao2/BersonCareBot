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

describe("InstanceAddLibraryItemDialog", () => {
  beforeEach(() => {
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
});
