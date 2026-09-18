import { toSkillDto } from "../../../domain/dto/index.ts";
import { skillRepository } from "../../../infrastructure/db/repositories/index.ts";
import { mapDomainError, okJson } from "../../../lib/http/errors.ts";
import { parseQuery } from "../../../lib/http/validate.ts";
import { listSkillsQuerySchema } from "../../../lib/http/schemas/index.ts";

export async function GET(req: Request) {
  const query = parseQuery(new URL(req.url), listSkillsQuerySchema);
  if ("error" in query) return query.error;

  try {
    const { items, total } = await skillRepository.listAll(query.data);
    return okJson(200, {
      items: items.map(toSkillDto),
      page: { offset: query.data.offset, limit: query.data.limit, total },
    });
  } catch (err) {
    return mapDomainError(err);
  }
}
