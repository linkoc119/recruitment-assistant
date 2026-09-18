import { extractionRepository, runRepository } from "@app/backend/infrastructure/db/repositories";
import { processSingleton } from "@app/backend/infrastructure/runtime";
import { runExtractResumeTask } from "./tasks/extract-resume/index.ts";
import { runScreeningTask } from "./tasks/run-screening/index.ts";

type ErrorReporter = (error: unknown) => void;
const reportError: ErrorReporter = (error) => console.error("Worker task failed:", error);

/** Claims fence overlap; one failure must not starve other queued work. */
export async function pollOnce(onError: ErrorReporter = reportError): Promise<void> {
  for (const job of await extractionRepository.listDue()) {
    try { await runExtractResumeTask(job); } catch (error) { onError(error); }
  }
  for (const run of await runRepository.listDue()) {
    try { await runScreeningTask(run); } catch (error) { onError(error); }
  }
}

interface RunnerState { stop?: () => Promise<void> }
const state = processSingleton<RunnerState>("worker", () => ({}));

/** One non-overlapping loop across Next reloads; retries use subsequent polls.
 * Stop cancels the timer and waits for the current pass to finish.
 */
export function startInProcessWorker(options: {
  intervalMs?: number;
  keepAlive?: boolean;
  poll?: () => Promise<void>;
  onError?: ErrorReporter;
} = {}): () => Promise<void> {
  if (state.stop) return state.stop;
  const intervalMs = options.intervalMs ?? 250;
  if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new Error("Invalid worker interval");
  const onError = options.onError ?? reportError;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      active = Promise.resolve().then(options.poll ?? (() => pollOnce(onError)))
        .catch(onError).finally(schedule);
    }, intervalMs);
    if (!options.keepAlive) timer.unref();
  };
  const stop = async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
    if (state.stop === stop) delete state.stop;
  };
  state.stop = stop;
  schedule();
  return stop;
}
