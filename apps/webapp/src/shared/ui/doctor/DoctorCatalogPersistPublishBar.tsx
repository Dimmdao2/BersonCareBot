"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const rowClass = "flex flex-wrap gap-2 border-t border-border/60 pt-4";

type SizeProp = { size?: "default" | "sm" };

type Base = {
  className?: string;
  isArchived: boolean;
  pending: boolean;
  isPublished: boolean;
  /** `false` — как в конструкторе комплекса ЛФК до первого `persist` (`!template`). */
  catalogRecordExists: boolean;
  persistLabel: string;
  persistPendingLabel?: string;
  /** Дополнительно к `isArchived || pending` (например, странная логика статуса в другом каталоге). */
  persistDisabled?: boolean;
  /** Полная замена правила disabled для «Опубликовать» (если задано). */
  publishDisabled?: boolean;
  buttonSize?: SizeProp["size"];
  saveVariant?: "default" | "secondary";
  intentName?: string;
};

export type DoctorCatalogPersistPublishBarCallbacksProps = Base & {
  mode: "callbacks";
  onPersist: () => void;
  onPublish: () => void;
};

export type DoctorCatalogPersistPublishBarFormIntentProps = Base & {
  mode: "formIntent";
  formId: string;
  saveIntentValue: string;
  publishIntentValue: string;
};

export type DoctorCatalogPersistPublishBarProps =
  | DoctorCatalogPersistPublishBarCallbacksProps
  | DoctorCatalogPersistPublishBarFormIntentProps;

export function DoctorCatalogPersistPublishBar(props: DoctorCatalogPersistPublishBarProps) {
  const {
    className,
    isArchived,
    pending,
    isPublished,
    catalogRecordExists,
    persistLabel,
    persistPendingLabel = "Сохранение…",
    persistDisabled: persistDisabledOverride,
    publishDisabled: publishDisabledOverride,
    buttonSize,
    saveVariant = "default",
    intentName = "intent",
  } = props;

  const persistDisabled = persistDisabledOverride ?? (isArchived || pending);
  const publishDisabledDefault = !catalogRecordExists || isArchived || pending || isPublished;
  const publishDisabled = publishDisabledOverride ?? publishDisabledDefault;

  const sz = buttonSize === "sm" ? ({ size: "sm" as const } satisfies SizeProp) : {};

  const persistCommon = {
    ...sz,
    disabled: persistDisabled,
    variant: saveVariant,
  } as const;

  const persistNode =
    props.mode === "callbacks" ? (
      <Button type="button" {...persistCommon} onClick={props.onPersist}>
        {pending ? persistPendingLabel : persistLabel}
      </Button>
    ) : (
      <Button
        type="submit"
        {...persistCommon}
        form={props.formId}
        name={intentName}
        value={props.saveIntentValue}
      >
        {pending ? persistPendingLabel : persistLabel}
      </Button>
    );

  const publishPublishedNode = (
    <Button type="button" variant="secondary" {...sz} disabled>
      Опубликован
    </Button>
  );

  const publishNode =
    props.mode === "callbacks" ? (
      isPublished ? (
        publishPublishedNode
      ) : (
        <Button
          type="button"
          variant="default"
          {...sz}
          onClick={props.onPublish}
          disabled={publishDisabled}
        >
          Опубликовать
        </Button>
      )
    ) : isPublished ? (
      publishPublishedNode
    ) : (
      <Button
        type="submit"
        variant="default"
        {...sz}
        form={props.formId}
        name={intentName}
        value={props.publishIntentValue}
        disabled={publishDisabled}
      >
        Опубликовать
      </Button>
    );

  return (
    <div className={cn(rowClass, className)}>
      {persistNode}
      {publishNode}
    </div>
  );
}
