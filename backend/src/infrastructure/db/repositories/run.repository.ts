import type {
  ItemStatus,
  PolicySnapshot,
  RunMode,
  RunStatus,
  ScreeningRun,
  ScreeningRunItem,
} from "../../../domain/types/index.ts";
import { nextId, nowIso, tables } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

const LEASE_TTL_MS = 120_000;

export class ActiveRunError extends Error {
  code = "active_run" as const;
}

export interface ListRunsQuery {
  publishedOnly?: boolean;
  offset: number;
  limit: number;
}

export interface ListRunItemsQuery {
  status?: ItemStatus;
  offset: number;
  limit: number;
}

export class RunRepository implements Repository<ScreeningRun> {
  async findScoped(jobId: string, id: string): Promise<ScreeningRun | null> {
    const run = tables.screening_runs.get(id);
    return run && run.job_id === jobId ? run : null;
  }

  async list(jobId: string, predicate?: (item: ScreeningRun) => boolean): Promise<ScreeningRun[]> {
    const all = [...tables.screening_runs.values()].filter((r) => r.job_id === jobId);
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(
    _tx: RepositoryTx,
    entity: ScreeningRun,
    guard: (current: ScreeningRun | null) => boolean,
  ): Promise<ScreeningRun> {
    const current = tables.screening_runs.get(entity.id) ?? null;
    if (!guard(current)) throw new Error("Screening run write was rejected by its guard.");
    tables.screening_runs.set(entity.id, entity);
    return entity;
  }

  async findActiveForJob(jobId: string): Promise<ScreeningRun | null> {
    return (
      [...tables.screening_runs.values()].find(
        (r) => r.job_id === jobId && (r.status === "queued" || r.status === "running"),
      ) ?? null
    );
  }

  async listForJob(jobId: string, query: ListRunsQuery): Promise<{ items: ScreeningRun[]; total: number }> {
    let all = [...tables.screening_runs.values()].filter((r) => r.job_id === jobId);
    if (query.publishedOnly) {
      const job = tables.jobs.get(jobId);
      all = all.filter((r) => r.id === job?.published_run_id);
    }
    all = all.sort((a, b) => b.round - a.round);
    const total = all.length;
    return { items: all.slice(query.offset, query.offset + query.limit), total };
  }

  /** Must be called under a job transaction that already checked no active run exists. */
  async create(input: {
    jobId: string;
    mode: RunMode;
    baseRunId: string | null;
    criteriaVersionId: string;
    policyVersion: string;
    policySnapshot: PolicySnapshot;
    idempotencyKey: string;
    payloadHash: string;
  }): Promise<ScreeningRun> {
    const priorRounds = [...tables.screening_runs.values()].filter((r) => r.job_id === input.jobId).map((r) => r.round);
    const round = priorRounds.length === 0 ? 1 : Math.max(...priorRounds) + 1;
    const id = nextId("screening_runs");
    const now = nowIso();
    const run: ScreeningRun = {
      id,
      job_id: input.jobId,
      round,
      mode: input.mode,
      base_run_id: input.baseRunId,
      criteria_version_id: input.criteriaVersionId,
      policy_version: input.policyVersion,
      policy_snapshot: input.policySnapshot,
      status: "queued",
      idempotency_key: input.idempotencyKey,
      payload_hash: input.payloadHash,
      lease_owner: null,
      lease_expires_at: null,
      lease_token: "0",
      error_code: null,
      created_at: now,
      started_at: null,
      finished_at: null,
      published_at: null,
      decision_epoch: 0,
    };
    tables.screening_runs.set(id, run);
    return run;
  }

  async claim(id: string, owner: string): Promise<ScreeningRun | null> {
    const run = tables.screening_runs.get(id);
    if (!run) return null;
    const now = Date.now();
    const claimable =
      (run.status === "queued") ||
      (run.status === "running" && run.lease_expires_at !== null && Date.parse(run.lease_expires_at) <= now);
    if (!claimable) return null;
    const claimed: ScreeningRun = {
      ...run,
      status: "running",
      lease_owner: owner,
      lease_expires_at: new Date(now + LEASE_TTL_MS).toISOString(),
      lease_token: String(Number(run.lease_token) + 1),
      started_at: run.started_at ?? new Date(now).toISOString(),
    };
    tables.screening_runs.set(id, claimed);
    return claimed;
  }

  /** Every queued or running-with-expired-lease run, across all jobs. For the worker poll loop. */
  async listDue(): Promise<ScreeningRun[]> {
    const now = Date.now();
    return [...tables.screening_runs.values()].filter(
      (r) =>
        r.status === "queued" ||
        (r.status === "running" && r.lease_expires_at !== null && Date.parse(r.lease_expires_at) <= now),
    );
  }

  async setStatus(id: string, owner: string, leaseToken: string, status: RunStatus, errorCode: string | null = null): Promise<void> {
    const run = tables.screening_runs.get(id);
    if (!run || run.lease_owner !== owner || run.lease_token !== leaseToken) return;
    const now = nowIso();
    tables.screening_runs.set(id, {
      ...run,
      status,
      error_code: errorCode,
      lease_owner: null,
      lease_expires_at: null,
      finished_at: now,
    });
  }

  async publish(jobId: string, runId: string): Promise<void> {
    const job = tables.jobs.get(jobId);
    if (!job) return;
    tables.jobs.set(jobId, { ...job, published_run_id: runId, updated_at: nowIso() });
    const run = tables.screening_runs.get(runId);
    if (run) {
      tables.screening_runs.set(runId, { ...run, published_at: nowIso() });
    }
  }

  // ---- screening_run_items ----

  async createItems(runId: string, jobId: string, resumeIds: string[]): Promise<ScreeningRunItem[]> {
    const items: ScreeningRunItem[] = resumeIds.map((resumeId) => ({
      run_id: runId,
      job_id: jobId,
      resume_id: resumeId,
      snapshot_id: null,
      extraction_job_id: null,
      status: "pending",
      attempts: 0,
      error_code: null,
      error_phase: null,
      updated_at: nowIso(),
    }));
    for (const item of items) {
      tables.screening_run_items.set(`${runId}:${item.resume_id}`, item);
    }
    return items;
  }

  async listItems(runId: string): Promise<ScreeningRunItem[]> {
    return [...tables.screening_run_items.values()].filter((i) => i.run_id === runId);
  }

  async listItemsPage(runId: string, query: ListRunItemsQuery): Promise<{ items: ScreeningRunItem[]; total: number }> {
    let all = (await this.listItems(runId)).sort((a, b) => Number(a.resume_id) - Number(b.resume_id));
    if (query.status) {
      all = all.filter((i) => i.status === query.status);
    }
    const total = all.length;
    return { items: all.slice(query.offset, query.offset + query.limit), total };
  }

  async updateItem(runId: string, resumeId: string, patch: Partial<ScreeningRunItem>): Promise<void> {
    const key = `${runId}:${resumeId}`;
    const item = tables.screening_run_items.get(key);
    if (!item) return;
    tables.screening_run_items.set(key, { ...item, ...patch, updated_at: nowIso() });
  }
}

export const runRepository = new RunRepository();
