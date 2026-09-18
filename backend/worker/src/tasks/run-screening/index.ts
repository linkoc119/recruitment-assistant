import { randomUUID } from "node:crypto";
import { executeRun, publishRun, type RunDeps } from "@app/backend/domain/runs";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
  skillRepository,
} from "@app/backend/infrastructure/db/repositories";
import { idempotencyStore } from "@app/backend/infrastructure/idempotency";

const deps: RunDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
  skillRepo: skillRepository,
  idempotencyStore,
};

/**
 * Claims one due `screening_runs` row and drives it through scoring and
 * publication. `executeRun`/`publishRun` already dispatch on `run.mode`
 * internally (a rescore reuses frozen snapshots and skips AI calls), so this
 * same task body serves both `initial` and `rescore` runs — see
 * `tasks/rescore` for the alias used by the rescore trigger.
 * Returns `false` if the run was no longer claimable (already taken, or not due).
 */
export async function runScreeningTask(run: { id: string; job_id: string }): Promise<boolean> {
  const owner = randomUUID();
  const claimed = await runRepository.claim(run.id, owner);
  if (!claimed) return false;

  const lease = { owner, leaseToken: claimed.lease_token };
  const ctx = { jobId: run.job_id, runId: run.id };
  await executeRun(deps, ctx, lease);
  await publishRun(deps, ctx, lease);
  return true;
}
