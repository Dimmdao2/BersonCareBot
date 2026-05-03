import type { ClinicalTest, ClinicalTestMediaItem } from "@/modules/tests/types";

export type ClinicalTestLibraryPickRow = {
  id: string;
  title: string;
  previewMedia: ClinicalTestMediaItem | null;
};

function firstPreviewMedia(media: ClinicalTest["media"]): ClinicalTestMediaItem | null {
  if (!media?.length) return null;
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

/** Строки для диалога «добавить тест» в редакторе набора (активные тесты каталога). */
export function clinicalTestLibraryRows(tests: ClinicalTest[]): ClinicalTestLibraryPickRow[] {
  return tests.map((t) => ({
    id: t.id,
    title: t.title,
    previewMedia: firstPreviewMedia(t.media),
  }));
}
