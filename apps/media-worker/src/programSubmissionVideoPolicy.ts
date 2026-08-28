export const MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS = 10;

export function isProgramSubmissionVideoDurationAllowed(durationSeconds: number): boolean {
  return (
    Number.isFinite(durationSeconds) &&
    durationSeconds >= MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS
  );
}
