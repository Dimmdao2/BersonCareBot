"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DoctorClientActiveProgramTreeModel } from "@/modules/doctor-client-card/types";
import { cn } from "@/lib/utils";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";
import { doctorClientSectionTitleClass, doctorClientStackedCardClass, doctorClientInsetListRowClass } from "./doctorClientCardChrome";

type Props = {
  userId: string;
  profileListScope?: string;
  tree: DoctorClientActiveProgramTreeModel;
};

function ItemRow(props: {
  userId: string;
  instanceId: string;
  profileListScope?: string;
  item: DoctorClientActiveProgramTreeModel["stages"][number]["ungroupedItems"][number];
}) {
  const { userId, instanceId, profileListScope, item } = props;
  const href = doctorClientTreatmentProgramInstanceHref(userId, instanceId, {
    profileListScope,
    discussionItemId: item.id,
  });
  return (
    <li>
      <Link href={href} className={cn(doctorClientInsetListRowClass, "group text-sm")}>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.isNew ? (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            Новое
          </Badge>
        ) : null}
      </Link>
    </li>
  );
}

export function DoctorClientActiveProgramPanel({ userId, profileListScope, tree }: Props) {
  const [openStageIds, setOpenStageIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (tree.defaultExpandedStageId) initial.add(tree.defaultExpandedStageId);
    return initial;
  });

  const editorHref = doctorClientTreatmentProgramInstanceHref(userId, tree.instanceId, {
    profileListScope,
  });

  const toggleStage = (stageId: string) => {
    setOpenStageIds((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  return (
    <div id="doctor-client-section-active-program" className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={doctorClientSectionTitleClass}>{tree.instanceTitle}</h3>
        <Link href={editorHref} className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
          Открыть программу
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {tree.stages.map((stage) => {
          const open = openStageIds.has(stage.id);
          const itemCount =
            stage.ungroupedItems.length + stage.groups.reduce((n, g) => n + g.items.length, 0);
          return (
            <Collapsible
              key={stage.id}
              open={open}
              onOpenChange={() => toggleStage(stage.id)}
              className={doctorClientStackedCardClass}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
                <ChevronDown
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm font-medium">{stage.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{itemCount}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/60 px-3 pb-3 pt-2">
                {stage.groups.map((group) => (
                  <div key={group.id} className="mb-3 last:mb-0">
                    {group.title ? (
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.title}</p>
                    ) : null}
                    <ul className="m-0 list-none space-y-1 p-0">
                      {group.items.map((item) => (
                        <ItemRow
                          key={item.id}
                          userId={userId}
                          instanceId={tree.instanceId}
                          profileListScope={profileListScope}
                          item={item}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
                {stage.ungroupedItems.length > 0 ? (
                  <ul className="m-0 list-none space-y-1 p-0">
                    {stage.ungroupedItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        userId={userId}
                        instanceId={tree.instanceId}
                        profileListScope={profileListScope}
                        item={item}
                      />
                    ))}
                  </ul>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
