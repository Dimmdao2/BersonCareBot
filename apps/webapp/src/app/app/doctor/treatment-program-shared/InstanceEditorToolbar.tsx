'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorSection } from '@/shared/ui/doctor/DoctorSection';
import { cn } from '@/lib/utils';
import type { TreatmentProgramInstanceStatus } from '@/modules/treatment-program/types';
import { isProgramInstanceEditLocked } from './programInstanceMutationGuard';
import { useInstanceEditorDraft } from './InstanceEditorDraftContext';

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function InstanceEditorToolbar(props: {
  stageNumber: number | null;
  stageTitle: string;
  programStatus: TreatmentProgramInstanceStatus;
  pipelineStageCount: number;
  onAddStageClick: () => void;
  onChangeStageOrderClick: () => void;
}) {
  const {
    stageNumber,
    stageTitle,
    programStatus,
    pipelineStageCount,
    onAddStageClick,
    onChangeStageOrderClick,
  } = props;
  const { isDirty, saving, saveDraft } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const scrollParent = findScrollParent(toolbar);
    if (!scrollParent) return;

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const toolbarTop = toolbar.getBoundingClientRect().top;
        const scrollTop = scrollParent.getBoundingClientRect().top;
        const stickyOffset = Number.parseFloat(window.getComputedStyle(toolbar).top) || 0;
        setStuck(toolbarTop <= scrollTop + stickyOffset + 0.5);
      });
    };

    update();
    scrollParent.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollParent.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleSave = () => {
    void saveDraft().then((r) => {
      if (r.ok) {
        toast.success('Изменения сохранены');
      } else if (!r.cancelled && r.error) {
        toast.error(r.error);
      }
    });
  };

  return (
    <div
      ref={toolbarRef}
      id="instance-editor-toolbar"
      data-testid="instance-editor-toolbar"
      data-stuck={stuck ? 'true' : 'false'}
      className={cn(
        'sticky top-[var(--doctor-sticky-offset)] z-20 transition-[margin] duration-200',
        stuck && '-mx-3',
      )}
    >
      <DoctorSection
        className={cn(
          'gap-2 transition-[border-radius,background-color] duration-200',
          stuck && 'rounded-none border-x-0 border-t-0 bg-card/95 backdrop-blur-sm',
          isDirty && !editLocked && 'border-amber-500/40',
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium tabular-nums text-muted-foreground">
            {stageNumber == null ? 'Этапы программы' : `Этап ${stageNumber}`}
          </p>
          <h2 className="break-words text-sm font-semibold text-foreground">{stageTitle}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 px-1.5 text-xs sm:px-3"
            disabled={editLocked}
            onClick={onAddStageClick}
            data-testid="instance-editor-add-stage"
          >
            Добавить этап
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 px-1.5 text-xs sm:px-3"
            disabled={editLocked || pipelineStageCount < 2}
            onClick={onChangeStageOrderClick}
            data-testid="instance-editor-change-stage-order"
          >
            Изменить порядок
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-w-0 px-1.5 text-xs sm:px-3"
            disabled={editLocked || !isDirty || saving}
            onClick={handleSave}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </DoctorSection>
    </div>
  );
}
