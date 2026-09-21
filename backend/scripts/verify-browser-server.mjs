// Test-only Next entrypoint: delay one real worker item so reload during
// processing is repeatable. No production flag, route or artificial UI state.
// Run from the backend workspace after `npm run build`.
// Type `hold` before starting a run, then `release` after checking its reload.
import next from 'next';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { runRepository } from '../src/infrastructure/db/repositories/index.ts';
import { startInProcessWorker } from '../worker/src/runner.ts';

let holdNext = false;
let release;
const updateItem = runRepository.updateItem.bind(runRepository);
runRepository.updateItem = async (...args) => {
  await updateItem(...args);
  if (holdNext && args[2].status === 'processing') {
    holdNext = false;
    await new Promise(resolve => {
      // Shorter than the real 120-second lease; no permanent hung worker.
      const timeout = setTimeout(() => { release = undefined; resolve(); }, 90_000);
      release = () => { clearTimeout(timeout); release = undefined; resolve(); };
      console.log(`Held run ${args[0]} at processing; type release to continue (90s safety timeout).`);
    });
  }
};
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  if (line.trim() === 'hold') { holdNext = true; console.log('Next processing item will pause.'); }
  if (line.trim() === 'release') release?.();
});
// Start first: Next instrumentation reuses this process singleton. Routes
// and this worker use the same in-memory tables, just like the normal server.
const stop = startInProcessWorker({ keepAlive: true });
const port = Number(process.env.PORT ?? 3101);
const app = next({ dev: false, hostname: '127.0.0.1', port });
await app.prepare();
const server = createServer(app.getRequestHandler());
server.listen(port, '127.0.0.1', () => console.log(`Browser verification server: http://127.0.0.1:${port}`));
process.on('SIGINT', async () => { release?.(); input.close(); await stop(); server.close(); await app.close(); process.exit(0); });
