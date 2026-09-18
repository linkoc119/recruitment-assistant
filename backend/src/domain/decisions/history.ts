import type { components } from "@app/api-types";
import type { DecisionDeps } from "./index.ts";
import type { FileStore } from "../../infrastructure/files/index.ts";
import type { Screening } from "../types/index.ts";
import { DomainError, notFound } from "../errors.ts";
import { toCriterionDto } from "../dto/index.ts";

type Context = { jobId: string; runId: string; resultId: string };
type Schemas = components["schemas"];

async function resolveResult(deps: DecisionDeps, ctx: Context) {
  if (!await deps.positionRepo.get(ctx.jobId)) throw notFound("Result");
  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run || run.published_at === null) throw notFound("Result");
  const result = await deps.screeningRepo.getForRun(ctx.jobId, ctx.runId, ctx.resultId);
  if (!result) throw notFound("Result");
  const resume = await deps.resumeRepo.findScoped(ctx.jobId, result.resume_id);
  if (!resume) throw notFound("Result");
  const snapshot = await deps.resumeRepo.getSnapshot(resume.id, result.snapshot_id);
  // Missing archived source is an availability error; never fall back to latest.
  if (!snapshot) throw new DomainError("source_unavailable", "The selected source is unavailable.");
  return { result, resume, snapshot };
}

export async function getResultSource(deps: DecisionDeps, ctx: Context): Promise<Schemas["SourcePreview"]> {
  const { result, snapshot } = await resolveResult(deps, ctx);
  return { resume_id: result.resume_id, snapshot_id: snapshot.id, run_id: ctx.runId,
    result_id: ctx.resultId, raw_text: snapshot.raw_text,
    segments: snapshot.segments.map(s => ({ segment_id: s.segment_id, page: s.page, paragraph: s.paragraph,
      start_offset: s.start_offset, end_offset: s.end_offset, text: s.text })) };
}

export async function getResultFile(deps: DecisionDeps & { fileStore: FileStore }, ctx: Context) {
  const { resume } = await resolveResult(deps, ctx);
  let content: Uint8Array | null;
  try { content = await deps.fileStore.get(resume.object_key); }
  catch { throw new DomainError("source_unavailable", "The selected file is unavailable."); }
  const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!content || !allowed.includes(resume.media_type)) throw new DomainError("source_unavailable", "The selected file is unavailable.");
  return { content, mediaType: resume.media_type, fileName: resume.file_name };
}

function value(row?: Screening): Schemas["ComparisonValue"] {
  return row ? { present: true, result_id: row.id, rank: row.rank_in_job, displayed_total: row.displayed_total,
    passed_mandatory: row.passed_mandatory, status: row.status } :
    { present: false, result_id: null, rank: null, displayed_total: null, passed_mandatory: null, status: null };
}
function scoreDelta(left: string, right: string): string {
  const cents = (s: string) => { const [whole, fraction = ""] = s.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); };
  const delta = cents(right) - cents(left);
  const abs = delta < 0n ? -delta : delta;
  return `${delta < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
const numericCompare = (a: string, b: string) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;

export async function compareRuns(deps: DecisionDeps, jobId: string,
  query: { left_run_id: string; right_run_id: string; offset: number; limit: number }): Promise<Schemas["Comparison"]> {
  if (!await deps.positionRepo.get(jobId)) throw notFound("Job");
  const [leftRun, rightRun] = await Promise.all([
    deps.runRepo.findScoped(jobId, query.left_run_id), deps.runRepo.findScoped(jobId, query.right_run_id),
  ]);
  if (!leftRun || !rightRun) throw notFound("Run");
  if (leftRun.id === rightRun.id || !leftRun.published_at || !rightRun.published_at) {
    throw new DomainError("invalid_run_selection", "Select two distinct published runs in this position.");
  }
  // Both repository calls capture immutable row references synchronously in
  // this process, before yielding. Decision writes replace rows, never mutate.
  const [leftRows, rightRows, leftRequirements, rightRequirements] = await Promise.all([
    deps.screeningRepo.listForRun(leftRun.id), deps.screeningRepo.listForRun(rightRun.id),
    deps.criteriaRepo.listRequirements(leftRun.criteria_version_id), deps.criteriaRepo.listRequirements(rightRun.criteria_version_id),
  ]);
  const identity = (row: Screening) => `${row.resume_id}:${row.snapshot_id}`;
  const left = new Map(leftRows.map(row => [identity(row), row]));
  const right = new Map(rightRows.map(row => [identity(row), row]));
  const pairs = [...new Set([...left.keys(), ...right.keys()])].map(key => ({ key, row: (left.get(key) ?? right.get(key))! }))
    .sort((a, b) => numericCompare(a.row.resume_id, b.row.resume_id) || numericCompare(a.row.snapshot_id, b.row.snapshot_id));
  const items = pairs.slice(query.offset, query.offset + query.limit).map(({ key, row }) => {
    const l = left.get(key), r = right.get(key);
    return { resume_id: row.resume_id, snapshot_id: row.snapshot_id, left: value(l), right: value(r),
      score_delta: l && r ? scoreDelta(l.displayed_total, r.displayed_total) : null,
      rank_delta: l && r ? r.rank_in_job - l.rank_in_job : null,
      eligibility_changed: l && r ? r.passed_mandatory !== l.passed_mandatory : null };
  });
  const leftCriteria = new Map(leftRequirements.map(c => [c.criterion_key, toCriterionDto(c)]));
  const rightCriteria = new Map(rightRequirements.map(c => [c.criterion_key, toCriterionDto(c)]));
  const changed: Schemas["Comparison"]["changed_criteria"] = [];
  for (const key of [...new Set([...leftCriteria.keys(), ...rightCriteria.keys()])].sort()) {
    const l = leftCriteria.get(key), r = rightCriteria.get(key);
    if (!l || !r) { changed.push({ criterion_key: key, change: l ? "removed" : "added", fields: [] }); continue; }
    // Row IDs necessarily change between revisions; compare criterion content.
    const fields = (Object.keys(l) as (keyof typeof l)[]).filter(field => field !== "id" && field !== "criterion_key" && JSON.stringify(l[field]) !== JSON.stringify(r[field]));
    if (fields.length) changed.push({ criterion_key: key, change: "modified", fields });
  }
  return { job_id: jobId, left_run_id: leftRun.id, right_run_id: rightRun.id, items, changed_criteria: changed,
    page: { offset: query.offset, limit: query.limit, total: pairs.length } };
}
