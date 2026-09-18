/**
 * Shared idempotency-key wiring for the write routes that own their
 * response body outright (`createJob`, `updateJob`, `saveCriteriaDraft`,
 * `suggestCriteria`, `approveCriteria`, `uploadResumeBatch`). `startRun` is
 * the one write op that already does this inside `domain/runs` (it needs
 * the lease held across a multi-step transaction), so it does not go
 * through this helper.
 */
import { idempotencyStore, fingerprintOf } from "../../infrastructure/idempotency/index.ts";
import { domainError, okJson } from "./errors.ts";

/**
 * Runs `work` under an idempotency key: replays the stored response for a
 * repeated key+payload, rejects a reused key with a different payload, and
 * persists the result of a fresh call before returning it.
 */
export async function withIdempotency(
  key: string,
  payload: unknown,
  status: number,
  work: () => Promise<unknown>,
): Promise<Response> {
  const fingerprint = fingerprintOf(payload);
  const result = await idempotencyStore.createOrReplay(key, fingerprint);

  if (result.outcome === "replay") {
    return okJson(result.status, result.body);
  }
  if (result.outcome === "conflict") {
    return domainError(result.code, "Idempotency conflict.");
  }

  try {
    const body = await work();
    await idempotencyStore.complete(key, result.owner, status, body);
    return okJson(status, body);
  } catch (err) {
    await idempotencyStore.releaseLease(key, result.owner);
    throw err;
  }
}
