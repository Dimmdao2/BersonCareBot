/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramLibraryPickers } from "./treatmentProgramLibraryTypes";
import { InstanceAddLibraryItemDialog } from "./InstanceAddLibraryItemDialog";
import { TreatmentProgramLibraryPickerToolbar } from "./TreatmentProgramLibraryPickerToolbar";

const addItemCreate = vi.fn(() => ["draft:item-1"]);

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({ addItemCreate }),
}));

vi.mock("@/shared/ui/doctor/ReferenceSelect", () => ({
  ReferenceSelect: (props: {
    id?: string;
    value?: string | null;
    onChange?: (code: string | null) => void;
    missingValueOption?: { value: string; label: string };
  }) => (
    <select
      aria-label={props.id?.includes("-load") ? "Тип нагрузки" : props.id?.includes("-region") ? "Регион" : "ref"}
      data-testid={props.id ?? "ref-select"}
      value={props.value ?? ""}
      onChange={(e) => props.onChange?.(e.target.value === "" ? null : e.target.value)}
    >
      <option value="">all</option>
      <option value="spine">spine</option>
      <option value="knee">knee</option>
      <option value="strength">strength</option>
      <option value="stretch">stretch</option>
      {props.missingValueOption ? (
        <option value={props.missingValueOption.value}>{props.missingValueOption.label}</option>
      ) : null}
    </select>
  ),
}));

const emptyLibrary: TreatmentProgramLibraryPickers = {
  exercises: [],
  lfkComplexes: [],
  testSets: [],
  clinicalTests: [],
  recommendations: [],
  lessons: [],
};

const STAGE_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const COMPLEX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXERCISE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXERCISE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("InstanceAddLibraryItemDialog", () => {
  beforeEach(() => {
    addItemCreate.mockClear();
    vi.restoreAllMocks();
  });

  it("режим «Свой текст»: addItemCreate freeform_recommendation", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        spec={{
          stageId: STAGE_ID,
          context: "phase_zero_recommendations",
          customGroupId: null,
        }}
        library={emptyLibrary}
        editLocked={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /свой текст/i }));
    await user.type(screen.getByLabelText(/заголовок/i), "Заголовок из приёма");
    await user.type(screen.getByLabelText(/^Текст$/i), "Текст **markdown**");
    await user.click(screen.getByRole("button", { name: /^добавить$/i }));

    await waitFor(() => {
      expect(addItemCreate).toHaveBeenCalledTimes(1);
    });
    expect(addItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "freeform_recommendation",
        stageId: STAGE_ID,
        title: "Заголовок из приёма",
        bodyMd: "Текст **markdown**",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("комплекс ЛФК: addItemCreate lfk_complex_expand", async () => {
    const user = userEvent.setup();
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
          expandLines: [
            { itemRefId: EXERCISE_A, snapshot: { title: "Упр A" } },
            { itemRefId: EXERCISE_B, snapshot: { title: "Упр B" } },
          ],
        },
      ],
    };

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        spec={{
          stageId: STAGE_ID,
          context: "custom_group",
          customGroupId: GROUP_ID,
        }}
        library={library}
        editLocked={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /комплекс лфк/i }));
    await user.click(screen.getByRole("button", { name: /комплекс а/i }));

    await waitFor(() => {
      expect(addItemCreate).toHaveBeenCalledTimes(1);
    });
    expect(addItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "lfk_complex_expand",
        stageId: STAGE_ID,
        groupId: GROUP_ID,
        complexTemplateId: COMPLEX_ID,
        items: [
          { itemRefId: EXERCISE_A, snapshot: { title: "Упр A" } },
          { itemRefId: EXERCISE_B, snapshot: { title: "Упр B" } },
        ],
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("упражнения: фильтры регион и тип нагрузки сужают список", async () => {
    const user = userEvent.setup();
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      exercises: [
        {
          id: "ex-spine-strength",
          title: "Spine strength",
          regionCodes: ["spine"],
          loadType: "strength",
        },
        {
          id: "ex-knee-stretch",
          title: "Knee stretch",
          regionCodes: ["knee"],
          loadType: "stretch",
        },
      ],
    };

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={() => {}}
        spec={{
          stageId: STAGE_ID,
          context: "custom_group",
          customGroupId: GROUP_ID,
        }}
        library={library}
        editLocked={false}
      />,
    );

    expect(screen.getByRole("button", { name: /spine strength/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /knee stretch/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Регион"), "spine");
    expect(screen.getByRole("button", { name: /spine strength/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /knee stretch/i })).toBeNull();

    await user.selectOptions(screen.getByLabelText("Регион"), "all");
    await user.selectOptions(screen.getByLabelText("Тип нагрузки"), "stretch");
    expect(screen.queryByRole("button", { name: /spine strength/i })).toBeNull();
    expect(screen.getByRole("button", { name: /knee stretch/i })).toBeInTheDocument();
  });

  it("рекомендации: фильтры регион/нагрузка не показываются", () => {
    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={() => {}}
        spec={{
          stageId: STAGE_ID,
          context: "phase_zero_recommendations",
          customGroupId: null,
        }}
        library={{
          ...emptyLibrary,
          recommendations: [{ id: "rec-1", title: "Rec A" }],
        }}
        editLocked={false}
      />,
    );

    expect(screen.queryByLabelText("Регион")).toBeNull();
    expect(screen.queryByLabelText("Тип нагрузки")).toBeNull();
  });

  it("toolbar: нет пунктов «Без региона» / «Без типа»", () => {
    render(
      <TreatmentProgramLibraryPickerToolbar
        idPrefix="inst-lib"
        searchQuery=""
        onSearchQueryChange={() => {}}
        regionCode={null}
        onRegionCodeChange={() => {}}
        loadType={null}
        onLoadTypeChange={() => {}}
        showRegionLoadFilters
      />,
    );

    expect(screen.queryByRole("option", { name: /без региона/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /без типа/i })).toBeNull();
  });

  it("комбинированный фильтр регион+нагрузка и empty state по фильтрам", async () => {
    const user = userEvent.setup();
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      exercises: [
        {
          id: "ex-spine-strength",
          title: "Spine strength",
          regionCodes: ["spine"],
          loadType: "strength",
        },
        {
          id: "ex-spine-stretch",
          title: "Spine stretch",
          regionCodes: ["spine"],
          loadType: "stretch",
        },
      ],
    };

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={() => {}}
        spec={{
          stageId: STAGE_ID,
          context: "custom_group",
          customGroupId: GROUP_ID,
        }}
        library={library}
        editLocked={false}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Регион"), "spine");
    await user.selectOptions(screen.getByLabelText("Тип нагрузки"), "strength");
    expect(screen.getByRole("button", { name: /spine strength/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /spine stretch/i })).toBeNull();

    await user.selectOptions(screen.getByLabelText("Регион"), "spine");
    await user.selectOptions(screen.getByLabelText("Тип нагрузки"), "stretch");
    expect(screen.getByRole("button", { name: /spine stretch/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Регион"), "knee");
    expect(screen.getByText("Ничего не найдено по фильтрам.")).toBeInTheDocument();
  });

  it("набор тестов: addItemCreate test_set_expand", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      testSets: [
        {
          id: "set-1",
          title: "Набор A",
          subtitle: "1 тестов",
          expandLines: [{ itemRefId: "test-a", snapshot: { title: "Тест A" } }],
        },
      ],
    };

    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        spec={{
          stageId: STAGE_ID,
          context: "stage_system_tests",
          customGroupId: null,
        }}
        library={library}
        editLocked={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /набор a/i }));

    await waitFor(() => {
      expect(addItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "test_set_expand",
          stageId: STAGE_ID,
          testSetId: "set-1",
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
