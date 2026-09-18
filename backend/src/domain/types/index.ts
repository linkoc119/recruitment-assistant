/**
 * CLS-01 domain model — the data the services in CLS-02 operate on.
 *
 * Field names are `snake_case` to match the 14-table DBML. These entities are
 * never serialized straight to a response; services assemble DTOs against
 * `@app/api-types` (class-domain.md line 9).
 *
 * `Decimal` is a decimal string, never a JS float. Intermediate scoring values
 * are not quantized to integer hundredths — see `domain/scoring/rational.ts`.
 *
 * Fields marked "API §8 gap" are the storage additions that
 * docs/api/README.md section 8 requires before implementation; they are absent
 * from the current DBML on purpose and are introduced here.
 */

export type Decimal = string;
export type DisplayedScore = string;
export type Timestamp = string;

export type ExtractionJobStatus = "queued" | "running" | "succeeded" | "failed";
export type EvidenceSource = "jd" | "cv";
export type JobStatus = "draft" | "open" | "closed";
export type RequirementKind = "skill" | "experience" | "education";
export type RequirementType = "mandatory" | "preferred";
export type DegreeLevel = "vocational" | "college" | "bachelor" | "master" | "doctorate";
export type ParseStatus = "uploaded" | "parsing" | "parsed" | "parse_failed";
export type RunStatus = "queued" | "running" | "completed" | "completed_with_errors" | "failed";
export type ItemStatus = "pending" | "processing" | "succeeded" | "failed";
export type DecisionStatus = "scored" | "shortlisted" | "rejected";
export type MatchStatus = "matched" | "partial" | "missing";
export type RunMode = "initial" | "rescore";
export type TriggerSource = "upload" | "reprocess" | "screening";
export type CriterionSource = "manual" | "ai";

/** BR-SCR-03: the ordering is a technical lookup, not a judgement of quality. */
export const DEGREE_ORDER: readonly DegreeLevel[] = [
  "vocational",
  "college",
  "bachelor",
  "master",
  "doctorate",
];

// ---------------------------------------------------------------- value objects

export interface Evidence {
  source: EvidenceSource;
  source_id: string;
  segment_id: string;
  quote: string;
  page: number | null;
  paragraph: number | null;
  start_offset: number;
  end_offset: number;
}

export interface PolicySnapshot {
  version: string;
  group_weights: Record<"skill" | "experience" | "education", Decimal>;
  match_values: Record<MatchStatus, Decimal>;
  degree_order: readonly DegreeLevel[];
  rounding: string;
}

export interface ExtractionConfig {
  parser_version: string;
  model_version: string;
  prompt_version: string;
  schema_version: string;
  dictionary_version: string;
  normalization_version: string;
  /** Server UTC date frozen at insertion; retries reuse it (extraction-jobs.md). */
  as_of_date: string;
}

/** Normalized facts persisted inside `resume_snapshots.extraction`. */
export interface Extraction {
  schema_version: string;
  normalization_version: string;
  as_of_date: string;
  /** Non-overlapping months under months-v1; null when no period is determinable. */
  supported_months: number;
  employment: EmploymentPeriod[];
  education: EducationFact[];
  candidate: SnapshotCandidateFacts;
}

export interface EmploymentPeriod {
  start_raw: string | null;
  end_raw: string | null;
  ongoing: boolean;
  /** Inclusive first month and exclusive last month, `YYYY-MM`; null when ambiguous. */
  start_month: string | null;
  end_month_exclusive: string | null;
  evidence: Evidence[];
}

export interface EducationFact {
  degree_raw: string;
  degree_level: DegreeLevel | null;
  evidence: Evidence[];
}

/** Display/contact facts captured for this snapshot, never current candidate rows. */
export interface SnapshotCandidateFacts {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface SourceSegment {
  segment_id: string;
  page: number | null;
  paragraph: number | null;
  start_offset: number;
  end_offset: number;
  text: string;
}

// -------------------------------------------------------------------- entities

export interface Job {
  id: string;
  title: string;
  level: string | null;
  jd_raw_text: string;
  status: JobStatus;
  criteria_revision: number | null;
  published_run_id: string | null;
  /** API §8 gap: optimistic concurrency for JD/metadata edits. */
  version: number;
  created_at: Timestamp;
  /** API §8 gap. */
  updated_at: Timestamp;
}

/**
 * `job_criteria_versions`. One row carries both states: `approved_at === null`
 * is the single active draft, otherwise it is a frozen approved revision.
 */
export interface CriteriaVersion {
  id: string;
  job_id: string;
  /** 0 while unapproved; approval assigns the next positive revision. */
  revision: number;
  jd_snapshot: string;
  dictionary_version: string;
  approved_at: Timestamp | null;
  created_at: Timestamp;
  /** API §8 gap: draft edit version, starts at 1 on creation. */
  draft_version: number;
  /** API §8 gap: approved revision this draft was based on, 0 before the first. */
  base_revision: number;
  /** API §8 gap: `jobs.version` captured with `jd_snapshot`. */
  job_version: number;
  updated_at: Timestamp;
}

export function isApproved(version: CriteriaVersion): boolean {
  return version.approved_at !== null;
}

export interface JobRequirement {
  id: string;
  criteria_version_id: string;
  criterion_key: string;
  kind: RequirementKind;
  skill_id: string | null;
  canonical_skill_name: string | null;
  label: string;
  req_type: RequirementType;
  weight: Decimal;
  min_years: Decimal | null;
  min_degree: DegreeLevel | null;
  source: CriterionSource;
  jd_evidence: Evidence[];
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
}

export interface Candidate {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: Timestamp;
}

export interface Resume {
  id: string;
  candidate_id: string;
  version: number;
  file_name: string;
  /** Private storage key; never leaves the domain layer. */
  object_key: string;
  file_hash: string;
  media_type: string;
  size_bytes: number;
  status: ParseStatus;
  error_code: string | null;
  created_at: Timestamp;
}

export interface PositionResume {
  job_id: string;
  resume_id: string;
  uploaded_at: Timestamp;
}

export interface ResumeSnapshot {
  id: string;
  resume_id: string;
  raw_text: string;
  segments: SourceSegment[];
  extraction: Extraction;
  parser_version: string;
  model_version: string;
  prompt_version: string;
  schema_version: string;
  dictionary_version: string;
  created_at: Timestamp;
}

export interface ResumeExtractionJob {
  id: string;
  job_id: string;
  resume_id: string;
  trigger_source: TriggerSource;
  status: ExtractionJobStatus;
  extraction_config: ExtractionConfig;
  attempts: number;
  max_attempts: number;
  available_at: Timestamp;
  lease_owner: string | null;
  lease_expires_at: Timestamp | null;
  /** Decimal integer string to preserve bigint precision (CLS-01 line 239). */
  lease_token: string;
  snapshot_id: string | null;
  error_code: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  updated_at: Timestamp;
}

export interface ResumeSkill {
  id: string;
  snapshot_id: string;
  skill_id: string | null;
  canonical_name: string | null;
  raw_text: string;
  /** BR-EVD-02: evidenced use is a full match, a bare listing is partial. */
  usage: "evidenced_use" | "listed_only";
  evidence: Evidence[];
  confidence: number | null;
}

export interface ScreeningRun {
  id: string;
  job_id: string;
  round: number;
  mode: RunMode;
  base_run_id: string | null;
  criteria_version_id: string;
  policy_version: string;
  policy_snapshot: PolicySnapshot;
  status: RunStatus;
  idempotency_key: string;
  payload_hash: string;
  lease_owner: string | null;
  lease_expires_at: Timestamp | null;
  lease_token: string;
  error_code: string | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  published_at: Timestamp | null;
  /** API §8 gap: incremented once per committed decision, for ranking pagination. */
  decision_epoch: number;
}

export function isActive(run: ScreeningRun): boolean {
  return run.status === "queued" || run.status === "running";
}

export interface ScreeningRunItem {
  run_id: string;
  job_id: string;
  resume_id: string;
  snapshot_id: string | null;
  extraction_job_id: string | null;
  status: ItemStatus;
  attempts: number;
  error_code: string | null;
  error_phase: string | null;
  updated_at: Timestamp;
}

export interface Screening {
  id: string;
  run_id: string;
  job_id: string;
  resume_id: string;
  criteria_version_id: string;
  snapshot_id: string;
  total_score: Decimal;
  displayed_total: DisplayedScore;
  skill_score: Decimal | null;
  experience_score: Decimal | null;
  education_score: Decimal | null;
  /** Always null in policy v1; the database has a CHECK enforcing it. */
  semantic_score: null;
  passed_mandatory: boolean;
  rank_in_job: number;
  summary: string;
  status: DecisionStatus;
  result_version: number;
  decision_at: Timestamp | null;
  scored_round: number;
  is_latest: boolean;
  scored_at: Timestamp;
}

export interface ScreeningDetail {
  id: string;
  screening_id: string;
  criteria_version_id: string;
  job_requirement_id: string;
  status: MatchStatus;
  criterion_passed: boolean;
  reason_code: string;
  reason: string;
  score_contribution: Decimal;
  displayed_contribution: DisplayedScore;
  evidence: Evidence[];
}

// -------------------------------------------------------------------- contexts

/** CLS-02 line 217: every scoped read starts from `jobId`, never the leaf id. */
export interface CvContext {
  jobId: string;
  resumeId: string;
}

export interface RunContext {
  jobId: string;
  runId: string;
}

export interface ResultContext {
  jobId: string;
  runId: string;
  resultId: string;
}

export interface ExtractionContext {
  extractionJobId: string;
  jobId: string;
  resumeId: string;
}

export interface Readiness {
  approved_criteria: boolean;
  ready_cv_count: number;
  active_run_id: string | null;
  can_start: boolean;
  blocking_codes: Array<"criteria_not_approved" | "no_ready_cv" | "active_run">;
}

export interface PageQuery {
  offset: number;
  limit: number;
}

export interface PageResult<T> {
  items: T[];
  page: { offset: number; limit: number; total: number };
}
