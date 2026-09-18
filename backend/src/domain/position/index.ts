/**
 * `domain/position` (CLS-02 `PositionService`, C3 CRIT). Owns `Job` CRUD and
 * `Readiness` — whether a position has an approved criteria set, at least one
 * parsed CV and no run already in flight.
 */
import { DomainError, notFound } from "../errors.ts";
import type { CriteriaRepository } from "../../infrastructure/db/repositories/criteria.repository.ts";
import type { PositionRepository } from "../../infrastructure/db/repositories/position.repository.ts";
import { StaleJobError } from "../../infrastructure/db/repositories/position.repository.ts";
import type { ResumeRepository } from "../../infrastructure/db/repositories/resume.repository.ts";
import type { RunRepository } from "../../infrastructure/db/repositories/run.repository.ts";
import type { Job, JobStatus, PageResult, Readiness } from "../types/index.ts";

export interface PositionDeps {
  positionRepo: PositionRepository;
  criteriaRepo: CriteriaRepository;
  resumeRepo: ResumeRepository;
  runRepo: RunRepository;
}

export interface JobDto {
  id: string;
  title: string;
  jd_raw_text: string;
  level: string | null;
  status: JobStatus;
  version: number;
  created_at: string;
  updated_at: string;
  criteria_revision: number | null;
  published_run_id: string | null;
  readiness: Readiness;
}

export interface JobListItemDto {
  id: string;
  title: string;
  level: string | null;
  status: JobStatus;
  created_at: string;
  ready_cv_count: number;
  published_run_id: string | null;
  active_run_id: string | null;
}

export interface CreateJobInput {
  title: string;
  level: string | null;
  jd_raw_text: string;
}

export interface UpdateJobInput {
  expected_version: number;
  title: string;
  jd_raw_text: string;
  level: string | null;
}

export interface ListJobsQuery {
  status?: JobStatus;
  offset: number;
  limit: number;
}

/** BR: computed fresh on every read, never persisted — cheap in-memory scans over a small position's rows. */
export async function computeReadiness(deps: PositionDeps, jobId: string): Promise<Readiness> {
  const approvedRevisions = await deps.criteriaRepo.listApproved(jobId);
  const approvedCriteria = approvedRevisions.length > 0;

  const resumes = await deps.resumeRepo.list(jobId);
  const readyCvCount = resumes.filter((r) => r.status === "parsed").length;

  const activeRun = await deps.runRepo.findActiveForJob(jobId);
  const activeRunId = activeRun?.id ?? null;

  const blockingCodes: Readiness["blocking_codes"] = [];
  if (!approvedCriteria) blockingCodes.push("criteria_not_approved");
  if (readyCvCount === 0) blockingCodes.push("no_ready_cv");
  if (activeRunId !== null) blockingCodes.push("active_run");

  return {
    approved_criteria: approvedCriteria,
    ready_cv_count: readyCvCount,
    active_run_id: activeRunId,
    can_start: blockingCodes.length === 0,
    blocking_codes: blockingCodes,
  };
}

async function assembleJob(deps: PositionDeps, job: Job): Promise<JobDto> {
  const readiness = await computeReadiness(deps, job.id);
  return {
    id: job.id,
    title: job.title,
    jd_raw_text: job.jd_raw_text,
    level: job.level,
    status: job.status,
    version: job.version,
    created_at: job.created_at,
    updated_at: job.updated_at,
    criteria_revision: job.criteria_revision,
    published_run_id: job.published_run_id,
    readiness,
  };
}

async function assembleJobListItem(deps: PositionDeps, job: Job): Promise<JobListItemDto> {
  const resumes = await deps.resumeRepo.list(job.id);
  const readyCvCount = resumes.filter((r) => r.status === "parsed").length;
  const activeRun = await deps.runRepo.findActiveForJob(job.id);
  return {
    id: job.id,
    title: job.title,
    level: job.level,
    status: job.status,
    created_at: job.created_at,
    ready_cv_count: readyCvCount,
    published_run_id: job.published_run_id,
    active_run_id: activeRun?.id ?? null,
  };
}

export async function createJob(deps: PositionDeps, input: CreateJobInput): Promise<JobDto> {
  const job = await deps.positionRepo.create(input);
  return assembleJob(deps, job);
}

export async function getJob(deps: PositionDeps, jobId: string): Promise<JobDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");
  return assembleJob(deps, job);
}

export async function listJobs(deps: PositionDeps, query: ListJobsQuery): Promise<PageResult<JobListItemDto>> {
  const { items, total } = await deps.positionRepo.listAll(query);
  const dtoItems = await Promise.all(items.map((job) => assembleJobListItem(deps, job)));
  return { items: dtoItems, page: { offset: query.offset, limit: query.limit, total } };
}

export async function updateJob(deps: PositionDeps, jobId: string, input: UpdateJobInput): Promise<JobDto> {
  const current = await deps.positionRepo.get(jobId);
  if (!current) throw notFound("Job");

  return deps.positionRepo.transaction(jobId, async (tx) => {
    if (current.version !== input.expected_version) {
      throw new StaleJobError();
    }
    const updated: Job = {
      ...current,
      title: input.title,
      jd_raw_text: input.jd_raw_text,
      level: input.level,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    };
    const saved = await deps.positionRepo.saveGuarded(
      tx,
      updated,
      (c) => c !== null && c.version === input.expected_version,
    );
    return assembleJob(deps, saved);
  });
}

export { DomainError };
