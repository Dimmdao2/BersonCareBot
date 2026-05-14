import type { OperatorHealthWritePort } from "@/modules/operator-health/ports";

type SuccessCall = {
  startedAtIso: string;
  durationMs: number;
  metaJson: Record<string, unknown>;
};

type FailureCall = {
  startedAtIso: string;
  durationMs: number;
  error: string;
};

let reconcileSuccessThrowsForTests: Error | undefined;

/** Vitest только: reconcile route — тик упал до лога успеха (проверка HTTP 200). */
export function setOperatorHealthWriteReconcileSuccessThrowsForTests(err: Error | undefined): void {
  reconcileSuccessThrowsForTests = err;
}

/** For route tests (`webappReposAreInMemory`): последние вызовы reconcile-тик записи. */
export const mediaTranscodeReconcileWriteLog: Array<
  ({ kind: "success" } & SuccessCall) | ({ kind: "failure" } & FailureCall)
> = [];

export function resetMediaTranscodeReconcileWriteLog(): void {
  mediaTranscodeReconcileWriteLog.length = 0;
  reconcileSuccessThrowsForTests = undefined;
}

export const inMemoryOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordMediaTranscodeReconcileSuccess(input) {
    if (reconcileSuccessThrowsForTests != null) {
      throw reconcileSuccessThrowsForTests;
    }
    mediaTranscodeReconcileWriteLog.push({
      kind: "success",
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },
  async recordMediaTranscodeReconcileFailure(input) {
    mediaTranscodeReconcileWriteLog.push({
      kind: "failure",
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
    });
  },
};
