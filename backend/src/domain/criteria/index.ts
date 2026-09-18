/**
 * `domain/criteria` (CLS-02 `CriteriaService`). Owns the single active draft
 * per job (`CriteriaVersion.approved_at === null`) and its approval into an
 * immutable revision. Zod schemas (Phase 4) only check shape; every
 * business-rule and cross-field check (BR-CRI-01..05) lives here.
 *
 * Validation order for both `saveDraft` and `approve`, per the plan:
 * `stale_job` -> `stale_criteria` -> `stale_draft` -> `invalid_criteria`.
 *
 * Approval does not create a new `CriteriaVersion` row — it flips the
 * existing draft row's `approved_at`/`revision` fields in place. That row
 * then becomes the frozen revision, and the next `saveDraft` naturally
 * creates a brand-new draft row (via `getOrCreateDraft`) because `getDraft`
 * finds nothing unapproved.
 */
import { DomainError, notFound } from "../errors.ts";
import { toCriterionDto, type CriterionDto } from "../dto/index.ts";
import { segmentText } from "../text/index.ts";
import { ZERO, cmp, fromDecimal } from "../scoring/rational.ts";
import type { CriteriaRepository } from "../../infrastructure/db/repositories/criteria.repository.ts";
import { StaleCriteriaError, StaleDraftError, StaleJobVersionError } from "../../infrastructure/db/repositories/criteria.repository.ts";
import type { PositionRepository } from "../../infrastructure/db/repositories/position.repository.ts";
import type { SkillRepository } from "../../infrastructure/db/repositories/skill.repository.ts";
import type { AiExtractionService } from "../../infrastructure/ai/index.ts";
import type { CriteriaVersion, DegreeLevel, CriterionSource, Evidence, Job, JobRequirement, RequirementKind, RequirementType } from "../types/index.ts";

export interface CriteriaDeps {
  positionRepo: PositionRepository;
  criteriaRepo: CriteriaRepository;
  skillRepo: SkillRepository;
  ai: AiExtractionService;
}

export interface CriterionInputDto {
  criterion_key: string;
  kind: RequirementKind;
  label: string;
  skill_id: string | null;
  req_type: RequirementType;
  weight: string;
  min_years: string | null;
  min_degree: DegreeLevel | null;
  source: CriterionSource;
  jd_evidence: Evidence[];
}

export interface CriteriaDraftDto {
  id: string;
  job_id: string;
  version: number;
  base_revision: number;
  job_version: number;
  jd_snapshot: string;
  criteria: CriterionDto[];
  updated_at: string;
}

export interface CriteriaRevisionDto {
  id: string;
  job_id: string;
  revision: number;
  jd_snapshot: string;
  dictionary_version: string;
  approved_at: string;
  criteria: CriterionDto[];
}

export interface SuggestedCriterionDto {
  criterion_key: string;
  kind: RequirementKind;
  label: string;
  skill_id: string | null;
  req_type: RequirementType;
  weight: string;
  min_years: string | null;
  min_degree: DegreeLevel | null;
  source: CriterionSource;
  jd_evidence: Evidence[];
}

export interface SuggestionsDto {
  job_id: string;
  job_version: number;
  schema_version: string;
  model_version: string;
  criteria: SuggestedCriterionDto[];
  warnings: string[];
}

export interface SaveDraftInput {
  expected_draft_version: number;
  expected_revision: number;
  expected_job_version: number;
  criteria: CriterionInputDto[];
}

export interface ApproveInput {
  expected_draft_version: number;
  expected_revision: number;
  expected_job_version: number;
}

async function requireJob(deps: CriteriaDeps, jobId: string): Promise<Job> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");
  return job;
}

async function currentApprovedRevision(deps: CriteriaDeps, jobId: string): Promise<number> {
  const approved = await deps.criteriaRepo.listApproved(jobId);
  return approved.reduce((max, v) => Math.max(max, v.revision), 0);
}

async function assembleDraft(deps: CriteriaDeps, draft: CriteriaVersion): Promise<CriteriaDraftDto> {
  const requirements = await deps.criteriaRepo.listRequirements(draft.id);
  return {
    id: draft.id,
    job_id: draft.job_id,
    version: draft.draft_version,
    base_revision: draft.base_revision,
    job_version: draft.job_version,
    jd_snapshot: draft.jd_snapshot,
    criteria: requirements.map(toCriterionDto),
    updated_at: draft.updated_at,
  };
}

async function assembleRevision(deps: CriteriaDeps, revision: CriteriaVersion): Promise<CriteriaRevisionDto> {
  const requirements = await deps.criteriaRepo.listRequirements(revision.id);
  return {
    id: revision.id,
    job_id: revision.job_id,
    revision: revision.revision,
    jd_snapshot: revision.jd_snapshot,
    dictionary_version: revision.dictionary_version,
    approved_at: revision.approved_at as string,
    criteria: requirements.map(toCriterionDto),
  };
}

/** BR-CRI-02/03 structural checks, enforced at `saveDraft` time (not deferred to approval). */
function validateCriteriaStructure(criteria: CriterionInputDto[]): string | null {
  const experienceCount = criteria.filter((c) => c.kind === "experience").length;
  if (experienceCount > 1) return "At most one experience criterion is allowed.";
  const educationCount = criteria.filter((c) => c.kind === "education").length;
  if (educationCount > 1) return "At most one education criterion is allowed.";

  for (const c of criteria) {
    if (c.kind === "experience") {
      if (c.min_years === null || cmp(fromDecimal(c.min_years), ZERO) <= 0) {
        return "An experience criterion requires min_years greater than 0.";
      }
    }
    if (c.kind === "education" && c.min_degree === null) {
      return "An education criterion requires min_degree.";
    }
  }

  const seenSkillIds = new Set<string>();
  for (const c of criteria) {
    if (c.kind !== "skill" || c.skill_id === null) continue;
    if (seenSkillIds.has(c.skill_id)) return "Duplicate skill criteria are not allowed.";
    seenSkillIds.add(c.skill_id);
  }
  return null;
}

async function toRequirements(
  deps: CriteriaDeps,
  criteria: CriterionInputDto[],
): Promise<Omit<JobRequirement, "id" | "criteria_version_id">[]> {
  const result: Omit<JobRequirement, "id" | "criteria_version_id">[] = [];
  for (const c of criteria) {
    const skill = c.skill_id ? await deps.skillRepo.findScoped("", c.skill_id) : null;
    result.push({
      criterion_key: c.criterion_key,
      kind: c.kind,
      skill_id: c.skill_id,
      canonical_skill_name: skill?.name ?? null,
      label: c.label,
      req_type: c.req_type,
      weight: c.weight,
      min_years: c.min_years,
      min_degree: c.min_degree,
      source: c.source,
      jd_evidence: c.jd_evidence,
    });
  }
  return result;
}

export async function getDraft(deps: CriteriaDeps, jobId: string): Promise<CriteriaDraftDto> {
  await requireJob(deps, jobId);
  const draft = await deps.criteriaRepo.getDraft(jobId);
  if (!draft) throw new DomainError("draft_not_found", "No active draft exists for this job.");
  return assembleDraft(deps, draft);
}

export async function saveDraft(deps: CriteriaDeps, jobId: string, input: SaveDraftInput): Promise<CriteriaDraftDto> {
  await requireJob(deps, jobId);

  return deps.criteriaRepo.transaction(jobId, async (tx) => {
    const job = await deps.positionRepo.get(jobId);
    if (!job) throw notFound("Job");
    if (job.version !== input.expected_job_version) throw new StaleJobVersionError();

    const currentRevision = await currentApprovedRevision(deps, jobId);
    if (currentRevision !== input.expected_revision) throw new StaleCriteriaError();

    const existingDraft = await deps.criteriaRepo.getDraft(jobId);
    const currentDraftVersion = existingDraft?.draft_version ?? 0;
    if (currentDraftVersion !== input.expected_draft_version) throw new StaleDraftError();

    const structuralError = validateCriteriaStructure(input.criteria);
    if (structuralError) throw new DomainError("invalid_criteria", structuralError);

    const now = new Date().toISOString();
    let draft: CriteriaVersion;
    if (!existingDraft) {
      draft = await deps.criteriaRepo.getOrCreateDraft(jobId, String(job.version), job.jd_raw_text);
    } else {
      const updated: CriteriaVersion = {
        ...existingDraft,
        jd_snapshot: job.jd_raw_text,
        job_version: job.version,
        draft_version: existingDraft.draft_version + 1,
        updated_at: now,
      };
      draft = await deps.criteriaRepo.saveGuarded(
        tx,
        updated,
        (c) => c !== null && c.draft_version === existingDraft.draft_version && c.approved_at === null,
      );
    }

    const requirements = await toRequirements(deps, input.criteria);
    deps.criteriaRepo.replaceRequirements(draft.id, requirements);

    return assembleDraft(deps, draft);
  });
}

export async function suggest(deps: CriteriaDeps, jobId: string, input: { expected_job_version: number }): Promise<SuggestionsDto> {
  const job = await requireJob(deps, jobId);
  if (job.version !== input.expected_job_version) throw new StaleJobVersionError();

  const segments = segmentText(job.jd_raw_text);
  const result = await deps.ai.extractJd({ jobId, segments });

  const warnings: string[] = [];
  const seenKeys = new Set<string>();
  const criteria: SuggestedCriterionDto[] = [];
  let skillIndex = 0;
  let sawExperience = false;
  let sawEducation = false;

  for (const fact of result.criteria) {
    if (fact.kind === "experience") {
      if (sawExperience) continue; // BR-CRI-02: at most one experience criterion.
      sawExperience = true;
    }
    if (fact.kind === "education") {
      if (sawEducation) continue; // BR-CRI-02: at most one education criterion.
      sawEducation = true;
    }

    let reqType: RequirementType = "preferred";
    if (fact.requirement_type === "mandatory" || fact.requirement_type === "preferred") {
      reqType = fact.requirement_type;
    } else {
      warnings.push(`Requirement type not specified for "${fact.label}"; defaulting to preferred.`);
    }

    let skillId: string | null = null;
    if (fact.kind === "skill" && fact.skill_name) {
      const skill = await deps.skillRepo.findByCanonicalName(fact.skill_name);
      skillId = skill?.id ?? null;
    }

    if (fact.kind === "experience" && fact.min_years === null) {
      warnings.push("Minimum years not detected for the experience criterion.");
    }

    const baseKey = fact.kind === "skill" ? `skill-${slugify(fact.skill_name ?? fact.label)}` : fact.kind;
    let criterionKey = baseKey;
    let suffix = 1;
    while (seenKeys.has(criterionKey)) {
      criterionKey = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    seenKeys.add(criterionKey);
    if (fact.kind === "skill") skillIndex += 1;

    criteria.push({
      criterion_key: criterionKey,
      kind: fact.kind,
      label: fact.label,
      skill_id: skillId,
      req_type: reqType,
      weight: "0",
      min_years: fact.min_years === null ? null : String(fact.min_years),
      min_degree: fact.min_degree,
      source: "ai",
      jd_evidence: fact.evidence,
    });
  }

  return {
    job_id: job.id,
    job_version: job.version,
    schema_version: result.schema_version,
    model_version: "mock-v1",
    criteria,
    warnings,
  };
}

export async function approve(deps: CriteriaDeps, jobId: string, input: ApproveInput): Promise<CriteriaRevisionDto> {
  await requireJob(deps, jobId);

  return deps.criteriaRepo.transaction(jobId, async (tx) => {
    const job = await deps.positionRepo.get(jobId);
    if (!job) throw notFound("Job");
    if (job.version !== input.expected_job_version) throw new StaleJobVersionError();

    const currentRevision = await currentApprovedRevision(deps, jobId);
    if (currentRevision !== input.expected_revision) throw new StaleCriteriaError();

    const draft = await deps.criteriaRepo.getDraft(jobId);
    if (!draft) throw new DomainError("draft_not_found", "No active draft exists for this job.");
    if (draft.draft_version !== input.expected_draft_version) throw new StaleDraftError();

    const requirements = await deps.criteriaRepo.listRequirements(draft.id);
    const approvalError = validateApprovalReadiness(requirements);
    if (approvalError) throw new DomainError("invalid_criteria", approvalError);

    const now = new Date().toISOString();
    const newRevision = currentRevision + 1;
    const approved: CriteriaVersion = {
      ...draft,
      revision: newRevision,
      approved_at: now,
      updated_at: now,
    };
    const saved = await deps.criteriaRepo.saveGuarded(
      tx,
      approved,
      (c) => c !== null && c.draft_version === input.expected_draft_version && c.approved_at === null,
    );

    const updatedJob: Job = { ...job, criteria_revision: newRevision, updated_at: now };
    await deps.positionRepo.saveGuarded(tx, updatedJob, (c) => c !== null && c.version === job.version);

    return assembleRevision(deps, saved);
  });
}

export async function listRevisions(deps: CriteriaDeps, jobId: string): Promise<CriteriaRevisionDto[]> {
  await requireJob(deps, jobId);
  const revisions = await deps.criteriaRepo.listApproved(jobId);
  return Promise.all(revisions.map((r) => assembleRevision(deps, r)));
}

/** BR-CRI-01: at least one criterion, every weight > 0, weights sum to exactly 100. */
function validateApprovalReadiness(requirements: JobRequirement[]): string | null {
  if (requirements.length === 0) return "At least one criterion is required before approval.";
  let sum = ZERO;
  for (const r of requirements) {
    const weight = fromDecimal(r.weight);
    if (cmp(weight, ZERO) <= 0) return `Criterion "${r.criterion_key}" must have a weight greater than 0.`;
    sum = { num: sum.num * weight.den + weight.num * sum.den, den: sum.den * weight.den };
  }
  if (cmp(sum, fromDecimal("100")) !== 0) return "Criterion weights must sum to exactly 100.";
  return null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 40) : "criterion";
}
