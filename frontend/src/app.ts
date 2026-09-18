import { mountShell } from "./shell/index.js";
import { startRouter } from "./router/index.js";

const sidebarEl = document.getElementById("sidebar");
const topbarEl = document.getElementById("topbar");
if (sidebarEl && topbarEl) {
  mountShell(sidebarEl, topbarEl);
}

startRouter();

// The skip link can't use a real "#..." href — every hash change is caught
// by the router's hashchange listener and resolved as a route, which would
// bounce it to the default landing page instead of the current screen's
// content. So it stays a plain in-page focus move instead.
const skipLink = document.getElementById("skip-link");
const mainEl = document.getElementById("app");
if (skipLink && mainEl) {
  skipLink.addEventListener("click", event => {
    event.preventDefault();
    mainEl.focus();
  });
}

