"use client";

/**
 * PatientTabKarta — clinical core («Карта»). Faithful to the wireframe
 * (docs/design/doctor-cabinet-wireframe.html #pp-karta + #visit-panel).
 *
 * Left column: Жалобы · Актуальный диагноз · Сопутствующие заболевания · Анамнез.
 * Right column: История визитов feed (collapsible cards) + «+ Новый визит».
 * «+ Новый визит» opens a slide-in panel (NewVisitPanel): the card blurs, the
 * visit list narrows, and the form overlays the right side. Toggle ◀/▶ hides
 * the history so the card is fully visible next to the form.
 *
 * UI-FIRST: all data is MOCK (see ./karta/mockData). Submit is a no-op.
 * TODO(backend): clinical model (visit/complaint/diagnosis/file) + reads + create-visit.
 */
import { useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { cn } from "@/lib/utils";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import {
  MOCK_ANAMNESIS_ILLNESS,
  MOCK_ANAMNESIS_LIFESTYLE,
  MOCK_ANAMNESIS_TRAUMA,
  MOCK_COMORBIDITIES,
  MOCK_COMPLAINTS,
  MOCK_DIAGNOSES,
  MOCK_VISITS,
  type Complaint,
  type Diagnosis,
  type Visit,
} from "./karta/mockData";
import { NewVisitPanel } from "./karta/NewVisitPanel";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

const severityBadgeClass =
  "flex-none self-center rounded-md bg-primary/15 px-1.5 py-px text-xs font-bold text-primary";
const editIconClass =
  "flex-none cursor-pointer self-center text-sm text-muted-foreground hover:text-foreground";
const dateMetaClass = "flex-none self-center text-xs text-muted-foreground";
const sectionLabelClass = "text-xs font-semibold text-foreground";
const plusBtnClass =
  "grid h-[18px] w-[18px] place-items-center rounded-md border border-primary/40 text-xs text-primary hover:bg-primary/10";
const miniTabRowClass = "flex gap-1";

function MiniTab({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "cursor-pointer rounded-md px-1.5 py-0.5 text-xs",
        active ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 44;
  const h = 14;
  const max = 10;
  const stepX = (w - 6) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = 3 + i * stepX;
    const y = 3 + (1 - p / max) * (h - 6);
    return { x, y };
  });
  const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} className="flex-none self-center" aria-hidden="true">
      <polyline points={poly} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      <circle cx={last.x} cy={last.y} r={2} className="fill-primary" />
    </svg>
  );
}

function ComplaintRow({ c }: { c: Complaint }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 text-sm">
      {c.priority ? (
        <span className="flex-none self-center text-primary" title="Приоритет">
          ⚑
        </span>
      ) : (
        <span className="w-3 flex-none" />
      )}
      <span className="flex-1">{c.text}</span>
      <span className={severityBadgeClass}>{c.severity}/10</span>
      <Sparkline points={c.trend} />
      <span className={editIconClass} title="Редактировать">
        ✎
      </span>
      <span className={dateMetaClass}>{c.since}</span>
    </div>
  );
}

function DiagnosisRow({ d }: { d: Diagnosis }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm",
        d.tone === "calm" ? "border-border bg-muted/15" : "border-border/70 bg-background/40",
      )}
    >
      {d.priority ? (
        <span className="flex-none self-center text-primary" title="Приоритет">
          ⚑
        </span>
      ) : (
        <span className="w-3 flex-none" />
      )}
      <span className="flex-1">{d.text}</span>
      <span className={editIconClass} title="Редактировать">
        ✎
      </span>
      <span className={dateMetaClass}>{d.meta}</span>
    </div>
  );
}

function VisitCard({ visit, defaultExpanded }: { visit: Visit; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <b className="text-sm text-foreground">{visit.date}</b>
        <span
          className={cn(
            "rounded-md px-1.5 py-px text-xs font-medium",
            visit.type === "first"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {visit.type === "first" ? "Первичный" : "Повторный"}
        </span>
        <span className={doctorSectionSubtitleClass}>
          {visit.location} · {visit.duration}
          {visit.filesCount ? ` · 📎 ${visit.filesCount}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {expanded ? "свернуть ▴" : "развернуть ▾"}
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
          {visit.dynamics && visit.dynamics.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-foreground">Динамика симптомов</div>
              <div className="flex flex-col gap-1.5">
                {visit.dynamics.map((dyn) => (
                  <div key={dyn.id} className="rounded-md border border-border/70 bg-muted/15 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {dyn.priority ? <span className="text-primary">⚑</span> : null}
                      {dyn.label}
                      <span className="ml-auto font-bold text-primary">
                        {dyn.from}/10 → {dyn.to}/10
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-foreground">{dyn.note}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {visit.sections?.map((s) => (
            <div key={s.title} className="flex flex-col gap-0.5">
              <div className="text-xs font-semibold text-foreground">{s.title}</div>
              <div className="text-sm text-foreground">{s.body}</div>
            </div>
          ))}
          {visit.files && visit.files.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {visit.files.map((f) => (
                <span
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <span>{f.icon}</span>
                  <span>{f.name}</span>
                </span>
              ))}
              <span className={doctorSectionSubtitleClass}>— файлы, прикреплённые к визиту</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PatientTabKarta({ userId: _userId, header: _header }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);

  // TODO(backend): replace MOCK_* with real reads keyed by userId.
  const complaints = MOCK_COMPLAINTS;
  const diagnoses = MOCK_DIAGNOSES;
  const comorbidities = MOCK_COMORBIDITIES;
  const visits = MOCK_VISITS;

  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-[1.15fr_1fr]">
      {/* LEFT: clinical state (Карта) */}
      <div className={cn("flex flex-col gap-2.5 transition-all", panelOpen && "opacity-60 blur-[1px]")}>
        {/* Жалобы */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <h3 className={doctorSectionTitleClass}>Жалобы</h3>
              <button type="button" className={plusBtnClass} title="Добавить жалобу">
                +
              </button>
            </span>
            <span className={miniTabRowClass}>
              <MiniTab active>Актуальные</MiniTab>
              <MiniTab>История</MiniTab>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {complaints.map((c) => (
              <ComplaintRow key={c.id} c={c} />
            ))}
          </div>
          <p className={doctorSectionSubtitleClass}>
            ⚑ — приоритет · N/10 — выраженность (обновляется каждым визитом, по значениям строится
            график динамики) · ✎ — правка: снять / в историю
          </p>
        </section>

        {/* Актуальный диагноз */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <h3 className={doctorSectionTitleClass}>Актуальный диагноз</h3>
              <button type="button" className={plusBtnClass} title="Добавить диагноз">
                +
              </button>
            </span>
            <span className={miniTabRowClass}>
              <MiniTab active>Текущий</MiniTab>
              <MiniTab>История</MiniTab>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {diagnoses.map((d) => (
              <DiagnosisRow key={d.id} d={d} />
            ))}
          </div>
          <p className={doctorSectionSubtitleClass}>
            по клику на диагноз: уточнить · снять (уходит в историю с датой)
          </p>
        </section>

        {/* Сопутствующие заболевания */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <h3 className={doctorSectionTitleClass}>Сопутствующие заболевания</h3>
              <button type="button" className={plusBtnClass} title="Добавить">
                +
              </button>
            </span>
            <span className={miniTabRowClass}>
              <MiniTab active>Текущие</MiniTab>
              <MiniTab>Снятые</MiniTab>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {comorbidities.map((co) => (
              <div
                key={co.id}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 text-sm dark:border-amber-700/40 dark:bg-amber-950/20"
              >
                <span className="flex-none self-center text-amber-600 dark:text-amber-500">●</span>
                <span className="flex-1">{co.text}</span>
                <span className={editIconClass} title="Редактировать">
                  ✎
                </span>
                <span className={dateMetaClass}>{co.since}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Анамнез */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <h3 className={doctorSectionTitleClass}>Анамнез</h3>
            <span className={doctorSectionSubtitleClass}>клик по строке — правка</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Травмы и операции</span>
            <button type="button" className={plusBtnClass} title="Добавить">
              +
            </button>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="border-b border-border py-1 pr-2 font-medium">Год</th>
                <th className="border-b border-border py-1 pr-2 font-medium">Что</th>
                <th className="border-b border-border py-1 pr-2 font-medium">Тип</th>
                <th className="border-b border-border py-1 font-medium">Иммоб.</th>
              </tr>
              {MOCK_ANAMNESIS_TRAUMA.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="border-b border-border/50 py-1 pr-2">{r.year}</td>
                  <td className="border-b border-border/50 py-1 pr-2">{r.what}</td>
                  <td className="border-b border-border/50 py-1 pr-2">{r.type}</td>
                  <td className="border-b border-border/50 py-1">{r.immobilization}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Болезни, стрессы</span>
            <button type="button" className={plusBtnClass} title="Добавить">
              +
            </button>
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="border-b border-border py-1 pr-2 font-medium">Период</th>
                <th className="border-b border-border py-1 pr-2 font-medium">Что</th>
                <th className="border-b border-border py-1 font-medium">Комментарий</th>
              </tr>
              {MOCK_ANAMNESIS_ILLNESS.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="border-b border-border/50 py-1 pr-2">{r.period}</td>
                  <td className="border-b border-border/50 py-1 pr-2">{r.what}</td>
                  <td className="border-b border-border/50 py-1">{r.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Образ жизни</span>
            <button type="button" className={plusBtnClass} title="Добавить запись">
              +
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {MOCK_ANAMNESIS_LIFESTYLE.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 text-sm"
              >
                <div className={cn(doctorSectionSubtitleClass, "mb-0.5")}>Запись от {e.date}</div>
                {e.text}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* RIGHT: visits feed / new-visit panel */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h2 className={doctorSectionTitleClass}>История визитов</h2>
          <span className={doctorSectionSubtitleClass}>{visits.length} визитов</span>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="ml-auto rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          >
            + Новый визит
          </button>
          <button
            type="button"
            onClick={() => setHistoryVisible((v) => !v)}
            title={historyVisible ? "Скрыть историю — увидеть карту" : "Показать историю визитов"}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {historyVisible ? "◀" : "▶"}
          </button>
        </div>

        {panelOpen ? (
          <div className={historyVisible ? "grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" : ""}>
            {historyVisible ? (
              <div className="flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto opacity-70">
                {visits.map((v, i) => (
                  <VisitCard key={v.id} visit={v} defaultExpanded={i === 0} />
                ))}
              </div>
            ) : null}
            <div className="max-h-[78vh]">
              <NewVisitPanel activeComplaints={complaints} onClose={() => setPanelOpen(false)} />
            </div>
          </div>
        ) : historyVisible ? (
          <div className="flex flex-col gap-2.5">
            {visits.map((v, i) => (
              <VisitCard key={v.id} visit={v} defaultExpanded={i === 0} />
            ))}
            <p className={doctorSectionSubtitleClass}>
              История визитов — справа. «+ Новый визит» переключает экран в режим добавления: карта
              блюрится, справа выезжает панель визита. Стрелка ◀ скрывает историю — карта снова видна
              чётко рядом с формой.
            </p>
          </div>
        ) : (
          <p className={doctorSectionSubtitleClass}>
            История скрыта — карта видна слева. Нажмите ▶, чтобы вернуть историю визитов.
          </p>
        )}
      </div>
    </div>
  );
}
