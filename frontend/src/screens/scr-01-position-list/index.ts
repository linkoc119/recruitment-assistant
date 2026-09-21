import { allPages, getJob, type Model } from "../../lib/api.js";
import { screen, esc, header, table, link, goto } from "../../lib/screen.js";
const view = screen(async v => {
  const jobs = await allPages<Model<"JobListItem">>("/jobs", v.signal);
  v.html(header("Job Positions & CV Screening", "Select a position to review criteria and evaluate resumes.", link("/positions/new", "Create Position", true)) +
    `<div class="table-toolbar"><label>Search title <input id="search" class="form-control" type="search"></label><label>Status <select id="status" class="form-control"><option value="">All</option><option>draft</option><option>open</option><option>closed</option></select></label></div><div id="positions-table"></div>`);
  const render = () => {
    const search = v.el.querySelector<HTMLInputElement>("#search")!.value.toLowerCase();
    const status = v.el.querySelector<HTMLSelectElement>("#status")!.value;
    v.el.querySelector("#positions-table")!.innerHTML = table(["JOB POSITION", "READY CVS", "STATUS", "ACTIONS"], jobs.filter(j => j.title.toLowerCase().includes(search) && (!status || j.status === status)).map(j => `<tr><td><button class="btn btn-ghost open-job" data-id="${esc(j.id)}">${esc(j.title)}</button><div>${esc(j.level)}</div></td><td>${j.ready_cv_count}</td><td>${esc(j.status)}</td><td>${link(`/positions/${j.id}/edit`, "Edit")}</td></tr>`).join(""));
    v.action(".open-job", async el => {
      const job = await getJob(el.dataset.id!, v.signal);
      const suffix = job.published_run_id ? "/ranking" : job.readiness.active_run_id ? `/screening-runs/${job.readiness.active_run_id}` : job.readiness.approved_criteria ? "/cv-workspace" : "/criteria";
      goto(`/positions/${job.id}${suffix}`);
    });
  };
  v.el.querySelector("#search")!.addEventListener("input", render, { signal: v.signal });
  v.el.querySelector("#status")!.addEventListener("change", render, { signal: v.signal });
  render();
});
export const { mount, unmount } = view;
export default view;
