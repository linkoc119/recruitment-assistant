export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { CANONICAL_SKILLS } = await import("./infrastructure/ai/index.ts");
    const { skillRepository } = await import("./infrastructure/db/repositories/index.ts");
    for (const name of CANONICAL_SKILLS) await skillRepository.upsertByName(name);
    const { startInProcessWorker } = await import("../worker/src/runner.ts");
    startInProcessWorker();
  }
}
