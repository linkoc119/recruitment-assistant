import type { RunTask } from "@app/backend/domain/runs";

export async function runScreening(_task: RunTask): Promise<void> {
  throw new Error("not implemented");
}
