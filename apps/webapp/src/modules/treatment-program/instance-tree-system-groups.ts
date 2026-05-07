import type { TreatmentProgramInstanceStageInput } from "./types";
import {
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
} from "./types";

type InstanceTreeStageGroupInput = NonNullable<TreatmentProgramInstanceStageInput["groups"]>[number];

/**
 * Для `createInstanceTree`: если в дереве есть элементы без `templateGroupId` типов
 * `recommendation` / `test_set`, а соответствующих строк с `systemKind` в `groups` нет —
 * добавляет канонические системные группы (как при `assignTemplateToPatient`).
 * Идемпотентно при уже переданных системных группах.
 */
export function withDefaultSystemGroupsIfNeededForTreeStage(
  st: TreatmentProgramInstanceStageInput,
): TreatmentProgramInstanceStageInput {
  const existing = st.groups ?? [];
  const { items } = st;
  const needRec = items.some((it) => it.templateGroupId == null && it.itemType === "recommendation");
  const needTests = items.some((it) => it.templateGroupId == null && it.itemType === "test_set");
  const hasRec = existing.some((g) => g.systemKind === "recommendations");
  const hasTests = existing.some((g) => g.systemKind === "tests");
  const prepend: InstanceTreeStageGroupInput[] = [];
  if (needRec && !hasRec) {
    prepend.push({
      sourceGroupId: null,
      title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
      description: null,
      scheduleText: null,
      sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
      systemKind: "recommendations",
    });
  }
  if (needTests && !hasTests) {
    prepend.push({
      sourceGroupId: null,
      title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
      description: null,
      scheduleText: null,
      sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
      systemKind: "tests",
    });
  }
  if (prepend.length === 0) return st;
  return { ...st, groups: [...prepend, ...existing] };
}
