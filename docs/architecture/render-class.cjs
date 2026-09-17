// Render the class views (CLS-01 domain model, CLS-02 services and ports) as portable, editable SVG
// (no external dependencies). Run from any directory: node docs/architecture/render-class.cjs
// Mermaid in the companion Markdown documents remains the relationship reference; write() verifies
// that the relationships drawn here match that source, and that no two boxes overlap, before
// writing any file. Boxes are painted after edges, so a connector routed behind a class is hidden
// rather than drawn across its text.
const fs = require('node:fs');
const path = require('node:path');

const BLUE = '#146ac4';
const GREEN = '#2b8205';
const RED = '#c71025';
const GRAY = '#494949';
const AMBER = '#8a6a12';
const FONT = 'Segoe UI, Arial, sans-serif';

const TITLE_H = 34;
const STEREO_H = 20;
const LINE_H = 22;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;
const SEP_GAP = 10;

const esc = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[c]));

class ClassDiagram {
  constructor(stem, width, height, title, subtitle) {
    this.stem = stem;
    this.width = width;
    this.height = height;
    this.title = title;
    this.subtitle = subtitle;
    this.layers = { frames: [], edges: [], boxes: [], labels: [], footer: [] };
    this.boxes = new Map();
    this.relations = [];
    const source = fs.readFileSync(path.join(__dirname, stem + '.md'), 'utf8');
    this.source = source.match(/```mermaid\r?\n([\s\S]*?)```/)[1];
    this.members = new Map();
    for (const match of this.source.matchAll(/^    class (\w+)(?:~[^\n]+~)? \{\r?\n([\s\S]*?)^    \}/gm)) {
      const attrs = [], methods = [];
      const stereotype = match[2].match(/<<([^\n]+)>>/)?.[1];
      for (const raw of match[2].split(/\r?\n/)) {
        const line = raw.trim();
        if (!line.startsWith('+')) continue;
        const value = line.slice(1);
        if (value.includes('(')) {
          // Full async return contracts live in Markdown; keep the overview readable.
          methods.push(value.replace(/ Promise~.*~$/, ' [async]').replace(/\) (?!\[async\])([^ ]+)$/, '): $1'));
        } else {
          const m = value.match(/^(\S+) (\S+)$/);
          const display = m && match[1] === 'Enumerations'
            ? `${m[1]} = ${m[2].replaceAll('/', ' | ')}`
            : m ? `${m[2]}: ${m[1].replace(/Nullable~(.*)~/, '$1 | null')}` : value;
          if (match[1] === 'Enumerations' && display.length > 46) {
            const split = display.lastIndexOf(' | ', 46);
            attrs.push(display.slice(0, split), '    ' + display.slice(split));
          } else attrs.push(display);
        }
      }
      this.members.set(match[1], { attrs, methods, ...(stereotype ? { stereotype } : {}) });
    }
  }

  // Returns the <text> markup without placing it in a layer. box() uses this to keep a class's
  // text inside its own <g>, painted after that box's background rect so the fill cannot cover it.
  textMarkup(x, y, lines, { size = 17, color = BLUE, weight = 400, anchor = 'middle', gap = LINE_H, mono = false } = {}) {
    const family = mono ? ' font-family="Consolas, Menlo, monospace"' : '';
    return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${family}>${lines.map((line, i) => `<tspan x="${x}" dy="${i ? gap : 0}">${esc(line)}</tspan>`).join('')}</text>`;
  }

  text(x, y, lines, opts = {}) {
    this.layers[opts.layer || 'boxes'].push(this.textMarkup(x, y, lines, opts));
  }

  // One line, not two: the label sits in a narrow strip between this frame's border and the first
  // row of boxes, and a two-line label needs more clearance than that strip reliably has.
  frame(x, y, w, h, label, sublabel, color = GRAY) {
    this.layers.frames.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="white" stroke="${color}" stroke-width="2.5" stroke-dasharray="14 8"/>`);
    const combined = sublabel ? `${label}  —  ${sublabel}` : label;
    this.layers.footer.push(`<rect x="${x + 16}" y="${y + 10}" width="${Math.min(w - 32, combined.length * 8.6)}" height="22" fill="white"/>`);
    this.text(x + 20, y + 26, [combined], { size: 16, color, weight: 700, anchor: 'start', layer: 'footer' });
  }

  static boxHeight({ stereotype, attrs = [], methods = [] }) {
    let h = TITLE_H + PAD_TOP + PAD_BOTTOM;
    if (stereotype) h += STEREO_H;
    h += attrs.length * LINE_H;
    if (methods.length) h += (attrs.length ? SEP_GAP : 0) + methods.length * LINE_H;
    return h;
  }

  box(id, x, y, w, spec) {
    if (this.boxes.has(id)) throw new Error(`Duplicate box ${id}`);
    const members = this.members.get(id);
    if (!members) throw new Error(`Class ${id} is missing from Mermaid`);
    spec = { ...spec, ...members };
    const { title, stereotype = '', attrs = [], methods = [], color = BLUE } = spec;
    const h = ClassDiagram.boxHeight(spec);
    this.boxes.set(id, { x, y, w, h });

    // parts[0] is the background rect; every text node below is appended after it so the rect
    // (drawn first within this <g>) never paints over the text (drawn after, within the same group).
    const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="white" stroke="${color}" stroke-width="3"/>`];
    let cursor = y + (stereotype ? 25 : 32);
    if (stereotype) {
      parts.push(this.textMarkup(x + w / 2, cursor, [`«${stereotype}»`], { size: 14, color }));
      cursor += STEREO_H;
    }
    parts.push(this.textMarkup(x + w / 2, cursor + 3, [title], { size: 20, color, weight: 700 }));

    let lineY = y + TITLE_H + (stereotype ? STEREO_H : 0) + PAD_TOP;
    parts.push(`<path d="M ${x} ${lineY - PAD_TOP + 4} H ${x + w}" stroke="${color}" stroke-width="2"/>`);
    for (const attr of attrs) {
      parts.push(this.textMarkup(x + 14, lineY + 6, [attr], { size: Math.min(15, (w - 28) / (attr.length * 0.61)), color: GRAY, anchor: 'start', mono: true }));
      lineY += LINE_H;
    }
    if (methods.length) {
      if (attrs.length) {
        parts.push(`<path d="M ${x} ${lineY + 1} H ${x + w}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
        lineY += SEP_GAP;
      }
      for (const m of methods) {
        parts.push(this.textMarkup(x + 14, lineY + 6, [m], { size: Math.min(15, (w - 28) / (m.length * 0.61)), color, anchor: 'start', mono: true }));
        lineY += LINE_H;
      }
    }
    this.layers.boxes.push(`<g id="${id}"><title>${esc(id)}</title>${parts.join('')}</g>`);

    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) throw new Error(`${id}: outside canvas`);
    return h;
  }

  stack(x, w, y, specs, gap = 34) {
    let cursor = y;
    for (const [id, spec] of specs) cursor += this.box(id, x, cursor, w, spec) + gap;
    return cursor - gap;
  }

  anchor(id, side, offset = 0) {
    const b = this.boxes.get(id);
    if (!b) throw new Error(`Unknown box ${id}`);
    if (side === 'l') return [b.x, b.y + b.h / 2 + offset];
    if (side === 'r') return [b.x + b.w, b.y + b.h / 2 + offset];
    if (side === 't') return [b.x + b.w / 2 + offset, b.y];
    if (side === 'b') return [b.x + b.w / 2 + offset, b.y + b.h];
    throw new Error(`Bad side ${side}`);
  }

  // kind: association | composition | realization | dependency
  link(from, to, kind, opts = {}) {
    const { fromSide = 'r', toSide = 'l', fromOffset = 0, toOffset = 0, via = [],
      fromMult = '', toMult = '', label = '', labelAt = 0.5, labelDy = -9 } = opts;
    this.relations.push({ from, to, kind, fromMult, toMult });
    const start = this.anchor(from, fromSide, fromOffset);
    const end = this.anchor(to, toSide, toOffset);
    const bends = via.map(point => [...point]);
    if (bends.length > 1) {
      const fromAxis = fromSide === 'l' || fromSide === 'r' ? 1 : 0;
      const toAxis = toSide === 'l' || toSide === 'r' ? 1 : 0;
      bends[0][fromAxis] = start[fromAxis];
      bends[bends.length - 1][toAxis] = end[toAxis];
    }
    const points = [start, ...bends, end];

    const dashed = kind === 'realization' || kind === 'dependency' ? ' stroke-dasharray="9 7"' : '';
    const markerEnd = kind === 'realization' ? 'hollow' : 'open';
    const markerStart = kind === 'composition' ? ' marker-start="url(#diamond-filled)"' : '';
    this.layers.edges.push(`<polyline data-from="${from}" data-to="${to}" data-kind="${kind}" points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${GRAY}" stroke-width="2.4"${dashed} marker-end="url(#${markerEnd})"${markerStart}/>`);

    const place = (point, next, value, away, startEnd) => {
      if (!value) return;
      const dx = next[0] - point[0];
      const dy = next[1] - point[1];
      const len = Math.hypot(dx, dy) || 1;
      const vertical = Math.abs(dy) > Math.abs(dx);
      const x = point[0] + (dx / len) * away + (vertical ? startEnd * 25 : 0);
      const y = point[1] + (dy / len) * away + (vertical ? 0 : -10);
      this.text(x, y, [value], { size: 14, color: GRAY, layer: 'labels' });
    };
    place(start, points[1], fromMult, 14, -1);
    place(end, points[points.length - 2], toMult, 14, 1);

    if (label) {
      const i = Math.max(0, Math.min(points.length - 2, Math.floor((points.length - 1) * labelAt)));
      const shortVertical = points.length === 2 && start[0] === end[0];
      const mx = (points[i][0] + points[i + 1][0]) / 2 + (shortVertical ? 125 : 0);
      const my = (points[i][1] + points[i + 1][1]) / 2 + labelDy;
      const w = label.length * 7.6 + 16;
      this.layers.labels.push(`<rect x="${mx - w / 2}" y="${my - 14}" width="${w}" height="20" rx="3" fill="white" fill-opacity="0.97"/>`);
      this.text(mx, my, [label], { size: 14, color: GRAY, layer: 'labels' });
    }
  }

  note(x, y, w, lines, color = AMBER) {
    const h = lines.length * 21 + 26;
    this.layers.frames.push(`<path d="M ${x} ${y} H ${x + w - 18} L ${x + w} ${y + 18} V ${y + h} H ${x} Z" fill="white" stroke="${color}" stroke-width="2"/>`);
    this.layers.frames.push(`<path d="M ${x + w - 18} ${y} V ${y + 18} H ${x + w}" fill="none" stroke="${color}" stroke-width="2"/>`);
    lines.forEach((line, i) => this.text(x + 12, y + 25 + i * 21, [line], { size: 14, color, anchor: 'start', layer: 'frames' }));
    return h;
  }

  legend(y, items) {
    this.text(30, y, [this.title], { size: 27, color: GRAY, anchor: 'start', layer: 'footer' });
    this.text(30, y + 28, [this.subtitle], { size: 16, color: GRAY, anchor: 'start', layer: 'footer' });
    let x = 30;
    for (const [glyph, label] of items) {
      this.layers.footer.push(`<g transform="translate(${x}, ${y + 56})">${glyph}</g>`);
      this.text(x + 74, y + 66, [label], { size: 15, color: GRAY, anchor: 'start', layer: 'footer' });
      x += 74 + label.length * 8 + 44;
    }
  }

  write() {
    // Prevent a visual restyle from silently dropping or adding relationships: the Mermaid class
    // diagram in the companion Markdown file is the reference, exactly as render-c4.cjs does for C4.
    const kinds = { '-->': 'association', '*--': 'composition', '..>': 'dependency', '..|>': 'realization' };
    const signature = r => JSON.stringify([r.from, r.to, r.kind, r.fromMult, r.toMult]);
    const expected = [...this.source.matchAll(/^ {4}(\w+)\s+(?:"([^"]*)"\s+)?(\*--|-->|\.\.\|>|\.\.>)\s+(?:"([^"]*)"\s+)?(\w+)\s*(?::|$)/gm)]
      .map(m => signature({ from: m[1], to: m[5], kind: kinds[m[3]], fromMult: m[2] || '', toMult: m[4] || '' })).sort();
    const actual = this.relations.map(signature).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(`${this.stem}: relationship kind/multiplicity mismatch.\nMissing: ${expected.filter(r => !actual.includes(r))}\nExtra: ${actual.filter(r => !expected.includes(r))}`);
    }
    if (JSON.stringify([...this.members.keys()].sort()) !== JSON.stringify([...this.boxes.keys()].sort())) {
      throw new Error(`${this.stem}: class identities differ from Mermaid`);
    }
    for (const { from, to } of this.relations) for (const id of [from, to]) {
      if (!this.boxes.has(id)) throw new Error(`Unknown endpoint ${id}`);
    }

    // Overlapping boxes are the failure mode of hand-placed layout; catch it here rather than by eye.
    const entries = [...this.boxes.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, a] = entries[i];
        const [idB, b] = entries[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          throw new Error(`${this.stem}: boxes ${idA} and ${idB} overlap`);
        }
      }
    }

    const defs = `<defs>
<marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="${GRAY}" stroke-width="1.8"/></marker>
<marker id="hollow" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="13" markerHeight="13" orient="auto"><path d="M 1 1 L 13 7 L 1 13 Z" fill="white" stroke="${GRAY}" stroke-width="1.8"/></marker>
<marker id="diamond-filled" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="16" markerHeight="12" orient="auto"><path d="M 1 6 L 9 1 L 17 6 L 9 11 Z" fill="${GRAY}" stroke="${GRAY}" stroke-width="1.5"/></marker>
</defs>`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="title desc" font-family="${FONT}">\n<title id="title">${esc(this.title)}</title>\n<desc id="desc">${esc(this.subtitle)} Relationships are verified against the Mermaid source in the accompanying document.</desc>\n${defs}\n<rect width="100%" height="100%" fill="white"/>\n${Object.values(this.layers).flat().join('\n')}\n</svg>\n`;
    fs.writeFileSync(path.join(__dirname, 'diagrams', this.stem + '.svg'), svg);
    console.log(`${this.stem}: ${this.boxes.size} classes, ${actual.length} verified relationships`);
  }
}

const LEGEND = [
  [`<path d="M 0 10 H 56" stroke="${GRAY}" stroke-width="2.4" marker-end="url(#open)"/>`, 'association'],
  [`<path d="M 14 10 H 56" stroke="${GRAY}" stroke-width="2.4" marker-start="url(#diamond-filled)"/>`, 'composition (whole owns part)'],
  [`<path d="M 0 10 H 54" stroke="${GRAY}" stroke-width="2.4" stroke-dasharray="9 7" marker-end="url(#hollow)"/>`, 'realization (implements)'],
  [`<path d="M 0 10 H 56" stroke="${GRAY}" stroke-width="2.4" stroke-dasharray="9 7" marker-end="url(#open)"/>`, 'dependency (uses)'],
];

// ===========================================================================
// CLS-01 - Domain model: the 14 persisted entities plus the validated JSON value objects.
// Class members come from Markdown. These are selected internal types, not public response DTOs.
// ===========================================================================
{
  const d = new ClassDiagram('class-domain', 2240, 2360,
    'CLS-01 — Domain Model: JD-based CV Screening and Ranking',
    'Proposed TypeScript domain types under backend/src/domain, selected from the 14-table schema; public responses require DTO assembly.');

  const W = 430;
  const X = [40, 600, 1160, 1720];
  const TOP = 90;

  d.stack(X[0], W, TOP, [
    ['Job', {
      title: 'Job', stereotype: 'entity · domain/position',


    }],
    ['CriteriaVersion', {
      title: 'CriteriaVersion', stereotype: 'entity · domain/criteria',


    }],
    ['JobRequirement', {
      title: 'JobRequirement', stereotype: 'entity · domain/criteria',

    }],
    ['Skill', {
      title: 'Skill', stereotype: 'entity · domain/criteria',

    }],
  ]);

  d.stack(X[1], W, TOP, [
    ['Candidate', {
      title: 'Candidate', stereotype: 'entity · domain/candidates',

    }],
    ['Resume', {
      title: 'Resume', stereotype: 'entity · domain/candidates',

    }],
    ['PositionResume', {
      title: 'PositionResume', stereotype: 'association · membership',

    }],
    ['ResumeSnapshot', {
      title: 'ResumeSnapshot', stereotype: 'entity (immutable)',

    }],
    ['ResumeSkill', {
      title: 'ResumeSkill', stereotype: 'entity (immutable)',

    }],
  ]);

  d.stack(X[2], W, TOP, [
    ['ScreeningRun', {
      title: 'ScreeningRun', stereotype: 'entity · domain/runs',


    }],
    ['ScreeningRunItem', {
      title: 'ScreeningRunItem', stereotype: 'entity · domain/runs',

    }],
    ['PolicySnapshot', {
      title: 'PolicySnapshot', stereotype: 'value object (frozen)',

      color: AMBER,
    }],
    ['Evidence', {
      title: 'Evidence', stereotype: 'value object (validated)',

      color: AMBER,
    }],
  ]);

  d.stack(X[3], W, TOP, [
    ['Screening', {
      title: 'Screening', stereotype: 'entity · domain/decisions',

    }],
    ['ScreeningDetail', {
      title: 'ScreeningDetail', stereotype: 'entity (immutable)',

    }],
    ['Enumerations', {
      title: 'Enumerations', stereotype: 'union types · domain',
      color: GREEN,
    }],
  ]);

  d.box('ResumeExtractionJob', 600, 1480, 520, {
    title: 'ResumeExtractionJob', stereotype: 'entity - durable extraction',
  });
  d.link('PositionResume', 'ResumeExtractionJob', 'association', { fromSide: 'l', toSide: 'l', via: [[555, 720], [555, 1700]], fromMult: '1', toMult: '0..*', label: 'originating membership', labelAt: 0.5, labelDy: 230 });
  d.link('ResumeExtractionJob', 'ResumeSnapshot', 'association', { fromSide: 'r', toSide: 'r', via: [[1130, 1730], [1130, 950]], fromMult: '0..1', toMult: '0..1', label: 'committed output', labelAt: 0.5 });
  d.link('ScreeningRunItem', 'ResumeExtractionJob', 'association', { fromSide: 'r', toSide: 'r', via: [[1640, 600], [1640, 1750]], fromMult: '0..*', toMult: '0..1', label: 'internal recovery only', labelAt: 0.5 });

  // Position and criteria.
  d.link('Job', 'CriteriaVersion', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '0..*', label: 'revisions' });
  d.link('CriteriaVersion', 'JobRequirement', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '0..*', label: 'criteria' });
  d.link('JobRequirement', 'Skill', 'association', { fromSide: 'b', toSide: 't', fromMult: '0..*', toMult: '0..1', label: 'canonical' });

  // Candidate and CV.
  d.link('Candidate', 'Resume', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '1..*', label: 'versions' });
  d.link('Resume', 'PositionResume', 'association', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '0..*' });
  d.link('Resume', 'ResumeSnapshot', 'composition', { fromSide: 'r', toSide: 'r', fromOffset: -60, via: [[1055, 407], [1055, 963]], fromMult: '1', toMult: '0..*', label: 'extractions', labelAt: 0.5 });
  d.link('ResumeSnapshot', 'ResumeSkill', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '0..*', label: 'skill facts' });
  d.link('ResumeSkill', 'Skill', 'association', { fromSide: 'l', toSide: 'b', via: [[515, 1244], [255, 1244]], fromMult: '0..*', toMult: '0..1' });

  // The position owns its CV membership and its runs; it points at exactly one published run.
  d.link('Job', 'PositionResume', 'composition', { fromSide: 'r', toSide: 'l', fromOffset: -40, via: [[515, 206], [515, 726]], fromMult: '1', toMult: '0..*', label: 'accepted CVs', labelAt: 1 });
  d.link('Job', 'ScreeningRun', 'composition', { fromSide: 't', toSide: 't', fromOffset: 60, toOffset: -100, via: [[315, 30], [1275, 30]], fromMult: '1', toMult: '0..*', label: 'runs', labelAt: 1 });
  d.link('Job', 'ScreeningRun', 'dependency', { fromSide: 't', toSide: 't', fromOffset: 140, toOffset: 80, via: [[395, 58], [1455, 58]], toMult: '0..1', label: 'published_run_id', labelAt: 1, labelDy: -22 });

  // Runs freeze their inputs and can reuse a previous run.
  d.link('ScreeningRun', 'CriteriaVersion', 'association', { fromSide: 'l', toSide: 'r', toOffset: 38, via: [[1095, 257], [1095, 638], [515, 638], [515, 608]], fromMult: '0..*', toMult: '1', label: 'frozen input', labelAt: 0.5 });
  d.link('ScreeningRun', 'ScreeningRun', 'association', { fromSide: 'r', toSide: 'r', fromOffset: -140, toOffset: -61, via: [[1635, 117], [1635, 196]], toMult: '0..1', label: 'base_run_id', labelAt: 1 });
  d.link('ScreeningRun', 'PolicySnapshot', 'composition', { fromSide: 'l', toSide: 'l', fromOffset: 140, toOffset: -40, via: [[1140, 397], [1140, 806]], fromMult: '1', toMult: '1' });
  d.link('ScreeningRun', 'ScreeningRunItem', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '1..*', label: 'frozen CV selection' });
  d.link('ScreeningRunItem', 'ResumeSnapshot', 'association', { fromSide: 'l', toSide: 'r', toOffset: -37, via: [[1120, 587], [1120, 926]], fromMult: '0..*', toMult: '0..1', label: 'scored snapshot', labelAt: 0.5 });

  // Results and their explanation.
  d.link('ScreeningRunItem', 'Screening', 'association', { fromSide: 'r', toSide: 'l', via: [[1655, 587], [1655, 263]], fromMult: '1', toMult: '0..1', label: 'on success', labelAt: 1 });
  d.link('Screening', 'ScreeningDetail', 'composition', { fromSide: 'b', toSide: 't', fromMult: '1', toMult: '1..*', label: 'per criterion' });
  d.link('ScreeningDetail', 'Evidence', 'composition', { fromSide: 'l', toSide: 'r', via: [[1655, 610], [1655, 1083]], fromMult: '1', toMult: '0..*' });
  d.link('ScreeningDetail', 'JobRequirement', 'association', { fromSide: 'r', toSide: 'l', fromOffset: 120, via: [[2190, 730], [2190, 1410], [20, 1410], [20, 878]], fromMult: '0..*', toMult: '1', label: 'explains', labelAt: 0.5 });

  d.note(X[0], 2100, 990, [
    'Immutability: CriteriaVersion and its JobRequirement rows freeze on approval; ResumeSnapshot,',
    'ResumeSkill and ScreeningDetail are never updated. Re-extraction always inserts a new snapshot,',
    'and a criteria-only rescore reuses the exact snapshot_id of each successful base-run item.',
  ]);
  d.note(X[2], 2100, 990, [
    'Decimal retains calculation precision; only DisplayedScore is rounded to two decimal places.',
    'DTO assembly adds derived fields and excludes internal data. Draft criteria may be empty.',
    'Q11: every read is scoped by job_id first — a valid id from another position resolves to a generic 404.',
  ], GRAY);

  d.legend(2226, LEGEND);
  d.write();
}

// ===========================================================================
// CLS-02 - Services and ports, laid out by the 3-tier folder structure so that the picture and the
// directory tree read the same way. Dependencies only ever point downward, never back up.
// ===========================================================================
{
  const d = new ClassDiagram('class-services', 2180, 1740,
    'CLS-02 — Services and Ports: Screening Backend and Worker',
    'Proposed classes under backend/src and backend/worker/src, arranged by folder tier. The C3 component ID is given in each service stereotype.');

  const WIDE = 470;
  const XW = [60, 600, 1140, 1660];
  const NARROW = 320;
  const XN = [55, 405, 755, 1105, 1455, 1805];

  d.frame(30, 36, 2120, 322, 'backend/src/app/api', 'Tier 1 · 21 Next.js Route Handler modules covering the 26 OpenAPI operationIds');
  d.frame(30, 400, 2120, 280, 'backend/src/domain', 'Tier 2 · business rules; repositories and adapters arrive as explicit function parameters');
  d.frame(30, 700, 2120, 480, 'backend/src/infrastructure', 'Tier 3 · ports and proposed PostgreSQL / S3 / HTTPS adapters');
  d.frame(30, 1200, 2120, 270, 'backend/worker/src', 'Separate process · claims a lease, then calls the same domain services');

  // Tier 1.
  d.box('RouteHandler', XW[0], 86, WIDE, {
    title: 'RouteHandler', stereotype: 'module · app/api/**/route.ts',


  });
  d.box('RequestValidator', XW[1], 86, WIDE, {
    title: 'RequestValidator', stereotype: 'module · lib/http/validate.ts',

  });
  d.box('ApiSchemas', XW[2], 86, WIDE, {
    title: 'ApiSchemas', stereotype: 'module · lib/http/schemas · zod',

  });
  d.box('HttpEnvelope', XW[3], 86, WIDE, {
    title: 'HttpEnvelope', stereotype: 'module · lib/http/errors.ts',


  });

  // Tier 2.
  d.box('PositionService', XN[0], 438, NARROW, {
    title: 'PositionService', stereotype: 'domain/position · CRIT',

  });
  d.box('CriteriaService', XN[1], 438, NARROW, {
    title: 'CriteriaService', stereotype: 'domain/criteria · CRIT',

  });
  d.box('ResumeService', XN[2], 438, NARROW, {
    title: 'ResumeService', stereotype: 'domain/candidates · CV',

  });
  d.box('RunService', XN[3], 438, NARROW, {
    title: 'RunService', stereotype: 'domain/runs · RUN',

  });
  d.box('ReviewService', XN[4], 438, NARROW, {
    title: 'ReviewService', stereotype: 'domain/decisions · REVIEW',

  });
  d.box('ScoringEngine', XN[5], 438, NARROW, {
    title: 'ScoringEngine', stereotype: 'domain/scoring · SCORE · pure',

    color: GREEN,
  });

  // Tier 3 — ports.
  d.box('AiExtractionService', XW[0], 750, WIDE, {
    title: 'AiExtractionService', stereotype: 'interface · ai · C3 EXTRACT',

  });
  d.box('Repository', XW[1], 750, WIDE, {
    title: 'Repository<T>', stereotype: 'interface · db/repositories · C3 DATA',

  });
  d.box('FileStore', XW[2], 750, WIDE, {
    title: 'FileStore', stereotype: 'interface · files · C3 DATA',

  });
  d.box('IdempotencyStore', XW[3], 750, WIDE, {
    title: 'IdempotencyStore', stereotype: 'interface · idempotency',

  });

  // Tier 3 — adapters.
  d.box('OpenAiExtractionAdapter', XW[0], 960, WIDE, {
    title: 'OpenAiExtractionAdapter', stereotype: 'adapter · HTTPS · proposed',


    color: RED,
  });
  d.box('PostgresRepository', XW[1], 960, WIDE, {
    title: 'PostgresRepository<T>', stereotype: 'adapter · SQL transactions · proposed',


    color: RED,
  });
  d.box('S3FileStore', XW[2], 960, WIDE, {
    title: 'S3FileStore', stereotype: 'adapter',


    color: RED,
  });
  d.box('PostgresIdempotencyStore', XW[3], 960, WIDE, {
    title: 'PostgresIdempotencyStore', stereotype: 'adapter',


    color: RED,
  });

  // Worker tier.
  d.box('WorkerLoop', XW[0], 1250, WIDE, {
    title: 'WorkerLoop', stereotype: 'worker/src/index.ts',


  });
  d.box('ExtractResumeTask', XW[1], 1250, WIDE, {
    title: 'ExtractResumeTask', stereotype: 'worker/src/tasks/extract-resume',

  });
  d.box('RunScreeningTask', XW[2], 1250, WIDE, {
    title: 'RunScreeningTask', stereotype: 'worker/src/tasks/run-screening',

  });
  d.box('RescoreTask', XW[3], 1250, WIDE, {
    title: 'RescoreTask', stereotype: 'worker/src/tasks/rescore',

  });

  // Tier 1 internals.
  d.link('RouteHandler', 'RequestValidator', 'dependency', { fromSide: 'r', toSide: 'l', label: 'validates' });
  d.link('RouteHandler', 'ApiSchemas', 'dependency', { fromSide: 't', toSide: 't', fromOffset: -60, via: [[235, 62], [1375, 62]], label: 'shapes', labelAt: 1 });
  d.link('RouteHandler', 'HttpEnvelope', 'dependency', { fromSide: 't', toSide: 't', fromOffset: 60, via: [[355, 74], [1895, 74]], label: 'renders', labelAt: 1 });

  // Tier 1 calls tier 2.
  d.link('RouteHandler', 'PositionService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -80 });
  d.link('RouteHandler', 'CriteriaService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -40, via: [[255, 410], [565, 410]] });
  d.link('RouteHandler', 'ResumeService', 'dependency', { fromSide: 'b', toSide: 't', via: [[295, 398], [915, 398]] });
  d.link('RouteHandler', 'RunService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 40, via: [[335, 390], [1265, 390]] });
  d.link('RouteHandler', 'ReviewService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 80, via: [[375, 382], [1615, 382]], label: 'position-scoped', labelAt: 1 });

  // Tier 2 reaches data only through the ports; the five services fan into Repository<T>.
  d.link('PositionService', 'Repository', 'dependency', { fromSide: 'b', toSide: 't', toOffset: -200, via: [[215, 700], [635, 700]] });
  d.link('CriteriaService', 'Repository', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -40, toOffset: -100, via: [[525, 712], [735, 712]] });
  d.link('ResumeService', 'Repository', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -40, via: [[875, 724], [835, 724]] });
  d.link('RunService', 'Repository', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -40, toOffset: 100, via: [[1225, 712], [935, 712]] });
  d.link('ReviewService', 'Repository', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: -40, toOffset: 200, via: [[1575, 724], [1035, 724]] });

  d.link('CriteriaService', 'AiExtractionService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 40, toOffset: 60, via: [[605, 736], [355, 736]], label: 'suggests only' });
  d.link('ResumeService', 'AiExtractionService', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 40, toOffset: -120, via: [[955, 744], [175, 744]] });
  d.link('ResumeService', 'FileStore', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 80, via: [[995, 732], [1375, 732]] });
  d.link('RunService', 'IdempotencyStore', 'dependency', { fromSide: 'b', toSide: 't', fromOffset: 80, via: [[1345, 740], [1895, 740]], label: 'one active run' });
  d.link('RunService', 'ResumeService', 'dependency', { fromSide: 'l', toSide: 'r', label: 'resolve shared extraction', labelDy: -110 });
  d.link('RunService', 'ScoringEngine', 'dependency', { fromSide: 't', toSide: 't', fromOffset: 100, via: [[1365, 414], [1965, 414]], label: 'snapshot in, score out' });

  // Adapters realize the ports.
  d.link('OpenAiExtractionAdapter', 'AiExtractionService', 'realization', { fromSide: 't', toSide: 'b' });
  d.link('PostgresRepository', 'Repository', 'realization', { fromSide: 't', toSide: 'b' });
  d.link('S3FileStore', 'FileStore', 'realization', { fromSide: 't', toSide: 'b' });
  d.link('PostgresIdempotencyStore', 'IdempotencyStore', 'realization', { fromSide: 't', toSide: 'b' });

  // The worker claims a lease, then re-enters the same domain services.
  d.link('WorkerLoop', 'ExtractResumeTask', 'association', { fromSide: 'r', toSide: 'l', toOffset: -27 });
  d.link('WorkerLoop', 'RunScreeningTask', 'association', { fromSide: 'b', toSide: 'b', fromOffset: -60, via: [[235, 1424], [1375, 1424]] });
  d.link('WorkerLoop', 'RescoreTask', 'association', { fromSide: 'b', toSide: 'b', fromOffset: 60, via: [[355, 1440], [1895, 1440]] });
  d.link('WorkerLoop', 'IdempotencyStore', 'dependency', { fromSide: 'b', toSide: 'r', fromOffset: 140, via: [[435, 1452], [2160, 1452], [2160, 835]], label: 'acquireLease', labelAt: 0 });
  d.link('ExtractResumeTask', 'ResumeService', 'dependency', { fromSide: 'r', toSide: 'b', via: [[1105, 1302], [1105, 690], [915, 690]] });
  d.link('RunScreeningTask', 'RunService', 'dependency', { fromSide: 'r', toSide: 'b', via: [[1635, 1302], [1635, 684], [1265, 684]] });
  d.link('RescoreTask', 'RunService', 'dependency', { fromSide: 'r', toSide: 'b', toOffset: 40, via: [[2160, 1302], [2160, 676], [1305, 676]], label: 'reuses snapshots', labelAt: 2 });

  d.note(1180, 1500, 970, [
    'Methods marked [async] return Promise; full types and context definitions are in the Markdown source.',
    'API and worker are separate processes sharing PostgreSQL. Worker writes validate owner/token/expiry.',
    'Transactions lock the position and atomically publish results. No implementation is claimed.',
  ], GRAY);

  d.legend(1600, LEGEND);
  d.write();
}
