import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramStageItem,
  TreatmentProgramTemplateDetail,
} from "./types";

/**
 * Находит id элемента экземпляра, скопированного из пункта шаблона (совпадение этапа, группы и полей пункта).
 */
export function mapTemplateStageItemToInstanceStageItemId(
  template: TreatmentProgramTemplateDetail,
  instance: TreatmentProgramInstanceDetail,
  templateStageItemId: string,
): string | null {
  let tplItem: TreatmentProgramStageItem | null = null;
  let tplStageId: string | null = null;
  for (const st of template.stages) {
    const it = st.items.find((i) => i.id === templateStageItemId);
    if (it) {
      tplItem = it;
      tplStageId = st.id;
      break;
    }
  }
  if (!tplItem || !tplStageId) return null;
  const instStage = instance.stages.find((s) => s.sourceStageId === tplStageId);
  if (!instStage) return null;

  const wantGroupId = (() => {
    if (tplItem.groupId == null) return null as string | null;
    const g = instStage.groups.find((ig) => ig.sourceGroupId === tplItem!.groupId);
    return g?.id ?? null;
  })();

  const cand = instStage.items.filter(
    (i) =>
      i.itemType === tplItem!.itemType &&
      i.itemRefId === tplItem!.itemRefId &&
      i.sortOrder === tplItem!.sortOrder &&
      (wantGroupId == null ? i.groupId == null : i.groupId === wantGroupId),
  );
  return cand[0]?.id ?? null;
}
