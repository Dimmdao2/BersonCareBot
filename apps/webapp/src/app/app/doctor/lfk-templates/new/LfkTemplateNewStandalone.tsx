"use client";

import { useRouter } from "next/navigation";
import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctorVisual";
import { TemplateEditor } from "../TemplateEditor";

export function LfkTemplateNewStandalone({
  exerciseCatalog,
}: {
  exerciseCatalog: Array<{ id: string; title: string; firstMedia: ExerciseMedia | null }>;
}) {
  const router = useRouter();
  return (
    <section className={doctorCatalogEditorSectionClass}>
      <TemplateEditor
        template={null}
        exerciseCatalog={exerciseCatalog}
        onCreated={(id) =>
          router.replace(`/app/doctor/lfk-templates?selected=${encodeURIComponent(id)}`)
        }
      />
    </section>
  );
}
