"use client";

import type { DoctorCommentsTabProps } from "../../comments/DoctorCommentsTab";
import { DoctorCommentsTab } from "../../comments/DoctorCommentsTab";
import type { TodayExerciseCommentAttentionItem } from "../../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/**
 * Форма SSR-данных от страницы-шелла (выход `loadDoctorExerciseCommentsForTab`).
 * ВАЖНО: ключи (`items`/`nextCursor`/`hasMore`) отличаются от пропов компонента
 * (`initialItems`/`initialCursor`/`hasMoreInitial`) — поэтому маппим явно, а не спредим.
 */
type CommentsInitialData = {
  items: TodayExerciseCommentAttentionItem[];
  nextCursor: DoctorExerciseCommentCursor | null;
  hasMore: boolean;
};

const EMPTY: DoctorCommentsTabProps = {
  initialItems: [],
  initialCursor: null,
  hasMoreInitial: false,
};

function toProps(initialData: unknown): DoctorCommentsTabProps {
  if (!initialData || typeof initialData !== "object") return EMPTY;
  const d = initialData as Partial<CommentsInitialData>;
  return {
    initialItems: Array.isArray(d.items) ? d.items : [],
    initialCursor: d.nextCursor ?? null,
    hasMoreInitial: d.hasMore ?? false,
  };
}

/** Таб «Комментарии» — SSR-данные передаются через initialData из страницы-шелла (Block 6). */
export function CommentsTab({ initialData }: CommunicationsTabProps) {
  return <DoctorCommentsTab {...toProps(initialData)} />;
}
