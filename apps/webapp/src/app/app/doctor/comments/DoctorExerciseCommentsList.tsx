/**
 * Read-only список новых комментариев пациентов по упражнениям для вкладки
 * «Коммуникации → Комментарии». Группировка и отображение повторяют диалог
 * `DoctorTodayAttentionDialog` (`kind="exerciseComments"`); ответ/отметка прочитанным —
 * по ссылке в программе (TODO#1 communications.md).
 */
import Link from "next/link";
import { cn } from "@/lib/utils";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { ProgramItemDiscussionMessageBody } from "@/app/app/patient/treatment/ProgramItemDiscussionMessageBody";
import {
  groupExerciseCommentAttentionByPatient,
  type TodayExerciseCommentAttentionItem,
} from "../loadDoctorExerciseCommentAttention";

export function DoctorExerciseCommentsList({
  items,
  total,
  truncated,
}: {
  items: TodayExerciseCommentAttentionItem[];
  total: number;
  truncated: boolean;
}) {
  const groups = groupExerciseCommentAttentionByPatient(items);

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <p className="text-xs text-muted-foreground">Новых комментариев: {total}</p>
      ) : null}
      {groups.map((group) => (
        <section key={group.patientUserId} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{group.patientDisplayName}</h3>
          <ul className="m-0 list-none space-y-2 p-0">
            {group.items.map((item) => (
              <li key={item.stageItemId} className={cn("flex flex-col gap-1", doctorSectionItemClass)}>
                <p className="text-xs text-muted-foreground">{item.stageItemTitle}</p>
                <p className="text-xs text-muted-foreground">{item.latestMessageAtLabel}</p>
                <div className="max-w-[min(100%,30rem)] rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                  <ProgramItemDiscussionMessageBody message={item.latestMessage} mine={false} />
                </div>
                <Link href={item.href} className={cn(doctorInlineLinkClass, "mt-1")}>
                  Открыть комментарии в программе
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Показаны первые {items.length} из {total}
        </p>
      ) : null}
    </div>
  );
}
