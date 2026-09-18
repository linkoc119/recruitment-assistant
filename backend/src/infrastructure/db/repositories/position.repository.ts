import type { Job, JobStatus } from "../../../domain/types/index.ts";
import { nextId, nowIso, tables } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

export interface ListJobsQuery {
  status?: JobStatus;
  offset: number;
  limit: number;
}

export class PositionRepository implements Repository<Job> {
  async findScoped(jobId: string, id: string): Promise<Job | null> {
    if (jobId !== id) return null;
    return tables.jobs.get(id) ?? null;
  }

  /** `Job` has no owning aggregate above it, so `list` ignores `jobId` scoping. */
  async list(_jobId: string, predicate?: (item: Job) => boolean): Promise<Job[]> {
    const all = [...tables.jobs.values()];
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(_tx: RepositoryTx, entity: Job, guard: (current: Job | null) => boolean): Promise<Job> {
    const current = tables.jobs.get(entity.id) ?? null;
    if (!guard(current)) {
      throw new StaleJobError();
    }
    tables.jobs.set(entity.id, entity);
    return entity;
  }

  async get(id: string): Promise<Job | null> {
    return tables.jobs.get(id) ?? null;
  }

  async listAll(query: ListJobsQuery): Promise<{ items: Job[]; total: number }> {
    let all = [...tables.jobs.values()].sort((a, b) => Number(a.id) - Number(b.id));
    if (query.status) {
      all = all.filter((job) => job.status === query.status);
    }
    const total = all.length;
    const items = all.slice(query.offset, query.offset + query.limit);
    return { items, total };
  }

  async create(input: { title: string; level: string | null; jd_raw_text: string }): Promise<Job> {
    const id = nextId("jobs");
    const now = nowIso();
    const job: Job = {
      id,
      title: input.title,
      level: input.level,
      jd_raw_text: input.jd_raw_text,
      status: "draft",
      criteria_revision: null,
      published_run_id: null,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    tables.jobs.set(id, job);
    return job;
  }
}

export class StaleJobError extends Error {
  code = "stale_job" as const;
  constructor() {
    super("Job version does not match the expected version.");
  }
}

export const positionRepository = new PositionRepository();
