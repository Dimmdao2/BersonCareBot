export type ReferenceCategory = {
  id: string;
  code: string;
  title: string;
  isUserExtensible: boolean;
  tenantId: string | null;
};

export type ReferenceItem = {
  id: string;
  categoryId: string;
  code: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  metaJson: Record<string, unknown>;
};
