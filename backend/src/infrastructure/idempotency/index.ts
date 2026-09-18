import { createHash, randomUUID } from "node:crypto";
import { processSingleton } from "../runtime/index.ts";

export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  status: "in_progress" | "completed";
  response_status: number | null;
  response_body: unknown;
  created_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
}

export type CreateOrReplayResult =
  | { outcome: "new"; owner: string }
  | { outcome: "replay"; status: number; body: unknown }
  | { outcome: "conflict"; code: "idempotency_mismatch" | "request_in_progress" };

/** CLS-02 `IdempotencyStore` port. */
export interface IdempotencyStore {
  createOrReplay(key: string, fingerprint: string): Promise<CreateOrReplayResult>;
  complete(key: string, owner: string, status: number, body: unknown): Promise<void>;
  acquireLease(key: string, ttlMs?: number): Promise<string | null>;
  renewLease(key: string, owner: string, ttlMs?: number): Promise<boolean>;
  releaseLease(key: string, owner: string): Promise<void>;
}

const DEFAULT_LEASE_TTL_MS = 30_000;

/** Normalizes a JSON-ish value to a stable string (sorted object keys) before hashing. */
export function normalizeForFingerprint(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

export function fingerprintOf(payload: unknown): string {
  return createHash("sha256").update(normalizeForFingerprint(payload)).digest("hex");
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async createOrReplay(key: string, fingerprint: string): Promise<CreateOrReplayResult> {
    const now = Date.now();
    const existing = this.records.get(key);

    if (!existing) {
      const owner = randomUUID();
      this.records.set(key, {
        key,
        fingerprint,
        status: "in_progress",
        response_status: null,
        response_body: null,
        created_at: new Date(now).toISOString(),
        lease_owner: owner,
        lease_expires_at: new Date(now + DEFAULT_LEASE_TTL_MS).toISOString(),
      });
      return { outcome: "new", owner };
    }

    if (existing.fingerprint !== fingerprint) {
      return { outcome: "conflict", code: "idempotency_mismatch" };
    }

    if (existing.status === "completed") {
      return { outcome: "replay", status: existing.response_status ?? 200, body: existing.response_body };
    }

    const expired = existing.lease_expires_at !== null && Date.parse(existing.lease_expires_at) <= now;
    if (!expired) {
      return { outcome: "conflict", code: "request_in_progress" };
    }

    const owner = randomUUID();
    this.records.set(key, {
      ...existing,
      lease_owner: owner,
      lease_expires_at: new Date(now + DEFAULT_LEASE_TTL_MS).toISOString(),
    });
    return { outcome: "new", owner };
  }

  async complete(key: string, owner: string, status: number, body: unknown): Promise<void> {
    const existing = this.records.get(key);
    if (!existing || existing.lease_owner !== owner) return;
    this.records.set(key, {
      ...existing,
      status: "completed",
      response_status: status,
      response_body: body,
      lease_owner: null,
      lease_expires_at: null,
    });
  }

  async acquireLease(key: string, ttlMs = DEFAULT_LEASE_TTL_MS): Promise<string | null> {
    const now = Date.now();
    const existing = this.records.get(key);
    if (existing && existing.lease_expires_at !== null && Date.parse(existing.lease_expires_at) > now) {
      return null;
    }
    const owner = randomUUID();
    this.records.set(key, {
      key,
      fingerprint: existing?.fingerprint ?? "",
      status: "in_progress",
      response_status: null,
      response_body: null,
      created_at: existing?.created_at ?? new Date(now).toISOString(),
      lease_owner: owner,
      lease_expires_at: new Date(now + ttlMs).toISOString(),
    });
    return owner;
  }

  async renewLease(key: string, owner: string, ttlMs = DEFAULT_LEASE_TTL_MS): Promise<boolean> {
    const existing = this.records.get(key);
    if (!existing || existing.lease_owner !== owner) return false;
    this.records.set(key, { ...existing, lease_expires_at: new Date(Date.now() + ttlMs).toISOString() });
    return true;
  }

  async releaseLease(key: string, owner: string): Promise<void> {
    const existing = this.records.get(key);
    if (!existing || existing.lease_owner !== owner) return;
    this.records.set(key, { ...existing, lease_owner: null, lease_expires_at: null });
  }
}

export const idempotencyStore = processSingleton("idempotency", () => new InMemoryIdempotencyStore());
