import { command, jobPath, request, type Model } from "../../lib/api.js";
import { confirmAction, screen, esc, header, button, link, table, badge } from "../../lib/screen.js";
const view = screen(async v => {
  const base = jobPath(v.params.position), ui = `/positions/${v.params.position}`;
  let ranking: Model<"Ranking">, offset = 0;
  let search = "", eligibility = "", decisionFilter = "";
  const decide = command();
  async function refresh(reset = false) {
    if (reset) offset = 0;
    ranking = await request<Model<"Ranking">>(`${base}/ranking/query`, { method: "POST", signal: v.signal, body: {
      offset, limit: 25, ...(search ? {search} : {}), ...(eligibility ? {passed_mandatory: eligibility === "passed"} : {}), ...(decisionFilter ? {decision: decisionFilter} : {}), ...(offset && ranking?.run_id ? {run_id: ranking.run_id, decision_epoch: ranking.decision_epoch} : v.params.run ? {run_id:v.params.run} : {})
    }});
    render();
  }
  function render() {
    v.html(header("Published Ranking", ranking.run_id ? `Run ${ranking.run_id} · Criteria revision ${ranking.criteria_revision} · ${ranking.is_current ? "Current" : "Historical — read only"}` : "No published ranking yet", link(`${ui}/cv-workspace`, "Candidates") + link(`${ui}/runs`, "Run History") + link(`${ui}/criteria/new-revision`, "Revise & Rescore")) +
      `<div class="card">${ranking.eligibility_counts.passed} passed mandatory · ${ranking.eligibility_counts.failed} failed mandatory · ${ranking.failure_count} technical failures excluded from ranking.${ranking.active_run_id ? link(`${ui}/screening-runs/${ranking.active_run_id}`, "View active run") : ""}${!ranking.is_current && ranking.run_id ? link(`${ui}/ranking`, "Current ranking") : ""}</div>` +
      `<form id="filters" class="table-toolbar"><label>Search candidate or file <input id="search" type="search" maxlength="200" class="form-control" value="${esc(search)}"></label><label>Eligibility <select id="eligibility" class="form-control"><option value="">All</option><option value="passed" ${eligibility==="passed"?"selected":""}>Passed mandatory</option><option value="failed" ${eligibility==="failed"?"selected":""}>Failed mandatory</option></select></label><label>Decision <select id="decision-filter" class="form-control">${["","scored","shortlisted","rejected"].map(d=>`<option value="${d}" ${d===decisionFilter?"selected":""}>${d||"All"}</option>`).join("")}</select></label>${button("apply","Apply filters")}</form>` +
      table(["RANK","CANDIDATE / CV","SCORE","ELIGIBILITY","DECISION","ACTIONS"], ranking.items.map((r,i)=>`${!r.passed_mandatory && (i===0 || ranking.items[i-1].passed_mandatory) ? `<tr class="knockout-divider"><td colspan="6">Below this line: failed mandatory criteria (still reviewable)</td></tr>` : ""}<tr><td>${r.rank}</td><td>${link(`${ui}/candidates/${r.result_id}?run=${ranking.run_id}`,r.candidate_name??r.file_name)}<small>CV v${r.resume_version}</small></td><td>${esc(r.displayed_total)}</td><td>${badge(r.passed_mandatory?"Passed mandatory":"Failed mandatory",!r.passed_mandatory)}<div>${r.failed_criteria.map(esc).join(", ")}</div></td><td>${badge(r.status)}</td><td>${ranking.is_current && r.status === "scored" ? `<button class="btn btn-secondary decide" data-id="${r.result_id}" data-decision="rejected">Reject</button><button class="btn btn-primary decide" data-id="${r.result_id}" data-decision="shortlisted">Shortlist</button>`:"Read only"}</td></tr>`).join("")) +
      `<div class="page-actions">${button("previous","Previous",false,offset===0)}<span>${offset+1 > ranking.page.total ? 0 : offset+1}–${Math.min(offset+25,ranking.page.total)} of ${ranking.page.total}</span>${button("next","Next",false,offset+25>=ranking.page.total)}${button("refresh","Refresh ranking")}</div>`);
    v.action("#refresh",()=>refresh(true));
    const apply = async () => {search=v.el.querySelector<HTMLInputElement>("#search")!.value.trim();eligibility=v.el.querySelector<HTMLSelectElement>("#eligibility")!.value;decisionFilter=v.el.querySelector<HTMLSelectElement>("#decision-filter")!.value;await refresh(true);};
    v.action("#apply",apply);
    v.el.querySelector("#filters")!.addEventListener("submit",e=>{e.preventDefault();v.el.querySelector<HTMLButtonElement>("#apply")!.click();},{signal:v.signal});
    v.action("#previous",async()=>{const previous=offset;offset=Math.max(0,offset-25);try{await refresh();}catch(error){offset=previous;throw error;}});
    v.action("#next",async()=>{const previous=offset;offset+=25;try{await refresh();}catch(error){offset=previous;throw error;}});
    v.action(".decide",async el=>{
      const row=ranking.items.find(r=>r.result_id===el.dataset.id)!;
      const decision=el.dataset.decision as "shortlisted"|"rejected";
      if(!await confirmAction(v, decision==="shortlisted"&&!row.passed_mandatory ? "This candidate failed mandatory criteria. Confirm shortlist anyway?" : `Confirm ${decision}? This decision is final for this run.`)) return;
      await decide(`${base}/screening-runs/${ranking.run_id}/results/${row.result_id}/decision`,{decision,expected_result_version:row.result_version,confirm_failed_mandatory:decision==="shortlisted"&&!row.passed_mandatory},v.signal,"PATCH");
      await refresh(true);
    });
  }
  await refresh();
});
export const {mount,unmount}=view;
export default view;
