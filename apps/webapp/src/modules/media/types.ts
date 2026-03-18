export type MediaKind = "image" | "audio" | "video";

export type MediaRecord = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  filename: string;
  /** Size in bytes. */
  size: number;
  /** Optional owner for future access control. */
  userId?: string | null;
  createdAt: string;
};
