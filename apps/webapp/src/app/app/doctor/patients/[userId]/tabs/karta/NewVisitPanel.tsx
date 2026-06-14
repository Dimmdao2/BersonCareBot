"use client";

/**
 * NewVisitPanel — slide-in «+ Новый визит» form (wireframe lines 402–531).
 * Toggle Первичный/Повторный, date/location/service/duration selects, complaint
 * rows (priority + severity), diagnosis rows with autocomplete look, and the
 * remaining textarea sections. Local state only; submit is a no-op.
 * TODO(backend): wire submit to create-visit endpoint.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DIAGNOSIS_SUGGESTIONS,
  VISIT_DATE_OPTIONS,
  VISIT_DURATION_OPTIONS,
  VISIT_LOCATION_OPTIONS,
  VISIT_SERVICE_OPTIONS,
  type Complaint,
} from "./mockData";

type VisitType = "first" | "repeat";

type FormComplaint = { id: string; priority: boolean; text: string; severity: number };

const chipSelectClass =
  "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground";
const fieldLabelClass = "text-xs font-semibold text-foreground";
const inputClass =
  "flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const textareaClass =
  "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-y";
const hintClass = "text-xs text-muted-foreground";

function PriorityFlag({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? "Приоритет: вкл" : "Приоритет: выкл"}
      className={cn("flex-none text-sm leading-none", on ? "text-primary" : "text-muted-foreground")}
    >
      ⚑
    </button>
  );
}

export function NewVisitPanel({
  activeComplaints,
  onClose,
}: {
  activeComplaints: Complaint[];
  onClose: () => void;
}) {
  const [visitType, setVisitType] = useState<VisitType>("first");
  const [date, setDate] = useState(VISIT_DATE_OPTIONS[0]);
  const [location, setLocation] = useState(VISIT_LOCATION_OPTIONS[0]);
  const [service, setService] = useState(VISIT_SERVICE_OPTIONS[0]);
  const [duration, setDuration] = useState(VISIT_DURATION_OPTIONS[0]);

  const [complaints, setComplaints] = useState<FormComplaint[]>([
    { id: "fc1", priority: true, text: "Бедро правое: боль ноющая после часа ходьбы", severity: 5 },
    {
      id: "fc2",
      priority: false,
      text: "Поясница (низ) слева: боль тянущая при нагрузках, ходьбе, наклонах",
      severity: 6,
    },
  ]);
  const [diagnoses, setDiagnoses] = useState<FormComplaint[]>([
    { id: "fd1", priority: true, text: "Трохантерит, тендинопатия средней ягодичной", severity: 0 },
    { id: "fd2", priority: false, text: "МФС квадратной мышцы поясницы справа", severity: 0 },
  ]);
  const [diagnosisDraft, setDiagnosisDraft] = useState("неспец");

  const addComplaint = () =>
    setComplaints((prev) => [
      ...prev,
      { id: `fc${Date.now()}`, priority: false, text: "", severity: 0 },
    ]);
  const addDiagnosis = () =>
    setDiagnoses((prev) => [
      ...prev,
      { id: `fd${Date.now()}`, priority: false, text: "", severity: 0 },
    ]);

  const handleSave = () => {
    // TODO(backend): submit visit { visitType, date, location, service, duration, complaints, diagnoses, ... }
    console.log("[NewVisitPanel] save (no-op)", { visitType, date, location, service, duration });
    onClose();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-primary/30 bg-card shadow-lg">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-primary/10 px-3.5 py-2.5">
        <span className="text-sm font-semibold text-foreground">Новый визит</span>
        <span className="flex gap-1">
          {(["first", "repeat"] as const).map((vt) => (
            <button
              key={vt}
              type="button"
              onClick={() => setVisitType(vt)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                visitType === vt
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {vt === "first" ? "Первичный" : "Повторный"}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть"
          className="order-last ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
        <span className="flex flex-wrap gap-1.5">
          <select value={date} onChange={(e) => setDate(e.target.value)} className={chipSelectClass}>
            {VISIT_DATE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={chipSelectClass}
          >
            {VISIT_LOCATION_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className={chipSelectClass}
          >
            {VISIT_SERVICE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={chipSelectClass}
          >
            {VISIT_DURATION_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </span>
      </div>
      <p className={cn(hintClass, "border-b border-border px-3.5 py-1.5")}>
        Если у пациента есть запись на сегодня — дата, локация, услуга и длительность подставляются из
        неё автоматически
      </p>

      {/* body (independently scrollable) */}
      <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {visitType === "first" ? (
          <>
            {/* Жалобы */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Жалобы</span>
                <button
                  type="button"
                  onClick={addComplaint}
                  title="Добавить жалобу"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {complaints.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <PriorityFlag
                      on={c.priority}
                      onToggle={() =>
                        setComplaints((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, priority: !x.priority } : x)),
                        )
                      }
                    />
                    <input
                      value={c.text}
                      onChange={(e) =>
                        setComplaints((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)),
                        )
                      }
                      className={inputClass}
                    />
                    <span className="flex flex-none items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={c.severity}
                        onChange={(e) =>
                          setComplaints((prev) =>
                            prev.map((x) =>
                              x.id === c.id ? { ...x, severity: Number(e.target.value) } : x,
                            ),
                          )
                        }
                        className="w-11 rounded-md border border-border bg-background px-1 py-1 text-center text-sm text-foreground"
                      />
                      /10
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setComplaints((prev) => prev.filter((x) => x.id !== c.id))
                      }
                      title="Удалить"
                      className="flex-none text-sm text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <p className={hintClass}>
                Каждая строка — жалоба-сущность с выраженностью 0–10: попадает в карту как
                «актуальная». Значение обновляется на каждом визите → график динамики. Enter —
                следующая, ⚑ — приоритет
              </p>
            </div>

            <FormTextarea label="Осмотр" placeholder="РДН ~1 см пр>лев, тест Адамса отрицательный..." minH="min-h-[54px]" />

            {/* Предварительный диагноз */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Предварительный диагноз</span>
                <button
                  type="button"
                  onClick={addDiagnosis}
                  title="Добавить диагноз"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {diagnoses.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <PriorityFlag
                      on={d.priority}
                      onToggle={() =>
                        setDiagnoses((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, priority: !x.priority } : x)),
                        )
                      }
                    />
                    <input
                      value={d.text}
                      onChange={(e) =>
                        setDiagnoses((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)),
                        )
                      }
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setDiagnoses((prev) => prev.filter((x) => x.id !== d.id))}
                      title="Удалить"
                      className="flex-none text-sm text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* autocomplete look */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex-none text-sm text-muted-foreground">⚑</span>
                    <input
                      value={diagnosisDraft}
                      onChange={(e) => setDiagnosisDraft(e.target.value)}
                      placeholder="Начните вводить — поиск по справочнику..."
                      className="flex-1 rounded-t-lg border border-primary bg-background px-2.5 py-1.5 text-sm text-foreground"
                    />
                    <span className="flex-none text-sm text-muted-foreground">✕</span>
                  </div>
                  {diagnosisDraft.trim().length > 0 ? (
                    <div className="mx-[19px] overflow-hidden rounded-b-lg border border-t-0 border-primary bg-background text-sm">
                      {DIAGNOSIS_SUGGESTIONS.map((s, idx) => (
                        <button
                          type="button"
                          key={s.text}
                          className={cn(
                            "flex w-full items-center gap-1 px-2.5 py-1.5 text-left hover:bg-primary/10",
                            idx === 0 && "bg-primary/10",
                            idx > 0 && "border-t border-border",
                          )}
                        >
                          <span className="font-semibold text-foreground">{s.text}</span>
                          <span className={hintClass}>· {s.meta}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="flex w-full items-center px-2.5 py-1.5 text-left font-medium text-primary hover:bg-primary/10 border-t border-border"
                      >
                        + Создать в справочнике: «{diagnosisDraft}…»
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className={hintClass}>
                Диагнозы — из справочника клинических диагнозов (не МКБ): автокомплит по вводу,
                новый создаётся в справочнике и переиспользуется у других пациентов
              </p>
            </div>

            <FormTextarea label="Проведённые манипуляции" placeholder="ФМ на область поясницы, трохантера, ягодицы" />
            <FormTextarea label="Результаты пробного лечения" placeholder="Уменьшение боли в наклоне" />
            <FormTextarea label="Рекомендации / Назначения" placeholder="ЛФК, курс 3 сеанса фасциальных манипуляций" />
          </>
        ) : (
          <>
            {/* Динамика симптомов — по актуальным жалобам */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Динамика симптомов — по актуальным жалобам</span>
              <div className="flex flex-col gap-2">
                {activeComplaints.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border bg-muted/15 p-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {c.priority ? <span className="text-primary">⚑</span> : null}
                      <span>{c.text}</span>
                      <span className="ml-auto">{c.since}</span>
                    </div>
                    <textarea
                      className={cn(textareaClass, "mt-1.5 min-h-[40px]")}
                      placeholder="Боли реже и меньше — после 2 часов ходьбы..."
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        Выраженность: <span>было {c.severity}/10</span> →
                        <input
                          type="number"
                          min={0}
                          max={10}
                          defaultValue={c.severity}
                          className="w-11 rounded-md border border-border bg-background px-1 py-1 text-center text-sm text-foreground"
                        />
                        /10
                      </span>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" /> Решена — снять
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Новая жалоба"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </button>
                <span className={hintClass}>новая жалоба, появившаяся к этому визиту</span>
              </div>
            </div>

            <FormTextarea label="Осмотр" placeholder="Наклон вперёд болезненный на 30 град (на 2 балла)..." minH="min-h-[54px]" />

            {/* Уточнение диагноза — по текущим */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Уточнение диагноза — по текущим</span>
              <div className="flex flex-col gap-2">
                {diagnoses.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border bg-muted/15 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {d.priority ? <span className="text-primary">⚑</span> : null}
                      <span>{d.text}</span>
                    </div>
                    <input
                      placeholder="Уточнение (из справочника)..."
                      className={cn(inputClass, "mt-1.5 w-full")}
                    />
                    <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" /> Снять диагноз
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Новый диагноз"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </button>
                <span className={hintClass}>новый диагноз — из справочника</span>
              </div>
            </div>

            <FormTextarea label="Проведённые манипуляции" placeholder="Сухая игла на область сух прав БЯМ..." />
            <FormTextarea label="Рекомендации / Назначения — коррекция" placeholder="Продолжаем программу ЛФК для ТБС, акцент на ягодичный мост..." />
          </>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-3.5 py-2.5">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Сохранить визит
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
        >
          📎 Прикрепить файлы
        </button>
        <span className={cn(hintClass, "ml-auto")}>
          Пустые секции не сохраняются и не показываются в ленте
        </span>
      </div>
    </div>
  );
}

function FormTextarea({
  label,
  placeholder,
  minH = "min-h-[38px]",
}: {
  label: string;
  placeholder: string;
  minH?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>{label}</span>
      <textarea className={cn(textareaClass, minH)} placeholder={placeholder} />
    </div>
  );
}
