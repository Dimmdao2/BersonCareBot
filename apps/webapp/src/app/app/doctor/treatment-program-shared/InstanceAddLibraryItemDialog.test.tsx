/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "./treatmentProgramLibraryTypes";
import { InstanceAddLibraryItemDialog } from "./InstanceAddLibraryItemDialog";
import { TreatmentProgramLibraryPickerToolbar } from "./TreatmentProgramLibraryPickerToolbar";

const addItemCreate = vi.fn(() => ["draft:item-1"]);
const deleteItem = vi.fn();
let displayDetail: TreatmentProgramInstanceDetail;

vi.mock("./InstanceEditorDraftContext", () => ({
  useInstanceEditorDraft: () => ({ addItemCreate, deleteItem, displayDetail }),
}));

// Render the canonical virtualized grid fully (no viewport virtualization in jsdom):
// map every item through the real renderItem so selection/filter logic stays under test.
vi.mock("@/shared/ui/doctor/catalog/VirtualizedItemGrid", () => ({
  VirtualizedItemGrid: ({
    items,
    renderItem,
    keyExtractor,
  }: {
    items: unknown[];
    renderItem: (item: unknown, index: number) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
  }) =>
    items.length === 0 ? null : (
      <div data-testid="mock-virtual-grid">
        {items.map((item, index) => (
          <div key={keyExtractor(item)}>{renderItem(item, index)}</div>
        ))}
      </div>
    ),
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

vi.mock("@/shared/ui/doctor/ReferenceMultiSelect", () => ({
  ReferenceMultiSelect: (props: { onChange?: (ids: string[]) => void }) => (
    <button type="button" onClick={() => props.onChange?.(["55555555-5555-4555-8555-555555555555"])}>
      Добавить регион
    </button>
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
const OTHER_GROUP_ID = "44444444-4444-4444-8444-444444444444";
const COMPLEX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXERCISE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXERCISE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeDisplayDetail(items: TreatmentProgramInstanceDetail["stages"][number]["items"] = []) {
  return {
    id: "instance-1",
    title: "Program",
    status: "active",
    patientUserId: "patient-1",
    assignedBy: null,
    templateId: null,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    assignmentSource: "doctor",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: STAGE_ID,
        instanceId: "instance-1",
        sourceStageId: null,
        title: "Stage",
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: "available",
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [
          {
            id: GROUP_ID,
            stageId: STAGE_ID,
            sourceGroupId: null,
            title: "Group",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
          },
          {
            id: OTHER_GROUP_ID,
            stageId: STAGE_ID,
            sourceGroupId: null,
            title: "Other group",
            description: null,
            scheduleText: null,
            sortOrder: 1,
            systemKind: null,
          },
        ],
        items,
      },
    ],
  } as TreatmentProgramInstanceDetail;
}

describe("InstanceAddLibraryItemDialog", () => {
  beforeEach(() => {
    addItemCreate.mockClear();
    deleteItem.mockClear();
    displayDetail = makeDisplayDetail();
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

  it("комплекс ЛФК: addItemCreate lfk_complex_expand без закрытия модалки", async () => {
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
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("создаёт индивидуальное упражнение inline и сохраняет в каталог только по явному выбору", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <InstanceAddLibraryItemDialog
        open
        onOpenChange={onOpenChange}
        spec={{ stageId: STAGE_ID, context: "custom_group", customGroupId: GROUP_ID }}
        library={emptyLibrary}
        editLocked={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /создать новое/i }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await user.type(screen.getByLabelText(/^Название$/i), "Упражнение для пациента");
    await user.type(screen.getByLabelText(/^Описание$/i), "Делать медленно");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /^Добавить упражнение$/i }));

    await waitFor(() => {
      expect(addItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "individual_exercise",
          stageId: STAGE_ID,
          groupId: GROUP_ID,
          title: "Упражнение для пациента",
          description: "Делать медленно",
          mediaId: null,
          saveToCatalog: true,
        }),
      );
    });
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

  it("рекомендации: региональный фильтр сужает список", async () => {
    const user = userEvent.setup();
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
          recommendations: [
            { id: "rec-1", title: "Spine Rec", regionCodes: ["spine"] },
            { id: "rec-2", title: "Knee Rec", regionCodes: ["knee"] },
          ],
        }}
        editLocked={false}
      />,
    );

    expect(screen.getByRole("button", { name: /spine rec/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /knee rec/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Регион"), "spine");

    expect(screen.getByRole("button", { name: /spine rec/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /knee rec/i })).toBeNull();
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

  it("мультивыбор: фильтр не сбрасывает выбранность, повторный клик удаляет только текущую группу", async () => {
    const user = userEvent.setup();
    displayDetail = makeDisplayDetail([
      {
        id: "item-current-group",
        stageId: STAGE_ID,
        itemType: "exercise",
        itemRefId: "ex-spine-strength",
        sortOrder: 0,
        comment: null,
        settings: null,
        groupId: GROUP_ID,
        snapshot: { title: "Spine strength" },
        localComment: null,
        completedAt: null,
        isActionable: null,
        status: "active",
        createdAt: "2026-07-08T00:00:00.000Z",
        lastViewedAt: null,
        effectiveComment: null,
      },
      {
        id: "item-other-group",
        stageId: STAGE_ID,
        itemType: "exercise",
        itemRefId: "ex-spine-strength",
        sortOrder: 0,
        comment: null,
        settings: null,
        groupId: OTHER_GROUP_ID,
        snapshot: { title: "Spine strength" },
        localComment: null,
        completedAt: null,
        isActionable: null,
        status: "active",
        createdAt: "2026-07-08T00:00:00.000Z",
        lastViewedAt: null,
        effectiveComment: null,
      },
    ]);
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

    expect(screen.getByRole("button", { name: /spine strength/i })).toHaveAttribute("aria-pressed", "true");

    await user.selectOptions(screen.getByLabelText("Регион"), "knee");
    expect(screen.queryByRole("button", { name: /spine strength/i })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Регион"), "spine");
    expect(screen.getByRole("button", { name: /spine strength/i })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /spine strength/i }));

    expect(deleteItem).toHaveBeenCalledTimes(1);
    expect(deleteItem).toHaveBeenCalledWith("item-current-group");
    expect(deleteItem).not.toHaveBeenCalledWith("item-other-group");
    expect(addItemCreate).not.toHaveBeenCalled();
  });

  it("мультивыбор: несколько кликов добавляют несколько элементов без server reload/закрытия", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const library: TreatmentProgramLibraryPickers = {
      ...emptyLibrary,
      exercises: [
        { id: "ex-1", title: "Exercise 1" },
        { id: "ex-2", title: "Exercise 2" },
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

    await user.click(screen.getByRole("button", { name: /exercise 1/i }));
    await user.click(screen.getByRole("button", { name: /exercise 2/i }));

    expect(addItemCreate).toHaveBeenCalledTimes(2);
    expect(addItemCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: "library_item", itemType: "exercise", itemRefId: "ex-1", groupId: GROUP_ID }),
    );
    expect(addItemCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "library_item", itemType: "exercise", itemRefId: "ex-2", groupId: GROUP_ID }),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
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
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
