import { extractionRepository, runRepository } from "@app/backend/infrastructure/db/repositories";
import { runExtractResumeTask } from "./tasks/extract-resume/index.js";
import { runScreeningTask } from "./tasks/run-screening/index.js";

const POLL_INTERVAL_MS = 1000;

/**
 * One pass over due work: claims every due extraction job and every due
 * screening run, and drives each to completion.
 *
 * Caveat for the in-memory milestone: the repositories are a module-level
 * `Map` living in whichever process imported `@app/backend/infrastructure/db`
 * first. A worker started as its own `node` process would see an empty
 * store, not the API process's data — there is no shared Postgres yet for
 * two processes to rendezvous on. So this loop only does something useful
 * when driven in-process (e.g. called directly in a test, or from the same
 * process as the Next.js dev server). The claim/lease and task logic above
 * is real, independently unit-testable code; only cross-process delivery is
 * out of scope for this milestone.
 */
export async function pollOnce(): Promise<void> {
  const dueExtractions = await extractionRepository.listDue();
  for (const job of dueExtractions) {
    await runExtractResumeTask(job);
  }

  const dueRuns = await runRepository.listDue();
  for (const run of dueRuns) {
    await runScreeningTask(run);
  }
}

export async function startPollLoop(intervalMs = POLL_INTERVAL_MS): Promise<never> {
  for (;;) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startPollLoop();
}
