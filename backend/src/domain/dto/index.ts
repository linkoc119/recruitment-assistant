/**
 * Shared read-model assembly helpers used by more than one domain service.
 * Per class-domain.md:9 no entity is ever serialized straight to a response;
 * these functions turn `domain/types` rows into the exact shapes
 * `@app/api-types` expects (openapi.yaml `Criterion`, `Evidence`, `Skill`).
 */
import type { Rational } from "../scoring/rational.ts";
import { toDecimalString } from "../scoring/rational.ts";
import type { Evidence, JobRequirement, Skill } from "../types/index.ts";

/** Global dictionary version the mock AI/skill service currently resolves against. */
export const DICTIONARY_VERSION = "dict-v1";

/** `Evidence` matches the domain value object field-for-field; this is documentation, not a transform. */
export function toEvidenceDto(evidence: Evidence): Evidence {
  return evidence;
}

export interface CriterionDto {
  id: string;
  criterion_key: string;
  kind: JobRequirement["kind"];
  label: string;
  skill_id: string | null;
  canonical_skill_name: string | null;
  req_type: JobRequirement["req_type"];
  weight: string;
  min_years: string | null;
  min_degree: JobRequirement["min_degree"];
  source: JobRequirement["source"];
  jd_evidence: Evidence[];
}

export function toCriterionDto(req: JobRequirement): CriterionDto {
  return {
    id: req.id,
    criterion_key: req.criterion_key,
    kind: req.kind,
    label: req.label,
    skill_id: req.skill_id,
    canonical_skill_name: req.canonical_skill_name,
    req_type: req.req_type,
    weight: req.weight,
    min_years: req.min_years,
    min_degree: req.min_degree,
    source: req.source,
    jd_evidence: req.jd_evidence.map(toEvidenceDto),
  };
}

export interface SkillDto {
  id: string;
  name: string;
  aliases: string[];
  dictionary_version: string;
}

export function toSkillDto(skill: Skill): SkillDto {
  return { id: skill.id, name: skill.name, aliases: skill.aliases, dictionary_version: DICTIONARY_VERSION };
}

/** Serializes a scoring `Rational` at scale 10, trimming trailing zeros (plan's recorded `Decimal` convention). */
export function formatDecimal(value: Rational): string {
  const s = toDecimalString(value, 10);
  if (!s.includes(".")) return s;
  const trimmed = s.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed.length === 0 ? "0" : trimmed;
}
