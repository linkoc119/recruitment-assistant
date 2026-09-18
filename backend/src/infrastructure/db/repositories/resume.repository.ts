import type {
  Candidate,
  ParseStatus,
  PositionResume,
  Resume,
  ResumeSkill,
  ResumeSnapshot,
} from "../../../domain/types/index.ts";
import { nextId, nowIso, tables, withLock } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

export interface ListResumesQuery {
  status?: ParseStatus;
  offset: number;
  limit: number;
}

/**
 * Covers `candidates` + `resumes` + `position_resumes` + `resume_snapshots` +
 * `resume_skills` — the aggregate `ResumeService` operates on as one unit.
 */
export class ResumeRepository implements Repository<Resume> {
  async findScoped(jobId: string, id: string): Promise<Resume | null> {
    if (!tables.position_resumes.has(linkKey(jobId, id))) return null;
    return tables.resumes.get(id) ?? null;
  }

  async list(jobId: string, predicate?: (item: Resume) => boolean): Promise<Resume[]> {
    const ids = [...tables.position_resumes.values()].filter((l) => l.job_id === jobId).map((l) => l.resume_id);
    const all = ids.map((id) => tables.resumes.get(id)).filter((r): r is Resume => Boolean(r));
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(_tx: RepositoryTx, entity: Resume, guard: (current: Resume | null) => boolean): Promise<Resume> {
    const current = tables.resumes.get(entity.id) ?? null;
    if (!guard(current)) throw new Error("Resume write was rejected by its guard.");
    tables.resumes.set(entity.id, entity);
    return entity;
  }

  async listForJob(jobId: string, query: ListResumesQuery): Promise<{ items: Resume[]; total: number }> {
    let all = await this.list(jobId);
    all = all.sort((a, b) => Number(a.id) - Number(b.id));
    if (query.status) {
      all = all.filter((r) => r.status === query.status);
    }
    const total = all.length;
    return { items: all.slice(query.offset, query.offset + query.limit), total };
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return tables.candidates.get(id) ?? null;
  }

  async getResume(id: string): Promise<Resume | null> {
    return tables.resumes.get(id) ?? null;
  }

  async isLinkedToJob(jobId: string, resumeId: string): Promise<boolean> {
    return tables.position_resumes.has(linkKey(jobId, resumeId));
  }

  async link(jobId: string, resumeId: string): Promise<PositionResume> {
    const key = linkKey(jobId, resumeId);
    const existing = tables.position_resumes.get(key);
    if (existing) return existing;
    const link: PositionResume = { job_id: jobId, resume_id: resumeId, uploaded_at: nowIso() };
    tables.position_resumes.set(key, link);
    return link;
  }

  /** Finds a resume already uploaded to this job with the same file content. */
  async findByHashInJob(jobId: string, fileHash: string): Promise<Resume | null> {
    const resumes = await this.list(jobId);
    return resumes.find((r) => r.file_hash === fileHash) ?? null;
  }

  /** Latest resume version for a candidate, across every job it was ever attached to. */
  async latestVersionForCandidate(candidateId: string): Promise<Resume | null> {
    const versions = [...tables.resumes.values()].filter((r) => r.candidate_id === candidateId);
    if (versions.length === 0) return null;
    return versions.reduce((latest, r) => (r.version > latest.version ? r : latest));
  }

  async createCandidate(facts: { full_name: string | null; email: string | null; phone: string | null }): Promise<Candidate> {
    const id = nextId("candidates");
    const candidate: Candidate = { id, ...facts, created_at: nowIso() };
    tables.candidates.set(id, candidate);
    return candidate;
  }

  async createResumeVersion(input: {
    candidateId: string;
    version: number;
    fileName: string;
    objectKey: string;
    fileHash: string;
    mediaType: string;
    sizeBytes: number;
  }): Promise<Resume> {
    const id = nextId("resumes");
    const resume: Resume = {
      id,
      candidate_id: input.candidateId,
      version: input.version,
      file_name: input.fileName,
      object_key: input.objectKey,
      file_hash: input.fileHash,
      media_type: input.mediaType,
      size_bytes: input.sizeBytes,
      status: "uploaded",
      error_code: null,
      created_at: nowIso(),
    };
    tables.resumes.set(id, resume);
    return resume;
  }

  async setStatus(resumeId: string, status: ParseStatus, errorCode: string | null): Promise<void> {
    const resume = tables.resumes.get(resumeId);
    if (!resume) return;
    tables.resumes.set(resumeId, { ...resume, status, error_code: errorCode });
  }

  async getLatestSnapshot(resumeId: string): Promise<ResumeSnapshot | null> {
    const snapshots = [...tables.resume_snapshots.values()].filter((s) => s.resume_id === resumeId);
    if (snapshots.length === 0) return null;
    return snapshots.reduce((latest, s) => (s.created_at > latest.created_at ? s : latest));
  }

  async listSkillFacts(snapshotId: string): Promise<ResumeSkill[]> {
    return [...tables.resume_skills.values()].filter((s) => s.snapshot_id === snapshotId);
  }

  /**
   * Locks the resume for a multi-table write (extraction completion). Keyed by
   * resume id, independent of the job-scoped lock, since a resume can be
   * shared across jobs (extraction-jobs.md: "lock the resume then job").
   */
  withResumeLock<R>(resumeId: string, work: () => Promise<R>): Promise<R> {
    return withLock(`resume:${resumeId}`, work);
  }

  /** Atomic completion write: snapshot + skill facts + resume status, one commit. */
  async commitExtraction(input: {
    resumeId: string;
    snapshot: Omit<ResumeSnapshot, "id" | "resume_id" | "created_at">;
    skills: Omit<ResumeSkill, "id" | "snapshot_id">[];
  }): Promise<ResumeSnapshot> {
    const snapshotId = nextId("resume_snapshots");
    const snapshot: ResumeSnapshot = {
      id: snapshotId,
      resume_id: input.resumeId,
      created_at: nowIso(),
      ...input.snapshot,
    };
    tables.resume_snapshots.set(snapshotId, snapshot);
    for (const skill of input.skills) {
      const id = nextId("resume_skills");
      tables.resume_skills.set(id, { ...skill, id, snapshot_id: snapshotId });
    }
    await this.setStatus(input.resumeId, "parsed", null);
    return snapshot;
  }
}

function linkKey(jobId: string, resumeId: string): string {
  return `${jobId}:${resumeId}`;
}

export const resumeRepository = new ResumeRepository();
