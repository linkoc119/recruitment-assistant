import type { Skill } from "../../../domain/types/index.ts";
import { nextId, tables } from "../store.ts";
import { runInTransaction, type RepositoryTx } from "./tx.ts";
import type { Repository } from "./index.ts";

/** `skills` is a global dictionary, not job-scoped; `jobId` params are ignored. */
export class SkillRepository implements Repository<Skill> {
  async findScoped(_jobId: string, id: string): Promise<Skill | null> {
    return tables.skills.get(id) ?? null;
  }

  async list(_jobId: string, predicate?: (item: Skill) => boolean): Promise<Skill[]> {
    const all = [...tables.skills.values()];
    return predicate ? all.filter(predicate) : all;
  }

  transaction<R>(jobId: string, work: (tx: RepositoryTx) => Promise<R>): Promise<R> {
    return runInTransaction(jobId, work);
  }

  async saveGuarded(_tx: RepositoryTx, entity: Skill, guard: (current: Skill | null) => boolean): Promise<Skill> {
    const current = tables.skills.get(entity.id) ?? null;
    if (!guard(current)) throw new Error("Skill write was rejected by its guard.");
    tables.skills.set(entity.id, entity);
    return entity;
  }

  async listAll(query: { search?: string; offset: number; limit: number }): Promise<{ items: Skill[]; total: number }> {
    let all = [...tables.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (query.search) {
      const needle = query.search.toLowerCase();
      all = all.filter((s) => s.name.toLowerCase().includes(needle) || s.aliases.some((a) => a.toLowerCase().includes(needle)));
    }
    const total = all.length;
    return { items: all.slice(query.offset, query.offset + query.limit), total };
  }

  async findByCanonicalName(name: string): Promise<Skill | null> {
    const needle = name.trim().toLowerCase();
    return [...tables.skills.values()].find((s) => s.name.toLowerCase() === needle) ?? null;
  }

  async upsertByName(name: string, category: string | null = null): Promise<Skill> {
    const existing = await this.findByCanonicalName(name);
    if (existing) return existing;
    const id = nextId("skills");
    const skill: Skill = { id, name, category, aliases: [] };
    tables.skills.set(id, skill);
    return skill;
  }
}

export const skillRepository = new SkillRepository();
