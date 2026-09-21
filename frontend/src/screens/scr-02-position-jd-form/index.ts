import { command, getJob, type Model } from "../../lib/api.js";
import { screen, esc, header, button, link, goto } from "../../lib/screen.js";
const view = screen(async v => {
  const job = v.params.position ? await getJob(v.params.position, v.signal) : null;
  const send = command();
  v.html(header(job ? "Edit Position & Job Description" : "Create New Job Position", "Preserve the original JD; criteria are reviewed separately.", link("/positions", "Cancel") + button("save-btn", "Save and Review Criteria →", true)) +
  `<form id="job-form" class="card" style="max-width:900px"><div class="form-group"><label class="form-label" for="job-title">Position Title *</label><input id="job-title" class="form-control" maxlength="200" required value="${esc(job?.title)}"></div><div class="form-group"><label class="form-label" for="job-level">Experience Level</label><input id="job-level" class="form-control" maxlength="50" value="${esc(job?.level)}"></div><div class="form-group"><label class="form-label" for="job-jd">Original Job Description *</label><textarea id="job-jd" class="form-control" required style="min-height:280px">${esc(job?.jd_raw_text)}</textarea></div></form>`);
  v.el.querySelector("form")!.addEventListener("input", () => v.dirty(true), { signal: v.signal });
  v.action("#save-btn", async () => {
    if (!v.el.querySelector<HTMLFormElement>("form")!.reportValidity()) return;
    const title = v.el.querySelector<HTMLInputElement>("#job-title")!.value.trim();
    const jd_raw_text = v.el.querySelector<HTMLTextAreaElement>("#job-jd")!.value;
    if (!title || !jd_raw_text.trim()) { v.message("Title and job description are required.", true); return; }
    const body = { title, level: v.el.querySelector<HTMLInputElement>("#job-level")!.value.trim() || null, jd_raw_text, ...(job ? { expected_version: job.version } : {}) };
    const saved = await send<Model<"Job">>(job ? `/jobs/${job.id}` : "/jobs", body, v.signal, job ? "PATCH" : "POST");
    v.dirty(false); goto(`/positions/${saved.id}/criteria`);
  });
});
export const { mount, unmount } = view;
export default view;
