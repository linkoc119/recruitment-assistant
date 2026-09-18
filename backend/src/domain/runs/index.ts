/**
 * `domain/runs` (CLS-02 `RunService`). Owns ScreeningRun lifecycle: start →
 * execute → publish, plus read-model helpers.
 *
 * BR-RUN-01: a run is immutable once created — items are frozen at `createItems`.
 * BR-RUN-02: at most one active run per job at a time.
 * BR-RSC-01: rescore copies the exact successful (resume_id, snapshot_id) pairs
 *            from the base run; `resume_ids` is forbidden on a rescore.
 * BR-RSC-02: rescore publishes only when every base item succeeded.
 */
import { DomainError, notFound } from "../errors.ts";
import { computeTotal, allocateDisplayed, type ScoreInputs } from "../scoring/index.ts";
import { toDecimalString } from "../scoring/rational.ts";
import type { CriteriaRepository } from "../../infrastructure/db/repositories/criteria.repository.ts";
import type { PositionRepository } from "../../infrastructure/db/repositories/position.repository.ts";
import type { ResumeRepository } from "../../infrastructure/db/repositories/resume.repository.ts";
import type { RunRepository } from "../../infrastructure/db/repositories/run.repository.ts";
import { ActiveRunError } from "../../infrastructure/db/repositories/run.repository.ts";
import type { ScreeningRepository } from "../../infrastructure/db/repositories/screening.repository.ts";
import type { SkillRepository } from "../../infrastructure/db/repositories/skill.repository.ts";
import type { IdempotencyStore } from "../../infrastructure/idempotency/index.ts";
import { fingerprintOf } from "../../infrastructure/idempotency/index.ts";
import type {
  DegreeLevel,
  ItemStatus,
  JobRequirement,
  MatchStatus,
  PolicySnapshot,
  RunMode,
  RunStatus,
  Screening,
  ScreeningRun,
  ScreeningRunItem,
} from "../types/index.ts";

export interface RunDeps {
  positionRepo: PositionRepository;
  criteriaRepo: CriteriaRepository;
  resumeRepo: ResumeRepository;
  runRepo: RunRepository;
  screeningRepo: ScreeningRepository;
  skillRepo: SkillRepository;
  idempotencyStore: IdempotencyStore;
}

const POLICY_VERSION = "policy-v1";

const POLICY_SNAPSHOT: PolicySnapshot = {
  version: POLICY_VERSION,
  group_weights: { skill: "0.55", experience: "0.30", education: "0.15" },
  match_values: { matched: "1", partial: "0.5", missing: "0" },
  degree_order: ["vocational", "college", "bachelor", "master", "doctorate"],
  rounding: "floor2+largest-remainder",
};

// ------------------------------------------------------------------- DTOs

export interface RunDto {
  id: string;
  job_id: string;
  round: number;
  mode: RunMode;
  base_run_id: string | null;
  criteria_revision: number;
  policy_version: string;
  status: RunStatus;
  counts: { total: number; pending: number; processing: number; succeeded: number; failed: number };
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  published_at: string | null;
  is_current: boolean;
  error_code: string | null;
}

export interface RunItemDto {
  resume_id: string;
  snapshot_id: string | null;
  status: ItemStatus;
  attempts: number;
  error_code: string | null;
  error_phase: string | null;
  result_id: string | null;
}

export interface StartRunInput {
  mode: RunMode;
  criteria_revision: number;
  resume_ids?: string[];
  base_run_id?: string;
}

// ----------------------------------------------------------------- assemblers

async function assembleRun(runRepo: RunRepository, run: ScreeningRun): Promise<RunDto> {
  const items = await runRepo.listItems(run.id);
  const counts = {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    processing: items.filter((i) => i.status === "processing").length,
    succeeded: items.filter((i) => i.status === "succeeded").length,
    failed: items.filter((i) => i.status === "failed").length,
  };
  const latestJob = (await import("../../infrastructure/db/store.ts")).tables.jobs.get(run.job_id);
  const isCurrent = latestJob?.published_run_id === run.id;

  const criteriaVersion = (await import("../../infrastructure/db/store.ts")).tables.criteria_versions.get(run.criteria_version_id);
  return {
    id: run.id,
    job_id: run.job_id,
    round: run.round,
    mode: run.mode,
    base_run_id: run.base_run_id,
    criteria_revision: criteriaVersion?.revision ?? 0,
    policy_version: run.policy_version,
    status: run.status,
    counts,
    created_at: run.created_at,
    started_at: run.started_at,
    finished_at: run.finished_at,
    published_at: run.published_at,
    is_current: isCurrent,
    error_code: run.error_code,
  };
}

async function assembleRunItem(screeningRepo: ScreeningRepository, item: ScreeningRunItem): Promise<RunItemDto> {
  const screenings = await screeningRepo.listForRun(item.run_id);
  const resultId = screenings.find((s) => s.resume_id === item.resume_id)?.id ?? null;
  return {
    resume_id: item.resume_id,
    snapshot_id: item.snapshot_id,
    status: item.status,
    attempts: item.attempts,
    error_code: item.error_code,
    error_phase: item.error_phase,
    result_id: resultId,
  };
}

// ------------------------------------------------------------------ service

export async function startRun(
  deps: RunDeps,
  jobId: string,
  input: StartRunInput,
  idempotencyKey: string,
): Promise<RunDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");

  // Check idempotency key first.
  const payloadHash = fingerprintOf({ jobId, ...input });
  const idempotencyResult = await deps.idempotencyStore.createOrReplay(idempotencyKey, payloadHash);
  if (idempotencyResult.outcome === "replay") {
    return idempotencyResult.body as RunDto;
  }
  if (idempotencyResult.outcome === "conflict") {
    throw new DomainError(idempotencyResult.code, "Idempotency conflict.");
  }
  const { owner } = idempotencyResult;

  try {
    const run = await deps.runRepo.transaction(jobId, async (_tx) => {
      const activeRun = await deps.runRepo.findActiveForJob(jobId);
      if (activeRun) throw new ActiveRunError();

      const criteriaVersion = await deps.criteriaRepo.getApproved(jobId, input.criteria_revision);
      if (!criteriaVersion) throw new DomainError("resource_not_found", "Criteria revision not found.");

      let resumeIds: string[];

      if (input.mode === "rescore") {
        if (input.resume_ids && input.resume_ids.length > 0) {
          throw new DomainError("invalid_run_selection", "resume_ids must not be specified for a rescore.");
        }
        if (!input.base_run_id) {
          throw new DomainError("invalid_run_selection", "base_run_id is required for a rescore.");
        }
        const baseRun = await deps.runRepo.findScoped(jobId, input.base_run_id);
        if (!baseRun) throw notFound("Base run");

        // BR-RSC-01: take exactly the successful (resume_id, snapshot_id) pairs.
        const baseItems = await deps.runRepo.listItems(input.base_run_id);
        const successfulItems = baseItems.filter((i) => i.status === "succeeded");
        if (successfulItems.length === 0) {
          throw new DomainError("invalid_run_selection", "Base run has no successful items to rescore.");
        }
        resumeIds = successfulItems.map((i) => i.resume_id);
      } else {
        // initial mode
        if (input.base_run_id) {
          throw new DomainError("invalid_run_selection", "base_run_id must not be specified for an initial run.");
        }
        const parsedResumes = await deps.resumeRepo.list(jobId, (r) => r.status === "parsed");
        if (input.resume_ids && input.resume_ids.length > 0) {
          // Validate all are parsed.
          for (const id of input.resume_ids) {
            const r = parsedResumes.find((pr) => pr.id === id);
            if (!r) throw new DomainError("invalid_run_selection", `Resume ${id} is not in parsed state or not in this job.`);
          }
          resumeIds = input.resume_ids;
        } else {
          resumeIds = parsedResumes.map((r) => r.id);
        }
        if (resumeIds.length === 0) {
          throw new DomainError("invalid_run_selection", "No parsed CVs available to start a run.");
        }
      }

      const newRun = await deps.runRepo.create({
        jobId,
        mode: input.mode,
        baseRunId: input.base_run_id ?? null,
        criteriaVersionId: criteriaVersion.id,
        policyVersion: POLICY_VERSION,
        policySnapshot: POLICY_SNAPSHOT,
        idempotencyKey,
        payloadHash,
      });

      await deps.runRepo.createItems(newRun.id, jobId, resumeIds);

      // For rescore: copy snapshot associations from the base run (no AI calls).
      if (input.mode === "rescore" && input.base_run_id) {
        const baseItems = await deps.runRepo.listItems(input.base_run_id);
        for (const baseItem of baseItems.filter((i) => i.status === "succeeded")) {
          await deps.runRepo.updateItem(newRun.id, baseItem.resume_id, {
            snapshot_id: baseItem.snapshot_id,
          });
        }
      }

      return newRun;
    });

    const dto = await assembleRun(deps.runRepo, run);
    await deps.idempotencyStore.complete(idempotencyKey, owner, 202, dto);
    return dto;
  } catch (err) {
    await deps.idempotencyStore.releaseLease(idempotencyKey, owner);
    throw err;
  }
}

/**
 * Executes a run under its lease: scores every pending item against the
 * criteria version frozen at `startRun`. The scoring is synchronous
 * (in-memory, mock AI already ran during extraction). For rescore mode the
 * snapshot is already set; for initial mode we look it up from the resume.
 */
export async function executeRun(
  deps: RunDeps,
  ctx: { jobId: string; runId: string },
  lease: { owner: string; leaseToken: string },
): Promise<void> {
  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run || run.lease_owner !== lease.owner || run.lease_token !== lease.leaseToken) return;

  const requirements = await deps.criteriaRepo.listRequirements(run.criteria_version_id);
  const items = await deps.runRepo.listItems(run.id);

  let anyError = false;
  for (const item of items.filter((i) => i.status === "pending")) {
    await deps.runRepo.updateItem(run.id, item.resume_id, { status: "processing", attempts: item.attempts + 1 });
    try {
      const snapshotId = item.snapshot_id ?? (await deps.resumeRepo.getLatestSnapshot(item.resume_id))?.id ?? null;
      if (!snapshotId) {
        throw new Error("No snapshot available for resume.");
      }
      const snapshot = await deps.resumeRepo.getLatestSnapshot(item.resume_id);
      if (!snapshot) throw new Error("Snapshot not found.");

      await deps.runRepo.updateItem(run.id, item.resume_id, { snapshot_id: snapshotId });

      await scoreItem(deps, run, item.resume_id, snapshot, requirements);
      await deps.runRepo.updateItem(run.id, item.resume_id, { status: "succeeded" });
    } catch (err) {
      anyError = true;
      await deps.runRepo.updateItem(run.id, item.resume_id, {
        status: "failed",
        error_code: "scoring_failed",
        error_phase: "scoring",
      });
    }
  }

  const finalStatus: RunStatus = anyError ? "completed_with_errors" : "completed";
  await deps.runRepo.setStatus(run.id, lease.owner, lease.leaseToken, finalStatus);
}

async function scoreItem(
  deps: RunDeps,
  run: ScreeningRun,
  resumeId: string,
  snapshot: { id: string; extraction: { supported_months: number; education: Array<{ degree_level: DegreeLevel | null }>; as_of_date: string } },
  requirements: JobRequirement[],
): Promise<void> {
  const skillFacts = await deps.resumeRepo.listSkillFacts(snapshot.id);

  // Build ScoreInputs from requirements + snapshot facts.
  const skillReqs = requirements.filter((r) => r.kind === "skill");
  const expReq = requirements.find((r) => r.kind === "experience") ?? null;
  const eduReq = requirements.find((r) => r.kind === "education") ?? null;

  const skillInputs = skillReqs.map((req) => {
    const fact = skillFacts.find((sf) => sf.canonical_name?.toLowerCase() === req.canonical_skill_name?.toLowerCase());
    let match: MatchStatus = "missing";
    if (fact) {
      match = fact.usage === "evidenced_use" ? "matched" : "partial";
    }
    return { id: req.id, weight: req.weight, reqType: req.req_type, match };
  });

  const expInput = expReq
    ? {
        id: expReq.id,
        reqType: expReq.req_type,
        minYears: expReq.min_years ?? "1",
        supportedMonths: snapshot.extraction.supported_months,
      }
    : null;

  const highestEdu = snapshot.extraction.education.length > 0
    ? snapshot.extraction.education.reduce((best: typeof snapshot.extraction.education[0] | null, e) => {
        if (!best || !best.degree_level) return e;
        if (!e.degree_level) return best;
        const bestIdx = ["vocational", "college", "bachelor", "master", "doctorate"].indexOf(best.degree_level);
        const eIdx = ["vocational", "college", "bachelor", "master", "doctorate"].indexOf(e.degree_level);
        return eIdx > bestIdx ? e : best;
      }, null)
    : null;

  const eduInput = eduReq
    ? {
        id: eduReq.id,
        reqType: eduReq.req_type,
        requiredDegree: eduReq.min_degree ?? "bachelor",
        candidateDegree: highestEdu?.degree_level ?? null,
      }
    : null;

  const scoreInputs: ScoreInputs = { skills: skillInputs, experience: expInput, education: eduInput };
  const scoreResult = computeTotal(scoreInputs);

  const { displayedTotal, contributions } = allocateDisplayed(
    scoreResult.criteria.map((c) => ({ criterionId: c.criterionId, contribution: c.contribution })),
    scoreResult.totalScore,
  );

  const screeningInput: Omit<Screening, "id"> = {
    run_id: run.id,
    job_id: run.job_id,
    resume_id: resumeId,
    criteria_version_id: run.criteria_version_id,
    snapshot_id: snapshot.id,
    total_score: toDecimalString(scoreResult.totalScore, 10).replace(/0+$/, "").replace(/\.$/, "") || "0",
    displayed_total: displayedTotal,
    skill_score: scoreResult.skillScore ? toDecimalString(scoreResult.skillScore, 10).replace(/0+$/, "").replace(/\.$/, "") || "0" : null,
    experience_score: scoreResult.experienceScore ? toDecimalString(scoreResult.experienceScore, 10).replace(/0+$/, "").replace(/\.$/, "") || "0" : null,
    education_score: scoreResult.educationScore ? toDecimalString(scoreResult.educationScore, 10).replace(/0+$/, "").replace(/\.$/, "") || "0" : null,
    semantic_score: null,
    passed_mandatory: scoreResult.passedMandatory,
    rank_in_job: 0, // placeholder; updated after all items scored
    summary: "",
    status: "scored",
    result_version: 1,
    decision_at: null,
    scored_round: run.round,
    is_latest: true,
    scored_at: new Date().toISOString(),
  };
  const screening = await deps.screeningRepo.create(screeningInput);

  // Persist per-criterion details.
  const details = scoreResult.criteria.map((c) => {
    const req = requirements.find((r) => r.id === c.criterionId);
    const contribution = contributions.find((ct) => ct.criterionId === c.criterionId);
    const skillFact = req?.kind === "skill"
      ? skillFacts.find((sf) => sf.canonical_name?.toLowerCase() === req.canonical_skill_name?.toLowerCase())
      : null;
    let match: MatchStatus = "missing";
    if (req?.kind === "skill" && skillFact) {
      match = skillFact.usage === "evidenced_use" ? "matched" : "partial";
    } else if (req?.kind === "experience") {
      match = scoreResult.experienceScore && Number(toDecimalString(scoreResult.experienceScore, 2)) > 0 ? "matched" : "missing";
    } else if (req?.kind === "education" && eduInput) {
      match = c.criterionPassed ? "matched" : (eduInput.candidateDegree ? "partial" : "missing");
    }

    return {
      criteria_version_id: run.criteria_version_id,
      job_requirement_id: c.criterionId,
      status: match,
      criterion_passed: c.criterionPassed,
      reason_code: c.criterionPassed ? "passed" : "failed",
      reason: c.criterionPassed ? "Criterion met." : "Criterion not met.",
      score_contribution: toDecimalString(c.contribution, 10).replace(/0+$/, "").replace(/\.$/, "") || "0",
      displayed_contribution: contribution?.displayed ?? "0.00",
      evidence: (req?.kind === "skill" && skillFact?.evidence) ? skillFact.evidence : [],
    };
  });
  await deps.screeningRepo.createDetails(screening.id, details);
}

export async function publishRun(
  deps: RunDeps,
  ctx: { jobId: string; runId: string },
  lease: { owner: string; leaseToken: string },
): Promise<void> {
  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run || run.status !== "completed") return;

  const items = await deps.runRepo.listItems(run.id);
  const successfulItems = items.filter((i) => i.status === "succeeded");

  // BR-RUN-04 (initial): at least one success required.
  // BR-RSC-02 (rescore): all base items must have succeeded.
  if (run.mode === "rescore") {
    const allSucceeded = items.length > 0 && items.every((i) => i.status === "succeeded");
    if (!allSucceeded) {
      await deps.runRepo.setStatus(run.id, lease.owner, lease.leaseToken, "failed", "rescore_partial_failure");
      return;
    }
  } else {
    if (successfulItems.length === 0) {
      await deps.runRepo.setStatus(run.id, lease.owner, lease.leaseToken, "failed", "no_successful_items");
      return;
    }
  }

  // Assign ranks: sort by passed_mandatory DESC, displayed_total DESC, resume_id ASC numeric.
  const screenings = await deps.screeningRepo.listForRun(run.id);
  const ranked = screenings
    .filter((s) => s.status === "scored")
    .sort((a, b) => {
      if (a.passed_mandatory !== b.passed_mandatory) return a.passed_mandatory ? -1 : 1;
      const totalDiff = Number(b.displayed_total) - Number(a.displayed_total);
      if (totalDiff !== 0) return totalDiff;
      return Number(a.resume_id) - Number(b.resume_id);
    });

  for (let i = 0; i < ranked.length; i++) {
    await deps.screeningRepo.setRank(ranked[i].id, i + 1);
  }

  await deps.runRepo.publish(ctx.jobId, run.id);
}

export async function listRunItems(
  deps: RunDeps,
  ctx: { jobId: string; runId: string },
  query: { status?: ItemStatus; offset: number; limit: number },
): Promise<{ items: RunItemDto[]; page: { offset: number; limit: number; total: number } }> {
  const job = await deps.positionRepo.get(ctx.jobId);
  if (!job) throw notFound("Job");
  const run = await deps.runRepo.findScoped(ctx.jobId, ctx.runId);
  if (!run) throw notFound("Run");
  const { items, total } = await deps.runRepo.listItemsPage(run.id, query);
  const dtoItems = await Promise.all(items.map((i) => assembleRunItem(deps.screeningRepo, i)));
  return { items: dtoItems, page: { offset: query.offset, limit: query.limit, total } };
}

export async function listRuns(deps: RunDeps, jobId: string, query: { offset: number; limit: number; published_only: boolean }) {
  if (!await deps.positionRepo.get(jobId)) throw notFound("Job");
  const { items, total } = await deps.runRepo.listForJob(jobId, { ...query, publishedOnly: query.published_only });
  return { items: await Promise.all(items.map(run => assembleRun(deps.runRepo, run))), page: { offset: query.offset, limit: query.limit, total } };
}

export async function getRun(deps: RunDeps, jobId: string, runId: string): Promise<RunDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");
  const run = await deps.runRepo.findScoped(jobId, runId);
  if (!run) throw notFound("Run");
  return assembleRun(deps.runRepo, run);
}
