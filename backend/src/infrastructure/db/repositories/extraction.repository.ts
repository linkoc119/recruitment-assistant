import type { ExtractionConfig, ResumeExtractionJob, TriggerSource } from "../../../domain/types/index.ts";
import { nextId, nowIso, tables, withLock } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

const LEASE_TTL_MS = 120_000;
const MAX_ATTEMPTS = 3;

/**
 * `resume_extraction_jobs` (extraction-jobs.md). Uniqueness is enforced at
 * write time: at most one `queued`/`running` row per `resume_id` globally.
 */
export class ExtractionRepository implements Repository<ResumeExtractionJob> {
  async findScoped(jobId: string, id: string): Promise<ResumeExtractionJob | null> {
    const job = tables.resume_extraction_jobs.get(id);
    return job && job.job_id === jobId ? job : null;
  }

  async list(jobId: string, predicate?: (item: ResumeExtractionJob) => boolean): Promise<ResumeExtractionJob[]> {
    const all = [...tables.resume_extraction_jobs.values()].filter((j) => j.job_id === jobId);
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(
    _tx: RepositoryTx,
    entity: ResumeExtractionJob,
    guard: (current: ResumeExtractionJob | null) => boolean,
  ): Promise<ResumeExtractionJob> {
    const current = tables.resume_extraction_jobs.get(entity.id) ?? null;
    if (!guard(current)) throw new Error("Extraction job write was rejected by its guard.");
    tables.resume_extraction_jobs.set(entity.id, entity);
    return entity;
  }

  withResumeLock<R>(resumeId: string, work: () => Promise<R>): Promise<R> {
    return withLock(`resume:${resumeId}`, work);
  }

  async findActiveForResume(resumeId: string): Promise<ResumeExtractionJob | null> {
    return (
      [...tables.resume_extraction_jobs.values()].find(
        (j) => j.resume_id === resumeId && (j.status === "queued" || j.status === "running"),
      ) ?? null
    );
  }

  async findLatestForResume(resumeId: string): Promise<ResumeExtractionJob | null> {
    const jobs = [...tables.resume_extraction_jobs.values()].filter((j) => j.resume_id === resumeId);
    if (jobs.length === 0) return null;
    return jobs.reduce((latest, j) => (j.created_at > latest.created_at ? j : latest));
  }

  /** Every queued-and-due or running-with-expired-lease job, across all jobs. For the worker poll loop. */
  async listDue(): Promise<ResumeExtractionJob[]> {
    const now = Date.now();
    return [...tables.resume_extraction_jobs.values()].filter(
      (j) =>
        (j.status === "queued" && Date.parse(j.available_at) <= now) ||
        (j.status === "running" && j.lease_expires_at !== null && Date.parse(j.lease_expires_at) <= now),
    );
  }

  /** Must be called under `withResumeLock`. */
  async enqueue(input: {
    jobId: string;
    resumeId: string;
    triggerSource: TriggerSource;
    config: ExtractionConfig;
  }): Promise<ResumeExtractionJob> {
    const id = nextId("resume_extraction_jobs");
    const now = nowIso();
    const job: ResumeExtractionJob = {
      id,
      job_id: input.jobId,
      resume_id: input.resumeId,
      trigger_source: input.triggerSource,
      status: "queued",
      extraction_config: input.config,
      attempts: 0,
      max_attempts: MAX_ATTEMPTS,
      available_at: now,
      lease_owner: null,
      lease_expires_at: null,
      lease_token: "0",
      snapshot_id: null,
      error_code: null,
      created_at: now,
      started_at: null,
      finished_at: null,
      updated_at: now,
    };
    tables.resume_extraction_jobs.set(id, job);
    return job;
  }

  /** Claims a due queued/expired-running row for `owner`. Returns null if not claimable. */
  async claim(id: string, owner: string): Promise<ResumeExtractionJob | null> {
    const job = tables.resume_extraction_jobs.get(id);
    if (!job) return null;
    const now = Date.now();
    const claimable =
      (job.status === "queued" && Date.parse(job.available_at) <= now) ||
      (job.status === "running" && job.lease_expires_at !== null && Date.parse(job.lease_expires_at) <= now);
    if (!claimable) return null;

    const claimed: ResumeExtractionJob = {
      ...job,
      status: "running",
      attempts: job.attempts + 1,
      lease_owner: owner,
      lease_expires_at: new Date(now + LEASE_TTL_MS).toISOString(),
      lease_token: String(Number(job.lease_token) + 1),
      started_at: job.started_at ?? new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
    tables.resume_extraction_jobs.set(id, claimed);
    return claimed;
  }

  async requeue(id: string, owner: string, leaseToken: string, availableAt: string): Promise<void> {
    const job = tables.resume_extraction_jobs.get(id);
    if (!job || job.lease_owner !== owner || job.lease_token !== leaseToken) return;
    tables.resume_extraction_jobs.set(id, {
      ...job,
      status: "queued",
      available_at: availableAt,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: nowIso(),
    });
  }

  async markSucceeded(id: string, owner: string, leaseToken: string, snapshotId: string): Promise<void> {
    const job = tables.resume_extraction_jobs.get(id);
    if (!job || job.lease_owner !== owner || job.lease_token !== leaseToken) return;
    const now = nowIso();
    tables.resume_extraction_jobs.set(id, {
      ...job,
      status: "succeeded",
      snapshot_id: snapshotId,
      lease_owner: null,
      lease_expires_at: null,
      finished_at: now,
      updated_at: now,
    });
  }

  async markFailed(id: string, owner: string, leaseToken: string, errorCode: string): Promise<void> {
    const job = tables.resume_extraction_jobs.get(id);
    if (!job || job.lease_owner !== owner || job.lease_token !== leaseToken) return;
    const now = nowIso();
    tables.resume_extraction_jobs.set(id, {
      ...job,
      status: "failed",
      error_code: errorCode,
      lease_owner: null,
      lease_expires_at: null,
      finished_at: now,
      updated_at: now,
    });
  }
}

export const extractionRepository = new ExtractionRepository();
