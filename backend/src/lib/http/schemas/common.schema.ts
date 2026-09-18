import { z } from "zod";

/**
 * Shared zod primitives mirroring openapi.yaml's reusable schemas
 * (`Id`/`NullableId`, `Version`, `Decimal`/`NullableDecimal`, the `offset`/
 * `limit` query parameters). Every request schema across `schemas/*.ts` is
 * built from these so a contract change only needs updating in one place.
 */

/** openapi.yaml `Id` / `NullableId`: positive bigint encoded as a decimal string. */
export const idSchema = z.string().regex(/^[1-9][0-9]*$/, "must be a positive integer id");

/** openapi.yaml `Version`: integer >= 1. */
export const versionSchema = z.number().int().min(1);

/** openapi.yaml `Decimal` / `NullableDecimal`: non-negative decimal string, never a JS float. */
export const decimalSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, "must be a non-negative decimal string");

/** components/parameters/offset. */
export const offsetSchema = z.coerce.number().int().min(0).default(0);
/** components/parameters/limit. */
export const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

/**
 * A string with at least one non-whitespace character — openapi.yaml's
 * `pattern: \S` on `JobInput`/`JobUpdate` title and jd_raw_text. `minLength: 1`
 * alone would still admit a whitespace-only value, which the contract rejects.
 */
export function nonBlankString(maxLength?: number): z.ZodString {
  const base = z.string().min(1, "must not be blank").regex(/\S/, "must not be blank");
  return maxLength !== undefined ? base.max(maxLength) : base;
}

/** `GET /jobs/{job_id}/skills`-style listing query: offset/limit only, no status filter in the contract. */
export const listSkillsQuerySchema = z.object({ offset: offsetSchema, limit: limitSchema }).strict();
