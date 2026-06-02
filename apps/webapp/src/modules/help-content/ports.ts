export type HelpArticleListItem = {
  slug: string;
  title: string;
  summary: string;
  sortOrder: number;
};

/** Minimal slice of content pages port for patient help catalog. */
export type HelpArticlesListPort = {
  listBySection(
    section: string,
    opts?: { viewAuthOnlyPages?: boolean },
  ): Promise<
    Array<{
      slug: string;
      title: string;
      summary: string;
      sortOrder: number;
    }>
  >;
};
