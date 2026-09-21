import { allPages, getJob, jobPath, request, type Model } from "../../lib/api.js";
import { screen, esc, header, link, table, badge, goto } from "../../lib/screen.js";
const view=screen(async v=>{
  const job=await getJob(v.params.position,v.signal),base=jobPath(job.id);
  if(!/^[1-9][0-9]*$/.test(v.params.run))throw new Error("Invalid run");
  const path=`${base}/screening-runs/${v.params.run}`;
  let redirected=false;
  async function refresh(){
    const [run,items]=await Promise.all([request<Model<"Run">>(path,{signal:v.signal}),allPages<Model<"RunItem">>(`${path}/items`,v.signal)]);
    const done=run.counts.succeeded+run.counts.failed,percent=run.counts.total?Math.round(done/run.counts.total*100):0;
    v.html(header("Screening Progress",`${job.title} · Round ${run.round}`,link(`/positions/${job.id}/cv-workspace`,"Candidates"))+
      `<div class="card">${badge(run.status,run.status==="failed")}<h2>${done} / ${run.counts.total} CVs · ${percent}%</h2><div class="progress-bar-container"><div class="progress-bar-fill" style="width:${percent}%"></div></div><p>${run.counts.succeeded} scored · ${run.counts.failed} technical failures (not mandatory failures)</p>${run.error_code?`<p role="alert">${esc(run.error_code)}</p>`:""}${run.published_at?link(`/positions/${job.id}/ranking?run=${run.id}`,"View ranking",true):link(`/positions/${job.id}/ranking`,"Previous published ranking")}</div>`+
      table(["CV", "STATUS", "ATTEMPTS", "ERROR"],items.map(i=>`<tr><td>${esc(i.resume_id)}</td><td>${badge(i.status,i.status==="failed")}</td><td>${i.attempts}</td><td>${esc(i.error_code??"—")}</td></tr>`).join("")));
    const active=run.status==="queued"||run.status==="running";
    if(run.is_current&&run.status==="completed"&&!redirected){redirected=true;v.poll(async()=>{goto(`/positions/${job.id}/ranking?run=${run.id}`);return false;},1500);}
    return active;
  }
  if(await refresh())v.poll(refresh);
});
export const {mount,unmount}=view;
export default view;
