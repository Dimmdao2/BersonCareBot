"use client";

import type { DoctorCommentsTabProps } from "../../comments/DoctorCommentsTab";
import { DoctorCommentsTab } from "../../comments/DoctorCommentsTab";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

const EMPTY: DoctorCommentsTabProps = {
  initialItems: [],
  initialCursor: null,
  hasMoreInitial: false,
};

/** Таб «Комментарии» — SSR-данные передаются через initialData из страницы-шелла (Block 6). */
export function CommentsTab({ initialData }: CommunicationsTabProps) {
  const props = (initialData as DoctorCommentsTabProps | undefined) ?? EMPTY;
  return <DoctorCommentsTab {...props} />;
}
