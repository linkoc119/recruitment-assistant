import type { SourceSegment } from "../types/index.ts";

/**
 * Splits raw JD/CV text into paragraph segments for the AI extraction port
 * and for evidence offsets (`Evidence.segment_id`/`page`/`paragraph`/
 * `start_offset`/`end_offset` all trace back to one of these). No page
 * concept exists for plain text, so `page` is always null; `paragraph` is
 * 1-based, matching the `minimum: 1` constraint on the API schema.
 */
export function segmentText(text: string): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let cursor = 0;
  let paragraph = 0;
  // Split on blank lines, keeping track of each paragraph's offset in the original text.
  for (const rawPara of text.split(/\n{2,}/)) {
    const start = text.indexOf(rawPara, cursor);
    const startOffset = start === -1 ? cursor : start;
    const trimmed = rawPara.trim();
    if (trimmed.length > 0) {
      paragraph += 1;
      segments.push({
        segment_id: `p${paragraph}`,
        page: null,
        paragraph,
        start_offset: Array.from(text.slice(0, startOffset)).length,
        end_offset: Array.from(text.slice(0, startOffset + rawPara.length)).length,
        text: rawPara,
      });
    }
    cursor = startOffset + rawPara.length;
  }
  if (segments.length === 0 && text.length > 0) {
    segments.push({ segment_id: "p1", page: null, paragraph: 1, start_offset: 0, end_offset: Array.from(text).length, text });
  }
  return segments;
}
