"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { apiJson } from "@/app/app/settings/bookingSoloAdminApi";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { Switch } from "@/shared/ui/doctor/primitives/switch";
import {
  formatMappingIssueLines,
  mappingRowBadgeLabel,
  mappingRowHasProblems,
  mappingRowStatusTone,
  problemsSummaryBanner,
} from "@/modules/rubitime-mapping/issueDisplay";
import type {
  RubitimeMappingRow,
  RubitimeSsaDuplicateGroup,
  RubitimeSsaDuplicateRow,
} from "@/modules/rubitime-mapping/types";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { getDoctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

const MAPPING_BASE = "/api/admin/booking-engine/rubitime-mapping";
const CATALOG_BASE = "/api/admin/booking-catalog";
const DUPLICATES_BASE = "/api/admin/booking-engine/rubitime-mapping/duplicates";

type CatalogBranch = { id: string; title: string; isActive: boolean };
type CatalogService = { id: string; title: string; durationMinutes: number; isActive: boolean };
type CatalogSpecialist = { id: string; branchId: string; fullName: string; isActive: boolean };
type CatalogBranchService = {
  id: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  rubitimeServiceId: string;
  isActive: boolean;
};

function duplicateGroupKey(group: Pick<RubitimeSsaDuplicateGroup, "branchId" | "serviceId" | "specialistId">): string {
  return `${group.branchId}:${group.serviceId}:${group.specialistId}`;
}

function formatIsoDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("ru-RU");
}

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function duplicateRowSummary(row: RubitimeSsaDuplicateRow): string {
  const mapping = row.hasMapping ? "есть связь Rubitime" : "без связи Rubitime";
  const state = row.isActive ? "включена" : "отключена";
  return `${mapping}, ${state}, создана ${formatIsoDate(row.createdAt)}`;
}

export function BookingRubitimeMappingSection() {
  const [rows, setRows] = useState<RubitimeMappingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mappedOk, setMappedOk] = useState(0);
  const [problems, setProblems] = useState(0);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<RubitimeMappingRow | null>(null);
  const [legacyBranches, setLegacyBranches] = useState<CatalogBranch[]>([]);
  const [legacyServices, setLegacyServices] = useState<CatalogService[]>([]);
  const [legacySpecialists, setLegacySpecialists] = useState<CatalogSpecialist[]>([]);
  const [legacyBranchServices, setLegacyBranchServices] = useState<CatalogBranchService[]>([]);
  const [legacyBranchId, setLegacyBranchId] = useState("");
  const [legacyServiceId, setLegacyServiceId] = useState("");
  const [legacySpecialistId, setLegacySpecialistId] = useState("");
  const [rubitimeServiceId, setRubitimeServiceId] = useState("");
  const [duplicateGroups, setDuplicateGroups] = useState<RubitimeSsaDuplicateGroup[]>([]);
  const [duplicateGroupsCount, setDuplicateGroupsCount] = useState(0);
  const [duplicateLoadError, setDuplicateLoadError] = useState<string | null>(null);
  const [duplicateActionError, setDuplicateActionError] = useState<string | null>(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [resolvingGroupKey, setResolvingGroupKey] = useState<string | null>(null);
  const [keepByGroupKey, setKeepByGroupKey] = useState<Record<string, string>>({});

  const loadCatalog = useCallback(async () => {
    const [bRes, sRes, spRes, bsRes] = await Promise.all([
      apiJson<{ ok: boolean; branches?: CatalogBranch[] }>(`${CATALOG_BASE}/branches`),
      apiJson<{ ok: boolean; services?: CatalogService[] }>(`${CATALOG_BASE}/services`),
      apiJson<{ ok: boolean; specialists?: CatalogSpecialist[] }>(`${CATALOG_BASE}/specialists`),
      apiJson<{ ok: boolean; branchServices?: CatalogBranchService[] }>(`${CATALOG_BASE}/branch-services`),
    ]);
    setLegacyBranches((bRes.branches ?? []).filter((b) => b.isActive));
    setLegacyServices((sRes.services ?? []).filter((s) => s.isActive));
    setLegacySpecialists((spRes.specialists ?? []).filter((s) => s.isActive));
    setLegacyBranchServices((bsRes.branchServices ?? []).filter((bs) => bs.isActive));
  }, []);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = problemsOnly ? "?problemsOnly=true" : "";
      const data = await apiJson<{
        ok: boolean;
        total: number;
        mappedOk: number;
        problems: number;
        rows: RubitimeMappingRow[];
      }>(`${MAPPING_BASE}${qs}`);
      setRows(data.rows);
      setTotal(data.total);
      setMappedOk(data.mappedOk);
      setProblems(data.problems);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [problemsOnly]);

  const loadDuplicates = useCallback(async () => {
    setDuplicatesLoading(true);
    setDuplicateLoadError(null);
    try {
      const data = await apiJson<{
        ok: boolean;
        totalGroups: number;
        groups: RubitimeSsaDuplicateGroup[];
      }>(DUPLICATES_BASE);
      setDuplicateGroups(data.groups);
      setDuplicateGroupsCount(data.totalGroups);
      setKeepByGroupKey((prev) => {
        const next: Record<string, string> = {};
        for (const group of data.groups) {
          const key = duplicateGroupKey(group);
          const existing = prev[key];
          const keepExists = group.rows.some((row) => row.ssaId === existing);
          next[key] = keepExists && existing ? existing : group.recommendedKeepSsaId;
        }
        return next;
      });
    } catch (e) {
      setDuplicateLoadError(e instanceof Error ? e.message : "duplicates_load_failed");
    } finally {
      setDuplicatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  const specialistsForBranch = useMemo(
    () => legacySpecialists.filter((s) => s.branchId === legacyBranchId),
    [legacySpecialists, legacyBranchId],
  );

  function openEdit(row: RubitimeMappingRow) {
    setEditRow(row);
    const existing = row.branchServiceId
      ? legacyBranchServices.find((bs) => bs.id === row.branchServiceId)
      : undefined;
    setLegacyBranchId(existing?.branchId ?? "");
    setLegacyServiceId(existing?.serviceId ?? "");
    setLegacySpecialistId(existing?.specialistId ?? "");
    setRubitimeServiceId(existing?.rubitimeServiceId ?? "");
    setActionError(null);
    setDialogOpen(true);
  }

  function saveLink() {
    if (!editRow) return;
    setActionError(null);
    startTransition(async () => {
      try {
        await apiJson(`${MAPPING_BASE}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: editRow.branchId,
            serviceId: editRow.serviceId,
            legacyBranchId,
            legacyServiceId,
            legacySpecialistId,
            rubitimeServiceId: rubitimeServiceId.trim(),
          }),
        });
        setDialogOpen(false);
        setEditRow(null);
        await loadMappings();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "link_failed");
      }
    });
  }

  async function resolveDuplicateGroup(group: RubitimeSsaDuplicateGroup) {
    const key = duplicateGroupKey(group);
    const keepSsaId = keepByGroupKey[key] ?? group.recommendedKeepSsaId;
    setDuplicateActionError(null);
    setResolvingGroupKey(key);
    try {
      await apiJson(`${DUPLICATES_BASE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: group.branchId,
          serviceId: group.serviceId,
          specialistId: group.specialistId,
          keepSsaId,
          transferMappingToKeep: true,
        }),
      });
      await Promise.all([loadMappings(), loadDuplicates()]);
    } catch (e) {
      setDuplicateActionError(e instanceof Error ? e.message : "duplicates_resolve_failed");
    } finally {
      setResolvingGroupKey(null);
    }
  }

  const problemsBanner = problemsSummaryBanner(problems);

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <DoctorSectionTitle>Связи локация × услуга</DoctorSectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={problemsOnly} onCheckedChange={setProblemsOnly} />
              <span className="text-muted-foreground">Только проблемы</span>
            </label>
            <Button variant="default" size="sm" onClick={() => void loadMappings()} disabled={loading}>
              {loading ? "Загрузка…" : "Обновить"}
            </Button>
          </div>
        </DoctorSectionHeader>

        <ul className="m-0 grid list-none gap-2 p-0 text-sm sm:grid-cols-3">
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Всего пар</span>
            <span className="font-semibold tabular-nums">{total}</span>
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Связано</span>
            <span className="font-semibold tabular-nums">{mappedOk}</span>
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Проблемы</span>
            <span className="font-semibold tabular-nums text-destructive">{problems}</span>
          </li>
        </ul>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        {problemsBanner ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {problemsBanner}
          </div>
        ) : null}

        {rows.length === 0 && !loading ? (
          <DoctorEmptyState>
            {problemsOnly ? "Нет проблемных связей." : "Нет пар локация × услуга с доступностью."}
          </DoctorEmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((row) => {
              const issueLines = formatMappingIssueLines(row);
              const hasProblems = mappingRowHasProblems(row);
              return (
                <li
                  key={`${row.branchId}:${row.serviceId}`}
                  className={cn(
                    getDoctorSectionItemClass(mappingRowStatusTone(row)),
                    "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {row.branchTitle} · {row.serviceTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.rubitimeBranchTitle ?? "—"} · {row.rubitimeSpecialistName ?? "—"} ·{" "}
                      {row.rubitimeServiceTitle ?? "—"}
                    </p>
                    {issueLines.length > 0 ? (
                      <ul
                        className="mt-2 list-none space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
                        aria-label="Проблемы связи"
                      >
                        {issueLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
                    <Badge variant={hasProblems ? "destructive" : "secondary"}>{mappingRowBadgeLabel(row)}</Badge>
                    <Button variant="default" size="sm" onClick={() => openEdit(row)}>
                      Настроить
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <DoctorSectionTitle>Повторяющиеся связи локация × услуга</DoctorSectionTitle>
          <div className="flex items-center gap-2">
            <Badge variant={duplicateGroupsCount > 0 ? "outline" : "secondary"}>
              {duplicateGroupsCount}{" "}
              {pluralizeRu(duplicateGroupsCount, "группа", "группы", "групп")}
            </Badge>
            <Button variant="default" size="sm" onClick={() => void loadDuplicates()} disabled={duplicatesLoading}>
              {duplicatesLoading ? "Загрузка…" : "Обновить"}
            </Button>
          </div>
        </DoctorSectionHeader>
        <p className="text-sm text-muted-foreground">
          Группа — это одна локация и услуга, для которых в базе есть несколько внутренних строк доступности. После
          очистки останется выбранная связь, остальные будут отключены.
        </p>

        {duplicateLoadError ? <p className="text-sm text-destructive">{duplicateLoadError}</p> : null}
        {duplicateActionError ? <p className="text-sm text-destructive">{duplicateActionError}</p> : null}

        {duplicateGroups.length === 0 && !duplicatesLoading ? (
          <DoctorEmptyState>Дубликаты не найдены.</DoctorEmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[940px] border-collapse text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Пара</th>
                  <th className="px-3 py-2 text-left font-medium">Найденные связи</th>
                  <th className="px-3 py-2 text-left font-medium">Какая связь останется</th>
                  <th className="px-3 py-2 text-right font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {duplicateGroups.map((group) => {
                  const key = duplicateGroupKey(group);
                  const selectedKeep = keepByGroupKey[key] ?? group.recommendedKeepSsaId;
                  const rowById = new Map(group.rows.map((row) => [row.ssaId, row]));
                  const selected = rowById.get(selectedKeep) ?? null;
                  const running = resolvingGroupKey === key;
                  return (
                    <tr key={key} className="border-t border-border/70 align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">
                          {group.branchTitle} · {group.serviceTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">{group.specialistName ?? "Без специалиста"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.rows.length}{" "}
                          {pluralizeRu(group.rows.length, "строка", "строки", "строк")} для одной пары
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="m-0 list-none space-y-1 p-0">
                          {group.rows.map((row) => (
                            <li key={row.ssaId} className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant={row.isActive ? "secondary" : "outline"}>
                                {row.isActive ? "Включена" : "Отключена"}
                              </Badge>
                              <Badge variant={row.hasMapping ? "secondary" : "outline"}>
                                {row.hasMapping ? "Есть связь Rubitime" : "Без связи Rubitime"}
                              </Badge>
                              {row.ssaId === group.recommendedKeepSsaId ? (
                                <Badge variant="outline">Рекомендуется оставить</Badge>
                              ) : null}
                              <span className="text-muted-foreground">{formatIsoDate(row.createdAt)}</span>
                              {row.rubitimeServiceId ? (
                                <span className="text-muted-foreground">Rubitime #{row.rubitimeServiceId}</span>
                              ) : null}
                              <span className="font-mono text-[11px] text-muted-foreground">ID {row.ssaId}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={selectedKeep}
                          onValueChange={(value) => {
                            if (!value) return;
                            setKeepByGroupKey((prev) => ({ ...prev, [key]: value }));
                            setDuplicateActionError(null);
                          }}
                        >
                          <SelectTrigger
                            displayLabel={
                              selected ? duplicateRowSummary(selected) : selectedKeep
                            }
                          >
                            <SelectValue placeholder="Выберите связь" />
                          </SelectTrigger>
                          <SelectContent>
                            {group.rows.map((row) => (
                              <SelectItem key={row.ssaId} value={row.ssaId} label={duplicateRowSummary(row)}>
                                {duplicateRowSummary(row)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={running}
                          onClick={() => void resolveDuplicateGroup(group)}
                        >
                          {running ? "Очищаю…" : "Очистить дубли"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DoctorSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Настроить связь Rubitime</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <p className="text-sm text-muted-foreground">
              {editRow.branchTitle} · {editRow.serviceTitle}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <Label>Rubitime филиал</Label>
              <Select value={legacyBranchId} onValueChange={(v) => setLegacyBranchId(v ?? "")}>
                <SelectTrigger
                  displayLabel={legacyBranches.find((b) => b.id === legacyBranchId)?.title}
                >
                  <SelectValue placeholder="Выберите филиал" />
                </SelectTrigger>
                <SelectContent>
                  {legacyBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rubitime специалист</Label>
              <Select
                value={legacySpecialistId}
                onValueChange={(v) => setLegacySpecialistId(v ?? "")}
                disabled={!legacyBranchId}
              >
                <SelectTrigger
                  displayLabel={specialistsForBranch.find((s) => s.id === legacySpecialistId)?.fullName}
                >
                  <SelectValue placeholder="Выберите специалиста" />
                </SelectTrigger>
                <SelectContent>
                  {specialistsForBranch.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rubitime услуга</Label>
              <Select value={legacyServiceId} onValueChange={(v) => setLegacyServiceId(v ?? "")}>
                <SelectTrigger displayLabel={legacyServices.find((s) => s.id === legacyServiceId)?.title}>
                  <SelectValue placeholder="Выберите услугу" />
                </SelectTrigger>
                <SelectContent>
                  {legacyServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} · {s.durationMinutes} мин
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rubitime-service-id">Rubitime service id</Label>
              <Input
                id="rubitime-service-id"
                value={rubitimeServiceId}
                onChange={(e) => setRubitimeServiceId(e.target.value)}
                placeholder="ID услуги в Rubitime"
              />
            </div>
            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isPending || !legacyBranchId || !legacyServiceId || !legacySpecialistId || !rubitimeServiceId.trim()}
              onClick={saveLink}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
