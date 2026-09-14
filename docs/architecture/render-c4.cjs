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

  footer(y, { items = [[30, GREEN, 'Person · Người sử dụng'], [360, BLUE, 'Phần mềm trong phạm vi'], [735, RED, 'Hệ thống bên ngoài']], note = 'Mũi tên nét đứt: quan hệ có hướng; nhãn nêu trách nhiệm và giao thức. Khung lớn: ranh giới hệ thống/container.' } = {}) {
    this.text(30, y, [this.title], { size: 29, color: GRAY, anchor: 'start', layer: 'footer' });
    this.text(30, y + 31, ['Kiến trúc đề xuất · Chỉ phân hệ sàng lọc và xếp hạng CV theo JD · Chưa triển khai backend/AI'], { size: 18, color: GRAY, anchor: 'start', layer: 'footer' });
    for (const [x, color, label] of items) {
      this.layers.footer.push(`<rect x="${x}" y="${y + 54}" width="20" height="20" rx="3" fill="white" stroke="${color}" stroke-width="3"/>`);
      this.text(x + 32, y + 71, [label], { size: 17, color: GRAY, anchor: 'start', layer: 'footer' });
    }
    this.text(30, y + 103, [note], { size: 17, color: GRAY, anchor: 'start', layer: 'footer' });
    this.text(30, y + 130, ['JD: mô tả công việc · CV: hồ sơ ứng tuyển · Phong cách trình bày tham khảo các ví dụ C4 của Simon Brown (c4model.com).'], { size: 15, color: GRAY, anchor: 'start', layer: 'footer' });
  }

  write() {
    // Prevent a visual restyle from silently dropping or adding architectural relationships.
    const source = fs.readFileSync(path.join(__dirname, this.stem + '.md'), 'utf8');
    const expected = [...source.matchAll(/^\s*(\w+) -\.?->\|[^\n]*?\| (\w+)/gm)].map(m => `${m[1]}->${m[2]}`).sort();
    const actual = [...this.relations].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${this.stem}: relationships differ from Mermaid`);
    for (const edge of actual) for (const id of edge.split('->')) if (!this.ids.has(id)) throw new Error(`Unknown endpoint ${id}`);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="title desc" font-family="${FONT}">\n<title id="title">${esc(this.title)}</title>\n<desc id="desc">Kiến trúc đề xuất cho phân hệ sàng lọc và xếp hạng CV theo JD. Chưa triển khai backend hoặc AI. Các quan hệ được kiểm tra khớp nguồn Mermaid trong tài liệu đi kèm.</desc>\n<defs><marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M 0 0 L 12 6 L 0 12 Z" fill="${GRAY}"/></marker></defs>\n<rect width="100%" height="100%" fill="white"/>\n${Object.values(this.layers).flat().join('\n')}\n</svg>\n`;
    fs.writeFileSync(path.join(__dirname, 'diagrams', this.stem + '.svg'), svg);
    console.log(`${this.stem}: ${this.ids.size} nodes, ${actual.length} verified relationships`);
  }
}

// C1: one software system, a person and an external extraction service.
{
  const d = new Diagram('c1-context', 1600, 1090, 'System Context View: Sàng lọc và xếp hạng CV theo JD');
  d.node('REC', 130, 35, 450, 345, ['Nhân viên tuyển dụng'], '[Person]', ['Duyệt tiêu chí, kiểm chứng kết quả', 'và quyết định shortlist hoặc loại.'], 'person', GREEN);
  d.node('SYS', 130, 585, 450, 250, ['Sàng lọc và xếp hạng CV', 'theo JD'], '[Software System]', ['Đối chiếu CV với tiêu chí đã duyệt;', 'cung cấp điểm, bằng chứng', 'và lịch sử các vòng chấm.']);
  d.node('AI', 1030, 585, 450, 250, ['Dịch vụ trích xuất AI'], '[External Software System]', ['Trích xuất dữ liệu từ JD và CV,', 'kèm vị trí bằng chứng trong nguồn.', 'Không quyết định điểm hay shortlist.'], 'box', RED);
  d.edge('REC', 'SYS', [[245,380],[245,585]], 210, 453, ['Nhập JD, nạp CV, duyệt', 'tiêu chí và yêu cầu chấm'], '', 330);
  d.edge('SYS', 'AI', [[580,655],[1030,655]], 805, 605, ['Gửi văn bản cần trích xuất', 'và cấu trúc kết quả mong đợi'], '', 370);
  d.footer(920);
  d.write();
}

// C2: preserve the four containers chosen in arc42; no extra static-content service.
{
  const d = new Diagram('c2-containers', 1650, 1690, 'Container View: Sàng lọc và xếp hạng CV theo JD');
  d.frame(55, 405, 1135, 1075, 'Sàng lọc và xếp hạng CV theo JD', '[Software System]');
  d.node('REC', 440, 25, 380, 310, ['Nhân viên tuyển dụng'], '[Person]', ['Duyệt tiêu chí, xem kết quả', 'và đưa ra quyết định.'], 'person', GREEN);
  d.node('WEB', 450, 465, 360, 210, ['Web App'], '[Container: HTML/CSS/JavaScript]', ['7 màn hình nghiệp vụ;', 'xem CV và theo dõi tiến trình.'], 'browser');
  d.node('API', 450, 815, 360, 235, ['Screening Backend'], '[Container: Python/FastAPI]', ['Cung cấp API, điều phối tác vụ,', 'chấm điểm và quản lý lịch sử.'], 'backend');
  d.node('FILES', 170, 1190, 330, 190, ['CV Store'], '[Container: S3-compatible storage]', ['Lưu file CV gốc', 'trong bucket riêng tư.'], 'bucket');
  d.node('DB', 770, 1190, 330, 190, ['Screening Database'], '[Container: PostgreSQL]', ['Tiêu chí, phiên bản đầu vào,', 'tác vụ và kết quả chấm.'], 'database');
  d.node('AI', 1255, 815, 350, 235, ['Dịch vụ trích xuất AI'], '[External Software System: HTTPS API]', ['Trích xuất dữ liệu JD/CV', 'có cấu trúc và bằng chứng.'], 'box', RED);
  d.edge('REC', 'WEB', [[630,335],[630,465]], 630, 360, ['Thao tác và xem kết quả'], 'Trình duyệt', 310);
  d.edge('WEB', 'API', [[630,675],[630,815]], 630, 723, ['Gửi lệnh, truy vấn và polling'], 'HTTPS/JSON; CV: multipart', 355);
  d.edge('API', 'FILES', [[530,1050],[340,1190]], 330, 1100, ['Lưu và đọc file CV'], 'HTTPS/S3 API', 275);
  d.edge('API', 'DB', [[730,1050],[930,1190]], 950, 1100, ['Đọc/ghi và giao dịch'], 'SQL/TCP', 280);
  d.edge('API', 'AI', [[810,930],[1255,930]], 1015, 855, ['Gửi văn bản; nhận dữ liệu', 'trích xuất có cấu trúc'], 'HTTPS/JSON', 315);
  d.footer(1525);
  d.write();
}

// C3: the API container is expanded; neighbouring containers remain outside it.
{
  const d = new Diagram('c3-components', 2340, 2230, 'Component View: Sàng lọc CV theo JD — Screening Backend');
  d.frame(50, 40, 1790, 1990, 'Sàng lọc và xếp hạng CV theo JD', '[Software System]');
  d.frame(80, 330, 1730, 1290, 'Screening Backend', '[Container: Python/FastAPI]');
  d.node('WEB', 760, 65, 360, 205, ['Web App'], '[Container: HTML/CSS/JavaScript]', ['Gửi lệnh, hiển thị kết quả', 'và theo dõi tác vụ.'], 'browser');
  d.node('HTTP', 760, 400, 360, 190, ['API Controllers'], '[Component: FastAPI routers]', ['Kiểm tra request và phiên bản;', 'định tuyến, trả phản hồi HTTP.'], 'component');
  d.node('CRIT', 140, 740, 300, 205, ['Criteria Service'], '[Component: Python]', ['Quản lý JD; duyệt và', 'đóng băng bộ tiêu chí.'], 'component');
  d.node('CV', 560, 740, 300, 205, ['Resume Service'], '[Component: Python/PDF-DOCX parser]', ['Quản lý file, hash, phiên bản', 'và văn bản CV.'], 'component');
  d.node('RUN', 980, 740, 300, 205, ['Screening', 'Coordinator'], '[Component: Python async tasks]', ['Tác vụ bền vững, retry', 'và công bố vòng chấm.'], 'component');
  d.node('REVIEW', 1400, 740, 300, 205, ['Ranking and', 'Review Service'], '[Component: Python]', ['Xếp hạng, bằng chứng,', 'quyết định và so sánh.'], 'component');
  d.node('EXTRACT', 140, 1110, 300, 205, ['Extraction Adapter'], '[Component: Python HTTP client]', ['Gọi AI; kiểm tra schema', 'và bằng chứng nguồn.'], 'component');
  d.node('SCORE', 980, 1110, 300, 205, ['Scoring Engine'], '[Component: Python domain module]', ['Lọc bắt buộc, tính điểm', 'và đóng góp từng tiêu chí.'], 'component');
  d.node('DATA', 700, 1400, 360, 190, ['Repositories'], '[Component: Python SQL/S3 clients]', ['Truy cập dữ liệu, file', 'và ranh giới giao dịch.'], 'component');
  d.node('DB', 420, 1770, 360, 195, ['Screening Database'], '[Container: PostgreSQL]', ['Dữ liệu nghiệp vụ, tác vụ', 'và lịch sử các vòng chấm.'], 'database');
  d.node('FILES', 1150, 1770, 360, 195, ['CV Store'], '[Container: S3-compatible storage]', ['File CV gốc', 'được lưu riêng tư.'], 'bucket');
  d.node('AI', 1910, 1110, 365, 205, ['Dịch vụ trích xuất AI'], '[External Software System: HTTPS API]', ['Trả dữ liệu JD/CV có cấu trúc', 'và vị trí bằng chứng.'], 'box', RED);
  d.edge('WEB', 'HTTP', [[940,270],[940,400]], 940, 292, ['Gửi lệnh và truy vấn'], 'HTTPS/JSON hoặc multipart', 350);
  d.edge('HTTP', 'CRIT', [[790,590],[290,740]], 345, 645, ['Trích xuất hoặc lưu tiêu chí'], 'Gọi hàm nội bộ', 325);
  d.edge('HTTP', 'CV', [[875,590],[710,740]], 680, 678, ['Nạp hoặc đọc file CV'], 'Gọi hàm nội bộ', 270);
  d.edge('HTTP', 'RUN', [[1005,590],[1130,740]], 1120, 660, ['Tạo tác vụ, đọc tiến trình'], 'Gọi hàm nội bộ', 290);
  d.edge('HTTP', 'REVIEW', [[1090,590],[1550,740]], 1510, 630, ['Đọc kết quả, ghi quyết định'], 'Gọi hàm nội bộ', 310);
  d.edge('RUN', 'CV', [[980,865],[860,865]], 920, 823, ['Đọc văn', 'bản CV'], '', 110);
  d.edge('CRIT', 'EXTRACT', [[290,945],[290,1110]], 290, 1020, ['Trích xuất JD'], 'Gọi hàm nội bộ', 235);
  d.edge('CRIT', 'DATA', [[140,895],[105,895],[105,1360],[670,1360],[670,1440],[700,1440]], 365, 1360, ['Lưu revision tiêu chí'], 'Gọi hàm nội bộ', 280);
  d.edge('CV', 'DATA', [[650,945],[650,1490],[700,1490]], 650, 1225, ['Lưu file, hash', 'và phiên bản CV'], 'Gọi hàm nội bộ', 235);
  d.edge('RUN', 'EXTRACT', [[980,915],[920,915],[920,1010],[400,1010],[400,1110]], 650, 1005, ['Trích xuất CV chưa có snapshot'], 'Gọi hàm nội bộ', 355);
  d.edge('RUN', 'SCORE', [[1130,945],[1130,1110]], 1130, 1030, ['Chấm snapshot theo policy'], 'Gọi hàm nội bộ', 295);
  d.edge('RUN', 'DATA', [[1280,915],[1330,915],[1330,1370],[980,1370],[980,1400]], 1220, 1362, ['Tác vụ, snapshot và publish'], 'Gọi hàm nội bộ', 315);
  d.edge('REVIEW', 'DATA', [[1550,945],[1550,1505],[1060,1505]], 1410, 1500, ['Đọc vòng, bằng chứng', 'và ghi quyết định'], 'Gọi hàm nội bộ', 305);
  d.edge('EXTRACT', 'AI', [[440,1210],[475,1210],[475,1335],[1870,1335],[1870,1210],[1910,1210]], 1640, 1303, ['Trích xuất văn bản JD/CV'], 'HTTPS/JSON', 310);
  d.edge('DATA', 'DB', [[795,1590],[600,1770]], 635, 1685, ['Đọc/ghi và giao dịch'], 'SQL/TCP', 270);
  d.edge('DATA', 'FILES', [[965,1590],[1330,1770]], 1215, 1685, ['Lưu và đọc file CV'], 'HTTPS/S3 API', 270);
  d.footer(2075);
  d.write();
}

// Deployment: the same containers as C2, placed on the proposed internal-trial nodes.
{
  const d = new Diagram('deployment', 1800, 2160, 'Deployment View: Sàng lọc và xếp hạng CV theo JD');
  d.frame(80, 30, 660, 415, 'Máy nhân viên tuyển dụng', '[Deployment node]', { color: GRAY });
  d.frame(110, 60, 600, 285, 'Trình duyệt', '[Execution environment]', { color: GRAY, dash: '9 7' });
  d.frame(80, 490, 1060, 1090, 'Máy chủ thử nghiệm nội bộ', '[Deployment node · Linux VM · 4 vCPU / 8 GiB]', { color: GRAY });
  d.frame(110, 790, 620, 370, 'Backend process', '[Execution environment]', { color: GRAY, dash: '9 7' });
  d.node('WEB', 150, 85, 520, 170, ['Web App instance'], '[Container instance: HTML/CSS/JavaScript]', ['Hiển thị, nhập liệu', 'và theo dõi tiến trình.'], 'browser');
  d.node('EDGE', 140, 530, 520, 200, ['Nginx'], '[Infrastructure node: reverse proxy]', ['HTTPS endpoint; phục vụ static', 'files của WEB và chuyển tiếp', '/api tới backend.'], 'box', AMBER);
  d.node('API', 145, 820, 550, 240, ['Screening Backend instance'], '[Container instance: Python/FastAPI]', ['Python/FastAPI, một tiến trình;', 'HTTP và bộ điều phối RUN', 'chạy cùng ứng dụng.'], 'backend');
  d.node('DB', 110, 1240, 460, 230, ['Screening Database instance'], '[Container instance: PostgreSQL]', ['PostgreSQL · volume riêng;', 'cổng 5432 chỉ mở trong', 'mạng nội bộ máy chủ.'], 'database');
  d.node('FILES', 640, 1240, 460, 230, ['CV Store instance'], '[Container instance: S3-compatible storage]', ['Dịch vụ tương thích S3 ·', 'volume riêng; bucket CV', 'không công khai.'], 'bucket');
  d.node('AI', 1320, 830, 420, 240, ['Dịch vụ trích xuất AI'], '[External deployment node: HTTPS endpoint]', ['Do nhà cung cấp vận hành,', 'ngoài phạm vi triển khai này.'], 'box', RED);
  d.node('BACKUP', 450, 1690, 520, 230, ['Kho backup'], '[Infrastructure node: tách khỏi máy chủ]', ['Bản sao DB và file theo cùng', 'mốc dữ liệu; mã hóa và', 'giới hạn truy cập.'], 'bucket', AMBER);
  d.edge('WEB', 'EDGE', [[470,255],[470,530]], 990, 420, ['Tải static files và gọi /api'], 'HTTPS :443', 400);
  d.edge('EDGE', 'API', [[400,730],[400,820]], 780, 755, ['Chuyển tiếp /api tới backend'], 'HTTP loopback :8000', 400);
  d.edge('API', 'DB', [[400,1060],[400,1210],[340,1210],[340,1240]], 205, 1190, ['Đọc/ghi và giao dịch'], 'SQL/TCP :5432 · mạng riêng', 230);
  d.edge('API', 'FILES', [[600,1060],[600,1210],[870,1210],[870,1240]], 1010, 1160, ['Lưu và đọc file CV'], 'HTTPS/S3 API :443 · mạng riêng', 260);
  d.edge('API', 'AI', [[695,940],[1320,940]], 920, 855, ['Gửi văn bản đã giảm', 'thông tin nhận dạng'], 'HTTPS :443', 350);
  d.edge('DB', 'BACKUP', [[520,1470],[520,1690]], 330, 1630, ['Backup theo lịch'], 'Kênh mã hóa', 250);
  d.edge('FILES', 'BACKUP', [[870,1470],[870,1690]], 1080, 1630, ['Backup theo lịch'], 'Kênh mã hóa', 250);
  d.footer(1980, {
    items: [[30, BLUE, 'Instance của container trong phạm vi'], [520, AMBER, 'Hạ tầng vận hành'], [860, RED, 'Bên ngoài hệ thống']],
    note: 'Mũi tên nét đứt: chiều khởi tạo kết nối; nhãn nêu trách nhiệm, giao thức và cổng. Khung xám: deployment node; khung xám nét đứt: execution environment.'
  });
  d.write();
}
