/**
 * Repository port (CLS-02 `Repository<T>`) plus the concrete in-memory
 * aggregate repositories. Grouped by aggregate root rather than one file per
 * table — `position`/`criteria`/`resume`/`run`/`screening` — a deliberate,
 * smaller-file-count deviation from the plan text, since several tables
 * (e.g. `resumes` + `candidates` + `resume_snapshots`) are only ever read or
 * written together by one service.
 *
 * `findScoped`/`list` always take `job_id` first: every read is scoped to its
 * owning position, which is the mechanism that keeps one job's data from
 * leaking into another job's response (Q11).
 */

export type { RepositoryTx } from "./tx.ts";
export { PositionRepository, positionRepository } from "./position.repository.ts";
export { CriteriaRepository, criteriaRepository } from "./criteria.repository.ts";
export { SkillRepository, skillRepository } from "./skill.repository.ts";
export { ResumeRepository, resumeRepository } from "./resume.repository.ts";
export { ExtractionRepository, extractionRepository } from "./extraction.repository.ts";
export { RunRepository, runRepository } from "./run.repository.ts";
export { ScreeningRepository, screeningRepository } from "./screening.repository.ts";

/**
 * Generic shape every concrete repository conforms to, per CLS-02. `T` is the
 * aggregate's entity type; `job_id` scoping and the transaction/guard shape
 * are what BR/Q11 rely on for cross-job isolation and optimistic concurrency.
 */
export interface Repository<T> {
  findScoped(jobId: string, id: string): Promise<T | null>;
  list(jobId: string, predicate?: (item: T) => boolean): Promise<T[]>;
  transaction<R>(jobId: string, work: (tx: import("./tx.ts").RepositoryTx) => Promise<R>): Promise<R>;
  saveGuarded(tx: import("./tx.ts").RepositoryTx, entity: T, guard: (current: T | null) => boolean): Promise<T>;
}
