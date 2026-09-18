import { withLock } from "../store.ts";

/**
 * Transaction handle passed into `Repository.transaction`'s work function and
 * on to `saveGuarded`. In-memory stand-in for a DB transaction: it carries the
 * job scope the lock was acquired under so `saveGuarded` calls inside `work`
 * can assert they are writing within the same job.
 */
export interface RepositoryTx {
  readonly jobId: string;
}

/**
 * Runs `work` under the per-job async mutex (`store.ts` `withLock`), so two
 * overlapping calls scoped to the same job never interleave their guarded
 * writes. Different jobs run fully in parallel.
 */
export function runInTransaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
  return withLock(`job:${jobId}`, () => work({ jobId }));
}
