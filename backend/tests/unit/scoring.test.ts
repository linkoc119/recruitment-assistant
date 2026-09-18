import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateDisplayed,
  computeSupportedMonths,
  computeTotal,
  evaluateMandatory,
  scoreEducation,
  scoreExperience,
  scoreSkills,
  type ScoreInputs,
} from "../../src/domain/scoring/index.ts";
import { toDecimalString } from "../../src/domain/scoring/rational.ts";

// AT-01: one fully matched skill (weight 60) + experience (weight 40, min_years=2, exactly 24 months, no education).
// docs/requirements/README.md:205 — skill 100, experience 80, total 92.941176... -> 92.94, contributions 64.71 + 28.23.
test("AT-01: skill+experience golden case scores 92.94 with contributions 64.71 + 28.23", () => {
  const inputs: ScoreInputs = {
    skills: [{ id: "1", weight: "60", reqType: "mandatory", match: "matched" }],
    experience: { id: "2", reqType: "preferred", minYears: "2", supportedMonths: 24 },
    education: null,
  };
  const result = computeTotal(inputs);

  assert.equal(toDecimalString(result.skillScore!, 0), "100");
  assert.equal(toDecimalString(result.experienceScore!, 0), "80");
  assert.equal(result.educationScore, null);
  assert.equal(result.passedMandatory, true);

  const { displayedTotal, contributions } = allocateDisplayed(
    result.criteria.map((c) => ({ criterionId: c.criterionId, contribution: c.contribution })),
    result.totalScore,
  );
  assert.equal(displayedTotal, "92.94");
  const skillContribution = contributions.find((c) => c.criterionId === "1")!;
  const experienceContribution = contributions.find((c) => c.criterionId === "2")!;
  assert.equal(skillContribution.displayed, "64.71");
  assert.equal(experienceContribution.displayed, "28.23");

  // Displayed contributions must sum exactly to the displayed total (BR-SCR-04).
  const sumCents = contributions.reduce((acc, c) => acc + Math.round(Number(c.displayed) * 100), 0);
  assert.equal(sumCents, Math.round(Number(displayedTotal) * 100));
});

// AT-02: two skills weighted 60/40; first mandatory and partial, second full match.
// docs/requirements/README.md:206 — skill and total = 70; mandatory false; remains scored.
test("AT-02: partial match on a mandatory skill fails eligibility but still scores", () => {
  const inputs: ScoreInputs = {
    skills: [
      { id: "1", weight: "60", reqType: "mandatory", match: "partial" },
      { id: "2", weight: "40", reqType: "preferred", match: "matched" },
    ],
    experience: null,
    education: null,
  };
  const result = computeTotal(inputs);
  assert.equal(toDecimalString(result.skillScore!, 0), "70");
  assert.equal(toDecimalString(result.totalScore, 0), "70");
  assert.equal(result.passedMandatory, false);
  assert.equal(evaluateMandatory(inputs), false);
});

// AT-03: experience only, weight 100, min_years=2; snapshots at 12/24/30/36 months.
// docs/requirements/README.md:207 — scores 40, 80, 100, 100; only the 12-month case fails if mandatory.
test("AT-03: experience score caps at 100 (125% of threshold) and only 12 months fails mandatory", () => {
  const cases: Array<[number, string]> = [
    [12, "40"],
    [24, "80"],
    [30, "100"],
    [36, "100"],
  ];
  for (const [months, expectedScore] of cases) {
    const { score, passed } = scoreExperience({ id: "1", reqType: "mandatory", minYears: "2", supportedMonths: months });
    assert.equal(toDecimalString(score, 0), expectedScore, `months=${months}`);
    assert.equal(passed, months !== 12, `months=${months}`);
  }
});

// AT-04: education only, weight 100, bachelor required; CVs state master/college/vocational/unclear.
// docs/requirements/README.md:208 — scores 100, 50, 0, 0; only master passes if mandatory.
test("AT-04: education scores by degree distance and only meeting-or-above passes mandatory", () => {
  const cases: Array<[string | null, string, boolean]> = [
    ["master", "100", true],
    ["college", "50", false],
    ["vocational", "0", false],
    [null, "0", false],
  ];
  for (const [candidateDegree, expectedScore, expectedPassed] of cases) {
    const { score, passed } = scoreEducation({
      id: "1",
      reqType: "mandatory",
      requiredDegree: "bachelor",
      candidateDegree: candidateDegree as never,
    });
    assert.equal(toDecimalString(score, 0), expectedScore, `degree=${candidateDegree}`);
    assert.equal(passed, expectedPassed, `degree=${candidateDegree}`);
  }
});

// AT-10: two overlapping employment periods must merge, not double-count.
// docs/requirements/README.md:214 — [2022-01,2023-01) union [2022-07,2023-07) = 18 months, not 24.
test("AT-10: overlapping employment periods merge under months-v1 instead of double-counting", () => {
  const months = computeSupportedMonths([
    { start_month: "2022-01", end_month_exclusive: "2023-01" },
    { start_month: "2022-07", end_month_exclusive: "2023-07" },
  ]);
  assert.equal(months, 18);
});

test("computeSupportedMonths ignores periods with an undetermined bound", () => {
  const months = computeSupportedMonths([
    { start_month: "2022-01", end_month_exclusive: "2022-07" },
    { start_month: null, end_month_exclusive: null },
  ]);
  assert.equal(months, 6);
});

// §8.3 "Groups with no criteria: drop the group ... renormalise" — worked with skill+experience only.
test("computeTotal renormalises coefficients when the education group is absent", () => {
  const inputs: ScoreInputs = {
    skills: [{ id: "1", weight: "100", reqType: "preferred", match: "matched" }],
    experience: { id: "2", reqType: "preferred", minYears: "1", supportedMonths: 12 },
    education: null,
  };
  const result = computeTotal(inputs);
  // (0.55*100 + 0.30*80) / 0.85 = 92.941176...
  assert.equal(toDecimalString(result.totalScore, 6), "92.941176");
});

test("computeTotal throws when every criterion group is absent", () => {
  assert.throws(() => computeTotal({ skills: [], experience: null, education: null }));
});

test("scoreSkills returns a null group score when there are no skill criteria", () => {
  const { groupScore, perCriterion } = scoreSkills([]);
  assert.equal(groupScore, null);
  assert.deepEqual(perCriterion, []);
});
