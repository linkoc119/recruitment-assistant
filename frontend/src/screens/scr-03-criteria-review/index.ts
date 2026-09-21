import { ApiError, allPages, command, getJob, jobPath, request, type Model } from "../../lib/api.js";
import { confirmAction, confirmRunStart, screen, esc, header, button, link, table, goto } from "../../lib/screen.js";
import { createDraftSync } from "../../lib/draft-sync.js";
type Criterion = Model<"CriterionInput">;
const input = (c: Criterion): Criterion => ({ criterion_key: c.criterion_key, kind: c.kind, label: c.label, skill_id: c.skill_id ?? null, req_type: c.req_type, weight: c.weight, min_years: c.min_years ?? null, min_degree: c.min_degree ?? null, source: c.source, jd_evidence: c.jd_evidence ?? [] });
const view = screen(async v => {
  const job = await getJob(v.params.position, v.signal), base = jobPath(job.id);
  const historical = !!v.params.revision && v.params.revision !== "new-revision";
  const rescore = v.params.revision === "new-revision";
  const skills = await allPages<Model<"Skill">>("/skills", v.signal);
  let draft: Model<"CriteriaDraft"> | null = null, revision: Model<"CriteriaRevision"> | null = null;
  if (historical) revision = await request(`${base}/criteria-revisions/${encodeURIComponent(v.params.revision)}`, { signal: v.signal });
  else {
    try { draft = await request(`${base}/criteria-draft`, { signal: v.signal }); }
    catch (error) { if (!(error instanceof ApiError) || error.code !== "draft_not_found") throw error; }
    if (!draft && job.criteria_revision) revision = await request(`${base}/criteria-revisions/${job.criteria_revision}`, { signal: v.signal });
  }
  let criteria: Criterion[] = (draft?.criteria ?? revision?.criteria ?? []).map(input);
  let publishedRun: Model<"Run"> | null = null;
  let approved: Model<"CriteriaRevision"> | null = null;
  if (rescore && job.published_run_id) {
    publishedRun = await request<Model<"Run">>(`${base}/screening-runs/${job.published_run_id}`, { signal: v.signal });
    if (revision && revision.revision > publishedRun.criteria_revision) approved = revision;
  }
  const saveCommand = command(), suggestCommand = command(), approvalCommand = command(), runCommand = command();
  const sync = createDraftSync<Criterion[], Model<"CriteriaDraft">>({
    read: () => criteria,
    onDirty: value => v.dirty(value),
    send: payload => saveCommand<Model<"CriteriaDraft">>(`${base}/criteria-draft`,
      { expected_draft_version: draft?.version ?? 0, expected_revision: job.criteria_revision ?? 0, expected_job_version: job.version, criteria: payload },
      v.signal, "PUT").then(saved => { draft = saved; return saved; }),
  });
  sync.setBaseline(draft?.job_version === job.version ? criteria : null);
  const degrees = ["vocational", "college", "bachelor", "master", "doctorate"] as const;
  const baseline = structuredClone(criteria);
  const jd = historical ? revision!.jd_snapshot : job.jd_raw_text;
  function valid() {
    const numbers = criteria.map(c => c.weight);
    if (!numbers.length || numbers.some(n => !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(n))) return false;
    const scale = Math.max(...numbers.map(n => n.split(".")[1]?.length ?? 0));
    const unit = 10n ** BigInt(scale);
    const weights = numbers.map(n => { const [w, f = ""] = n.split("."); return BigInt(w) * unit + BigInt(f.padEnd(scale, "0") || "0"); });
    return weights.every(w => w > 0n) && weights.reduce((a,b) => a+b, 0n) === 100n * unit;
  }
  function totals() {
    v.el.querySelector("#weight-total")!.textContent = `Total Weight: ${criteria.reduce((sum,c) => sum + (Number(c.weight) || 0),0).toFixed(4).replace(/\.?0+$/, "")} / 100`;
    const approve = v.el.querySelector<HTMLButtonElement>("#approve");
    if (approve) approve.disabled = !valid() || approved !== null;
    const start = v.el.querySelector<HTMLButtonElement>("#rescore");
    if (start) start.disabled = approved === null;
  }
  async function save() {
    const saved = await sync.save();
    if (saved) v.message("Draft saved. Approval is a separate action.");
  }
  function render() {
    v.html(header(historical ? `JD & Screening Criteria — Revision ${revision!.revision}` : rescore ? "JD & Screening Criteria — New Revision" : "JD & Screening Criteria", historical ? "Read-only approved snapshot" : job.title,
      link(`/positions/${job.id}/cv-workspace`, "Candidates") + link(`/positions/${job.id}/edit`, "Edit JD")) +
      `<div class="split-view"><div class="pane"><h2 class="card-title">Original Job Description</h2><div style="white-space:pre-wrap;margin-top:20px">${esc(jd)}</div></div><div><div class="card"><p>Policy v1: weights distribute points within the skill group. Experience and education use fixed group coefficients, not their criterion weights.</p>${!historical ? button("suggest", "Suggest from JD") + button("add", "Add Criterion") + button("reset", "Reset Changes") : ""}</div><div id="criteria-table">${table(["CRITERION", "TYPE", "WEIGHT", "THRESHOLD", ""], criteria.map((c,i) => `<tr data-index="${i}"><td>${historical ? esc(c.label) : `<label class="sr-only" for="label-${i}">Criterion label</label><input id="label-${i}" class="form-control" data-field="label" value="${esc(c.label)}"><select class="form-control" data-field="kind" aria-label="Criterion kind">${["skill","experience","education"].map(k=>`<option ${c.kind===k?"selected":""}>${k}</option>`).join("")}</select>${c.kind === "skill" ? `<select class="form-control" data-field="skill_id" aria-label="Canonical skill"><option value="">Choose skill</option>${skills.map(s=>`<option value="${s.id}" ${s.id===c.skill_id?"selected":""}>${esc(s.name)}</option>`).join("")}</select>` : ""}`}${c.jd_evidence?.length ? `<details><summary>JD evidence</summary>${c.jd_evidence.map(e=>`<blockquote>${esc(e.quote)}</blockquote>`).join("")}</details>` : ""}</td><td>${historical ? esc(c.req_type) : `<select class="form-control" data-field="req_type" aria-label="Requirement type"><option value="mandatory" ${c.req_type==="mandatory"?"selected":""}>Mandatory</option><option value="preferred" ${c.req_type==="preferred"?"selected":""}>Preferred</option></select>`}</td><td>${historical ? esc(c.weight) : `<input class="form-control" data-field="weight" aria-label="Weight" type="number" min="0" max="100" step="any" value="${esc(c.weight)}">`}</td><td>${c.kind === "experience" ? historical ? esc(c.min_years) + " years" : `<input class="form-control" data-field="min_years" aria-label="Minimum years" type="number" min="0.01" step="any" value="${esc(c.min_years)}">` : c.kind === "education" ? historical ? esc(c.min_degree) : `<select class="form-control" data-field="min_degree" aria-label="Minimum degree">${degrees.map(d=>`<option ${c.min_degree===d?"selected":""}>${d}</option>`).join("")}</select>` : "—"}</td><td>${historical ? "" : `<button class="btn btn-ghost remove" data-index="${i}">Remove</button>`}</td></tr>`).join(""))}</div><div class="card"><strong id="weight-total"></strong><div class="page-actions">${historical ? link(`/positions/${job.id}/criteria`, "Current criteria") : button("save", "Save Draft") + button("approve", "Approve Criteria", true)}${approved && rescore ? button("rescore", "Start Rescore", true) : ""}</div></div></div></div>`);
    if (rescore) {
      const changes = criteria.filter(c => !baseline.some(b => JSON.stringify(b) === JSON.stringify(c))).length;
      const removed = baseline.filter(b => !criteria.some(c => c.criterion_key === b.criterion_key)).length;
      const summary = document.createElement("p");
      summary.textContent = `${changes} added or edited criteria; ${removed} removed. Previous published results remain available until rescore succeeds.`;
      v.el.querySelector("#criteria-table")!.prepend(summary);
    }
    totals();
    if (historical) return;
    v.el.querySelectorAll("input[data-field]").forEach(el => el.addEventListener("input", () => v.dirty(true), { signal: v.signal }));
    v.el.querySelectorAll<HTMLInputElement|HTMLSelectElement>("[data-field]").forEach(el => el.addEventListener(el instanceof HTMLInputElement ? "input" : "change", () => {
      const c = criteria[Number(el.closest("tr")!.dataset.index)], field = el.dataset.field!;
      if (field === "kind") { c.kind = el.value as Criterion["kind"]; c.skill_id = null; c.min_years = c.kind === "experience" ? "1" : null; c.min_degree = c.kind === "education" ? "bachelor" : null; }
      else if (field === "skill_id") { c.skill_id = el.value || null; c.label = skills.find(s => s.id === el.value)?.name ?? c.label; }
      else Object.assign(c, { [field]: el.value });
      approved = null; v.dirty(true);
      if (field === "kind" || field === "skill_id") render(); else totals();
    }, { signal: v.signal }));
    v.action(".remove", async el => { criteria.splice(Number(el.dataset.index),1); approved = null; v.dirty(true); render(); });
    v.action("#add", async () => { approved = null; criteria.push({ criterion_key: crypto.randomUUID(), kind: "skill", label: "New criterion", skill_id: null, req_type: "preferred", weight: "0", source: "manual", jd_evidence: [] }); v.dirty(true); render(); });
    v.action("#reset", async () => { approved = null; criteria = structuredClone(baseline); v.dirty(true); render(); });
    v.action("#suggest", async () => {
      const suggestion = await suggestCommand<Model<"Suggestions">>(`${base}/criteria-suggestions`, { expected_job_version: job.version }, v.signal);
      if (criteria.length && !await confirmAction(v, "Replace the current unsaved criteria with these suggestions? Unsaved edits are lost.", "Replace criteria")) return;
      approved = null; criteria = suggestion.criteria.map(input); v.dirty(true); render();
      v.message(suggestion.warnings.length ? suggestion.warnings.join(" ") : "Suggestions received. Review and save before approval.");
    });
    v.action("#save", save);
    v.action("#approve", async () => {
      if (!valid()) { v.message("Every weight must be positive and the total exactly 100.", true); return; }
      await save();
      if (sync.isDirty()) { v.message("The criteria changed while the draft was being saved. Save again, then approve.", true); return; }
      approved = await approvalCommand<Model<"CriteriaRevision">>(`${base}/criteria-revisions`, { expected_draft_version: draft!.version, expected_revision: job.criteria_revision ?? 0, expected_job_version: job.version }, v.signal);
      job.criteria_revision = approved.revision; draft = null; sync.setBaseline(null); v.dirty(false);
      if (!rescore) goto(`/positions/${job.id}/cv-workspace`);
      else { render(); v.message("Revision approved. Start rescore when ready; the published ranking stays visible until it succeeds."); }
    });
    v.action("#rescore", async () => {
      if (!approved || !job.published_run_id || !publishedRun) { v.message("A published base run is required.", true); return; }
      const confirmed = await confirmRunStart(v, { positionId: job.id, position: job.title, mode: "rescore", criteriaRevision: approved.revision, policyVersion: publishedRun.policy_version, cvCount: publishedRun.counts.succeeded, sourceRunId: publishedRun.id, sourceRun: `Run ${publishedRun.id} · round ${publishedRun.round}` });
      if (!confirmed) return;
      const run = await runCommand<Model<"Run">>(`${base}/screening-runs`, { mode: "rescore", criteria_revision: approved.revision, base_run_id: job.published_run_id }, v.signal);
      goto(`/positions/${job.id}/screening-runs/${run.id}`);
    });
  }
  render();
});
export const { mount, unmount } = view;
export default view;
