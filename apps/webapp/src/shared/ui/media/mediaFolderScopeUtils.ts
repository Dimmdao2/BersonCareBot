import type { MediaFolderRecord } from "@/modules/media/types";

/** Цепочка «Корень» → … → папка для хлебных кроек и навигации. */
export function buildCrumbsForMediaFolder(
  flat: MediaFolderRecord[],
  folderId: string | null,
): { id: string | null; label: string }[] {
  if (folderId === null) {
    return [{ id: null, label: "Корень" }];
  }
  const byId = new Map(flat.map((f) => [f.id, f]));
  const chain: MediaFolderRecord[] = [];
  let cur: MediaFolderRecord | undefined = byId.get(folderId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return [{ id: null, label: "Корень" }, ...chain.map((f) => ({ id: f.id, label: f.name }))];
}

/** Полный путь «родитель / … / имя» для плоского списка папок. */
export function mediaFolderPathLabel(folder: MediaFolderRecord, all: MediaFolderRecord[]): string {
  const byId = new Map(all.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur: MediaFolderRecord | undefined = folder;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

export function sortMediaFoldersByPathRu(folders: MediaFolderRecord[]): MediaFolderRecord[] {
  if (folders.length === 0) return [];
  return folders.slice().sort((a, b) => {
    const pa = mediaFolderPathLabel(a, folders);
    const pb = mediaFolderPathLabel(b, folders);
    return pa.localeCompare(pb, "ru");
  });
}
