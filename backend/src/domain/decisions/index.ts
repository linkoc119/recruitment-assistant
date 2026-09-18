/**
 * `domain/decisions` (CLS-02 `ReviewService`). Owns the ranking read-model
 * and the human-decision write path.
 *
 * Validation order for `recordDecision` (database-design.md:55):
 * association check → published pointer → expected_result_version → transition
 * validity + confirm_failed_mandatory → write.
 *
 * No-op replay: the exact same decision at the exact current version is allowed
 * and returns the existing screening unchanged. Any version mismatch → `stale_result`.
 */
import { DomainError, notFound } from "../errors.ts";
import { toCriterionDto } from "../dto/index.ts";
import type { CriteriaRepository } from "../../infrastructure/db/repositories/criteria.repository.ts";
import type { PositionRepository } from "../../infrastructure/db/repositories/position.repository.ts";
import type { ResumeRepository } from "../../infrastructure/db/repositories/resume.repository.ts";
import type { RunRepository } from "../../infrastructure/db/repositories/run.repository.ts";
import type { ScreeningRepository } from "../../infrastructure/db/repositories/screening.repository.ts";
import { StaleResultError } from "../../infrastructure/db/repositories/screening.repository.ts";
import type {
  DecisionStatus,
  Evidence,
  MatchStatus,
  Screening,
} from "../types/index.ts";

export interface DecisionDeps {
  positionRepo: PositionRepository;
  criteriaRepo: CriteriaRepository;
  resumeRepo: ResumeRepository;
  runRepo: RunRepository;
  screeningRepo: ScreeningRepository;
}

// ------------------------------------------------------------------- DTOs

export interface RankRowDto {
  result_id: string;
  resume_id: string;
  snapshot_id: string;
  candidate_id: string;
  candidate_name: string | null;
  file_name: string;
  resume_version: number;
  rank: number;
  passed_mandatory: boolean;
  displayed_total: string;
  status: DecisionStatus;
  result_version: number;
  failed_criteria: string[];
  matched_skills: string[];
  missing_skills: string[];
}

export interface RankingDto {
  job_id: string;
  run_id: string | null;
  criteria_revision: number | null;
  policy_version: string | null;
  is_current: boolean;
  decision_epoch: number;
  active_run_id: string | null;
  latest_criteria_revision: number | null;
  items: RankRowDto[];
  page: { offset: number; limit: number; total: number };
  failure_count: number;
  eligibility_counts: { passed: number; failed: number };
}

export interface CriterionMatchDto {
  criterion: ReturnType<typeof toCriterionDto>;
  match_status: MatchStatus;
  criterion_passed: boolean;
  reason_code: string;
  reason: string;
  score_contribution: string;
  displayed_contribution: string;
  evidence: Evidence[];
}

export interface ResultDetailDto {
  id: string;
  job_id: string;
  run_id: string;
  resume_id: string;
  snapshot_id: string;
  criteria_revision: number;
  resume_version: number;
  candidate: { id: string; full_name: string | null; email: string | null; phone: string | null };
  policy_version: string;
  result_version: number;
  status: DecisionStatus;
  decision_at: string | null;
  is_current: boolean;
  can_decide: boolean;
  rank: number;
  passed_mandatory: boolean;
  total_score: string;
  displayed_total: string;
  skill_score: string | null;
  experience_score: string | null;
  education_score: string | null;
  semantic_score: null;
  summary: string;
  experience: { normalization_version: string; as_of_date: string; supported_months: number } | null;
  criteria: CriterionMatchDto[];
}

export interface DecisionDto {
  result_id: string;
  run_id: string;
  status: DecisionStatus;
  result_version: number;
  decision_at: string | null;
}

export interface RankingQuery {
  run_id?: string;
  decision_epoch?: number;
  offset: number;
  limit: number;
}

export interface RecordDecisionInput {
  decision: "shortlisted" | "rejected";
  expected_result_version: number;
  confirm_failed_mandatory: boolean;
}

// ----------------------------------------------------------------- assemblers

async function assembleRankRow(
  deps: DecisionDeps,
  screening: Screening,
): Promise<RankRowDto | null> {
  const resume = await deps.resumeRepo.getResume(screening.resume_id);
  if (!resume) return null;
  const candidate = await deps.resumeRepo.getCandidate(resume.candidate_id);
  if (!candidate) return null;

  const details = await deps.screeningRepo.listDetails(screening.id);
  const requirements = await deps.criteriaRepo.listRequirements(screening.criteria_version_id);

  const failedCriteria: string[] = [];
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const detail of details) {
    const req = requirements.find((r) => r.id === detail.job_requirement_id);
    if (!req) continue;
    if (!detail.criterion_passed && req.req_type === "mandatory") {
      failedCriteria.push(req.criterion_key);
    }
    if (req.kind === "skill") {
      if (detail.status === "matched" || detail.status === "partial") {
        matchedSkills.push(req.canonical_skill_name ?? req.label);
      } else {
        missingSkills.push(req.canonical_skill_name ?? req.label);
      }
    }
  }

  return {
    result_id: screening.id,
    resume_id: screening.resume_id,
    snapshot_id: screening.snapshot_id,
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    file_name: resume.file_name,
    resume_version: resume.version,
    rank: screening.rank_in_job,
    passed_mandatory: screening.passed_mandatory,
    displayed_total: screening.displayed_total,
    status: screening.status,
    result_version: screening.result_version,
    failed_criteria: failedCriteria,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
  };
}

// ------------------------------------------------------------------ service

export async function queryRanking(
  deps: DecisionDeps,
  jobId: string,
  query: RankingQuery,
): Promise<RankingDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");

  const activeRun = await deps.runRepo.findActiveForJob(jobId);
  const approvedRevisions = await deps.criteriaRepo.listApproved(jobId);
  const latestRevision = approvedRevisions.length > 0 ? approvedRevisions[approvedRevisions.length - 1].revision : null;

  // No published run → return empty result.
  if (!job.published_run_id) {
    return {
      job_id: jobId,
      run_id: null,
      criteria_revision: null,
      policy_version: null,
      is_current: false,
      decision_epoch: 0,
      active_run_id: activeRun?.id ?? null,
      latest_criteria_revision: latestRevision,
      items: [],
      page: { offset: query.offset, limit: query.limit, total: 0 },
      failure_count: 0,
      eligibility_counts: { passed: 0, failed: 0 },
    };
  }

  const runId = query.run_id ?? job.published_run_id;
  const run = await deps.runRepo.findScoped(jobId, runId);
  if (!run) throw notFound("Run");

  // Pagination anti-scraping: if offset > 0, run_id + decision_epoch must match current.
  if (query.offset > 0 && (query.run_id !== undefined || query.decision_epoch !== undefined)) {
    if (query.run_id && query.run_id !== run.id) {
      throw new DomainError("page_changed", "Run has changed since the first page was fetched.");
    }
    if (query.decision_epoch !== undefined && query.decision_epoch !== run.decision_epoch) {
      throw new DomainError("page_changed", "Decision epoch has advanced since the first page was fetched.");
    }
  }

  const allScreenings = await deps.screeningRepo.listForRun(run.id);
  const isCurrent = job.published_run_id === run.id;

  // Sort: passed_mandatory DESC, displayed_total DESC, resume_id ASC numeric.
  const sorted = [...allScreenings].sort((a, b) => {
    if (a.passed_mandatory !== b.passed_mandatory) return a.passed_mandatory ? -1 : 1;
    const totalDiff = Number(b.displayed_total) - Number(a.displayed_total);
    if (totalDiff !== 0) return totalDiff;
    return Number(a.resume_id) - Number(b.resume_id);
  });

  const total = sorted.length;
  const page = sorted.slice(query.offset, query.offset + query.limit);
  const rows = (await Promise.all(page.map((s) => assembleRankRow(deps, s)))).filter((r): r is RankRowDto => r !== null);

  const criteriaVersion = (await import("../../infrastructure/db/store.ts")).tables.criteria_versions.get(run.criteria_version_id);
  const runItems = await deps.runRepo.listItems(run.id);
  const actualFailureCount = runItems.filter((i) => i.status === "failed").length;

  return {
    job_id: jobId,
    run_id: run.id,
    criteria_revision: criteriaVersion?.revision ?? null,
    policy_version: run.policy_version,
    is_current: isCurrent,
    decision_epoch: run.decision_epoch,
    active_run_id: activeRun?.id ?? null,
    latest_criteria_revision: latestRevision,
    items: rows,
    page: { offset: query.offset, limit: query.limit, total },
    failure_count: actualFailureCount,
    eligibility_counts: {
      passed: allScreenings.filter((s) => s.passed_mandatory).length,
      failed: allScreenings.filter((s) => !s.passed_mandatory).length,
    },
  };
}

export async function getResult(
  deps: DecisionDeps,
  ctx: { jobId: string; runId: string; resultId: string },
): Promise<ResultDetailDto> {
  const job = await deps.positionRepo.get(ctx.jobId);
  if (!job) throw notFound("Job");
  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run) throw notFound("Run");
  const screening = await deps.screeningRepo.getForRun(ctx.jobId, ctx.runId, ctx.resultId);
  if (!screening) throw notFound("Result");

  const resume = await deps.resumeRepo.getResume(screening.resume_id);
  if (!resume) throw notFound("Resume");
  const candidate = await deps.resumeRepo.getCandidate(resume.candidate_id);
  if (!candidate) throw notFound("Candidate");
  const snapshot = await deps.resumeRepo.getSnapshot(screening.resume_id, screening.snapshot_id);
  const details = await deps.screeningRepo.listDetails(screening.id);
  const requirements = await deps.criteriaRepo.listRequirements(screening.criteria_version_id);
  const criteriaVersion = await deps.criteriaRepo.findScoped(ctx.jobId, screening.criteria_version_id);

  const isCurrent = job.published_run_id === run.id;
  const canDecide = isCurrent && (screening.status === "scored" || screening.status === "shortlisted" || screening.status === "rejected");

  const criteriaMatches: CriterionMatchDto[] = details.map((detail) => {
    const req = requirements.find((r) => r.id === detail.job_requirement_id);
    return {
      criterion: req ? toCriterionDto(req) : { id: detail.job_requirement_id, criterion_key: detail.job_requirement_id, kind: "skill" as const, label: "", skill_id: null, canonical_skill_name: null, req_type: "preferred" as const, weight: "0", min_years: null, min_degree: null, source: "manual" as const, jd_evidence: [] },
      match_status: detail.status,
      criterion_passed: detail.criterion_passed,
      reason_code: detail.reason_code,
      reason: detail.reason,
      score_contribution: detail.score_contribution,
      displayed_contribution: detail.displayed_contribution,
      evidence: detail.evidence,
    };
  });

  return {
    id: screening.id,
    job_id: ctx.jobId,
    run_id: ctx.runId,
    resume_id: screening.resume_id,
    snapshot_id: screening.snapshot_id,
    criteria_revision: criteriaVersion?.revision ?? 0,
    resume_version: resume.version,
    candidate: { id: candidate.id, full_name: candidate.full_name, email: candidate.email, phone: candidate.phone },
    policy_version: run.policy_version,
    result_version: screening.result_version,
    status: screening.status,
    decision_at: screening.decision_at,
    is_current: isCurrent,
    can_decide: canDecide,
    rank: screening.rank_in_job,
    passed_mandatory: screening.passed_mandatory,
    total_score: screening.total_score,
    displayed_total: screening.displayed_total,
    skill_score: screening.skill_score,
    experience_score: screening.experience_score,
    education_score: screening.education_score,
    semantic_score: null,
    summary: screening.summary,
    experience: snapshot
      ? {
          normalization_version: snapshot.extraction.normalization_version,
          as_of_date: snapshot.extraction.as_of_date,
          supported_months: snapshot.extraction.supported_months,
        }
      : null,
    criteria: criteriaMatches,
  };
}

export async function recordDecision(
  deps: DecisionDeps,
  ctx: { jobId: string; runId: string; resultId: string },
  input: RecordDecisionInput,
): Promise<DecisionDto> {
  const job = await deps.positionRepo.get(ctx.jobId);
  if (!job) throw notFound("Job");

  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run) throw notFound("Run");

  const screening = await deps.screeningRepo.getForRun(ctx.jobId, ctx.runId, ctx.resultId);
  if (!screening) throw notFound("Result");

  // Published pointer check (BR-DEC-01): can only decide on the current published run.
  if (job.published_run_id !== run.id) {
    throw new DomainError("run_not_current", "Decisions can only be recorded on the currently published run.");
  }

  // Version check.
  if (screening.result_version !== input.expected_result_version) {
    // No-op replay: same decision at the exact same version is allowed.
    if (screening.status === input.decision && screening.result_version === input.expected_result_version) {
      return toDecisionDto(screening);
    }
    throw new StaleResultError();
  }

  // Transition validity (BR-DEC-05/06): only `scored` can be decided; already-decided at current version = replay.
  if (screening.status === input.decision) {
    return toDecisionDto(screening); // No-op: same state at same version.
  }
  if (screening.status === "shortlisted" || screening.status === "rejected") {
    throw new DomainError("decision_final", "This result has already been decided and cannot be changed.");
  }
  if (screening.status !== "scored") {
    throw new DomainError("invalid_request", `Cannot decide on a result with status '${screening.status}'.`);
  }

  // BR-DEC-03: shortlisting someone who failed mandatory requires explicit confirmation.
  if (input.decision === "shortlisted" && !screening.passed_mandatory && !input.confirm_failed_mandatory) {
    throw new DomainError("confirmation_required", "Candidate did not pass mandatory criteria. Set confirm_failed_mandatory: true to proceed.");
  }

  await deps.screeningRepo.transaction(ctx.jobId, async (tx) => {
    // Increment the run's decision_epoch to invalidate ranking page cursors.
    const latestRun = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
    if (latestRun) {
      const updatedRun = { ...latestRun, decision_epoch: latestRun.decision_epoch + 1 };
      await deps.runRepo.saveGuarded(tx, updatedRun, (c) => c !== null && c.decision_epoch === latestRun.decision_epoch);
    }
  });

  const updated = await deps.screeningRepo.recordDecision(ctx.resultId, input.expected_result_version, input.decision);
  return toDecisionDto(updated);
}

function toDecisionDto(screening: Screening): DecisionDto {
  return {
    result_id: screening.id,
    run_id: screening.run_id,
    status: screening.status as "shortlisted" | "rejected",
    result_version: screening.result_version,
    decision_at: screening.decision_at,
  };
}
