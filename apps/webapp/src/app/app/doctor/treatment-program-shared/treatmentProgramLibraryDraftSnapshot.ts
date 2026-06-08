import type { TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";

/** Минимальный снимок каталожной строки только для in-memory preview редактора; при сохранении editor-batch сервер строит канонический снимок через `buildSnapshot`. */
export function libraryRowToItemDraftSnapshot(
  row: TreatmentProgramLibraryRow,
  itemType: TreatmentProgramLibraryPickType,
): Record<string, unknown> {
  const snap: Record<string, unknown> = { title: row.title };
  if (row.subtitle?.trim()) snap.subtitle = row.subtitle.trim();
  const thumb = row.thumbUrl?.trim();
  if (thumb) {
    if (itemType === "clinical_test") {
      snap.tests = [
        {
          testId: row.id,
          title: row.title,
          sortOrder: 0,
          comment: null,
          media: [{ mediaUrl: thumb, mediaType: "image", sortOrder: 0 }],
        },
      ];
    } else if (itemType === "recommendation") {
      snap.bodyMd = "";
      snap.media = [{ mediaUrl: thumb, mediaType: "image", sortOrder: 0 }];
    } else {
      snap.media = [{ mediaUrl: thumb, mediaType: "image", sortOrder: 0 }];
    }
  }
  return snap;
}

export function freeformRecommendationDraftSnapshot(title: string, bodyMd: string): Record<string, unknown> {
  return { title, bodyMd };
}
