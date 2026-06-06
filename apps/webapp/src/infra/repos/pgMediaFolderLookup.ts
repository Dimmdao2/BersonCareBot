/** Wave 3 phase 15E — media folder existence check via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function mediaFolderExists(folderId: string): Promise<boolean> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT id::text AS id FROM media_folders WHERE id = $1::uuid LIMIT 1`,
    [folderId],
  );
  return r.rows.length > 0;
}
