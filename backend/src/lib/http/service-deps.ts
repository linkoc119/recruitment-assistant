import { positionRepository, criteriaRepository, resumeRepository, extractionRepository, runRepository, screeningRepository, skillRepository } from "../../infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../infrastructure/ai/index.ts";
import { fileStore } from "../../infrastructure/files/index.ts";

/** Composition for history/source/recovery handlers; no business rules here. */
export const serviceDeps = { positionRepo: positionRepository, criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository, extractionRepo: extractionRepository, runRepo: runRepository,
  screeningRepo: screeningRepository, skillRepo: skillRepository, ai: aiExtractionService, fileStore };
