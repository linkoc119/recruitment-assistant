// Sinh sơ đồ use case UML cho chức năng "Sàng lọc & Xếp hạng CV theo JD".
// Toạ độ mép ellipse được tính bằng giao điểm đường nối hai tâm, nên mũi tên
// luôn chạm đúng viền thay vì đâm vào trong hình.
const fs = require('fs');

const W = 1580, H = 1080;
const C = {
  ink: '#1b1f23', muted: '#625f59', line: '#464440',
  blue: '#0a66c2', blueBg: '#eaf2fb', blueEdge: '#a6c8ee',
  purple: '#7a54c0', purpleBg: '#f3eefc', purpleEdge: '#cbb8ef',
  bound: '#bcb8b1', bg: '#ffffff', panel: '#faf9f7'
};

// ---- danh sách use case: tâm, bán kính, nhãn (mỗi phần tử một dòng), nhóm màu
const UC = {
  u1:  { x:470, y:150, rx:152, ry:44, t:['Tạo vị trí tuyển dụng','& mô tả công việc (JD)'], g:'core' },
  u2:  { x:470, y:285, rx:152, ry:44, t:['Thiết lập tiêu chí','& trọng số chấm điểm'], g:'core' },
  u3:  { x:470, y:420, rx:152, ry:44, t:['Tải CV ứng viên','lên hệ thống'], g:'core' },
  u5:  { x:470, y:555, rx:152, ry:44, t:['Chấm điểm & đối sánh','CV với JD'], g:'core' },
  u9:  { x:470, y:690, rx:152, ry:44, t:['Chỉnh tiêu chí','& chấm lại toàn bộ'], g:'core' },
  u6:  { x:470, y:825, rx:152, ry:44, t:['Xem bảng xếp hạng','ứng viên'], g:'core' },

  u11: { x:960, y:290, rx:146, ry:40, t:['Chuẩn hoá từ điển','kỹ năng'], g:'sub' },
  u4:  { x:960, y:400, rx:146, ry:40, t:['Phân tích & trích xuất','dữ liệu từ CV'], g:'ai' },
  u5a: { x:960, y:500, rx:146, ry:40, t:['Tính 4 điểm thành phần'], g:'ai' },
  u5b: { x:960, y:590, rx:146, ry:40, t:['Sinh bằng chứng','& giải thích điểm'], g:'ai' },
  u10: { x:960, y:690, rx:146, ry:40, t:['So sánh hai vòng chấm'], g:'sub' },
  u7:  { x:960, y:800, rx:146, ry:40, t:['Xem chi tiết ứng viên'], g:'sub' },
  u8:  { x:960, y:930, rx:146, ry:40, t:['Đưa vào shortlist','/ Loại ứng viên'], g:'sub' }
};

// ---- tác nhân
const AC = {
  rec:   { x:115,  y:420, name:'Nhà tuyển dụng',   sub:'(tác nhân chính)' },
  mgr:   { x:115,  y:955, name:'Trưởng bộ phận',   sub:'(duyệt shortlist)' },
  ai:    { x:1440, y:465, name:'Hệ thống AI',      sub:'(tác nhân phụ)', ai:true },
  admin: { x:1440, y:200, name:'Quản trị hệ thống', sub:'' }
};

// liên kết tác nhân — use case
const ASSOC = [
  ['rec','u1'], ['rec','u2'], ['rec','u3'], ['rec','u5'], ['rec','u9'], ['rec','u6'],
  ['mgr','u6'], ['mgr','u8'],
  ['ai','u4'], ['ai','u5a'], ['ai','u5b'],
  ['admin','u11']
];

// include: use case gốc ..> use case bắt buộc kèm theo
const INCL = [['u2','u11'], ['u3','u4'], ['u5','u5a'], ['u5','u5b'], ['u9','u5']];
// extend: use case mở rộng ..> use case gốc
const EXT  = [['u10','u9'], ['u7','u6'], ['u8','u6']];

// Giao điểm của tia (từ tâm ellipse hướng tới điểm đích) với viền ellipse.
function edge(e, tx, ty, pad) {
  pad = pad || 0;
  const dx = tx - e.x, dy = ty - e.y;
  const a = e.rx + pad, b = e.ry + pad;
  const k = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  return [e.x + dx * k, e.y + dy * k];
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const o = [];
o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Segoe UI, Be Vietnam Pro, system-ui, sans-serif">');
o.push('<defs>');
o.push('<marker id="arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="' + C.line + '"/></marker>');
o.push('<marker id="arrowBlue" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="' + C.blue + '"/></marker>');
o.push('</defs>');
o.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');

o.push('<text x="' + (W / 2) + '" y="41" text-anchor="middle" font-size="25" font-weight="700" fill="' + C.ink + '">Sơ đồ Use Case — Sàng lọc &amp; Xếp hạng CV theo JD</text>');

// ranh giới hệ thống
o.push('<rect x="260" y="70" width="1030" height="960" rx="10" fill="' + C.panel + '" stroke="' + C.bound + '" stroke-width="1.6"/>');
o.push('<text x="775" y="103" text-anchor="middle" font-size="15" font-weight="700" letter-spacing="1.4" fill="' + C.muted + '">HỆ THỐNG TRỢ LÝ TUYỂN DỤNG</text>');

// đường quan hệ vẽ trước để nằm dưới các hình
for (const pair of ASSOC) {
  const A = AC[pair[0]], U = UC[pair[1]];
  const ay = A.y + 4;
  const p = edge(U, A.x, ay);
  o.push('<line x1="' + A.x + '" y1="' + ay + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="' + (A.ai ? C.purple : C.line) + '" stroke-width="1.5" opacity="0.72"/>');
}

function dashed(from, to, label, color, marker) {
  const F = UC[from], T = UC[to];
  const p1 = edge(F, T.x, T.y);
  const p2 = edge(T, F.x, F.y, 5);
  o.push('<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="' + color + '" stroke-width="1.6" stroke-dasharray="7 5" marker-end="url(#' + marker + ')"/>');
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
  const tw = label.length * 6.4 + 10;
  o.push('<rect x="' + (mx - tw / 2).toFixed(1) + '" y="' + (my - 10).toFixed(1) + '" width="' + tw.toFixed(1) + '" height="18" rx="3" fill="' + C.panel + '"/>');
  o.push('<text x="' + mx.toFixed(1) + '" y="' + (my + 3.5).toFixed(1) + '" text-anchor="middle" font-size="11.5" font-style="italic" fill="' + color + '">' + esc(label) + '</text>');
}
for (const p of INCL) dashed(p[0], p[1], '«include»', C.line, 'arrow');
for (const p of EXT)  dashed(p[0], p[1], '«extend»',  C.blue, 'arrowBlue');

// ellipse use case
for (const k of Object.keys(UC)) {
  const u = UC[k];
  const fill = u.g === 'ai' ? C.purpleBg : C.blueBg;
  const edg  = u.g === 'ai' ? C.purpleEdge : C.blueEdge;
  const sw   = u.g === 'core' ? 2.2 : 1.4;
  o.push('<ellipse cx="' + u.x + '" cy="' + u.y + '" rx="' + u.rx + '" ry="' + u.ry + '" fill="' + fill + '" stroke="' + edg + '" stroke-width="' + sw + '"/>');
  const n = u.t.length, lh = 17, y0 = u.y - ((n - 1) * lh) / 2 + 5;
  u.t.forEach(function (ln, i) {
    o.push('<text x="' + u.x + '" y="' + (y0 + i * lh).toFixed(1) + '" text-anchor="middle" font-size="13.5" font-weight="' + (u.g === 'core' ? 600 : 500) + '" fill="' + C.ink + '">' + esc(ln) + '</text>');
  });
}

// tác nhân — hình que
for (const k of Object.keys(AC)) {
  const a = AC[k], c = a.ai ? C.purple : C.ink;
  const x = a.x, y = a.y - 46;
  o.push('<g stroke="' + c + '" stroke-width="2.1" fill="none" stroke-linecap="round">' +
    '<circle cx="' + x + '" cy="' + y + '" r="13" fill="' + (a.ai ? C.purpleBg : C.blueBg) + '"/>' +
    '<line x1="' + x + '" y1="' + (y + 13) + '" x2="' + x + '" y2="' + (y + 46) + '"/>' +
    '<line x1="' + (x - 19) + '" y1="' + (y + 25) + '" x2="' + (x + 19) + '" y2="' + (y + 25) + '"/>' +
    '<line x1="' + x + '" y1="' + (y + 46) + '" x2="' + (x - 16) + '" y2="' + (y + 71) + '"/>' +
    '<line x1="' + x + '" y1="' + (y + 46) + '" x2="' + (x + 16) + '" y2="' + (y + 71) + '"/></g>');
  o.push('<text x="' + x + '" y="' + (y + 93) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + c + '">' + esc(a.name) + '</text>');
  if (a.sub) o.push('<text x="' + x + '" y="' + (y + 110) + '" text-anchor="middle" font-size="11.5" fill="' + C.muted + '">' + esc(a.sub) + '</text>');
}

// chú giải
const lx = 700, ly = 158;
o.push('<rect x="' + lx + '" y="' + (ly - 24) + '" width="560" height="60" rx="6" fill="' + C.bg + '" stroke="' + C.bound + '"/>');
o.push('<ellipse cx="' + (lx + 28) + '" cy="' + (ly - 3) + '" rx="18" ry="9" fill="' + C.blueBg + '" stroke="' + C.blueEdge + '" stroke-width="2.2"/>');
o.push('<text x="' + (lx + 54) + '" y="' + (ly + 1) + '" font-size="12" fill="' + C.ink + '">Luồng nghiệp vụ chính</text>');
o.push('<ellipse cx="' + (lx + 250) + '" cy="' + (ly - 3) + '" rx="18" ry="9" fill="' + C.purpleBg + '" stroke="' + C.purpleEdge + '" stroke-width="1.4"/>');
o.push('<text x="' + (lx + 276) + '" y="' + (ly + 1) + '" font-size="12" fill="' + C.ink + '">Bước do AI thực hiện</text>');
o.push('<line x1="' + (lx + 14) + '" y1="' + (ly + 22) + '" x2="' + (lx + 44) + '" y2="' + (ly + 22) + '" stroke="' + C.line + '" stroke-width="1.6" stroke-dasharray="7 5" marker-end="url(#arrow)"/>');
o.push('<text x="' + (lx + 54) + '" y="' + (ly + 26) + '" font-size="12" fill="' + C.ink + '">«include» — bắt buộc chạy kèm</text>');
o.push('<line x1="' + (lx + 300) + '" y1="' + (ly + 22) + '" x2="' + (lx + 330) + '" y2="' + (ly + 22) + '" stroke="' + C.blue + '" stroke-width="1.6" stroke-dasharray="7 5" marker-end="url(#arrowBlue)"/>');
o.push('<text x="' + (lx + 340) + '" y="' + (ly + 26) + '" font-size="12" fill="' + C.ink + '">«extend» — nhánh tuỳ chọn</text>');

o.push('</svg>');
fs.writeFileSync(process.argv[2], o.join('\n'), 'utf8');
console.log('wrote ' + process.argv[2]);
