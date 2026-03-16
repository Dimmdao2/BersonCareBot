export type ContentVideoSource =
  | { type: "url"; url: string }
  | { type: "api"; mediaId: string };

export type ContentStubItem = {
  slug: string;
  title: string;
  summary: string;
  /** Placeholder or real body text. */
  bodyText: string;
  /** Optional image URL (relative or absolute). */
  imageUrl?: string;
  /** Optional video for media block. */
  videoSource?: ContentVideoSource;
};
