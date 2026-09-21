import { allPages, command, getJob, jobPath, type Model } from "../../lib/api.js";
import { confirmRunStart, screen, esc, header, button, link, table, badge, goto } from "../../lib/screen.js";
import { formatDateTime, resumeStatusLabel, resumeErrorText } from "../../lib/html.js";
const view = screen(async v => {
  let job = await getJob(v.params.position, v.signal);
  const base = jobPath(job.id), uploadCommand = command(), startCommand = command();
  const retries = new Map<string, ReturnType<typeof command>>();
  let resumes: Model<"Resume">[] = [], candidates: Model<"Candidate">[] = [], selected = new Set<string>(), touched = false;
  let previousRows = "";
  let files: File[] = [], batchId = crypto.randomUUID(), uploading = false, latestDuplicateCount = 0;
  v.html(header("Candidate CV Workspace", job.title, link(`/positions/${job.id}/criteria`, "Review criteria")) +
    `<div class="card"><label class="form-label" for="files">Add PDF/DOCX files — up to 200 files, 10 MiB each</label><input id="files" type="file" accept=".pdf,.docx" multiple><div id="upload-staging"></div>${button("upload", "Upload selected files", true)}<div id="upload-outcomes" aria-live="polite"></div></div><div class="table-toolbar"><label>Parsing status <select id="filter" class="form-control"><option value="">All</option><option value="parse_failed">Failed</option><option value="parsed">Parsed</option><option value="parsing">Parsing</option><option value="uploaded">Queued</option></select></label><label><input type="checkbox" id="select-all"> Select all ready CVs</label>${button("refresh", "Refresh")}</div><div id="resumes-table"></div><div class="card"><p id="readiness"></p>${button("start", "Start Screening", true)}<div id="active-run"></div></div>`);
  function renderRows() {
    const filter = v.el.querySelector<HTMLSelectElement>("#filter")!.value;
    v.el.querySelector("#resumes-table")!.innerHTML = table(["SELECT", "FILE", "CANDIDATE", "UPLOADED", "STATUS", "ACTION"], resumes.filter(r=>!filter || r.status===filter).map(r=>`<tr><td><input type="checkbox" class="cv-select" aria-label="Select ${esc(r.file_name)}" data-id="${r.id}" ${selected.has(r.id)?"checked":""} ${r.can_screen?"":"disabled"}></td><td>${esc(r.file_name)}<div>Version ${r.version}</div></td><td>${esc(candidates.find(c=>c.id===r.candidate_id)?.full_name ?? `Candidate ${r.candidate_id}`)}</td><td>${formatDateTime(r.created_at)}</td><td>${badge(resumeStatusLabel(r.status),r.status==="parse_failed")}${r.error_code?`<div>${esc(resumeErrorText(r.error_code))}</div>`:""}</td><td>${r.status==="parse_failed"?`<button class="btn btn-ghost retry" data-id="${r.id}">Retry extraction</button>`:""}</td></tr>`).join(""));
    v.el.querySelectorAll<HTMLInputElement>(".cv-select").forEach(el=>el.addEventListener("change",()=>{ touched=true; el.checked?selected.add(el.dataset.id!):selected.delete(el.dataset.id!); readiness(); },{signal:v.signal}));
    v.action(".retry", async el=>{
      const id=el.dataset.id!; if(!retries.has(id)) retries.set(id,command());
      await retries.get(id)!(`${base}/resumes/${id}/reprocess`, undefined,v.signal); await refresh();
    });
    readiness();
  }
  function readiness() {
    v.el.querySelector("#readiness")!.textContent = `${selected.size} selected / ${resumes.filter(r=>r.can_screen).length} ready. ${job.readiness.blocking_codes.join(" · ")}`;
    const start=v.el.querySelector<HTMLButtonElement>("#start")!;
    start.disabled=start.getAttribute("aria-busy")==="true" || !job.readiness.can_start || !selected.size || selected.size>200;
    v.el.querySelector("#active-run")!.innerHTML=job.readiness.active_run_id?link(`/positions/${job.id}/screening-runs/${job.readiness.active_run_id}`,"Open active run"):"";
  }
  async function refresh() {
    const [nextJob,nextResumes,nextCandidates]=await Promise.all([getJob(job.id,v.signal),allPages<Model<"Resume">>(`${base}/resumes`,v.signal),allPages<Model<"Candidate">>(`${base}/candidates`,v.signal)]);
    if(v.signal.aborted) return;
    job=nextJob;resumes=nextResumes;candidates=nextCandidates;
    selected=new Set([...selected].filter(id=>resumes.some(r=>r.id===id && r.can_screen)));
    if(!touched) selected=new Set(resumes.filter(r=>r.can_screen).map(r=>r.id));
    const signature=JSON.stringify([resumes,candidates,[...selected]]);
    if(signature!==previousRows){previousRows=signature;renderRows();}else readiness();
  }
  await refresh();
  v.el.querySelector("#files")!.addEventListener("change",()=>{
    files=Array.from(v.el.querySelector<HTMLInputElement>("#files")!.files??[]);batchId=crypto.randomUUID();
    v.dirty(files.length>0);
    v.el.querySelector("#upload-staging")!.innerHTML=table(["FILE", "IDENTITY", "CONFIRM"],files.map((f,i)=>`<tr><td>${esc(f.name)} (${f.size} bytes)</td><td><select class="form-control" id="identity-${i}" aria-label="Identity for ${esc(f.name)}"><option value="">New candidate</option>${candidates.map(c=>`<option value="${c.id}">New version: ${esc(c.full_name??`Candidate ${c.id}`)}</option>`).join("")}</select></td><td><label><input type="checkbox" id="confirm-${i}"> I confirm this candidate identity</label></td></tr>`).join(""));
  },{signal:v.signal});
  v.action("#upload",async()=>{
    if(uploading)return;
    if(!files.length||files.length>200){v.message("Choose between 1 and 200 files; split larger batches.",true);return;}
    const form=new FormData();const manifest:Model<"UploadManifestItem">[]=[];
    for(let i=0;i<files.length;i++){
      const candidate=v.el.querySelector<HTMLSelectElement>(`#identity-${i}`)!.value;
      const confirmed=v.el.querySelector<HTMLInputElement>(`#confirm-${i}`)!.checked;
      if(candidate&&!confirmed){v.message("Confirm the identity for each new CV version.",true);return;}
      form.append("files",files[i]); manifest.push({client_file_id:`file-${i}`,file_index:i,identity_mode:candidate?"new_version":"new_candidate",...(candidate?{candidate_id:candidate,identity_confirmed:true}:{})});
    }
    form.append("manifest",JSON.stringify(manifest));
    uploading=true;
    try{
      const result=await uploadCommand<Model<"UploadResponse">>(`${base}/resume-batches`,form,v.signal,"POST",batchId+JSON.stringify(manifest));
      latestDuplicateCount=result.duplicate_count;
      v.el.querySelector("#upload-outcomes")!.innerHTML=`<p>${result.accepted_count} accepted · ${result.duplicate_count} duplicates · ${result.rejected_count} rejected</p>`+table(["FILE", "OUTCOME", "ERROR"],result.items.map(o=>`<tr><td>${esc(files[Number(o.client_file_id.split("-")[1])]?.name)}</td><td>${esc(o.outcome)}</td><td>${esc(o.error_code??"—")}</td></tr>`).join(""));
      v.dirty(false);await refresh();
    }finally{uploading=false;}
  });
  v.el.querySelector("#filter")!.addEventListener("change",renderRows,{signal:v.signal});
  v.el.querySelector("#select-all")!.addEventListener("change",e=>{touched=true;selected=(e.target as HTMLInputElement).checked?new Set(resumes.filter(r=>r.can_screen).map(r=>r.id)):new Set();renderRows();},{signal:v.signal});
  v.action("#refresh",refresh);
  v.action("#start",async()=>{
    if(!job.readiness.can_start || !selected.size || selected.size>200)return;
    const selection={mode:"initial" as const,criteria_revision:job.criteria_revision!,resume_ids:[...selected]};
    const confirmed=await confirmRunStart(v,{positionId:job.id,position:job.title,mode:"initial",criteriaRevision:selection.criteria_revision,policyVersion:"policy-v1",cvCount:selection.resume_ids.length,failedExcluded:resumes.filter(r=>r.status==="parse_failed").length,duplicateExcluded:latestDuplicateCount});
    if(!confirmed)return;
    const run=await startCommand<Model<"Run">>(`${base}/screening-runs`,selection,v.signal);
    v.dirty(false);goto(`/positions/${job.id}/screening-runs/${run.id}`);
  });
  v.poll(async()=>{if(!uploading)await refresh();return true;});
});
export const {mount,unmount}=view;
export default view;
