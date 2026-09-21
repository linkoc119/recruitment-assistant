import { allPages, getJob, jobPath, request, type Model } from "../../lib/api.js";
import { screen, esc, header, link, table, badge, goto } from "../../lib/screen.js";
import { formatDateTime, formatElapsed, runStatusLabel, runItemStatusLabel, runItemPhaseLabel, runErrorText } from "../../lib/html.js";
const view=screen(async v=>{
  const job=await getJob(v.params.position,v.signal),base=jobPath(job.id);
  if(!/^[1-9][0-9]*$/.test(v.params.run))throw new Error("Invalid run");
  const path=`${base}/screening-runs/${v.params.run}`;
  let redirected=false;
  let previousState="";
  // CV file name/version are not on RunItem — join against the job's resumes.
  // The CV set for a run is frozen at start (business rule), so one fetch is
  // normally enough; re-fetch only if an item references a resume we have
  // not seen yet.
  const resumesById=new Map<string,Model<"Resume">>();
  async function ensureResumes(resumeIds:string[]){
    if(resumeIds.every(id=>resumesById.has(id)))return;
    const resumes=await allPages<Model<"Resume">>(`${base}/resumes`,v.signal);
    resumes.forEach(r=>resumesById.set(r.id,r));
  }
  let elapsedTimer:ReturnType<typeof setInterval>|undefined;
  v.signal.addEventListener("abort",()=>{if(elapsedTimer)clearInterval(elapsedTimer);});
  function tickElapsed(run:Model<"Run">){
    if(elapsedTimer){clearInterval(elapsedTimer);elapsedTimer=undefined;}
    if(!run.started_at||run.finished_at)return;
    const startedAt=run.started_at;
    elapsedTimer=setInterval(()=>{
      const el=v.el.querySelector("#elapsed");
      if(!el||!v.el.isConnected){clearInterval(elapsedTimer);return;}
      el.textContent=formatElapsed(startedAt,null);
    },1000);
  }
  async function refresh(){
    const [run,items]=await Promise.all([request<Model<"Run">>(path,{signal:v.signal}),allPages<Model<"RunItem">>(`${path}/items`,v.signal)]);
    await ensureResumes(items.map(i=>i.resume_id));
    const active=run.status==="queued"||run.status==="running";
    const state=JSON.stringify([run,items]);
    if(state===previousState)return active;
    previousState=state;
    const focused=document.activeElement;
    const focusHref=focused instanceof HTMLAnchorElement && v.el.contains(focused)?focused.getAttribute("href"):null;
    const tableFocused=focused instanceof HTMLElement && v.el.contains(focused) && focused.classList.contains("table-container");
    const done=run.counts.succeeded+run.counts.failed,percent=run.counts.total?Math.round(done/run.counts.total*100):0;
    const elapsed=run.started_at?formatElapsed(run.started_at,run.finished_at):"—";
    v.html(header("Screening Progress",`${job.title} · Round ${run.round}`,link(`/positions/${job.id}/cv-workspace`,"Candidates"))+
      `<div class="card">${badge(runStatusLabel(run.status),run.status==="failed")}<h2>${done} / ${run.counts.total} CVs · ${percent}%</h2><div class="progress-bar-container" role="progressbar" aria-label="CV processing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="progress-bar-fill" style="width:${percent}%"></div></div>`+
      `<dl class="review-grid"><div><dt>Start time</dt><dd>${run.started_at?formatDateTime(run.started_at):"Not started yet"}</dd></div><div><dt>Elapsed</dt><dd id="elapsed">${esc(elapsed)}</dd></div><div><dt>Total</dt><dd>${run.counts.total}</dd></div><div><dt>Pending</dt><dd>${run.counts.pending}</dd></div><div><dt>Processing</dt><dd>${run.counts.processing}</dd></div><div><dt>Succeeded</dt><dd>${run.counts.succeeded}</dd></div><div><dt>Failed</dt><dd>${run.counts.failed}</dd></div></dl>`+
      `<p>${run.counts.succeeded} scored · ${run.counts.failed} technical failures (not mandatory failures)</p>${run.error_code?`<p role="alert">${esc(runErrorText(run.error_code))}</p>`:""}${run.published_at?link(`/positions/${job.id}/ranking?run=${run.id}`,"View ranking",true):link(`/positions/${job.id}/ranking`,"Previous published ranking")}</div>`+
      table(["CV", "STATUS", "PHASE", "ERROR"],items.map(i=>{
        const resume=resumesById.get(i.resume_id);
        const cv=resume?`${esc(resume.file_name)}<div>Version ${resume.version}</div>`:esc(i.resume_id);
        return `<tr><td>${cv}</td><td>${badge(runItemStatusLabel(i.status),i.status==="failed")}</td><td>${esc(runItemPhaseLabel(i.error_phase))}</td><td>${i.error_code?esc(runErrorText(i.error_code)):"—"}</td></tr>`;
      }).join("")));
    tickElapsed(run);
    if(focusHref)Array.from(v.el.querySelectorAll<HTMLAnchorElement>("a")).find(a=>a.getAttribute("href")===focusHref)?.focus({preventScroll:true});
    else if(tableFocused)v.el.querySelector<HTMLElement>(".table-container")?.focus({preventScroll:true});
    if(run.is_current&&run.status==="completed"&&!redirected){redirected=true;v.poll(async()=>{goto(`/positions/${job.id}/ranking?run=${run.id}`);return false;},1500);}
    return active;
  }
  if(await refresh())v.poll(refresh);
});
export const {mount,unmount}=view;
export default view;
