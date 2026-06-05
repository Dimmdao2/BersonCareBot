export function logBookingRubitimeMirrorFailed(input: {
  bookingId: string;
  action: "cancel_record" | "update_record" | "create_record";
  rubitimeId: string | null;
}): void {
  console.warn("[booking_rubitime_mirror_failed]", JSON.stringify(input));
}
