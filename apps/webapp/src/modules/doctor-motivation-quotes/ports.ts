/** Doctor CMS: редактирование списка цитат (`motivational_quotes`). */

export type MotivationQuoteEditorRow = {
  id: string;
  body_text: string;
  author: string | null;
  is_active: boolean;
  sort_order: number;
  archived_at: Date | null;
};

export type DoctorMotivationQuotesEditorPort = {
  listQuotesForEditor(): Promise<MotivationQuoteEditorRow[]>;
};
