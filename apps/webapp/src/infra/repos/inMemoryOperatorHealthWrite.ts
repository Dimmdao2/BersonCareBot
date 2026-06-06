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

export const webPushOnlyReminderTickWriteLog: Array<
  | ({ kind: "success" } & SuccessCall)
  | ({ kind: "failure" } & FailureCall & { metaJson: Record<string, unknown> })
> = [];

export function resetMediaTranscodeReconcileWriteLog(): void {
  mediaTranscodeReconcileWriteLog.length = 0;
  reconcileSuccessThrowsForTests = undefined;
}

export function resetWebPushOnlyReminderTickWriteLog(): void {
  webPushOnlyReminderTickWriteLog.length = 0;
}

export const operatorJobTickWriteLog: Array<
  | ({ kind: "success"; jobFamily: string; jobKey: string } & SuccessCall)
  | ({ kind: "failure"; jobFamily: string; jobKey: string } & FailureCall & { metaJson: Record<string, unknown> })
> = [];

export function resetOperatorJobTickWriteLog(): void {
  operatorJobTickWriteLog.length = 0;
}

export const inMemoryOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordOperatorJobTickSuccess(input) {
    operatorJobTickWriteLog.push({
      kind: "success",
      jobFamily: input.jobFamily,
      jobKey: input.jobKey,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },

  async recordOperatorJobTickFailure(input) {
    operatorJobTickWriteLog.push({
      kind: "failure",
      jobFamily: input.jobFamily,
      jobKey: input.jobKey,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: input.metaJson,
    });
  },

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
  async recordWebPushOnlyReminderTickSuccess(input) {
    webPushOnlyReminderTickWriteLog.push({
      kind: "success",
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },
  async recordWebPushOnlyReminderTickFailure(input) {
    webPushOnlyReminderTickWriteLog.push({
      kind: "failure",
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: input.metaJson,
    });
  },

  async resolveAllOpenIncidents() {
    return { resolved: 0 };
  },
};
