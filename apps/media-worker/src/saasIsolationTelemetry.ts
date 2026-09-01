import {
  classifySaasIsolationFailure,
  isRecognizedSaasIsolationFailure,
} from '@bersoncare/error-tracking';
import type { MediaWorkerControlPort } from './control.js';

const CIRCUIT_OPEN_MS = 30_000;

/** A failed telemetry command is isolated from the original worker failure and circuit-broken. */
export function createMediaWorkerIsolationReporter(
  control: Pick<MediaWorkerControlPort, 'isolationFailure'>,
  now: () => number = Date.now,
) {
  let circuitOpenUntil = 0;
  return {
    report(error: unknown): void {
      // Ordinary transcode/S3 failures are not isolation events. An isolation failure that no rule
      // recognized IS one, and is reported as `unclassified_background_operation` instead of being
      // dropped — the control seam and `app.report_saas_isolation_event` both accept that class.
      if (!isRecognizedSaasIsolationFailure(error) || now() < circuitOpenUntil) return;
      void control.isolationFailure(classifySaasIsolationFailure(error)).catch(() => {
        circuitOpenUntil = now() + CIRCUIT_OPEN_MS;
      });
    },
    inspectForTest() { return { circuitOpenUntil }; },
  };
}
