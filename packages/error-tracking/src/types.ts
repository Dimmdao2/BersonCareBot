export type ErrorTrackingService = "webapp" | "integrator" | "media-worker";

export type ErrorTrackingProcessRole =
  | "webapp"
  | "api"
  | "worker"
  | "scheduler"
  | "media-worker";

export type ErrorTrackingCapturePoint =
  | "webapp_request_error"
  | "integrator_http_error"
  | "integrator_startup_fatal"
  | "worker_loop_error"
  | "worker_startup_fatal"
  | "scheduler_loop_error"
  | "scheduler_startup_fatal"
  | "media_worker_loop_error"
  | "media_worker_startup_fatal";

export type ErrorTrackingInitInput = Readonly<{
  enabled: boolean;
  dsn: string | null;
  service: ErrorTrackingService;
  processRole: ErrorTrackingProcessRole;
  buildId?: string | null;
  nodeEnv?: string | null;
  cwd?: string;
}>;

export type ErrorTrackingInitResult = Readonly<{
  enabled: boolean;
  release: string;
  reason?: "disabled" | "invalid_dsn" | "sdk_unavailable";
}>;
