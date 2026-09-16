// Generate a table/relationship overview from DBML; no parallel schema copy.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sang-loc-xep-hang-v2.dbml'), 'utf8');
const tables = [...source.matchAll(/^Table (\w+) \{\n([\s\S]*?)^\}/gm)];
const refs = [...source.matchAll(/^Ref: (\w+)\.(\([^\n]+?\)|\w+) > (\w+)\.(\([^\n]+?\)|\w+)/gm)];
const fk = new Set();
for (const r of refs) for (const c of r[2].replace(/[()]/g, '').split(',').map(x=>x.trim())) fk.add(r[1]+'.'+c);
let out = '---\ntitle: CV Screening Database — 13 Tables (Proposed)\nconfig:\n  layout: elk\n---\nerDiagram\n';
for (const t of tables) {
  out += '  '+t[1]+' {\n';
  for (const m of t[2].matchAll(/^  (\w+) ([\w]+)(?:\([^\n]*?\))?([^\n]*)$/gm)) {
    if (['Note','indexes','checks'].includes(m[1])) continue;
    const keys = [];
    if (/\bpk\b/.test(m[3]) || (t[1]==='position_resumes' && ['job_id','resume_id'].includes(m[1])) || (t[1]==='screening_run_items' && ['run_id','resume_id'].includes(m[1]))) keys.push('PK');
    if (fk.has(t[1]+'.'+m[1])) keys.push('FK');
    out += '    '+m[2]+' '+m[1]+(keys.length?' '+keys.join(','):'')+'\n';
  }
  out += '  }\n';
}
const seen = new Set();
for (const r of refs) {
  const key = r[1]+'>'+r[3];
  if (seen.has(key)) continue;
  seen.add(key);
  const optional = ['jobs','screening_runs','resume_skills','job_requirements','screening_run_items'].includes(r[1]) &&
    /published_run_id|criteria_revision|base_run_id|skill_id|snapshot_id/.test(r[2]);
  const oneChild = r[1] === 'jobs' || (r[1] === 'screenings' && r[3] === 'screening_run_items');
  out += '  '+r[3]+(optional?' |o':' ||')+'..'+(oneChild?'o|':'o{')+' '+r[1]+' : "'+r[2].replace(/[()]/g,'')+'"\n';
}
fs.writeFileSync(path.join(__dirname, 'database-design-erd.mmd'), out);
console.log(tables.length+' tables, '+refs.length+' foreign keys, '+seen.size+' overview relationships');
