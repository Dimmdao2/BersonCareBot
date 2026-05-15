"use client";

import { MaterialRatingBlock } from "@/shared/ui/material-rating/MaterialRatingBlock";

export function PatientContentMaterialRating(props: {
  contentPageId: string;
  guest: boolean;
  needsActivation: boolean;
  className?: string;
}) {
  return (
    <MaterialRatingBlock
      targetKind="content_page"
      targetId={props.contentPageId}
      guest={props.guest}
      needsActivation={props.needsActivation}
      readOnly={props.guest || props.needsActivation}
      className={props.className}
    />
  );
}
