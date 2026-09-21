import { command, errorText, getJob, jobPath, request, type Model } from "../../lib/api.js";
import { confirmAction, screen, esc, header, button, link, table, badge } from "../../lib/screen.js";
const view=screen(async v=>{
 const job=await getJob(v.params.position,v.signal),run=v.params.run??job.published_run_id;
 if(!run||!v.params.result||!/^[1-9][0-9]*$/.test(v.params.result))throw new Error("Result requires a run");
 const ui=`/positions/${job.id}`,base=`${jobPath(job.id)}/screening-runs/${run}/results/${v.params.result}`;
 let result:Model<"ResultDetail">,source:Model<"SourcePreview">|null=null;
 const decide=command();
 async function loadSource(){
  try{source=await request<Model<"SourcePreview">>(`${base}/source`,{signal:v.signal});showSource();}
  catch(error){if(!v.signal.aborted){const el=v.el.querySelector("#source-text");if(el)el.textContent=errorText(error);}}
 }
 function showSource(evidence?:Model<"Evidence">){
  if(v.signal.aborted||!source)return;
  const area=v.el.querySelector("#source-text")!;
  if(!evidence){area.textContent=source.raw_text;return;}
  const chars=Array.from(source.raw_text),start=evidence.start_offset,end=evidence.end_offset;
  if(evidence.source!=="cv"||evidence.source_id!==source.snapshot_id||chars.slice(start,end).join("")!==evidence.quote){v.message("Evidence does not match this source snapshot.",true);return;}
  const mark=document.createElement("mark");mark.textContent=chars.slice(start,end).join("");
  area.replaceChildren(document.createTextNode(chars.slice(0,start).join("")),mark,document.createTextNode(chars.slice(end).join("")));
  mark.scrollIntoView({block:"center",behavior:"smooth"});
 }
 async function refresh(){
  result=await request<Model<"ResultDetail">>(base,{signal:v.signal});
  const canDecide=result.can_decide&&result.is_current&&result.status==="scored";
  v.html(header(result.candidate.full_name??`Candidate ${result.candidate.id}`,`${[result.candidate.email,result.candidate.phone].filter(Boolean).join(" · ")} · Run ${result.run_id} · CV v${result.resume_version} · Revision ${result.criteria_revision}`,link(`${ui}/ranking?run=${run}`,"Back to ranking")+button("reject","Reject",false,!canDecide)+button("shortlist","Shortlist",true,!canDecide))+
  `<div class="card"><h2>${esc(result.displayed_total)} / 100</h2>${badge(result.passed_mandatory?"Passed mandatory":"Failed mandatory",!result.passed_mandatory)} ${badge(result.status)}<p>${result.is_current?"Current published run":"Historical snapshot — read only"}</p>${!result.is_current?link(`${ui}/ranking`,"Current ranking"):""}${button("refresh","Refresh result")}</div>`+
  `<div class="split-view"><div>` + table(["CRITERION","REQUIREMENT","MATCH","CONTRIBUTION","REASON & SOURCE EVIDENCE"],result.criteria.map((c,i)=>`<tr><td>${esc(c.criterion.label)}<small> · Weight ${esc(c.criterion.weight)}</small></td><td>${esc(c.criterion.req_type)}</td><td>${badge(c.match_status,!c.criterion_passed)}</td><td>${esc(c.displayed_contribution)}</td><td>${esc(c.reason)}${c.evidence.map((e,j)=>`<blockquote>${esc(e.quote)}<button class="btn btn-ghost evidence" data-criterion="${i}" data-evidence="${j}">View source${e.page?` · Page ${e.page}`:""}${e.paragraph?` · Paragraph ${e.paragraph}`:""}</button></blockquote>`).join("")}${!c.evidence.length?"<p>No supporting evidence recorded.</p>":""}</td></tr>`).join(""))+
  `</div><div class="pane"><div class="page-header"><h2 class="card-title">Original Resume</h2><div>${button("download","Download original")}${button("source-retry","Reload source")}</div></div><pre id="source-text" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit">Loading source…</pre></div></div>`);
  v.action("#refresh",refresh);v.action("#source-retry",loadSource);
  v.action(".evidence",async el=>{if(!source)await loadSource();showSource(result.criteria[Number(el.dataset.criterion)].evidence[Number(el.dataset.evidence)]);});
  for(const [selector,decision] of [["#reject","rejected"],["#shortlist","shortlisted"]] as const)v.action(selector,async()=>{
   if(!canDecide)return;
   if(!await confirmAction(v, decision==="shortlisted"&&!result.passed_mandatory?"This candidate failed mandatory criteria. Confirm shortlist anyway?":`Confirm ${decision}? This decision is final for this run.`))return;
   await decide(`${base}/decision`,{decision,expected_result_version:result.result_version,confirm_failed_mandatory:decision==="shortlisted"&&!result.passed_mandatory},v.signal,"PATCH");await refresh();
  });
  v.action("#download",async()=>{
   const response=await fetch(`/api${base}/file`,{signal:v.signal,cache:"no-store"});
   if(!response.ok){v.message("Original file is unavailable. Stored analysis remains readable.",true);return;}
   const blob=await response.blob();if(v.signal.aborted)return;
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`resume-${result.resume_id}.${blob.type.includes("pdf")?"pdf":"docx"}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  await loadSource();
 }
 await refresh();
});
export const {mount,unmount}=view;
export default view;
