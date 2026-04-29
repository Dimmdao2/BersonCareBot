"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import type { PatientHomeBlockRuntimeStatus } from "@/modules/patient-home/patientHomeRuntimeStatus";
import { PatientHomeBlockSettingsCard } from "./PatientHomeBlockSettingsCard";
import { PatientHomeReorderBlocksDialog } from "./PatientHomeReorderBlocksDialog";

type KnownRefs = {
  contentPages: string[];
  contentSections: string[];
  courses: string[];
};

export function PatientHomeBlocksSettingsPageClient({
  initialBlocks,
  knownRefs,
  blockRuntimeStatuses,
}: {
  initialBlocks: PatientHomeBlock[];
  knownRefs: KnownRefs;
  blockRuntimeStatuses: Readonly<Record<string, PatientHomeBlockRuntimeStatus>>;
}) {
  const router = useRouter();
  const [reorderOpen, setReorderOpen] = useState(false);
  const blocks = useMemo(
    () => [...initialBlocks].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")),
    [initialBlocks],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setReorderOpen(true)}>
          Поменять порядок блоков
        </Button>
      </div>
      <div className="space-y-4">
        {blocks.map((block) => (
          <PatientHomeBlockSettingsCard
            key={block.code}
            block={block}
            knownRefs={knownRefs}
            runtimeStatus={blockRuntimeStatuses[block.code]!}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>
      {reorderOpen ? (
        <PatientHomeReorderBlocksDialog
          open={reorderOpen}
          onOpenChange={setReorderOpen}
          initialBlocks={blocks}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
