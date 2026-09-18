import { pathToFileURL } from "node:url";
import { startInProcessWorker } from "./runner.ts";
export { pollOnce, startInProcessWorker } from "./runner.ts";

// A separate process has its own empty mock store. Next starts this runner
// through instrumentation inside the API process instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startInProcessWorker({ keepAlive: true });
}
