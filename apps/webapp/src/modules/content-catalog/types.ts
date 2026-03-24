export type ContentVideoSource =
  | { type: "url"; url: string }
  | { type: "api"; mediaId: string };

export type ContentBodyFormat = "markdown" | "legacy-html";

export type ContentStubItem = {
  slug: string;
  title: string;
  summary: string;
  /** Placeholder or real body text. */
  bodyText: string;
  /**
   * How to render `bodyText` on the patient page: Markdown from `body_md`, or sanitized legacy HTML
   * from `body_html` when Markdown was never stored.
   */
  bodyFormat?: ContentBodyFormat;
  /** Optional image URL (relative or absolute). */
  imageUrl?: string;
  /** Optional video for media block. */
  videoSource?: ContentVideoSource;
};
