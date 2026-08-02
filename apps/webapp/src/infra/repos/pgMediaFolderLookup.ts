import { eq } from 'drizzle-orm';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import { mediaFolders } from '../../../db/schema/schema';

export async function mediaFolderExists(folderId: string): Promise<boolean> {
  const rows = await getWebappSqlDb()
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(eq(mediaFolders.id, folderId))
    .limit(1);
  return rows.length > 0;
}
