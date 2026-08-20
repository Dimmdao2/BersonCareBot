import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import {
  buildRollbackArtifact,
  buildManifest,
  enforceFailClosedPlan,
  manifestTargetIds,
  parseAndVerifyManifest,
  parseAndVerifyRollbackArtifact,
  planManifest,
  sameIdentityState,
  type CurrentFioRow,
  type FioIdentityState,
  type FioNameState,
  type OwnerReviewedFioManifest,
  type OwnerReviewedFioRollbackArtifact,
} from './owner-reviewed-fio-contract';

export type FioTransactionPort = {
  lockRows(ids: string[]): Promise<CurrentFioRow[]>;
  conditionalUpdate(
    id: string,
    expected: FioIdentityState,
    desired: FioNameState,
  ): Promise<boolean>;
};

export type FioDatabasePort = {
  readRows(ids: string[]): Promise<CurrentFioRow[]>;
  transaction<T>(run: (tx: FioTransactionPort) => Promise<T>): Promise<T>;
};

export type DurableArtifactWriter = {
  writeBeforeMutation(artifact: OwnerReviewedFioRollbackArtifact): Promise<string>;
};

async function ensureRealDirectoryChain(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  const { root } = path.parse(resolved);
  let current = root;
  for (const segment of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('artifact directory chain must contain only real directories');
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current, { mode: 0o700 });
      const created = await lstat(current);
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new Error('artifact directory creation was redirected');
      }
    }
  }
}

async function assertRealDirectoryChain(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  const { root } = path.parse(resolved);
  let current = root;
  for (const segment of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('JSON input parent chain must contain only real directories');
    }
  }
}

export async function readRegularJsonFile(pathname: string): Promise<unknown> {
  const resolved = path.resolve(pathname);
  await assertRealDirectoryChain(path.dirname(resolved));
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('JSON input must be a regular non-symlink file');
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

export async function sealManifestFile(
  payload: unknown,
  outputPath: string,
): Promise<OwnerReviewedFioManifest> {
  if (!path.isAbsolute(outputPath)) throw new Error('sealed manifest output path must be absolute');
  const manifest = parseAndVerifyManifest(buildManifest(payload));
  const parent = path.dirname(outputPath);
  await assertRealDirectoryChain(parent);
  const handle = await open(outputPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const parentHandle = await open(parent, 'r');
  try {
    await parentHandle.sync();
  } finally {
    await parentHandle.close();
  }
  return manifest;
}

export function createDurableRollbackWriter(directory: string): DurableArtifactWriter {
  return {
    async writeBeforeMutation(artifact) {
      if (!path.isAbsolute(directory)) throw new Error('rollback directory must be absolute');
      await ensureRealDirectoryChain(directory);
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
        throw new Error('rollback directory must be a real directory, not a symlink');
      }
      const artifactPath = path.join(
        directory,
        `fio-owner-review-${artifact.runId}-${artifact.artifactSha256.slice(0, 12)}-${randomUUID()}.rollback.json`,
      );
      const handle = await open(artifactPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
        await handle.chmod(0o600);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const directoryHandle = await open(directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      return artifactPath;
    },
  };
}

export async function readRollbackArtifact(
  pathname: string,
): Promise<OwnerReviewedFioRollbackArtifact> {
  return parseAndVerifyRollbackArtifact(await readRegularJsonFile(pathname));
}

export async function previewOwnerReviewedFio(
  manifest: OwnerReviewedFioManifest,
  db: FioDatabasePort,
) {
  return planManifest(manifest, await db.readRows(manifestTargetIds(manifest)));
}

export async function applyOwnerReviewedFio(
  manifest: OwnerReviewedFioManifest,
  db: FioDatabasePort,
  artifactWriter: DurableArtifactWriter,
  now: () => string = () => new Date().toISOString(),
  /** Exact `current_database()` of this apply; stamped into the rollback artifact (B-8). */
  targetDatabase?: string,
): Promise<{
  plan: ReturnType<typeof planManifest>;
  artifactPath: string | null;
  artifactSha256: string | null;
}> {
  return db.transaction(async (tx) => {
    const plan = planManifest(manifest, await tx.lockRows(manifestTargetIds(manifest)));
    enforceFailClosedPlan(plan);
    if (plan.updates.length === 0) return { plan, artifactPath: null, artifactSha256: null };

    const artifact = buildRollbackArtifact(manifest, plan.updates, now(), targetDatabase);
    const artifactPath = await artifactWriter.writeBeforeMutation(artifact);
    for (const update of plan.updates) {
      const changed = await tx.conditionalUpdate(
        update.manifest.id,
        update.current,
        update.manifest.desiredAfter,
      );
      if (!changed) throw new Error('conditional FIO update failed after row lock');
    }
    return { plan, artifactPath, artifactSha256: artifact.artifactSha256 };
  });
}

export async function rollbackOwnerReviewedFio(
  artifact: OwnerReviewedFioRollbackArtifact,
  db: FioDatabasePort,
): Promise<number> {
  return db.transaction(async (tx) => {
    const current = await tx.lockRows(artifact.rows.map((row) => row.id));
    const byId = new Map(current.map((row) => [row.id, row]));
    for (const row of artifact.rows) {
      const currentRow = byId.get(row.id);
      if (!currentRow || !sameIdentityState(currentRow, row.expectedPostApply)) {
        throw new Error('rollback conflict: current row does not equal recorded post-apply state');
      }
    }
    for (const row of artifact.rows) {
      const restoreNames: FioNameState = {
        displayName: row.restoreBefore.displayName,
        firstName: row.restoreBefore.firstName,
        lastName: row.restoreBefore.lastName,
        patronymic: row.restoreBefore.patronymic,
      };
      const changed = await tx.conditionalUpdate(row.id, row.expectedPostApply, restoreNames);
      if (!changed) throw new Error('conditional FIO rollback failed after row lock');
    }
    return artifact.rows.length;
  });
}
