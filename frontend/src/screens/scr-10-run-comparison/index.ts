import { allPages, getJob, jobPath, request, type Model } from "../../lib/api.js";
import { screen, esc, header, button, link, table, goto } from "../../lib/screen.js";
const view=screen(async v=>{
 const job=await getJob(v.params.position,v.signal),base=jobPath(job.id),ui=`/positions/${job.id}`;
 const runs=(await allPages<Model<"Run">>(`${base}/screening-runs`,v.signal)).filter(r=>r.published_at);
 const left=v.params.left,right=v.params.right;
 let offset=0;
 async function render(){
 const comparison=left&&right?await request<Model<"Comparison">>(`${base}/comparison?left_run_id=${left}&right_run_id=${right}&offset=${offset}&limit=25`,{signal:v.signal}):null;
 v.html(header("Run Comparison",`${job.title} · Deltas are right minus left`,link(`${ui}/runs`,"Run History"))+
 `<div class="card"><label>Baseline <select id="left" class="form-control">${runs.map(r=>`<option value="${r.id}" ${r.id===left?"selected":""}>Run ${r.id} · Revision ${r.criteria_revision}</option>`).join("")}</select></label><label>Compared run <select id="right" class="form-control">${runs.map(r=>`<option value="${r.id}" ${r.id===right?"selected":""}>Run ${r.id} · Revision ${r.criteria_revision}</option>`).join("")}</select></label>${button("compare","Compare",true,runs.length<2)}</div>`+
 (comparison?`<div class="card"><h2 class="card-title">Changed criteria</h2>${comparison.changed_criteria.length?comparison.changed_criteria.map(c=>`<p>${esc(c.criterion_key)}: ${esc(c.change)} (${c.fields.map(esc).join(", ")})</p>`).join(""):"No changed criteria."}</div>`+
 table(["CV SNAPSHOT","BASELINE","COMPARED","SCORE DELTA","RANK DELTA","ELIGIBILITY CHANGED"],comparison.items.map(i=>{
 const side=(value:Model<"ComparisonValue">,run:string)=>value.present?`${link(`${ui}/candidates/${value.result_id}?run=${run}`,`Rank ${value.rank} · ${value.displayed_total}`)}<div>${esc(value.status)} · ${value.passed_mandatory?"Passed":"Failed"} mandatory</div>`:"Not in this run";
 return `<tr><td>CV ${esc(i.resume_id)} · Snapshot ${esc(i.snapshot_id)}</td><td>${side(i.left,left)}</td><td>${side(i.right,right)}</td><td>${esc(i.score_delta??"—")}</td><td>${esc(i.rank_delta??"—")}</td><td>${i.eligibility_changed===null?"—":i.eligibility_changed?"Yes":"No"}</td></tr>`;}).join(""))+
 `<div class="page-actions">${button("previous","Previous",false,offset===0)}${button("next","Next",false,offset+25>=comparison.page.total)}</div>`:"<div class=card>Select two published runs to compare.</div>"));
 v.action("#compare",async()=>{const l=v.el.querySelector<HTMLSelectElement>("#left")!.value,r=v.el.querySelector<HTMLSelectElement>("#right")!.value;if(l===r){v.message("Select two different runs.",true);return;}goto(`${ui}/comparison?left=${l}&right=${r}`);});
 v.action("#previous",async()=>{const previous=offset;offset=Math.max(0,offset-25);try{await render();}catch(error){offset=previous;throw error;}});v.action("#next",async()=>{const previous=offset;offset+=25;try{await render();}catch(error){offset=previous;throw error;}});
 }
 await render();
});
export const {mount,unmount}=view;
export default view;
