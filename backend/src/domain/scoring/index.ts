/**
 * Policy v1 scoring engine (arc42.md §8.3). Zero I/O: every input is a plain
 * value already resolved by the caller (job requirements + CV snapshot
 * facts), so this module is exhaustively unit-testable without a repository.
 *
 * `semantic_score` is always `null` in policy v1 (§8.3) and never appears
 * here — the caller sets it directly when assembling the `ResultDetail` DTO.
 */

import { DEGREE_ORDER, type Decimal, type DegreeLevel, type MatchStatus, type RequirementType } from "../types/index.ts";
import * as R from "./rational.ts";
import type { Rational } from "./rational.ts";

const MATCH_VALUE: Record<MatchStatus, Rational> = {
  matched: R.fromInt(1),
  partial: R.fromDecimal("0.5"),
  missing: R.ZERO,
};

/** §8.3 "base coefficients = skill: 0.55, experience: 0.30, education: 0.15". */
const BASE_COEFFICIENT = {
  skill: R.fromDecimal("0.55"),
  experience: R.fromDecimal("0.30"),
  education: R.fromDecimal("0.15"),
} as const;

const EXPERIENCE_BASE = R.fromInt(80);
const EXPERIENCE_CAP = R.fromDecimal("1.25");
const TWELVE = R.fromInt(12);
const HUNDRED = R.fromInt(100);
const EDUCATION_FULL = R.fromInt(100);
const EDUCATION_ONE_BELOW = R.fromInt(50);

// ------------------------------------------------------------------- inputs

export interface SkillCriterionInput {
  id: string;
  weight: Decimal;
  reqType: RequirementType;
  match: MatchStatus;
}

export interface ExperienceCriterionInput {
  id: string;
  reqType: RequirementType;
  minYears: Decimal;
  /** Non-overlapping months from the CV snapshot (months-v1, half-open ranges, never negative). */
  supportedMonths: number;
}

export interface EducationCriterionInput {
  id: string;
  reqType: RequirementType;
  requiredDegree: DegreeLevel;
  /** `null` when the level could not be determined from the CV — counts as insufficient evidence. */
  candidateDegree: DegreeLevel | null;
}

export interface ScoreInputs {
  skills: SkillCriterionInput[];
  experience: ExperienceCriterionInput | null;
  education: EducationCriterionInput | null;
}

// ------------------------------------------------------------------ outputs

export interface CriterionScore {
  criterionId: string;
  /** Exact, pre-rounding contribution to the total (already coefficient-weighted). */
  contribution: Rational;
  /** Whether THIS criterion's own threshold was met — independent of req_type. */
  criterionPassed: boolean;
}

export interface ScoreResult {
  totalScore: Rational;
  skillScore: Rational | null;
  experienceScore: Rational | null;
  educationScore: Rational | null;
  /** BR-ELG-02: computed independently of the score, from `evaluateMandatory`. */
  passedMandatory: boolean;
  /** One entry per scored criterion (skills, then experience, then education), for `allocateDisplayed`. */
  criteria: CriterionScore[];
}

// -------------------------------------------------------------- group score

/**
 * `skill = 100 * sum(weight_i * match_i) / sum(weight_i)`.
 * Returns `groupScore === null` when there are no skill criteria — the caller
 * drops the group from the total renormalisation (§8.3 "Groups with no
 * criteria").
 */
export function scoreSkills(criteria: SkillCriterionInput[]): {
  groupScore: Rational | null;
  perCriterion: Array<{ id: string; localScore: Rational; passed: boolean }>;
} {
  if (criteria.length === 0) return { groupScore: null, perCriterion: [] };
  const weightSum = criteria.reduce((acc, c) => R.add(acc, R.fromDecimal(c.weight)), R.ZERO);
  if (R.cmp(weightSum, R.ZERO) <= 0) {
    throw new Error("scoreSkills: the sum of skill criteria weights must be positive.");
  }
  const perCriterion = criteria.map((c) => {
    const weight = R.fromDecimal(c.weight);
    // This criterion's share of the 0-100 group score.
    const localScore = R.div(R.mul(R.mul(HUNDRED, weight), MATCH_VALUE[c.match]), weightSum);
    return { id: c.id, localScore, passed: skillCriterionPassed(c.match) };
  });
  const groupScore = perCriterion.reduce((acc, p) => R.add(acc, p.localScore), R.ZERO);
  return { groupScore, perCriterion };
}

/** `experience = 80 * min(years / min_years, 1.25)`, `years = supported_months / 12`. At most one per policy v1. */
export function scoreExperience(input: ExperienceCriterionInput): { score: Rational; passed: boolean } {
  const minYears = R.fromDecimal(input.minYears);
  if (R.cmp(minYears, R.ZERO) <= 0) {
    throw new Error("scoreExperience: min_years must be positive (§8.3 criteria-set validation).");
  }
  const years = R.div(R.fromInt(input.supportedMonths), TWELVE);
  const ratio = R.min(R.div(years, minYears), EXPERIENCE_CAP);
  const score = R.mul(EXPERIENCE_BASE, ratio);
  return { score, passed: experienceCriterionPassed(input.supportedMonths, input.minYears) };
}

/** `education = 100` at/above the required degree, `50` exactly one level below, `0` otherwise. At most one per policy v1. */
export function scoreEducation(input: EducationCriterionInput): { score: Rational; passed: boolean } {
  const passed = educationCriterionPassed(input.requiredDegree, input.candidateDegree);
  if (input.candidateDegree === null) return { score: R.ZERO, passed };
  const diff = DEGREE_ORDER.indexOf(input.candidateDegree) - DEGREE_ORDER.indexOf(input.requiredDegree);
  if (diff >= 0) return { score: EDUCATION_FULL, passed };
  if (diff === -1) return { score: EDUCATION_ONE_BELOW, passed };
  return { score: R.ZERO, passed };
}

// ---------------------------------------------------------- per-item passed

function skillCriterionPassed(match: MatchStatus): boolean {
  // §8.3 Mandatory: "A partial skill match does not satisfy a mandatory criterion" — only an exact match passes.
  return match === "matched";
}

function experienceCriterionPassed(supportedMonths: number, minYears: Decimal): boolean {
  const years = R.div(R.fromInt(supportedMonths), TWELVE);
  return R.cmp(years, R.fromDecimal(minYears)) >= 0;
}

function educationCriterionPassed(required: DegreeLevel, candidate: DegreeLevel | null): boolean {
  if (candidate === null) return false; // "an undetermined education level counts as insufficient evidence"
  return DEGREE_ORDER.indexOf(candidate) >= DEGREE_ORDER.indexOf(required);
}

// ----------------------------------------------------------------- overall

/**
 * BR-ELG-02: AND over every mandatory criterion's own threshold, entirely
 * independent of the score computation — callable without running
 * `computeTotal` first (e.g. to short-circuit before scoring).
 */
export function evaluateMandatory(inputs: ScoreInputs): boolean {
  for (const c of inputs.skills) {
    if (c.reqType === "mandatory" && !skillCriterionPassed(c.match)) return false;
  }
  if (inputs.experience?.reqType === "mandatory") {
    if (!experienceCriterionPassed(inputs.experience.supportedMonths, inputs.experience.minYears)) return false;
  }
  if (inputs.education?.reqType === "mandatory") {
    if (!educationCriterionPassed(inputs.education.requiredDegree, inputs.education.candidateDegree)) return false;
  }
  return true;
}

/**
 * `total = sum(normalized_coefficient_g * component_score_g)`, renormalising
 * the base coefficients over whichever groups are present (§8.3 "Groups with
 * no criteria"). Throws if every group is absent — the caller must reject an
 * empty criteria set before scoring (§8.3 "An empty criteria set is rejected
 * so that no division by zero occurs").
 */
export function computeTotal(inputs: ScoreInputs): ScoreResult {
  const skill = scoreSkills(inputs.skills);
  const experience = inputs.experience ? scoreExperience(inputs.experience) : null;
  const education = inputs.education ? scoreEducation(inputs.education) : null;

  let weightSum = R.ZERO;
  if (skill.groupScore !== null) weightSum = R.add(weightSum, BASE_COEFFICIENT.skill);
  if (experience !== null) weightSum = R.add(weightSum, BASE_COEFFICIENT.experience);
  if (education !== null) weightSum = R.add(weightSum, BASE_COEFFICIENT.education);
  if (R.cmp(weightSum, R.ZERO) <= 0) {
    throw new Error("computeTotal: at least one criterion group must be present.");
  }

  const criteria: CriterionScore[] = [];
  let totalScore = R.ZERO;

  if (skill.groupScore !== null) {
    const coefficient = R.div(BASE_COEFFICIENT.skill, weightSum);
    for (const p of skill.perCriterion) {
      const contribution = R.mul(coefficient, p.localScore);
      criteria.push({ criterionId: p.id, contribution, criterionPassed: p.passed });
      totalScore = R.add(totalScore, contribution);
    }
  }
  if (experience !== null && inputs.experience !== null) {
    const coefficient = R.div(BASE_COEFFICIENT.experience, weightSum);
    const contribution = R.mul(coefficient, experience.score);
    criteria.push({ criterionId: inputs.experience.id, contribution, criterionPassed: experience.passed });
    totalScore = R.add(totalScore, contribution);
  }
  if (education !== null && inputs.education !== null) {
    const coefficient = R.div(BASE_COEFFICIENT.education, weightSum);
    const contribution = R.mul(coefficient, education.score);
    criteria.push({ criterionId: inputs.education.id, contribution, criterionPassed: education.passed });
    totalScore = R.add(totalScore, contribution);
  }

  return {
    totalScore,
    skillScore: skill.groupScore,
    experienceScore: experience?.score ?? null,
    educationScore: education?.score ?? null,
    passedMandatory: evaluateMandatory(inputs),
    criteria,
  };
}

// --------------------------------------------------------- displayed columns

export interface DisplayedContribution {
  criterionId: string;
  /** `DisplayedScore`-shaped 2dp string, e.g. "64.71". */
  displayed: string;
}

/**
 * BR-SCR-04: floor each contribution to 2dp, then distribute the rounding
 * deficit in 0.01 steps by largest remainder — ties broken by ascending
 * numeric criterion ID — so the displayed contributions sum exactly to the
 * displayed (rounded) total. `totalScore`/`contributions` must come from the
 * same `computeTotal` call (their exact sum is what gets rounded here).
 */
export function allocateDisplayed(
  contributions: Array<{ criterionId: string; contribution: Rational }>,
  totalScore: Rational,
): { displayedTotal: string; contributions: DisplayedContribution[] } {
  const totalCents = R.toCentsRoundHalfUp(totalScore);

  const rows = contributions.map((c) => {
    const cents = R.toCentsFloor(c.contribution);
    const remainder = R.sub(R.mul(c.contribution, HUNDRED), R.fromInt(cents));
    return { criterionId: c.criterionId, cents, remainder };
  });

  const flooredSum = rows.reduce((acc, r) => acc + r.cents, 0n);
  let deficit = totalCents - flooredSum;
  if (deficit < 0n) {
    // Mathematically unreachable: sum(floor(x_i)) <= floor(sum(x_i)) <= round(sum(x_i)) for non-negative x_i.
    throw new Error("allocateDisplayed: floored contributions exceed the rounded total.");
  }

  const order = rows.map((_, i) => i).sort((a, b) => {
    const byRemainder = R.cmp(rows[b].remainder, rows[a].remainder); // descending remainder
    if (byRemainder !== 0) return byRemainder;
    const diff = BigInt(rows[a].criterionId) - BigInt(rows[b].criterionId); // ascending id
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });

  const bumped = new Set<number>();
  for (let i = 0; i < order.length && deficit > 0n; i++, deficit--) {
    bumped.add(order[i]);
  }

  const displayedContributions = rows.map((r, i) => ({
    criterionId: r.criterionId,
    displayed: centsToDisplayedScore(r.cents + (bumped.has(i) ? 1n : 0n)),
  }));

  return { displayedTotal: centsToDisplayedScore(totalCents), contributions: displayedContributions };
}

function centsToDisplayedScore(cents: bigint): string {
  const intPart = cents / 100n;
  const fracPart = (cents % 100n).toString().padStart(2, "0");
  return `${intPart}.${fracPart}`;
}

// --------------------------------------------------------------- months-v1

/**
 * months-v1 (§8.3 "Experience takes the non-overlapping number of months...
 * never double-counts overlapping employment"): total calendar months
 * covered by half-open `[start_month, end_month_exclusive)` ranges
 * (`YYYY-MM` strings), merging overlapping or adjacent periods. A period
 * whose bounds could not be determined contributes nothing (§8.4 "periods
 * that cannot be determined are marked as missing evidence").
 */
export function computeSupportedMonths(
  periods: Array<{ start_month: string | null; end_month_exclusive: string | null }>,
): number {
  const ranges = periods
    .filter((p): p is { start_month: string; end_month_exclusive: string } => p.start_month !== null && p.end_month_exclusive !== null)
    .map((p) => [monthIndex(p.start_month), monthIndex(p.end_month_exclusive)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let curStart = 0;
  let curEnd = -1; // sentinel: no open interval yet
  for (const [start, end] of ranges) {
    if (curEnd === -1) {
      curStart = start;
      curEnd = end;
      continue;
    }
    if (start > curEnd) {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  if (curEnd !== -1) total += curEnd - curStart;
  return total;
}

function monthIndex(yyyyMm: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) throw new Error(`computeSupportedMonths: not a YYYY-MM string: "${yyyyMm}"`);
  const [, year, month] = match;
  return Number(year) * 12 + (Number(month) - 1);
}
