/** Persisted proxy failure reasons (`media_hls_proxy_error_events.reason_code`). */
export const HLS_PROXY_REASON_CODES_DB = [
  "session_unauthorized",
  "feature_disabled",
  "media_not_readable",
  "forbidden_path",
  "missing_object",
  "upstream_403",
  "s3_read_failed",
  "upstream_timeout",
  "range_not_satisfiable",
  "playlist_read_failed",
  "playlist_rewrite_failed",
  "internal_error",
] as const;

export type HlsProxyReasonCodeDb = (typeof HLS_PROXY_REASON_CODES_DB)[number];

export const HLS_PROXY_ARTIFACT_KINDS = ["master", "variant", "segment"] as const;
export type HlsProxyArtifactKind = (typeof HLS_PROXY_ARTIFACT_KINDS)[number];
