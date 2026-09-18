import type { DecisionStatus, Screening, ScreeningDetail } from "../../../domain/types/index.ts";
import { nextId, nowIso, tables } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

export class StaleResultError extends Error {
  code = "stale_result" as const;
}

export class ScreeningRepository implements Repository<Screening> {
  async findScoped(jobId: string, id: string): Promise<Screening | null> {
    const screening = tables.screenings.get(id);
    return screening && screening.job_id === jobId ? screening : null;
  }

  async list(jobId: string, predicate?: (item: Screening) => boolean): Promise<Screening[]> {
    const all = [...tables.screenings.values()].filter((s) => s.job_id === jobId);
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(_tx: RepositoryTx, entity: Screening, guard: (current: Screening | null) => boolean): Promise<Screening> {
    const current = tables.screenings.get(entity.id) ?? null;
    if (!guard(current)) throw new StaleResultError();
    tables.screenings.set(entity.id, entity);
    return entity;
  }

  async listForRun(runId: string): Promise<Screening[]> {
    return [...tables.screenings.values()].filter((s) => s.run_id === runId);
  }

  async getForRun(jobId: string, runId: string, resultId: string): Promise<Screening | null> {
    const s = tables.screenings.get(resultId);
    return s && s.job_id === jobId && s.run_id === runId ? s : null;
  }

  async create(input: Omit<Screening, "id">): Promise<Screening> {
    const id = nextId("screenings");
    const screening: Screening = { ...input, id };
    tables.screenings.set(id, screening);
    return screening;
  }

  async setRank(id: string, rank: number): Promise<void> {
    const s = tables.screenings.get(id);
    if (!s) return;
    tables.screenings.set(id, { ...s, rank_in_job: rank });
  }

  /** Optimistic-concurrency decision write. `guard` sees the pre-write row. */
  async recordDecision(
    id: string,
    expectedResultVersion: number,
    decision: DecisionStatus,
  ): Promise<Screening> {
    const current = tables.screenings.get(id);
    if (!current) throw new Error("Screening not found.");
    if (current.result_version !== expectedResultVersion) {
      // No-op replay: identical decision already at the *current* version is allowed by the caller
      // before this method is reached; reaching here with a version mismatch is always stale.
      throw new StaleResultError();
    }
    const updated: Screening = {
      ...current,
      status: decision,
      decision_at: nowIso(),
      result_version: current.result_version + 1,
    };
    tables.screenings.set(id, updated);
    return updated;
  }

  // ---- screening_details ----

  async createDetails(screeningId: string, details: Omit<ScreeningDetail, "id" | "screening_id">[]): Promise<ScreeningDetail[]> {
    const saved: ScreeningDetail[] = [];
    for (const detail of details) {
      const id = nextId("screening_details");
      const full: ScreeningDetail = { ...detail, id, screening_id: screeningId };
      tables.screening_details.set(id, full);
      saved.push(full);
    }
    return saved;
  }

  async listDetails(screeningId: string): Promise<ScreeningDetail[]> {
    return [...tables.screening_details.values()].filter((d) => d.screening_id === screeningId);
  }
}

export const screeningRepository = new ScreeningRepository();
