import type { ScreenModule, RouteParams } from "../router/types.js";
import { esc } from "./html.js";
import { errorText } from "./api.js";
import { runReviewMarkup, type RunReview } from "./run-review.js";
export { esc } from "./html.js";
export const link = (href: string, text: string, primary = false) => `<a class="btn btn-${primary ? "primary" : "secondary"}" href="#${esc(href)}">${esc(text)}</a>`;
export const button = (id: string, text: string, primary = false, disabled = false) => `<button id="${id}" class="btn btn-${primary ? "primary" : "secondary"}" ${disabled ? "disabled" : ""}>${esc(text)}</button>`;
export const header = (title: string, description = "", actions = "") => `<div class="page-header"><div><h1 class="page-title">${esc(title)}</h1><p class="page-desc">${esc(description)}</p></div><div class="page-actions">${actions}</div></div><div id="screen-message" aria-live="polite"></div>`;
export const table = (headings: string[], rows: string) => `<div class="table-container" role="region" aria-label="Scrollable data table" tabindex="0"><table class="data-table"><thead><tr>${headings.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headings.length}">No records to display.</td></tr>`}</tbody></table></div>`;
export const badge = (value: string, danger = false) => `<span class="badge badge-${danger ? "danger" : "muted"}">${esc(value)}</span>`;
export const goto = (path: string) => { window.location.hash = `#${path}`; };
export interface View {
  el: HTMLElement; params: RouteParams; signal: AbortSignal;
  html(markup: string): void;
  action(selector: string, work: (target: HTMLElement) => Promise<void>): void;
  message(text: string, error?: boolean): void;
  poll(work: () => Promise<boolean>, interval?: number): void;
  dirty(value: boolean): void;
}
let dirty = false;
export function canLeave() { return !dirty || window.confirm("Discard unsaved changes?"); }
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
export function screen(load: (view: View) => Promise<void>): ScreenModule {
  let controller: AbortController | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unmount = () => { controller?.abort(); timers.forEach(clearTimeout); timers.clear(); dirty = false; };
  const mount = async (el: HTMLElement, params: RouteParams) => {
    unmount();
    controller = new AbortController();
    const signal = controller.signal;
    const view: View = {
      el, params, signal,
      html(markup) { if (!signal.aborted) el.innerHTML = markup; },
      dirty(value) { if (!signal.aborted) dirty = value; },
      message(text, error = false) {
        if (signal.aborted) return;
        const area = el.querySelector<HTMLElement>("#screen-message");
        if (area) { area.className = "callout"; area.setAttribute("role", error ? "alert" : "status"); area.textContent = text; }
      },
      action(selector, work) {
        el.querySelectorAll<HTMLElement>(selector).forEach(target => target.addEventListener("click", async event => {
          event.preventDefault();
          if (target.getAttribute("aria-busy") === "true") return;
          target.setAttribute("aria-busy", "true");
          if (target instanceof HTMLButtonElement) target.disabled = true;
          try { await work(target); } catch (error) { view.message(errorText(error), true); }
          finally {
            target.removeAttribute("aria-busy");
            if (target instanceof HTMLButtonElement) target.disabled = false;
            if (!signal.aborted && target.isConnected && document.activeElement === document.body) target.focus();
          }
        }, { signal }));
      },
      poll(work, interval = 2000) {
        let failures = 0;
        const schedule = (delay: number) => {
          const timer = setTimeout(() => { timers.delete(timer); void tick(); }, delay);
          timers.add(timer);
        };
        const tick = async () => {
          if (signal.aborted) return;
          let again = true;
          try { again = await work(); failures = 0; } catch (error) { if (!signal.aborted) view.message(errorText(error), true); failures++; }
          if (!signal.aborted && again) schedule(Math.min(30000, interval * 2 ** Math.min(failures, 4)));
        };
        schedule(interval);
      },
    };
    view.html(header("Loading…") + '<div class="card" role="status" aria-busy="true">Loading server data…</div>');
    try {
      await load(view);
      if (!signal.aborted) { const heading = el.querySelector<HTMLElement>("h1"); heading?.setAttribute("tabindex", "-1"); heading?.focus(); }
    }
    catch (error) {
      if (signal.aborted) return;
      view.html(header("Unable to load this screen", "", link("/positions", "Positions")) + button("retry-screen", "Retry"));
      view.message(errorText(error), true);
      view.action("#retry-screen", () => mount(el, params));
    }
  };
  return { mount, unmount };
}

function containDialogFocus(dialog: HTMLDialogElement) {
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

export function confirmAction(view: View, message: string, title = "Confirm decision"): Promise<boolean> {
  return new Promise(resolve => {
    if (view.signal.aborted) { resolve(false); return; }
    const dialog = document.createElement("dialog");
    dialog.className = "confirmation-dialog";
    dialog.setAttribute("aria-labelledby", "confirmation-title");
    dialog.innerHTML = `<h2 id="confirmation-title">${esc(title)}</h2><p>${esc(message)}</p><div class="page-actions"><button class="btn btn-secondary" data-answer="cancel">Cancel</button><button class="btn btn-primary" data-answer="confirm">Confirm</button></div>`;
    view.el.append(dialog);
    const finish = (answer: boolean) => { dialog.close(); dialog.remove(); view.signal.removeEventListener("abort", abort); resolve(answer); };
    const abort = () => finish(false);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); }, { once: true });
    dialog.querySelector('[data-answer="cancel"]')!.addEventListener("click", () => finish(false), { once: true });
    dialog.querySelector('[data-answer="confirm"]')!.addEventListener("click", () => finish(true), { once: true });
    view.signal.addEventListener("abort", abort, { once: true });
    containDialogFocus(dialog);
    dialog.showModal();
    (dialog.querySelector('[data-answer="cancel"]') as HTMLButtonElement).focus();
  });
}

export function confirmRunStart(view: View, review: RunReview): Promise<boolean> {
  return new Promise(resolve => {
    if (view.signal.aborted) { resolve(false); return; }
    const dialog = document.createElement("dialog");
    dialog.className = "confirmation-dialog run-review-dialog";
    dialog.setAttribute("aria-labelledby", "run-review-title");
    dialog.innerHTML = `<h2 id="run-review-title">Review ${review.mode === "initial" ? "screening run" : "rescore"}</h2>${runReviewMarkup(review)}<div class="page-actions"><button class="btn btn-secondary" data-answer="cancel">Go back</button><button class="btn btn-primary" data-answer="confirm">Confirm and start</button></div>`;
    view.el.append(dialog);
    const finish = (answer: boolean) => { dialog.close(); dialog.remove(); view.signal.removeEventListener("abort", abort); resolve(answer); };
    const abort = () => finish(false);
    dialog.querySelectorAll("a").forEach(anchor => anchor.addEventListener("click", () => finish(false), { once: true }));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); }, { once: true });
    dialog.querySelector('[data-answer="cancel"]')!.addEventListener("click", () => finish(false), { once: true });
    dialog.querySelector('[data-answer="confirm"]')!.addEventListener("click", () => finish(true), { once: true });
    view.signal.addEventListener("abort", abort, { once: true });
    containDialogFocus(dialog);
    dialog.showModal();
    (dialog.querySelector('[data-answer="cancel"]') as HTMLButtonElement).focus();
  });
}
