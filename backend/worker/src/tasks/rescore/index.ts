import { runScreeningTask } from "../run-screening/index.ts";

/**
 * Rescore runs are driven by the exact same claim → executeRun → publishRun
 * path as an initial run: `RunMode` dispatch (reuse frozen snapshots, skip AI
 * calls) happens inside `domain/runs` itself, keyed off the run's own `mode`
 * field. This alias exists so the worker's task registry can route the
 * `rescore` trigger to a distinctly-named task.
 */
export const rescoreTask = runScreeningTask;
