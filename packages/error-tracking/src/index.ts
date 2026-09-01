export {
  captureErrorTrackingException,
  closeErrorTracking,
  flushErrorTracking,
  initErrorTracking,
  resolveErrorTrackingRelease,
} from './runtime.js';

export {
  SAAS_ISOLATION_EVENT_CLASSES,
  classifySaasIsolationFailure,
  isRecognizedSaasIsolationFailure,
} from './saasIsolationClassification.js';
export type { SaasIsolationTelemetryEventClass } from './saasIsolationClassification.js';

export { createSaasIsolationBackgroundReporter } from './saasIsolationReporter.js';
export type {
  SaasIsolationBackgroundReporter,
  SaasIsolationBackgroundSource,
  SaasIsolationEventSink,
  SaasIsolationTelemetryTransportStatus,
} from './saasIsolationReporter.js';

export type {
  ErrorTrackingCapturePoint,
  ErrorTrackingInitInput,
  ErrorTrackingInitResult,
  ErrorTrackingProcessRole,
  ErrorTrackingService,
} from './types.js';
