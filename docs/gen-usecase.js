// Proposed screening scope: arc42 -> INVEST stories -> use cases.
// Run: node docs/gen-usecase.js docs/use-case-diagram.svg
const fs = require('fs');
const path = require('path');
const output = process.argv[2] || path.join(__dirname, 'use-case-diagram.svg');
const cases = [
  ['UC-01', 'Create Position and JD', false],
  ['UC-02', 'Suggest Criteria from JD', true],
  ['UC-03', 'Configure and Approve Criteria', false],
  ['UC-04', 'Upload CV Batch', false],
  ['UC-05', 'Parse and Extract CV Data', true],
  ['UC-06', 'Start Screening', false],
  ['UC-07', 'Track Progress and Failures', false],
  ['UC-08', 'Evaluate Eligibility and Scores', false],
  ['UC-09', 'View Ranking', false],
  ['UC-10', 'Inspect Details and Evidence', false],
  ['UC-11', 'Shortlist Candidate', false],
  ['UC-12', 'Reject Candidate', false],
  ['UC-13', 'Adjust Criteria Revision', false],
  ['UC-14', 'Rescore the Source CV Set', false],
  ['UC-15', 'View Screening History', false],
  ['UC-16', 'Compare Two Runs', false]
];
const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const o = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1640" height="1170" viewBox="0 0 1640 1170" role="img" aria-labelledby="title desc">',
  '<title id="title">Use Cases — JD-based CV Screening and Ranking</title>',
  '<desc id="desc">Two use-case groups inside one system. The Recruiter is the direct user; AI only supports JD and CV extraction. Screening runs include the internal evaluation behavior UC-08.</desc>',
  '<rect width="1640" height="1170" fill="white"/>',
  '<defs><marker id="include" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#536779" stroke-width="1.3"/></marker></defs>',
  '<g font-family="Segoe UI, Arial, sans-serif" fill="#182b3b">',
  '<text x="820" y="42" text-anchor="middle" font-size="26" font-weight="700">USE CASES — JD-BASED CV SCREENING &amp; RANKING</text>',
  '<text x="820" y="72" text-anchor="middle" font-size="15" fill="#536779">Proposed design · arc42 policy v1 · 16 use cases / 17 user stories</text>',
  '<rect x="220" y="108" width="1160" height="942" rx="12" fill="#fafcfe" stroke="#869bad" stroke-width="2"/>',
  '<text x="800" y="139" text-anchor="middle" font-size="16" font-weight="700">SCREENING SYSTEM — one system boundary</text>',
  '<line x1="835" y1="158" x2="835" y2="1028" stroke="#d4dfe8" stroke-dasharray="5 7"/>',
  '<text x="467" y="175" text-anchor="middle" font-size="15">A. Preparation and processing</text>',
  '<text x="1135" y="175" text-anchor="middle" font-size="15">B. Review and rescoring</text>'
];
function actor(x, y, label, note, color) {
  o.push(`<g stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"><circle cx="${x}" cy="${y}" r="15"/><path d="M${x} ${y+15}v45 m-25 -30h50 M${x} ${y+60}l-22 35 M${x} ${y+60}l22 35"/></g>`);
  o.push(`<text x="${x}" y="${y+120}" text-anchor="middle" font-size="17" font-weight="700">${label}</text><text x="${x}" y="${y+142}" text-anchor="middle" font-size="12" fill="#536779">${note}</text>`);
}
// The two Recruiter symbols represent the same actor, outside one system boundary.
actor(105, 515, 'Recruiter', 'Direct user', '#20714a');
actor(1510, 515, 'Recruiter', 'Same actor as left', '#20714a');
actor(105, 150, 'AI Service', 'Extraction only', '#7650ad');
cases.forEach(([id, label, ai], index) => {
  const left = index < 8;
  const x = left ? 475 : 1135;
  const y = 234 + (index % 8) * 106;
  const internal = id === 'UC-05' || id === 'UC-08';
  if (!internal) {
    const startX = left ? 130 : 1485;
    const endX = left ? x - 205 : x + 205;
    o.push(`<line x1="${startX}" y1="545" x2="${endX}" y2="${y}" stroke="#88a096" stroke-width="1.3"/>`);
  }
  if (ai) {
    o.push(`<path d="M130 180 V192 H${720 + index*7} V${y} H680" fill="none" stroke="#7650ad" stroke-width="1.7"/>`);
  }
  o.push(`<ellipse cx="${x}" cy="${y}" rx="205" ry="39" fill="${ai ? '#f3eefb' : '#eaf3fb'}" stroke="${ai ? '#ab91cc' : '#8cbbdf'}" stroke-width="1.7"/>`);
  o.push(`<text x="${x}" y="${y-8}" text-anchor="middle" font-size="12" font-weight="700" fill="#536779">${id}${id === 'UC-08' ? ' · Internal behavior' : ''}</text>`);
  o.push(`<text x="${x}" y="${y+15}" text-anchor="middle" font-size="16">${esc(label)}</text>`);
});
o.push('<path d="M680 764 H790 V976 H680" fill="none" stroke="#536779" stroke-width="1.4" stroke-dasharray="6 5" marker-end="url(#include)"/>');
o.push('<path d="M930 764 H868 V1003 H623" fill="none" stroke="#536779" stroke-width="1.4" stroke-dasharray="6 5" marker-end="url(#include)"/>');
o.push('<text x="779" y="875" text-anchor="middle" font-size="12" transform="rotate(-90 779 875)">«include»</text>');
o.push('<text x="887" y="875" text-anchor="middle" font-size="12" transform="rotate(-90 887 875)">«include»</text>');
o.push('<text x="820" y="1090" text-anchor="middle" font-size="15">AI supports extraction; the backend validates evidence and calculates scores. Semantic scoring is not applied.</text>');
o.push('<text x="820" y="1120" text-anchor="middle" font-size="14" fill="#536779">Solid: actor association. Dashed «include»: shared evaluation behavior used by both screening flows.</text>');
o.push('<text x="820" y="1146" text-anchor="middle" font-size="14" fill="#536779">No separate shortlist approver or dictionary-administration screen is in v1 scope.</text>');
o.push('</g></svg>');
fs.writeFileSync(output, o.join('\n'), 'utf8');
console.log(`Wrote ${output} (${cases.length} use cases)`);
