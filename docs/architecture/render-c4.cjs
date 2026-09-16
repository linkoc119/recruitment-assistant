// Render the C4 views (C1-C3) and the deployment view as portable, editable SVG (no external dependencies).
// Run from any directory: node docs/architecture/render-c4.cjs
// Mermaid in the companion Markdown documents remains the relationship reference.
const fs = require('node:fs');
const path = require('node:path');

const BLUE = '#146ac4';
const GREEN = '#2b8205';
const RED = '#c71025';
const GRAY = '#494949';
const AMBER = '#8a6a12';
const FONT = 'Segoe UI, Arial, sans-serif';
const esc = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[c]));

class Diagram {
  constructor(stem, width, height, title) {
    this.stem = stem;
    this.width = width;
    this.height = height;
    this.title = title;
    this.layers = { frames: [], edges: [], nodes: [], labels: [], footer: [] };
    this.ids = new Set();
    this.relations = [];
  }

  text(x, y, lines, { size = 21, color = BLUE, weight = 400, anchor = 'middle', gap = size * 1.28, layer = 'nodes' } = {}) {
    this.layers[layer].push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? gap : 0}">${esc(line)}</tspan>`).join('')}</text>`);
  }

  frame(x, y, w, h, title, type, { color = BLUE, dash = null } = {}) {
    const dashed = dash ? ` stroke-dasharray="${dash}"` : '';
    this.layers.frames.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="white" stroke="${color}" stroke-width="3"${dashed}/>`);
    this.text(x + 18, y + h - 39, [title], { size: 23, color, weight: 700, anchor: 'start', layer: 'frames' });
    this.text(x + 18, y + h - 15, [type], { size: 15, color, anchor: 'start', layer: 'frames' });
  }

  node(id, x, y, w, h, title, type, description, kind = 'box', color = BLUE) {
    if (this.ids.has(id)) throw new Error(`Duplicate node ${id}`);
    this.ids.add(id);
    const shapes = [];
    let offset = 38;
    if (kind === 'person') {
      const radius = 61;
      const bodyY = y + 111;
      shapes.push(`<rect x="${x}" y="${bodyY}" width="${w}" height="${h - 111}" rx="59" fill="white" stroke="${color}" stroke-width="6"/>`);
      shapes.push(`<circle cx="${x + w / 2}" cy="${y + radius}" r="${radius}" fill="white" stroke="${color}" stroke-width="6"/>`);
      offset = 154;
    } else if (kind === 'database' || kind === 'bucket') {
      const ry = 23;
      const inset = kind === 'bucket' ? 28 : 0;
      shapes.push(`<path d="M ${x} ${y + ry} L ${x + inset} ${y + h - ry} A ${w / 2 - inset} ${ry} 0 0 0 ${x + w - inset} ${y + h - ry} L ${x + w} ${y + ry} Z" fill="white" stroke="${color}" stroke-width="5"/>`);
      shapes.push(`<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="white" stroke="${color}" stroke-width="5"/>`);
      offset = 73;
    } else {
      shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="white" stroke="${color}" stroke-width="5"/>`);
      if (kind === 'browser') {
        shapes.push(`<path d="M ${x} ${y + 29} H ${x + w}" stroke="${color}" stroke-width="5"/>`);
        for (let i = 0; i < 3; i++) shapes.push(`<circle cx="${x + 17 + 20 * i}" cy="${y + 14}" r="6" fill="${color}"/>`);
        offset = 65;
      } else if (kind === 'component') {
        for (const dy of [18, 48]) shapes.push(`<rect x="${x - 15}" y="${y + dy}" width="36" height="21" rx="2" fill="white" stroke="${color}" stroke-width="4"/>`);
        offset = 46;
      } else if (kind === 'backend') {
        shapes.push(`<path d="M ${x + 19} ${y + 18} l 13 9 l -13 9 M ${x + 41} ${y + 38} h 20" fill="none" stroke="${color}" stroke-width="4"/>`);
        offset = 67;
      }
    }
    this.layers.nodes.push(`<g id="${id}"><title>${esc(id + ' · ' + title.join(' '))}</title>${shapes.join('')}</g>`);
    const titleSize = kind === 'person' ? 28 : w >= 400 ? 28 : 24;
    this.text(x + w / 2, y + offset, title, { size: titleSize, color, weight: 700 });
    const typeY = y + offset + (title.length - 1) * titleSize * 1.28 + 27;
    this.text(x + w / 2, typeY, [type], { size: 14, color });
    this.text(x + w / 2, typeY + 34, description, { size: 20, color, gap: 25 });
    const lastLine = typeY + 34 + (description.length - 1) * 25;
    if (lastLine > y + h - 12) throw new Error(`${id}: text exceeds node height`);
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) throw new Error(`${id}: outside canvas`);
  }

  edge(from, to, points, labelX, labelY, lines, protocol = '', width = 280) {
    this.relations.push(`${from}->${to}`);
    const coords = points.map(p => p.join(',')).join(' ');
    this.layers.edges.push(`<polyline data-from="${from}" data-to="${to}" points="${coords}" fill="none" stroke="${GRAY}" stroke-width="2.6" stroke-dasharray="11 9" marker-end="url(#arrow)"/>`);
    const lineGap = 25;
    const h = lines.length * lineGap + (protocol ? 21 : 0) + 10;
    this.layers.labels.push(`<rect x="${labelX - width / 2}" y="${labelY - 20}" width="${width}" height="${h}" rx="3" fill="white" fill-opacity="0.98"/>`);
    this.text(labelX, labelY, lines, { size: 20, gap: lineGap, color: GRAY, layer: 'labels' });
    if (protocol) this.text(labelX, labelY + lines.length * lineGap, [`[${protocol}]`], { size: 14, color: GRAY, layer: 'labels' });
  }

  footer(y, { items = [[30, GREEN, 'Person · User'], [360, BLUE, 'Software in scope'], [735, RED, 'External system']], note = 'Dashed arrow: directed relationship; its label states the responsibility and protocol. Large frame: system/container boundary.' } = {}) {
    this.text(30, y, [this.title], { size: 29, color: GRAY, anchor: 'start', layer: 'footer' });
    this.text(30, y + 31, ['Proposed architecture · JD-based CV screening and ranking only · Backend/AI not implemented'], { size: 18, color: GRAY, anchor: 'start', layer: 'footer' });
    for (const [x, color, label] of items) {
      this.layers.footer.push(`<rect x="${x}" y="${y + 54}" width="20" height="20" rx="3" fill="white" stroke="${color}" stroke-width="3"/>`);
      this.text(x + 32, y + 71, [label], { size: 17, color: GRAY, anchor: 'start', layer: 'footer' });
    }
    this.text(30, y + 103, [note], { size: 17, color: GRAY, anchor: 'start', layer: 'footer' });
    this.text(30, y + 130, ['JD: job description · CV: candidate application file · Presentation style references Simon Brown\'s C4 examples (c4model.com).'], { size: 15, color: GRAY, anchor: 'start', layer: 'footer' });
  }

  write() {
    // Prevent a visual restyle from silently dropping or adding architectural relationships.
    const source = fs.readFileSync(path.join(__dirname, this.stem + '.md'), 'utf8');
    const expected = [...source.matchAll(/^\s*(\w+) -\.?->\|[^\n]*?\| (\w+)/gm)].map(m => `${m[1]}->${m[2]}`).sort();
    const actual = [...this.relations].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${this.stem}: relationships differ from Mermaid`);
    for (const edge of actual) for (const id of edge.split('->')) if (!this.ids.has(id)) throw new Error(`Unknown endpoint ${id}`);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="title desc" font-family="${FONT}">\n<title id="title">${esc(this.title)}</title>\n<desc id="desc">Proposed architecture for JD-based CV screening and ranking. The backend and AI integration are not implemented. Relationships are verified against the Mermaid source in the accompanying document.</desc>\n<defs><marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M 0 0 L 12 6 L 0 12 Z" fill="${GRAY}"/></marker></defs>\n<rect width="100%" height="100%" fill="white"/>\n${Object.values(this.layers).flat().join('\n')}\n</svg>\n`;
    fs.writeFileSync(path.join(__dirname, 'diagrams', this.stem + '.svg'), svg);
    console.log(`${this.stem}: ${this.ids.size} nodes, ${actual.length} verified relationships`);
  }
}

// C1: one software system, a person and an external extraction service.
{
  const d = new Diagram('c1-context', 1600, 1090, 'System Context View: JD-based CV Screening and Ranking');
  d.node('REC', 130, 35, 450, 345, ['Recruiter'], '[Person]', ['Reviews criteria and verifies results', 'and decides to shortlist or reject.'], 'person', GREEN);
  d.node('SYS', 130, 585, 450, 250, ['JD-based CV Screening', 'and Ranking'], '[Software System]', ['Evaluates CVs against approved criteria;', 'provides scores, evidence,', 'and screening-run history.']);
  d.node('AI', 1030, 585, 450, 250, ['AI Extraction Service'], '[External Software System]', ['Extracts data from JDs and CVs', 'with source evidence locations.', 'Does not decide scores or shortlists.'], 'box', RED);
  d.edge('REC', 'SYS', [[245,380],[245,585]], 210, 453, ['Enters JD, uploads CVs, approves', 'criteria, and requests screening'], '', 330);
  d.edge('SYS', 'AI', [[580,655],[1030,655]], 805, 605, ['Sends text to extract and', 'the expected result structure'], '', 370);
  d.footer(920);
  d.write();
}

// C2: preserve the four containers chosen in arc42; no extra static-content service.
{
  const d = new Diagram('c2-containers', 1650, 1690, 'Container View: JD-based CV Screening and Ranking');
  d.frame(55, 405, 1135, 1075, 'JD-based CV Screening and Ranking', '[Software System]');
  d.node('REC', 440, 25, 380, 310, ['Recruiter'], '[Person]', ['Reviews criteria and results', 'and records decisions.'], 'person', GREEN);
  d.node('WEB', 450, 465, 360, 210, ['Web App'], '[Container: HTML/CSS/JavaScript]', ['Presents the workflow and CV viewer;', 'tracks screening progress.'], 'browser');
  d.node('API', 450, 815, 360, 235, ['Screening Backend'], '[Container: Python/FastAPI]', ['Provides the API, coordinates jobs,', 'scores CVs, and manages history.'], 'backend');
  d.node('FILES', 170, 1190, 330, 190, ['CV Store'], '[Container: S3-compatible storage]', ['Stores original CV files', 'in a private bucket.'], 'bucket');
  d.node('DB', 770, 1190, 330, 190, ['Screening Database'], '[Container: PostgreSQL]', ['Criteria, input snapshots,', 'jobs, and screening results.'], 'database');
  d.node('AI', 1255, 815, 350, 235, ['AI Extraction Service'], '[External Software System: HTTPS API]', ['Extracts structured JD/CV data', 'with source evidence.'], 'box', RED);
  d.edge('REC', 'WEB', [[630,335],[630,465]], 630, 360, ['Interacts and views results'], 'Browser', 310);
  d.edge('WEB', 'API', [[630,675],[630,815]], 630, 723, ['Sends commands, queries, and polls'], 'HTTPS/JSON; CV: multipart', 355);
  d.edge('API', 'FILES', [[530,1050],[340,1190]], 330, 1100, ['Stores and reads CV files'], 'HTTPS/S3 API', 275);
  d.edge('API', 'DB', [[730,1050],[930,1190]], 950, 1100, ['Reads/writes and runs transactions'], 'SQL/TCP', 280);
  d.edge('API', 'AI', [[810,930],[1255,930]], 1015, 855, ['Sends text; receives', 'structured extracted data'], 'HTTPS/JSON', 315);
  d.footer(1525);
  d.write();
}

// C3: the API container is expanded; neighbouring containers remain outside it.
{
  const d = new Diagram('c3-components', 2340, 2230, 'Component View: JD-based CV Screening — Screening Backend');
  d.frame(50, 40, 1790, 1990, 'JD-based CV Screening and Ranking', '[Software System]');
  d.frame(80, 330, 1730, 1290, 'Screening Backend', '[Container: Python/FastAPI]');
  d.node('WEB', 760, 65, 360, 205, ['Web App'], '[Container: HTML/CSS/JavaScript]', ['Sends commands, displays results,', 'and tracks jobs.'], 'browser');
  d.node('HTTP', 760, 400, 360, 190, ['API Controllers'], '[Component: FastAPI routers]', ['Validates requests, context,', 'and versions.'], 'component');
  d.node('CRIT', 140, 740, 300, 205, ['Criteria Service'], '[Component: Python]', ['Manages positions, JDs,', 'and criteria revisions.'], 'component');
  d.node('CV', 560, 740, 300, 205, ['Resume Service'], '[Component: Python/PDF-DOCX parser]', ['Manages files, hashes, versions,', 'and CV text.'], 'component');
  d.node('RUN', 980, 740, 300, 205, ['Screening', 'Coordinator'], '[Component: Python async tasks]', ['Coordinates durable jobs, retries,', 'and run publication.'], 'component');
  d.node('REVIEW', 1400, 740, 300, 205, ['Ranking and', 'Review Service'], '[Component: Python]', ['Provides rankings, evidence,', 'decisions, and comparisons.'], 'component');
  d.node('EXTRACT', 140, 1110, 300, 205, ['Extraction Adapter'], '[Component: Python HTTP client]', ['Calls AI; validates schemas', 'and source evidence.'], 'component');
  d.node('SCORE', 980, 1110, 300, 205, ['Scoring Engine'], '[Component: Python domain module]', ['Evaluates mandatory criteria, scores,', 'and criterion contributions.'], 'component');
  d.node('DATA', 700, 1400, 360, 190, ['Repositories'], '[Component: Python SQL/S3 clients]', ['Provides data and file access', 'and transaction boundaries.'], 'component');
  d.node('DB', 420, 1770, 360, 195, ['Screening Database'], '[Container: PostgreSQL]', ['Business data, jobs,', 'and screening-run history.'], 'database');
  d.node('FILES', 1150, 1770, 360, 195, ['CV Store'], '[Container: S3-compatible storage]', ['Stores original CV files', 'privately.'], 'bucket');
  d.node('AI', 1910, 1110, 365, 205, ['AI Extraction Service'], '[External Software System: HTTPS API]', ['Returns structured JD/CV data', 'and evidence locations.'], 'box', RED);
  d.edge('WEB', 'HTTP', [[940,270],[940,400]], 940, 292, ['Sends commands and queries'], 'HTTPS/JSON or multipart', 350);
  d.edge('HTTP', 'CRIT', [[790,590],[290,740]], 345, 620, ['Creates/reads positions', 'and manages criteria'], 'Internal function call', 325);
  d.edge('HTTP', 'CV', [[875,590],[710,740]], 680, 678, ['Uploads or reads a CV file'], 'Internal function call', 270);
  d.edge('HTTP', 'RUN', [[1005,590],[1130,740]], 1120, 660, ['Creates jobs and reads progress'], 'Internal function call', 290);
  d.edge('HTTP', 'REVIEW', [[1090,590],[1550,740]], 1510, 630, ['Reads results and records decisions'], 'Internal function call', 310);
  d.edge('RUN', 'CV', [[980,865],[860,865]], 920, 823, ['Reads CV', 'text'], '', 110);
  d.edge('CRIT', 'EXTRACT', [[290,945],[290,1110]], 290, 1020, ['Extracts JD data'], 'Internal function call', 235);
  d.edge('CRIT', 'DATA', [[140,895],[105,895],[105,1360],[670,1360],[670,1440],[700,1440]], 365, 1360, ['Reads/writes positions and criteria'], 'Internal function call', 330);
  d.edge('CV', 'DATA', [[650,945],[650,1490],[700,1490]], 650, 1225, ['Stores file, hash,', 'and CV version'], 'Internal function call', 235);
  d.edge('RUN', 'EXTRACT', [[980,915],[920,915],[920,1010],[400,1010],[400,1110]], 650, 1005, ['Extracts CV without a snapshot'], 'Internal function call', 355);
  d.edge('RUN', 'SCORE', [[1130,945],[1130,1110]], 1130, 1030, ['Scores snapshot under policy'], 'Internal function call', 295);
  d.edge('RUN', 'DATA', [[1280,915],[1330,915],[1330,1370],[980,1370],[980,1400]], 1220, 1362, ['Stores jobs/snapshots and publishes'], 'Internal function call', 315);
  d.edge('REVIEW', 'DATA', [[1550,945],[1550,1505],[1060,1505]], 1410, 1500, ['Reads runs and evidence', 'and records decisions'], 'Internal function call', 305);
  d.edge('EXTRACT', 'AI', [[440,1210],[475,1210],[475,1335],[1870,1335],[1870,1210],[1910,1210]], 1640, 1303, ['Extracts data from JD/CV text'], 'HTTPS/JSON', 310);
  d.edge('DATA', 'DB', [[795,1590],[600,1770]], 635, 1685, ['Reads/writes and runs transactions'], 'SQL/TCP', 270);
  d.edge('DATA', 'FILES', [[965,1590],[1330,1770]], 1215, 1685, ['Stores and reads CV files'], 'HTTPS/S3 API', 270);
  d.footer(2075);
  d.write();
}

// Deployment: the same containers as C2, placed on the proposed internal-trial nodes.
{
  const d = new Diagram('deployment', 1800, 2160, 'Deployment View: JD-based CV Screening and Ranking');
  d.frame(80, 30, 660, 415, "Recruiter's computer", '[Deployment node]', { color: GRAY });
  d.frame(110, 60, 600, 285, 'Web browser', '[Execution environment]', { color: GRAY, dash: '9 7' });
  d.frame(80, 490, 1060, 1090, 'Internal trial server', '[Deployment node · Linux VM · 4 vCPU / 8 GiB]', { color: GRAY });
  d.frame(110, 790, 620, 370, 'Backend process', '[Execution environment]', { color: GRAY, dash: '9 7' });
  d.node('WEB', 150, 85, 520, 170, ['Web App instance'], '[Container instance: HTML/CSS/JavaScript]', ['Displays the interface, accepts input,', 'and tracks progress.'], 'browser');
  d.node('EDGE', 140, 530, 520, 200, ['Nginx'], '[Infrastructure node: reverse proxy]', ['HTTPS endpoint; serves WEB files', 'and forwards /api requests', 'to the backend.'], 'box', AMBER);
  d.node('API', 145, 820, 550, 240, ['Screening Backend instance'], '[Container instance: Python/FastAPI]', ['One Python/FastAPI process;', 'HTTP and the RUN coordinator', 'execute in the same application.'], 'backend');
  d.node('DB', 110, 1240, 460, 230, ['Screening Database instance'], '[Container instance: PostgreSQL]', ['PostgreSQL · dedicated volume;', 'port 5432 is available only on', 'the server private network.'], 'database');
  d.node('FILES', 640, 1240, 460, 230, ['CV Store instance'], '[Container instance: S3-compatible storage]', ['S3-compatible service · dedicated volume;', 'the CV bucket is private.'], 'bucket');
  d.node('AI', 1320, 830, 420, 240, ['AI Extraction Service'], '[External deployment node: HTTPS endpoint]', ['Operated by a vendor', 'outside this deployment scope.'], 'box', RED);
  d.node('BACKUP', 450, 1690, 520, 230, ['Backup store'], '[Infrastructure node: separate from server]', ['Database and file copies share', 'one recovery point; encrypted', 'and access restricted.'], 'bucket', AMBER);
  d.edge('WEB', 'EDGE', [[470,255],[470,530]], 990, 420, ['Loads static files and calls /api'], 'HTTPS :443', 400);
  d.edge('EDGE', 'API', [[400,730],[400,820]], 780, 755, ['Forwards /api to backend'], 'HTTP loopback :8000', 400);
  d.edge('API', 'DB', [[400,1060],[400,1210],[340,1210],[340,1240]], 205, 1190, ['Reads/writes and runs transactions'], 'SQL/TCP :5432 · private network', 230);
  d.edge('API', 'FILES', [[600,1060],[600,1210],[870,1210],[870,1240]], 1010, 1160, ['Stores and reads CV files'], 'HTTPS/S3 API :443 · private network', 260);
  d.edge('API', 'AI', [[695,940],[1320,940]], 920, 855, ['Sends text with reduced', 'identifying information'], 'HTTPS :443', 350);
  d.edge('DB', 'BACKUP', [[520,1470],[520,1690]], 330, 1630, ['Scheduled backup'], 'Encrypted channel', 250);
  d.edge('FILES', 'BACKUP', [[870,1470],[870,1690]], 1080, 1630, ['Scheduled backup'], 'Encrypted channel', 250);
  d.footer(1980, {
    items: [[30, BLUE, 'In-scope container instance'], [520, AMBER, 'Operational infrastructure'], [860, RED, 'External system']],
    note: 'Dashed arrow: connection initiation direction; labels state responsibility, protocol, and port. Solid grey frame: deployment node; dashed grey frame: execution environment.'
  });
  d.write();
}
