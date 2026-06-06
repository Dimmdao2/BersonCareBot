import type { DoctorMotivationQuotesEditorPort } from "@/modules/doctor-motivation-quotes/ports";

export const inMemoryDoctorMotivationQuotesEditorPort: DoctorMotivationQuotesEditorPort = {
  async listQuotesForEditor() {
    return [];
  },
  async upsertQuote() {},
  async setQuoteArchived() {},
  async setQuoteActive() {},
  async reorderQuotes() {},
};
