import type { LeaseToken } from "@app/backend/infrastructure/idempotency";

export async function acquireLease(_taskId: string): Promise<LeaseToken> {
  throw new Error("not implemented");
}

export async function releaseLease(_token: LeaseToken): Promise<void> {
  throw new Error("not implemented");
}
