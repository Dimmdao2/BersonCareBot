/**
 * Presigned URLs must not appear in structured logs (AUDIT phase-09 MF-2).
 * SDK errors occasionally embed request URLs in messages — strip http(s) segments.
 */
export function redactUrlLikeSubstrings(input: string): string {
  return input.replace(/https?:\/\/[^\s"'<>]+/gi, "[url_redacted]");
}

export type PresignFailureLogFields = {
  name: string;
  message: string;
};

export function serializePresignFailureForLog(err: unknown): PresignFailureLogFields {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redactUrlLikeSubstrings(err.message ?? ""),
    };
  }
  return {
    name: "unknown",
    message: redactUrlLikeSubstrings(String(err)),
  };
}
