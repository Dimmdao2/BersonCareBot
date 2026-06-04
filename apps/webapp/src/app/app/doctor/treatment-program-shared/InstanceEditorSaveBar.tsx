"use client";

import toast from "react-hot-toast";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { isProgramInstanceEditLocked } from "./programInstanceMutationGuard";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";

/** @deprecated На экране инстанса заменён на {@link InstanceEditorToolbar}. Оставлен для unit-тестов legacy-поведения save/discard. */
export function InstanceEditorSaveBar() {
  const { programStatus, isDirty, saving, discardDraft, saveDraft } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);

  if (!isDirty || editLocked) return null;

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2"
      role="status"
    >
      <p className="text-sm text-foreground">Есть несохранённые изменения</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => discardDraft()}>
          Отменить
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            void saveDraft().then((r) => {
              if (r.ok) {
                toast.success("Изменения сохранены");
              } else if (!r.cancelled && r.error) {
                toast.error(r.error);
              }
            });
          }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
