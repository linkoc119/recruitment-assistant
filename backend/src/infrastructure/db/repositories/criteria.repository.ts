import type { CriteriaVersion, JobRequirement } from "../../../domain/types/index.ts";
import { nextId, nowIso, tables } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

export class StaleDraftError extends Error {
  code = "stale_draft" as const;
}
export class StaleCriteriaError extends Error {
  code = "stale_criteria" as const;
}
export class StaleJobVersionError extends Error {
  code = "stale_job" as const;
}

export class CriteriaRepository implements Repository<CriteriaVersion> {
  async findScoped(jobId: string, id: string): Promise<CriteriaVersion | null> {
    const version = tables.criteria_versions.get(id);
    return version && version.job_id === jobId ? version : null;
  }

  async list(jobId: string, predicate?: (item: CriteriaVersion) => boolean): Promise<CriteriaVersion[]> {
    const all = [...tables.criteria_versions.values()].filter((v) => v.job_id === jobId);
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(
    _tx: RepositoryTx,
    entity: CriteriaVersion,
    guard: (current: CriteriaVersion | null) => boolean,
  ): Promise<CriteriaVersion> {
    const current = tables.criteria_versions.get(entity.id) ?? null;
    if (!guard(current)) {
      throw new StaleDraftError();
    }
    tables.criteria_versions.set(entity.id, entity);
    return entity;
  }

  /** The one active (unapproved) draft for a job, creating it if none exists yet. */
  async getOrCreateDraft(jobId: string, jobVersion: string, jdSnapshot: string): Promise<CriteriaVersion> {
    const existing = [...tables.criteria_versions.values()].find((v) => v.job_id === jobId && v.approved_at === null);
    if (existing) return existing;

    const approvedRevisions = [...tables.criteria_versions.values()].filter(
      (v) => v.job_id === jobId && v.approved_at !== null,
    );
    const baseRevision = approvedRevisions.reduce((max, v) => Math.max(max, v.revision), 0);

    const id = nextId("criteria_versions");
    const now = nowIso();
    const draft: CriteriaVersion = {
      id,
      job_id: jobId,
      revision: 0,
      jd_snapshot: jdSnapshot,
      dictionary_version: "dict-v1",
      approved_at: null,
      created_at: now,
      draft_version: 1,
      base_revision: baseRevision,
      job_version: Number(jobVersion),
      updated_at: now,
    };
    tables.criteria_versions.set(id, draft);
    return draft;
  }

  async getDraft(jobId: string): Promise<CriteriaVersion | null> {
    return [...tables.criteria_versions.values()].find((v) => v.job_id === jobId && v.approved_at === null) ?? null;
  }

  async listApproved(jobId: string): Promise<CriteriaVersion[]> {
    return [...tables.criteria_versions.values()]
      .filter((v) => v.job_id === jobId && v.approved_at !== null)
      .sort((a, b) => a.revision - b.revision);
  }

  async getApproved(jobId: string, revision: number): Promise<CriteriaVersion | null> {
    return (
      [...tables.criteria_versions.values()].find(
        (v) => v.job_id === jobId && v.approved_at !== null && v.revision === revision,
      ) ?? null
    );
  }

  // ---- job_requirements ----

  async listRequirements(criteriaVersionId: string): Promise<JobRequirement[]> {
    return [...tables.job_requirements.values()].filter((r) => r.criteria_version_id === criteriaVersionId);
  }

  /** Replaces the full requirement set for a draft (saveDraft is a full overwrite). */
  replaceRequirements(criteriaVersionId: string, requirements: Omit<JobRequirement, "id" | "criteria_version_id">[]): JobRequirement[] {
    for (const [key, req] of tables.job_requirements) {
      if (req.criteria_version_id === criteriaVersionId) {
        tables.job_requirements.delete(key);
      }
    }
    const saved: JobRequirement[] = [];
    for (const req of requirements) {
      const id = nextId("job_requirements");
      const full: JobRequirement = { ...req, id, criteria_version_id: criteriaVersionId };
      tables.job_requirements.set(id, full);
      saved.push(full);
    }
    return saved;
  }
}

export const criteriaRepository = new CriteriaRepository();
