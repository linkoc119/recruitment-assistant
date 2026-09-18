import type { DegreeLevel, Evidence, RequirementType, SourceSegment } from "../../domain/types/index.ts";
import { processSingleton } from "../runtime/index.ts";

export interface JdCriterionFact {
  kind: "skill" | "experience" | "education";
  label: string;
  skill_name: string | null;
  requirement_type: RequirementType | "unspecified";
  min_years: number | null;
  min_degree: DegreeLevel | null;
  evidence: Evidence[];
}

export interface JdExtractionResult {
  schema_version: "extraction-v1";
  criteria: JdCriterionFact[];
}

export interface CvSkillFact {
  name: string;
  usage: "evidenced_use" | "listed_only";
  evidence: Evidence[];
}

export interface CvEmploymentFact {
  start_raw: string | null;
  end_raw: string | null;
  ongoing: boolean;
  evidence: Evidence[];
}

export interface CvEducationFact {
  degree_raw: string;
  degree_level: DegreeLevel | null;
  evidence: Evidence[];
}

export interface CvExtractionResult {
  schema_version: "extraction-v1";
  skills: CvSkillFact[];
  employment: CvEmploymentFact[];
  education: CvEducationFact[];
}

/** CLS-02 `AiExtractionService` port. */
export interface AiExtractionService {
  extractJd(input: { jobId: string; segments: SourceSegment[] }): Promise<JdExtractionResult>;
  extractCv(input: { resumeId: string; segments: SourceSegment[] }): Promise<CvExtractionResult>;
}

/** Canonical skill dictionary the mock keyword-matches against (dictionary_version "dict-v1"). */
export const CANONICAL_SKILLS: readonly string[] = [
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "SQL",
  "React",
  "Node.js",
  "AWS",
  "Docker",
  "Kubernetes",
  "Go",
  "C#",
  "C++",
  "PHP",
  "Ruby",
  "Angular",
  "Vue",
  "Machine Learning",
  "DevOps",
  "Linux",
  "Git",
  "GraphQL",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "Redis",
  "Kafka",
  "CI/CD",
  "Agile",
  "Scrum",
];

const MANDATORY_MARKERS = ["required", "must have", "mandatory", "bắt buộc", "yêu cầu"];
const EVIDENCED_USE_MARKERS = ["using", "used", "built", "build", "developed", "develop", "implemented", "implement", "worked with", "wrote"];
const DEGREE_MARKERS: Array<[RegExp, DegreeLevel]> = [
  [/\bdoctorate\b|\bphd\b|\btiến sĩ\b/i, "doctorate"],
  [/\bmaster'?s?\b|\bthạc sĩ\b/i, "master"],
  [/\bbachelor'?s?\b|\bcử nhân\b|\bđại học\b/i, "bachelor"],
  [/\bcollege\b|\bcao đẳng\b/i, "college"],
  [/\bvocational\b|\btrung cấp\b/i, "vocational"],
];
const EXPERIENCE_YEARS = /(\d+(?:\.\d+)?)\+?\s*(?:years?|năm)/i;
/** `YYYY-MM` start/end, optionally with an ongoing marker ("present"/"hiện tại"). */
const DATE_RANGE = /(\d{4}-\d{2})\s*(?:to|-|–|đến)\s*(\d{4}-\d{2}|present|hiện tại|now)/i;

function findEvidence(segments: SourceSegment[], sourceId: string, source: "jd" | "cv", matcher: RegExp): Evidence | null {
  for (const segment of segments) {
    const match = matcher.exec(segment.text);
    if (match) {
      const quote = match[0];
      const start = segment.text.indexOf(quote);
      return {
        source,
        source_id: sourceId,
        segment_id: segment.segment_id,
        quote,
        page: segment.page,
        paragraph: segment.paragraph,
        start_offset: segment.start_offset + start,
        end_offset: segment.start_offset + start + quote.length,
      };
    }
  }
  return null;
}

/**
 * Deterministic keyword/regex extraction over locally-parsed segments — a
 * stand-in for a real AI call (accepted scope: no real AI). It never
 * fabricates a fact it cannot cite a segment quote for.
 */
export class MockAiExtractionService implements AiExtractionService {
  callCounts = { extractJd: 0, extractCv: 0 };

  async extractJd(input: { jobId: string; segments: SourceSegment[] }): Promise<JdExtractionResult> {
    this.callCounts.extractJd += 1;
    const criteria: JdCriterionFact[] = [];
    const text = input.segments.map((s) => s.text).join(" ");

    for (const skill of CANONICAL_SKILLS) {
      const pattern = new RegExp(`\\b${escapeRegExp(skill)}\\b`, "i");
      const evidence = findEvidence(input.segments, input.jobId, "jd", pattern);
      if (!evidence) continue;
      const mandatory = MANDATORY_MARKERS.some((marker) => evidence.quote.toLowerCase().includes(marker) || containsNear(text, skill, marker));
      criteria.push({
        kind: "skill",
        label: skill,
        skill_name: skill,
        requirement_type: mandatory ? "mandatory" : "preferred",
        min_years: null,
        min_degree: null,
        evidence: [evidence],
      });
    }

    const yearsEvidence = findEvidence(input.segments, input.jobId, "jd", EXPERIENCE_YEARS);
    if (yearsEvidence) {
      const match = EXPERIENCE_YEARS.exec(yearsEvidence.quote);
      const minYears = match ? Number(match[1]) : null;
      criteria.push({
        kind: "experience",
        label: `Minimum ${minYears ?? "?"} years of experience`,
        skill_name: null,
        requirement_type: MANDATORY_MARKERS.some((m) => text.toLowerCase().includes(m)) ? "mandatory" : "preferred",
        min_years: minYears,
        min_degree: null,
        evidence: [yearsEvidence],
      });
    }

    for (const [pattern, level] of DEGREE_MARKERS) {
      const evidence = findEvidence(input.segments, input.jobId, "jd", pattern);
      if (!evidence) continue;
      criteria.push({
        kind: "education",
        label: evidence.quote,
        skill_name: null,
        requirement_type: "preferred",
        min_years: null,
        min_degree: level,
        evidence: [evidence],
      });
      break; // BR-CRI-02: at most one education criterion.
    }

    return { schema_version: "extraction-v1", criteria };
  }

  async extractCv(input: { resumeId: string; segments: SourceSegment[] }): Promise<CvExtractionResult> {
    this.callCounts.extractCv += 1;
    const skills: CvSkillFact[] = [];
    for (const skill of CANONICAL_SKILLS) {
      const pattern = new RegExp(`\\b${escapeRegExp(skill)}\\b`, "i");
      const evidence = findEvidence(input.segments, input.resumeId, "cv", pattern);
      if (!evidence) continue;
      const segment = input.segments.find((s) => s.segment_id === evidence.segment_id);
      const usedNearby = segment ? EVIDENCED_USE_MARKERS.some((marker) => segment.text.toLowerCase().includes(marker)) : false;
      skills.push({ name: skill, usage: usedNearby ? "evidenced_use" : "listed_only", evidence: [evidence] });
    }

    const employment: CvEmploymentFact[] = [];
    for (const segment of input.segments) {
      const match = DATE_RANGE.exec(segment.text);
      if (!match) continue;
      const quote = match[0];
      const start = segment.text.indexOf(quote);
      const evidence: Evidence = {
        source: "cv",
        source_id: input.resumeId,
        segment_id: segment.segment_id,
        quote,
        page: segment.page,
        paragraph: segment.paragraph,
        start_offset: segment.start_offset + start,
        end_offset: segment.start_offset + start + quote.length,
      };
      const ongoing = /present|hiện tại|now/i.test(match[2]);
      employment.push({
        start_raw: match[1],
        end_raw: ongoing ? null : match[2],
        ongoing,
        evidence: [evidence],
      });
    }

    const education: CvEducationFact[] = [];
    for (const [pattern, level] of DEGREE_MARKERS) {
      const evidence = findEvidence(input.segments, input.resumeId, "cv", pattern);
      if (!evidence) continue;
      education.push({ degree_raw: evidence.quote, degree_level: level, evidence: [evidence] });
      break;
    }

    return { schema_version: "extraction-v1", skills, employment, education };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNear(text: string, skill: string, marker: string): boolean {
  const lower = text.toLowerCase();
  const skillIndex = lower.indexOf(skill.toLowerCase());
  const markerIndex = lower.indexOf(marker.toLowerCase());
  if (skillIndex === -1 || markerIndex === -1) return false;
  return Math.abs(skillIndex - markerIndex) < 80;
}

export const aiExtractionService = processSingleton("ai", () => new MockAiExtractionService());
