/**
 * The 14-table in-memory store (`sang-loc-xep-hang-v2.dbml`). This is the only
 * place raw `Map`s live; every repository in `./repositories/*` reads/writes
 * through here. There is no real Postgres in this round (accepted scope).
 */
import type {
  Candidate,
  CriteriaVersion,
  Job,
  JobRequirement,
  PositionResume,
  Resume,
  ResumeExtractionJob,
  ResumeSkill,
  ResumeSnapshot,
  Screening,
  ScreeningDetail,
  ScreeningRun,
  ScreeningRunItem,
  Skill,
} from "../../domain/types/index.ts";

export interface Tables {
  jobs: Map<string, Job>;
  criteria_versions: Map<string, CriteriaVersion>;
  job_requirements: Map<string, JobRequirement>;
  skills: Map<string, Skill>;
  candidates: Map<string, Candidate>;
  resumes: Map<string, Resume>;
  position_resumes: Map<string, PositionResume>; // key = `${job_id}:${resume_id}`
  resume_snapshots: Map<string, ResumeSnapshot>;
  resume_extraction_jobs: Map<string, ResumeExtractionJob>;
  resume_skills: Map<string, ResumeSkill>;
  screening_runs: Map<string, ScreeningRun>;
  screening_run_items: Map<string, ScreeningRunItem>; // key = `${run_id}:${resume_id}`
  screenings: Map<string, Screening>;
  screening_details: Map<string, ScreeningDetail>;
}

export function createTables(): Tables {
  return {
    jobs: new Map(),
    criteria_versions: new Map(),
    job_requirements: new Map(),
    skills: new Map(),
    candidates: new Map(),
    resumes: new Map(),
    position_resumes: new Map(),
    resume_snapshots: new Map(),
    resume_extraction_jobs: new Map(),
    resume_skills: new Map(),
    screening_runs: new Map(),
    screening_run_items: new Map(),
    screenings: new Map(),
    screening_details: new Map(),
  };
}

/** Process-wide store singleton — the in-memory stand-in for a database. */
export const tables: Tables = createTables();

/** Resets every table. Test-only; never called from application code. */
export function resetTables(): void {
  for (const key of Object.keys(tables) as (keyof Tables)[]) {
    (tables[key] as Map<unknown, unknown>).clear();
  }
  idCounters.clear();
}

const idCounters = new Map<keyof Tables, number>();

/** Monotonic positive-integer ids as strings, matching the `Id` schema `^[1-9][0-9]*$`. */
export function nextId(table: keyof Tables): string {
  const current = idCounters.get(table) ?? 0;
  const next = current + 1;
  idCounters.set(table, next);
  return String(next);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A per-key async mutex. `screening_runs`/`resume_extraction_jobs` claims and
 * job-scoped writes serialize through this so two overlapping async domain
 * calls in the same Node process cannot interleave inside a guarded write —
 * the in-memory analogue of a row lock. Real cross-process locking is out of
 * scope (accepted: in-memory repositories, single process).
 */
const chains = new Map<string, Promise<void>>();

export function withLock<R>(key: string, work: () => Promise<R>): Promise<R> {
  const prior = chains.get(key) ?? Promise.resolve();
  const run = prior.then(work, work);
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
