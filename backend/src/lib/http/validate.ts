import type { ZodSchema } from "zod";
import { apiError } from "./errors.ts";

export type ParseResult<T> = { data: T } | { error: Response };

export async function parseJsonBody<T>(req: Request, schema: ZodSchema<T>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: apiError(400, "invalid_json", "Request body is not valid JSON.") };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { error: apiError(422, "validation_failed", "Request body failed validation.") };
  }
  return { data: result.data };
}
