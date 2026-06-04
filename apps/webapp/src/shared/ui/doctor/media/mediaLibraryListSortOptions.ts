export type MediaLibraryListSortPreset = "date:desc" | "date:asc" | "name:asc" | "name:desc";

export const MEDIA_LIBRARY_LIST_SORT_OPTIONS: { value: MediaLibraryListSortPreset; label: string }[] = [
  { value: "date:desc", label: "Сначала новые" },
  { value: "date:asc", label: "Сначала старые" },
  { value: "name:asc", label: "Название А→Я" },
  { value: "name:desc", label: "Название Я→А" },
];

export function parseMediaLibraryListSortPreset(preset: MediaLibraryListSortPreset): {
  sortBy: "date" | "name";
  sortDir: "asc" | "desc";
} {
  const [a, b] = preset.split(":") as ["date" | "name", "asc" | "desc"];
  return { sortBy: a, sortDir: b };
}

export function mediaLibraryListSortLabel(preset: MediaLibraryListSortPreset): string {
  return MEDIA_LIBRARY_LIST_SORT_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}
