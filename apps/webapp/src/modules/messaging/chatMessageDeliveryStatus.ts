export type ChatMessageDeliveryStatus = "sent" | "read";

/** Outgoing message is read by peer when their read cursor is at or after message time. */
export function chatMessageDeliveryStatus(params: {
  createdAt: string;
  peerLastReadAt?: string | null;
  readAt?: string | null;
}): ChatMessageDeliveryStatus {
  if (params.readAt) return "read";
  if (!params.peerLastReadAt) return "sent";
  return params.createdAt <= params.peerLastReadAt ? "read" : "sent";
}
