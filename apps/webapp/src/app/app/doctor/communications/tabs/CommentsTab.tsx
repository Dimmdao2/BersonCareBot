"use client";

import type { DoctorCommentsTabProps } from "../../comments/DoctorCommentsTab";
import { DoctorCommentsTab } from "../../comments/DoctorCommentsTab";
import type { TodayExerciseCommentAttentionItem } from "../../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import type { CommentPatientRow } from "../../comments/loadDoctorCommentPatients";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/**
 * Форма SSR-данных от страницы-шелла (выход `loadDoctorExerciseCommentsForTab` + `loadDoctorCommentPatients`).
 *
 * Shape изменён в Этапе 5b: `initialTabData.comments` теперь объект
 * `{ feed: { items, nextCursor, hasMore }, patients: CommentPatientRow[] }`.
 *
 * Обратная совместимость: если initialData имеет старую плоскую форму (только items/nextCursor/hasMore)
 * — маппим в feed, patients = [].
 */
type CommentsInitialDataV2 = {
  feed: {
    items: TodayExerciseCommentAttentionItem[];
    nextCursor: DoctorExerciseCommentCursor | null;
    hasMore: boolean;
  };
  patients: CommentPatientRow[];
};

/** Старая плоская форма (backward compat). */
type CommentsInitialDataLegacy = {
  items: TodayExerciseCommentAttentionItem[];
  nextCursor: DoctorExerciseCommentCursor | null;
  hasMore: boolean;
};

const EMPTY: DoctorCommentsTabProps = {
  initialItems: [],
  initialCursor: null,
  hasMoreInitial: false,
  initialPatients: [],
};

function isV2Shape(d: unknown): d is CommentsInitialDataV2 {
  return (
    typeof d === "object" &&
    d !== null &&
    "feed" in d &&
    typeof (d as CommentsInitialDataV2).feed === "object"
  );
}

function isLegacyShape(d: unknown): d is CommentsInitialDataLegacy {
  return (
    typeof d === "object" &&
    d !== null &&
    "items" in d &&
    Array.isArray((d as CommentsInitialDataLegacy).items)
  );
}

function toProps(initialData: unknown): DoctorCommentsTabProps {
  if (isV2Shape(initialData)) {
    const { feed, patients } = initialData;
    return {
      initialItems: Array.isArray(feed.items) ? feed.items : [],
      initialCursor: feed.nextCursor ?? null,
      hasMoreInitial: feed.hasMore ?? false,
      initialPatients: Array.isArray(patients) ? patients : [],
    };
  }
  if (isLegacyShape(initialData)) {
    return {
      initialItems: Array.isArray(initialData.items) ? initialData.items : [],
      initialCursor: initialData.nextCursor ?? null,
      hasMoreInitial: initialData.hasMore ?? false,
      initialPatients: [],
    };
  }
  return EMPTY;
}

/** Таб «Комментарии» — SSR-данные передаются через initialData из страницы-шелла. */
export function CommentsTab({ initialData }: CommunicationsTabProps) {
  return <DoctorCommentsTab {...toProps(initialData)} />;
}
