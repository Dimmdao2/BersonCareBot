/**
 * Runs a live reversible check without leaving DEV in the mutated state when the
 * readback or oracle throws after the write has already succeeded.
 */
export async function runReversibleCycle({
  id,
  read,
  change,
  restore,
  changedMatches,
  restoredMatches,
}) {
  const started = performance.now();
  const steps = [];
  let original;
  let changed;
  let restored;
  let changeApplied = false;
  let failure = null;

  try {
    original = await read();
    steps.push({
      stage: 'initial_read',
      status: original?.status ?? null,
      ...(original?.error || original?.body?.error
        ? { error: original.error ?? original.body.error }
        : {}),
    });
    if (!original?.ok) {
      return {
        id,
        pass: false,
        stage: 'initial_read',
        failure: `initial_read_rejected:${original?.error ?? original?.body?.error ?? 'unknown'}`,
        steps,
        duration_ms: Math.round(performance.now() - started),
      };
    }

    const changedResponse = await change(original);
    steps.push({
      stage: 'change',
      status: changedResponse?.status ?? null,
      ...(changedResponse?.error || changedResponse?.body?.error
        ? { error: changedResponse.error ?? changedResponse.body.error }
        : {}),
    });
    if (!changedResponse?.ok) {
      return {
        id,
        pass: false,
        stage: 'change',
        failure: `change_rejected:${changedResponse?.error ?? changedResponse?.body?.error ?? 'unknown'}`,
        steps,
        duration_ms: Math.round(performance.now() - started),
      };
    }
    changeApplied = true;
    changed = await read();
    steps.push({ stage: 'changed_readback', status: changed?.status ?? null });
    if (!changed?.ok || !changedMatches(original, changed)) {
      failure = 'changed_readback_mismatch';
    }
  } catch (error) {
    failure = `exception:${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (changeApplied) {
      try {
        const restoreResponse = await restore(original);
        steps.push({ stage: 'restore', status: restoreResponse?.status ?? null });
        restored = await read();
        steps.push({ stage: 'restored_readback', status: restored?.status ?? null });
        if (!restoreResponse?.ok || !restored?.ok || !restoredMatches(original, restored)) {
          failure = failure ?? 'restore_readback_mismatch';
        }
      } catch (error) {
        failure =
          failure ?? `restore_exception:${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  return {
    id,
    pass: failure === null && changeApplied,
    ...(failure ? { failure } : {}),
    steps,
    duration_ms: Math.round(performance.now() - started),
  };
}
