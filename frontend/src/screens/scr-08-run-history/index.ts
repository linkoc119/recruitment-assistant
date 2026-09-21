import { allPages, getJob, jobPath, type Model } from "../../lib/api.js";
import { screen, esc, header, button, link, table, badge, goto } from "../../lib/screen.js";
const view=screen(async v=>{
 const job=await getJob(v.params.position,v.signal), ui=`/positions/${job.id}`;
 const runs=await allPages<Model<"Run">>(`${jobPath(job.id)}/screening-runs`,v.signal);
 v.html(header("Screening Run History",job.title,link(`${ui}/criteria/new-revision`,"New Criteria Revision")+button("compare","Compare 2 Runs",true,true))+
 table(["SELECT","RUN","MODE","CRITERIA","COMPLETED","OUTCOME","STATUS","ACTIONS"],runs.map(r=>`<tr><td><input type="checkbox" class="run-select" value="${r.id}" aria-label="Select run ${r.id}" ${r.published_at?"":"disabled"}></td><td>Run ${r.id} · Round ${r.round}</td><td>${esc(r.mode)}</td><td>${link(`${ui}/criteria/${r.criteria_revision}`,`Revision ${r.criteria_revision}`)}</td><td>${esc(r.finished_at?new Date(r.finished_at).toLocaleString():"—")}</td><td>${r.counts.succeeded}/${r.counts.total} scored · ${r.counts.failed} errors</td><td>${badge(r.is_current?"Current":r.status)}</td><td>${link(r.published_at?`${ui}/ranking?run=${r.id}`:`${ui}/screening-runs/${r.id}`,r.published_at?"View Results":"View Progress")}</td></tr>`).join("")));
 const selected=()=>Array.from(v.el.querySelectorAll<HTMLInputElement>(".run-select:checked")).map(el=>el.value);
 v.el.querySelectorAll(".run-select").forEach(el=>el.addEventListener("change",()=>{v.el.querySelector<HTMLButtonElement>("#compare")!.disabled=selected().length!==2;},{signal:v.signal}));
 v.action("#compare",async()=>{const ids=selected().sort((a,b)=>runs.find(r=>r.id===a)!.round-runs.find(r=>r.id===b)!.round);if(ids.length===2)goto(`${ui}/comparison?left=${ids[0]}&right=${ids[1]}`);});
});
export const {mount,unmount}=view;
export default view;
