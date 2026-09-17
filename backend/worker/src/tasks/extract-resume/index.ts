import type { Candidate } from "@app/backend/domain/candidates";

export async function extractResume(_resumeId: string): Promise<Candidate> {
  throw new Error("not implemented");
}
