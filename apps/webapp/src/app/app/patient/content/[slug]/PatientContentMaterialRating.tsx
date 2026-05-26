"use client";

import { useCallback, useState } from "react";
import { MaterialRatingBlock } from "@/shared/ui/material-rating/MaterialRatingBlock";
import { PatientWarmupRatingFeedbackDialog } from "./PatientWarmupRatingFeedbackDialog";

export function PatientContentMaterialRating(props: {
  contentPageId: string;
  guest: boolean;
  needsActivation: boolean;
  isDailyWarmup?: boolean;
  className?: string;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStars, setFeedbackStars] = useState(0);

  const showFeedback = props.isDailyWarmup && !props.guest && !props.needsActivation;

  const onLowRatingSaved = useCallback(
    (stars: number) => {
      if (!showFeedback) return;
      setFeedbackStars(stars);
      setFeedbackOpen(true);
    },
    [showFeedback],
  );

  return (
    <>
      <MaterialRatingBlock
        targetKind="content_page"
        targetId={props.contentPageId}
        guest={props.guest}
        needsActivation={props.needsActivation}
        readOnly={props.guest || props.needsActivation}
        onLowRatingSaved={showFeedback ? onLowRatingSaved : undefined}
        className={props.className}
      />
      {showFeedback ? (
        <PatientWarmupRatingFeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          contentPageId={props.contentPageId}
          ratingValue={feedbackStars}
        />
      ) : null}
    </>
  );
}
