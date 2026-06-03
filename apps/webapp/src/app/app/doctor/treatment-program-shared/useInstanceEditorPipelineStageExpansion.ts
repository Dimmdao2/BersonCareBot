"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickDefaultExpandedPipelineStageId,
  type PipelineStageForDefaultExpand,
} from "./instanceEditorDefaultExpandedStageId";

function buildInitialExpandedStageIds(pipelineStages: PipelineStageForDefaultExpand[]): Set<string> {
  const defaultId = pickDefaultExpandedPipelineStageId(pipelineStages);
  return defaultId ? new Set([defaultId]) : new Set();
}

export function useInstanceEditorPipelineStageExpansion(pipelineStages: PipelineStageForDefaultExpand[]) {
  const deferredInitRef = useRef(pipelineStages.length === 0);
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(() =>
    pipelineStages.length > 0 ? buildInitialExpandedStageIds(pipelineStages) : new Set(),
  );

  useEffect(() => {
    if (!deferredInitRef.current) return;
    if (pipelineStages.length === 0) return;
    deferredInitRef.current = false;
    const t = window.setTimeout(() => {
      setExpandedStageIds(buildInitialExpandedStageIds(pipelineStages));
    }, 0);
    return () => window.clearTimeout(t);
  }, [pipelineStages]);

  const setStageExpanded = useCallback((stageId: string, open: boolean) => {
    setExpandedStageIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(stageId);
      else next.delete(stageId);
      return next;
    });
  }, []);

  const isStageExpanded = useCallback((stageId: string) => expandedStageIds.has(stageId), [expandedStageIds]);

  return { expandedStageIds, isStageExpanded, setStageExpanded };
}
